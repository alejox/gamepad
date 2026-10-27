#import <Cocoa/Cocoa.h>

#include <atomic>
#include <csignal>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

#include <mach-o/dyld.h>
#include <sys/stat.h>

namespace {
volatile sig_atomic_t childProcess = 0;
std::atomic<int> readyPort(0);

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

void forwardSignal(int signal) {
  const pid_t child = static_cast<pid_t>(childProcess);
  if (child > 0) kill(child, signal);
}

void makeDirs(const std::string& path) {
  for (size_t i = 1; i <= path.size(); ++i) {
    if (i < path.size() && path[i] != '/') continue;
    const std::string component = path.substr(0, i);
    if (!component.empty()) mkdir(component.c_str(), 0755);
  }
}

std::string logPath() {
  const char* home = getenv("HOME");
  const std::string base = home && *home ? home : "/tmp";
  const std::string dir = base + "/Library/Logs/AlejoxGamepad";
  makeDirs(dir);
  return dir + "/host.log";
}

void appendLog(const std::string& path, const std::string& text) {
  std::ofstream out(path, std::ios::app);
  if (out) out << text;
}

void showErrorDialog(const std::string& log) {
  std::string script = "/usr/bin/osascript -e 'display dialog \"AlejoxGamepad stopped unexpectedly. "
                       "Details were written to ";
  script += log;
  script += "\" buttons {\"OK\"} default button 1 with icon stop'";
  std::system(script.c_str());
}
}  // namespace

@interface AppDelegate : NSObject <NSApplicationDelegate, NSMenuDelegate>
@property(nonatomic, strong) NSTask* serverTask;
@property(nonatomic, strong) NSStatusItem* statusItem;
@property(nonatomic, strong) NSMutableString* pending;
@property(nonatomic, copy) NSString* logPath;
@property(nonatomic, copy) NSString* nodePath;
@property(nonatomic, copy) NSString* bundlePath;
@property(nonatomic, copy) NSString* resourcesPath;
@property(nonatomic, copy) NSString* iconPath;
@property(nonatomic, strong) NSArray<NSString*>* forwardedArgs;
@property(nonatomic) BOOL quitting;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification*)notification {
  [self setupStatusItem];
  if (![self startServer]) {
    showErrorDialog([self.logPath UTF8String]);
    [NSApp terminate:nil];
  }
}

- (void)applicationWillTerminate:(NSNotification*)notification {
  self.quitting = YES;
  if (self.serverTask && self.serverTask.isRunning) {
    [self.serverTask terminate];
    [self.serverTask waitUntilExit];
  }
}

- (void)setupStatusItem {
  self.statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSVariableStatusItemLength];
  NSImage* icon = [[NSImage alloc] initWithContentsOfFile:self.iconPath];
  if (icon) {
    icon.size = NSMakeSize(18, 18);
    [icon setTemplate:YES];
    self.statusItem.button.image = icon;
  } else {
    self.statusItem.button.title = @"🎮";
  }
  NSMenu* menu = [[NSMenu alloc] init];
  menu.delegate = self;
  self.statusItem.menu = menu;
}

- (BOOL)startServer {
  NSTask* task = [[NSTask alloc] init];
  task.launchPath = self.nodePath;
  task.currentDirectoryPath = self.resourcesPath;

  NSMutableArray<NSString*>* arguments = [NSMutableArray arrayWithObject:self.bundlePath];
  [arguments addObjectsFromArray:self.forwardedArgs];
  task.arguments = arguments;

  NSMutableDictionary* environment = [NSMutableDictionary dictionaryWithDictionary:NSProcessInfo.processInfo.environment];
  environment[@"GAMEPAD_PACKAGED"] = @"1";
  task.environment = environment;

  NSPipe* pipe = [NSPipe pipe];
  task.standardOutput = pipe;
  task.standardError = pipe;

  __weak AppDelegate* weakSelf = self;
  task.terminationHandler = ^(NSTask* finished) {
    [weakSelf serverDidExit:finished];
  };

  @try {
    [task launch];
  } @catch (NSException* exception) {
    return NO;
  }

  self.serverTask = task;
  childProcess = task.processIdentifier;

  NSFileHandle* handle = pipe.fileHandleForReading;
  handle.readabilityHandler = ^(NSFileHandle* fileHandle) {
    NSData* data = [fileHandle availableData];
    if (data.length == 0) {
      fileHandle.readabilityHandler = nil;
      return;
    }
    [weakSelf handleServerOutput:data];
  };
  return YES;
}

- (void)handleServerOutput:(NSData*)data {
  NSString* text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"";
  appendLog([self.logPath UTF8String], [text UTF8String]);
  if (readyPort.load() == 0) {
    [self.pending appendString:text];
    [self scanReadyLine];
  }
}

- (void)scanReadyLine {
  NSRegularExpression* expression =
      [NSRegularExpression regularExpressionWithPattern:@"GAMEPAD_READY (\\d+)" options:0 error:nil];
  NSTextCheckingResult* match =
      [expression firstMatchInString:self.pending options:0 range:NSMakeRange(0, self.pending.length)];
  if (match) {
    NSInteger port = [[self.pending substringWithRange:[match rangeAtIndex:1]] integerValue];
    readyPort.store((int)port);
  }
}

- (void)serverDidExit:(NSTask*)task {
  if (task.terminationStatus != 0) {
    showErrorDialog([self.logPath UTF8String]);
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    if (!self.quitting) {
      [NSApp terminate:nil];
    }
  });
}

