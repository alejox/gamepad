param(
  [string]$Version = (Get-Content "$PSScriptRoot/../package.json" -Raw | ConvertFrom-Json).version
)

$ErrorActionPreference = "Stop"
$serverRoot = Resolve-Path "$PSScriptRoot/.."
$repositoryRoot = Resolve-Path "$serverRoot/../.."
$dist = "$serverRoot/dist"
$stage = "$dist/windows/AlejoxGamepad"
$artifacts = "$dist/artifacts"
$driverName = "ViGEmBus_1.22.0_x64_x86_arm64.exe"
$driverUrl = "https://github.com/nefarius/ViGEmBus/releases/download/v1.22.0/$driverName"
$driverSha256 = "89220a7865076b342892f98865f3499fb7c4cfd673159e89d352c360fd014c6a"

Push-Location $serverRoot
try {
  npm run build:bundle
  if ($LASTEXITCODE -ne 0) { throw "Server bundle failed" }

  Remove-Item "$dist/windows" -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force "$stage/node_modules/@jitsi", "$stage/node_modules/@koromix", "$stage/redistributables", $artifacts | Out-Null

  Copy-Item "$dist/bundle/server.mjs" "$stage/server.mjs"
  Copy-Item "$dist/bundle/server.mjs.map" "$stage/server.mjs.map"
  Copy-Item (Get-Command node.exe).Source "$stage/node.exe"
  Copy-Item "$serverRoot/native/win32-x64/ViGEmClient.dll" "$stage/ViGEmClient.dll"

  cl.exe /nologo /EHsc /O2 /W4 /std:c++17 /DUNICODE /D_UNICODE "$serverRoot/packaging/windows/launcher.cpp" "/Fo:$dist/windows/launcher.obj" "/Fe:$stage/AlejoxGamepad.exe"
  if ($LASTEXITCODE -ne 0) { throw "Windows launcher compilation failed" }

  Copy-Item "$repositoryRoot/node_modules/koffi" "$stage/node_modules/koffi" -Recurse
  Copy-Item "$repositoryRoot/node_modules/@koromix/koffi-win32-x64" "$stage/node_modules/@koromix/koffi-win32-x64" -Recurse
  Copy-Item "$repositoryRoot/node_modules/@jitsi/robotjs" "$stage/node_modules/@jitsi/robotjs" -Recurse
  Copy-Item "$repositoryRoot/node_modules/node-gyp-build" "$stage/node_modules/node-gyp-build" -Recurse
  Get-ChildItem "$stage/node_modules/@jitsi/robotjs/prebuilds" -Directory |
    Where-Object Name -ne "win32-x64" |
    Remove-Item -Recurse -Force

  foreach ($nativeFile in @(
    "$stage/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node",
    "$stage/node_modules/@jitsi/robotjs/prebuilds/win32-x64/@jitsi+robotjs.node",
    "$stage/ViGEmClient.dll"
  )) {
    if (-not (Test-Path $nativeFile -PathType Leaf)) { throw "Missing native package file: $nativeFile" }
  }

  $driver = "$dist/windows/$driverName"
  Invoke-WebRequest $driverUrl -OutFile $driver
  if ((Get-FileHash $driver -Algorithm SHA256).Hash.ToLowerInvariant() -ne $driverSha256) {
    throw "ViGEmBus redistributable hash mismatch"
  }
  Copy-Item $driver "$stage/redistributables/$driverName"

  $zip = "$artifacts/AlejoxGamepad-Portable-$Version.zip"
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
  Compress-Archive "$stage/*" $zip -CompressionLevel Optimal

  $iscc = (Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source
  if (-not $iscc) { $iscc = "${env:ProgramFiles(x86)}/Inno Setup 6/ISCC.exe" }
  if (-not (Test-Path $iscc -PathType Leaf)) { throw "Inno Setup 6 (ISCC.exe) was not found" }
  & $iscc "/DAppVersion=$Version" "/DSourceDir=$stage" "$serverRoot/packaging/windows/AlejoxGamepad.iss"
  if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed" }

  Get-Item $zip, "$artifacts/AlejoxGamepad-Setup-$Version.exe" | Select-Object FullName, Length
} finally {
  Pop-Location
}
