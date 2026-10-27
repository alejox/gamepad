#!/bin/bash
set -euo pipefail

server_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repository_root="$(cd "$server_root/../.." && pwd)"
version="${1:-$(node -p "require('$server_root/package.json').version")}"
node_version="$(node -p 'process.version')"
runtime_name="node-$node_version-darwin-arm64"
dist="$server_root/dist"
stage="$dist/macos"
app="$stage/AlejoxGamepad.app"
contents="$app/Contents"
resources="$contents/Resources"
artifacts="$dist/artifacts"
runtime_root="$dist/macos-runtime"
archive_dir="$dist/macos-downloads"
archive="$archive_dir/$runtime_name.tar.xz"
icon_source="$repository_root/apps/mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"

if [[ "$(uname -s)" != "Darwin" || "$(uname -m)" != "arm64" ]]; then
  echo "macOS packaging requires an Apple Silicon (arm64) Mac" >&2
  exit 1
fi
if [[ ! "$version" =~ ^[0-9A-Za-z.-]+$ ]]; then
  echo "Invalid package version: $version" >&2
  exit 1
fi

cd "$server_root"
npm run build:bundle
rm -rf "$stage"
mkdir -p "$contents/MacOS" "$resources/Licenses" "$artifacts" "$archive_dir" "$runtime_root"

if [[ ! -f "$archive" ]]; then
  curl --fail --location --retry 3 \
    "https://nodejs.org/dist/$node_version/$runtime_name.tar.xz" \
    --output "$archive"
fi
curl --fail --location --retry 3 \
  "https://nodejs.org/dist/$node_version/SHASUMS256.txt" \
  --output "$archive_dir/SHASUMS256-$node_version.txt"
expected=""
while read -r hash filename; do
  if [[ "$filename" == "$runtime_name.tar.xz" ]]; then
    expected="$hash"
    break
  fi
done < "$archive_dir/SHASUMS256-$node_version.txt"
actual="$(shasum -a 256 "$archive")"
actual="${actual%% *}"
if [[ -z "$expected" || "$actual" != "$expected" ]]; then
  echo "Node runtime checksum mismatch" >&2
  exit 1
fi
if [[ ! -x "$runtime_root/$runtime_name/bin/node" ]]; then
  tar -xJf "$archive" -C "$runtime_root"
fi

cp "$dist/bundle/server.mjs" "$resources/server.mjs"
cp "$dist/bundle/server.mjs.map" "$resources/server.mjs.map"
cp "$runtime_root/$runtime_name/bin/node" "$resources/node"
cp "$runtime_root/$runtime_name/LICENSE" "$resources/Licenses/Node-LICENSE"
cp "$server_root/packaging/macos/Info.plist" "$contents/Info.plist"
minimum_system_version=""
while read -r field value _; do
  if [[ "$field" == "minos" ]]; then
    minimum_system_version="$value"
    break
  fi
done < <(vtool -show-build "$resources/node")
if [[ ! "$minimum_system_version" =~ ^[0-9]+(\.[0-9]+)*$ ]]; then
  echo "Cannot determine the bundled Node minimum macOS version" >&2
  exit 1
fi
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $version" "$contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $version" "$contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :LSMinimumSystemVersion $minimum_system_version" "$contents/Info.plist"

clang++ -std=c++17 -O2 -Wall -Wextra -Werror -arch arm64 -mmacosx-version-min=11.0 \
  "$server_root/packaging/macos/launcher.cpp" -o "$contents/MacOS/AlejoxGamepad"

mkdir -p "$resources/node_modules/@jitsi" "$resources/node_modules/@koromix"
cp -R "$repository_root/node_modules/@jitsi/robotjs" "$resources/node_modules/@jitsi/robotjs"
cp -R "$repository_root/node_modules/node-gyp-build" "$resources/node_modules/node-gyp-build"
cp -R "$repository_root/node_modules/koffi" "$resources/node_modules/koffi"
cp -R "$repository_root/node_modules/@koromix/koffi-darwin-arm64" \
  "$resources/node_modules/@koromix/koffi-darwin-arm64"
find "$resources/node_modules/@jitsi/robotjs/prebuilds" -mindepth 1 -maxdepth 1 -type d \
  ! -name 'darwin-x64+arm64' -exec rm -rf {} +
robot_binary="$resources/node_modules/@jitsi/robotjs/prebuilds/darwin-x64+arm64/@jitsi+robotjs.node"
lipo "$robot_binary" -thin arm64 -output "$robot_binary.arm64"
mv "$robot_binary.arm64" "$robot_binary"

cp "$repository_root/node_modules/@jitsi/robotjs/LICENSE.md" "$resources/Licenses/RobotJS-LICENSE.md"
cp "$repository_root/node_modules/koffi/LICENSE.txt" "$resources/Licenses/Koffi-LICENSE.txt"
cp "$repository_root/node_modules/node-gyp-build/LICENSE" "$resources/Licenses/node-gyp-build-LICENSE"
cp "$repository_root/node_modules/ws/LICENSE" "$resources/Licenses/ws-LICENSE"

iconset="$stage/AlejoxGamepad.iconset"
mkdir -p "$iconset"
while read -r pixels name; do
  sips -z "$pixels" "$pixels" "$icon_source" --out "$iconset/$name" >/dev/null
done <<'ICONS'
16 icon_16x16.png
32 icon_16x16@2x.png
32 icon_32x32.png
64 icon_32x32@2x.png
128 icon_128x128.png
256 icon_128x128@2x.png
256 icon_256x256.png
512 icon_256x256@2x.png
512 icon_512x512.png
1024 icon_512x512@2x.png
ICONS
iconutil -c icns "$iconset" -o "$resources/AlejoxGamepad.icns"
rm -rf "$iconset"
plutil -lint "$contents/Info.plist"

for binary in \
  "$contents/MacOS/AlejoxGamepad" \
  "$resources/node" \
  "$robot_binary" \
  "$resources/node_modules/@koromix/koffi-darwin-arm64/darwin_arm64/koffi.node"; do
  if [[ "$(lipo -archs "$binary")" != "arm64" ]]; then
    echo "Expected an arm64-only binary: $binary" >&2
    exit 1
  fi
done
if [[ "$("$resources/node" --version)" != "$node_version" ]]; then
  echo "Bundled Node runtime version mismatch" >&2
  exit 1
fi

dmg_stage="$stage/dmg"
mkdir -p "$dmg_stage"
ditto "$app" "$dmg_stage/AlejoxGamepad.app"
ln -s /Applications "$dmg_stage/Applications"
dmg="$artifacts/AlejoxGamepad-$version-macOS-arm64.dmg"
zip="$artifacts/AlejoxGamepad-Portable-$version-macOS-arm64.zip"
rm -f "$dmg" "$zip"
hdiutil create -volname AlejoxGamepad -srcfolder "$dmg_stage" -ov -format UDZO \
  -imagekey zlib-level=9 "$dmg"
hdiutil verify "$dmg"
ditto -c -k --sequesterRsrc --keepParent "$app" "$zip"

ls -lh "$dmg" "$zip"
