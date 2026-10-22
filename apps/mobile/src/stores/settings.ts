import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { persistence } from "../adapters/persistence.js";
import {
  DEFAULT_PORT,
  type Settings,
  defaultSettings,
  parseStoredServer,
  parseStoredSettings,
} from "../domain/settings.js";

const SETTINGS_KEY = "gamepad.settings";
const SERVER_KEY = "gamepad.server";

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<Settings>(defaultSettings());
  const lastHost = ref("");
  const lastPort = ref(DEFAULT_PORT);
  let loaded = false;

  async function load(): Promise<void> {
    const store = persistence();
    settings.value = parseStoredSettings(await store.get(SETTINGS_KEY));
    const server = parseStoredServer(await store.get(SERVER_KEY));
    lastHost.value = server.host;
    lastPort.value = server.port;
    loaded = true;
  }

  // Persist only after the first load so defaults never overwrite saved data.
  watch(
    settings,
    (value) => {
      if (loaded) void persistence().set(SETTINGS_KEY, JSON.stringify(value));
    },
    { deep: true },
  );

  /** Remembers the last server (never the PIN). */
  function rememberServer(host: string, port: number): void {
    lastHost.value = host;
    lastPort.value = port;
    void persistence().set(SERVER_KEY, JSON.stringify({ host, port }));
  }

  return { settings, lastHost, lastPort, load, rememberServer };
});
