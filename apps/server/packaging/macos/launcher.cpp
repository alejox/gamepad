#include <csignal>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <string>
#include <vector>

#include <fcntl.h>
#include <mach-o/dyld.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <unistd.h>

namespace {
volatile sig_atomic_t childProcess = 0;

void forwardSignal(int signal) {
  const pid_t child = static_cast<pid_t>(childProcess);
  if (child > 0) kill(child, signal);
}

bool installSignalHandler(int signal) {
  struct sigaction action = {};
  action.sa_handler = forwardSignal;
  sigemptyset(&action.sa_mask);
  return sigaction(signal, &action, nullptr) == 0;
}

std::filesystem::path executablePath() {
  uint32_t size = 0;
  _NSGetExecutablePath(nullptr, &size);
  std::vector<char> buffer(size);
  if (_NSGetExecutablePath(buffer.data(), &size) != 0) return {};

  char* resolved = realpath(buffer.data(), nullptr);
  if (resolved == nullptr) return {};
  const std::filesystem::path path(resolved);
  free(resolved);
  return path;
}

/** Creates `path` and every missing directory before it (best effort). */
void makeDirs(const std::string& path) {
  for (size_t i = 1; i <= path.size(); ++i) {
    if (i < path.size() && path[i] != '/') continue;
    const std::string component = path.substr(0, i);
    if (!component.empty()) mkdir(component.c_str(), 0755);
  }
}

/** Log file that captures the bundled server's stdout and stderr. */
std::string logPath() {
  const char* home = getenv("HOME");
  const std::string base = home && *home ? home : "/tmp";
  const std::string dir = base + "/Library/Logs/AlejoxGamepad";
  makeDirs(dir);
  return dir + "/host.log";
}

/** Shows a native dialog so a failed start is never silent. Best effort. */
void showErrorDialog(const std::string& log) {
  std::string script = "/usr/bin/osascript -e 'display dialog \"AlejoxGamepad stopped unexpectedly. "
                       "Details were written to ";
  script += log;
  script += "\" buttons {\"OK\"} default button 1 with icon stop'";
  // The dialog blocks until the user dismisses it; then we exit.
  std::system(script.c_str());
}
}  // namespace

int main(int argc, char** argv) {
  const std::string log = logPath();
  const std::filesystem::path executable = executablePath();
  if (executable.empty()) {
    showErrorDialog(log);
    return 1;
  }

  const std::filesystem::path resources = executable.parent_path().parent_path() / "Resources";
  const std::string node = (resources / "node").string();
  const std::string bundle = (resources / "server.mjs").string();
  if (chdir(resources.c_str()) != 0 || setenv("GAMEPAD_PACKAGED", "1", 1) != 0) {
    showErrorDialog(log);
    return 1;
  }

  const int logFd = open(log.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);

  const pid_t child = fork();
  if (child < 0) {
    showErrorDialog(log);
    return 1;
  }
  if (child == 0) {
    // The bundled server's output has nowhere visible to go: capture it.
    if (logFd >= 0) {
      dup2(logFd, STDOUT_FILENO);
      dup2(logFd, STDERR_FILENO);
    }
    close(logFd);
    std::vector<char*> arguments;
    arguments.push_back(const_cast<char*>(node.c_str()));
    arguments.push_back(const_cast<char*>(bundle.c_str()));
    for (int index = 1; index < argc; ++index) arguments.push_back(argv[index]);
    arguments.push_back(nullptr);
    execv(node.c_str(), arguments.data());
    _exit(127);
  }
  close(logFd);

  childProcess = child;
  if (!installSignalHandler(SIGINT) || !installSignalHandler(SIGTERM) || !installSignalHandler(SIGHUP) ||
      !installSignalHandler(SIGQUIT)) {
    kill(child, SIGTERM);
    waitpid(child, nullptr, 0);
    showErrorDialog(log);
    return 1;
  }

  int status = 0;
  pid_t waited;
  do {
    waited = waitpid(child, &status, 0);
  } while (waited < 0 && errno == EINTR);
  childProcess = 0;
  if (waited < 0) {
    showErrorDialog(log);
    return 1;
  }

  const bool cleanExit = WIFEXITED(status) && WEXITSTATUS(status) == 0;
  if (!cleanExit) showErrorDialog(log);
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
  return 1;
}
