#include <windows.h>

#include <iostream>
#include <string>
#include <vector>

namespace {
BOOL WINAPI ignoreConsoleEvent(DWORD) { return TRUE; }

std::wstring quoteArgument(const std::wstring& argument) {
  if (!argument.empty() && argument.find_first_of(L" \t\n\v\"") == std::wstring::npos) return argument;

  std::wstring quoted = L"\"";
  size_t slashes = 0;
  for (const wchar_t character : argument) {
    if (character == L'\\') {
      ++slashes;
    } else if (character == L'"') {
      quoted.append(slashes * 2 + 1, L'\\');
      quoted += L'"';
      slashes = 0;
    } else {
      quoted.append(slashes, L'\\');
      slashes = 0;
      quoted += character;
    }
  }
  quoted.append(slashes * 2, L'\\');
  quoted += L'"';
  return quoted;
}

int fail(const wchar_t* message) {
  std::wcerr << message << L" (Windows error " << GetLastError() << L")" << std::endl;
  return 1;
}
}  // namespace

int wmain(int argc, wchar_t** argv) {
  std::wstring executablePath(32768, L'\0');
  const DWORD length = GetModuleFileNameW(nullptr, executablePath.data(), static_cast<DWORD>(executablePath.size()));
  if (length == 0 || length >= executablePath.size()) return fail(L"Cannot locate AlejoxGamepad.exe");
  executablePath.resize(length);

  const size_t separator = executablePath.find_last_of(L"\\/");
  if (separator == std::wstring::npos) return fail(L"Cannot locate the application directory");
  const std::wstring directory = executablePath.substr(0, separator);
  const std::wstring node = directory + L"\\node.exe";
  const std::wstring bundle = directory + L"\\server.mjs";

  std::wstring command = quoteArgument(node) + L" " + quoteArgument(bundle);
  for (int index = 1; index < argc; ++index) command += L" " + quoteArgument(argv[index]);
  std::vector<wchar_t> mutableCommand(command.begin(), command.end());
  mutableCommand.push_back(L'\0');

  if (!SetEnvironmentVariableW(L"GAMEPAD_PACKAGED", L"1")) return fail(L"Cannot configure the packaged runtime");
  SetConsoleCtrlHandler(ignoreConsoleEvent, TRUE);

  STARTUPINFOW startup = {};
  startup.cb = sizeof(startup);
  PROCESS_INFORMATION process = {};
  if (!CreateProcessW(node.c_str(), mutableCommand.data(), nullptr, nullptr, TRUE, 0, nullptr, directory.c_str(), &startup,
                      &process)) {
    return fail(L"Cannot start the bundled Node runtime");
  }

  CloseHandle(process.hThread);
  WaitForSingleObject(process.hProcess, INFINITE);
  DWORD exitCode = 1;
  if (!GetExitCodeProcess(process.hProcess, &exitCode)) exitCode = 1;
  CloseHandle(process.hProcess);
  SetConsoleCtrlHandler(ignoreConsoleEvent, FALSE);
  return static_cast<int>(exitCode);
}
