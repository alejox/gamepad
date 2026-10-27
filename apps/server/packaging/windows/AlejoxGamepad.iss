#ifndef AppVersion
#define AppVersion "0.1.0"
#endif
#ifndef SourceDir
#define SourceDir "..\..\dist\windows\AlejoxGamepad"
#endif

[Setup]
AppId={{7F01683A-0A64-4E6F-9F2E-0A2E147F0B91}
AppName=AlejoxGamepad
AppVersion={#AppVersion}
AppVerName=AlejoxGamepad {#AppVersion}
DefaultDirName={autopf}\AlejoxGamepad
DefaultGroupName=AlejoxGamepad
OutputDir=..\..\dist\artifacts
OutputBaseFilename=AlejoxGamepad-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\AlejoxGamepad.exe
WizardStyle=modern

[Tasks]
Name: desktopicon; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"
Name: vigembus; Description: "Install ViGEmBus 1.22.0 (virtual Xbox 360 controller driver)"; GroupDescription: "Optional components:"; Flags: checkedonce

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\AlejoxGamepad"; Filename: "{app}\AlejoxGamepad.exe"; WorkingDir: "{app}"
Name: "{group}\Uninstall AlejoxGamepad"; Filename: "{uninstallexe}"
Name: "{autodesktop}\AlejoxGamepad"; Filename: "{app}\AlejoxGamepad.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "netsh.exe"; Parameters: "advfirewall firewall add rule name=""AlejoxGamepad"" dir=in action=allow program=""{app}\node.exe"" enable=yes profile=private protocol=TCP localport=7531"; Flags: runhidden waituntilterminated; StatusMsg: "Allowing AlejoxGamepad on private networks..."
Filename: "{app}\redistributables\ViGEmBus_1.22.0_x64_x86_arm64.exe"; Parameters: "/quiet /norestart"; Flags: runhidden waituntilterminated; StatusMsg: "Installing ViGEmBus 1.22.0..."; Tasks: vigembus
Filename: "{app}\AlejoxGamepad.exe"; Description: "Launch AlejoxGamepad"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "netsh.exe"; Parameters: "advfirewall firewall delete rule name=""AlejoxGamepad"""; Flags: runhidden waituntilterminated
