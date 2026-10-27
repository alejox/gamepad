#include <csignal>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <string>
#include <vector>

#include <mach-o/dyld.h>
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
}  // namespace

int main(int argc, char** argv) {
  const std::filesystem::path executable = executablePath();
  if (executable.empty()) {
    std::cerr << "Cannot locate the AlejoxGamepad app executable" << std::endl;
    return 1;
  }

  const std::filesystem::path resources = executable.parent_path().parent_path() / "Resources";
  const std::string node = (resources / "node").string();
  const std::string bundle = (resources / "server.mjs").string();
  if (chdir(resources.c_str()) != 0 || setenv("GAMEPAD_PACKAGED", "1", 1) != 0) {
    std::cerr << "Cannot configure the packaged runtime" << std::endl;
    return 1;
  }

  const pid_t child = fork();
  if (child < 0) {
    std::cerr << "Cannot start the bundled Node runtime" << std::endl;
    return 1;
  }
  if (child == 0) {
    std::vector<char*> arguments;
    arguments.push_back(const_cast<char*>(node.c_str()));
    arguments.push_back(const_cast<char*>(bundle.c_str()));
    for (int index = 1; index < argc; ++index) arguments.push_back(argv[index]);
    arguments.push_back(nullptr);
    execv(node.c_str(), arguments.data());
    std::cerr << "Cannot execute the bundled Node runtime" << std::endl;
    _exit(127);
  }

  childProcess = child;
  if (!installSignalHandler(SIGINT) || !installSignalHandler(SIGTERM) || !installSignalHandler(SIGHUP) ||
      !installSignalHandler(SIGQUIT)) {
    kill(child, SIGTERM);
    waitpid(child, nullptr, 0);
    std::cerr << "Cannot install application signal handlers" << std::endl;
    return 1;
  }

  int status = 0;
  pid_t waited;
  do {
    waited = waitpid(child, &status, 0);
  } while (waited < 0 && errno == EINTR);
  childProcess = 0;
  if (waited < 0) {
    std::cerr << "Cannot wait for the bundled Node runtime" << std::endl;
    return 1;
  }
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
  return 1;
}