- (NSDictionary*)fetchStatus {
  int port = readyPort.load();
  if (port <= 0) return nil;
  NSString* url = [NSString stringWithFormat:@"http://127.0.0.1:%d/status", port];
  NSData* data = [NSData dataWithContentsOfURL:[NSURL URLWithString:url]];
  if (!data) return nil;
  return [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
}

- (void)menuNeedsUpdate:(NSMenu*)menu {
  [menu removeAllItems];

  int port = readyPort.load();
  NSDictionary* status = [self fetchStatus];

  if (port <= 0) {
    [menu addItem:[self disabledItem:@"Starting…"]];
    return;
  }
  if (!status) {
    [menu addItem:[self disabledItem:@"Server not responding"]];
    [menu addItem:[NSMenuItem separatorItem]];
    [menu addItemWithTitle:@"Quit AlejoxGamepad" action:@selector(quit:) keyEquivalent:@"q"];
    return;
  }

  NSDictionary* controller = status[@"controller"];
  BOOL connected = [controller[@"connected"] boolValue];
  NSString* remote = controller[@"remoteAddress"] ?: @"";
  NSString* heading = connected ? [NSString stringWithFormat:@"Connected from %@", remote] : @"Waiting for a controller";
  NSMenuItem* headingItem = [self disabledItem:heading];
  headingItem.image = [NSImage imageNamed:connected ? NSImageNameStatusAvailable : NSImageNameStatusNone];
  [menu addItem:headingItem];

  [menu addItem:[NSMenuItem separatorItem]];

  NSArray* addresses = status[@"addresses"] ?: @[];
  if (addresses.count == 0) {
    [menu addItem:[self disabledItem:@"No LAN IPv4 address found"]];
  } else {
    for (NSString* address in addresses) {
      [menu addItem:[self copyItem:address withTitle:address]];
    }
  }

  NSString* pin = status[@"pin"] ?: @"";
  if (pin.length > 0) {
    [menu addItem:[self copyItem:pin withTitle:[NSString stringWithFormat:@"PIN %@", pin]]];
  }

  NSDictionary* driver = status[@"driver"];
  NSString* driverName = driver[@"name"] ?: @"";
  if (driverName.length > 0) {
    [menu addItem:[self disabledItem:[NSString stringWithFormat:@"Driver: %@", driverName]]];
  }

  [menu addItem:[NSMenuItem separatorItem]];
  [menu addItemWithTitle:@"Open host page" action:@selector(openHostPage:) keyEquivalent:@""];
  [menu addItemWithTitle:@"Quit AlejoxGamepad" action:@selector(quit:) keyEquivalent:@"q"];
}

- (NSMenuItem*)disabledItem:(NSString*)title {
  NSMenuItem* item = [[NSMenuItem alloc] initWithTitle:title action:nil keyEquivalent:@""];
  item.enabled = NO;
  return item;
}

- (NSMenuItem*)copyItem:(NSString*)value withTitle:(NSString*)title {
  NSMenuItem* item = [[NSMenuItem alloc] initWithTitle:title action:@selector(copyToPasteboard:) keyEquivalent:@""];
  item.target = self;
  item.representedObject = value;
  return item;
}

- (void)copyToPasteboard:(id)sender {
  NSString* value = [sender representedObject];
  if (!value) return;
  NSPasteboard* pasteboard = [NSPasteboard generalPasteboard];
  [pasteboard clearContents];
  [pasteboard setString:value forType:NSPasteboardTypeString];
}

- (void)openHostPage:(id)sender {
  int port = readyPort.load();
  if (port <= 0) return;
  NSString* url = [NSString stringWithFormat:@"http://localhost:%d/", port];
  [[NSWorkspace sharedWorkspace] openURL:[NSURL URLWithString:url]];
}

- (void)quit:(id)sender {
  [NSApp terminate:nil];
}

@end

int main(int argc, char** argv) {
  const std::filesystem::path executable = executablePath();
  if (executable.empty()) return 1;

  const std::filesystem::path resources = executable.parent_path().parent_path() / "Resources";
  const std::string node = (resources / "node").string();
  const std::string bundle = (resources / "server.mjs").string();
  const std::string icon = (resources / "AlejoxGamepad.icns").string();
  const std::string log = logPath();

  struct sigaction action = {};
  action.sa_handler = forwardSignal;
  sigemptyset(&action.sa_mask);
  sigaction(SIGINT, &action, nullptr);
  sigaction(SIGTERM, &action, nullptr);
  sigaction(SIGHUP, &action, nullptr);
  sigaction(SIGQUIT, &action, nullptr);

  NSMutableArray<NSString*>* forwarded = [NSMutableArray array];
  for (int i = 1; i < argc; ++i) {
    [forwarded addObject:[NSString stringWithUTF8String:argv[i]]];
  }

  @autoreleasepool {
    NSApplication* app = [NSApplication sharedApplication];
    [app setActivationPolicy:NSApplicationActivationPolicyAccessory];

    AppDelegate* delegate = [[AppDelegate alloc] init];
    delegate.logPath = [NSString stringWithUTF8String:log.c_str()];
    delegate.nodePath = [NSString stringWithUTF8String:node.c_str()];
    delegate.bundlePath = [NSString stringWithUTF8String:bundle.c_str()];
    delegate.resourcesPath = [NSString stringWithUTF8String:resources.c_str()];
    delegate.iconPath = [NSString stringWithUTF8String:icon.c_str()];
    delegate.forwardedArgs = forwarded;
    delegate.pending = [NSMutableString string];

    app.delegate = delegate;
    [app run];
  }
  return 0;
}
