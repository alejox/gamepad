import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.alejox.gamepad",
  appName: "Gamepad",
  webDir: "dist",
  server: {
    // Serve the app from http://localhost so the WebView may open plain
    // ws://<lan-ip> sockets (https would block them as mixed content).
    androidScheme: "http",
    // The PC server is reached over unencrypted LAN WebSockets.
    cleartext: true,
  },
};

export default config;
