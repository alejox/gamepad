import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { importImage } from "../adapters/imageImport.js";
import { imageStore } from "../adapters/imageStore.js";
import { persistence } from "../adapters/persistence.js";
import { type CustomLayout, defaultLayout } from "../domain/customLayout.js";
import {
  CUSTOM_SKIN,
  DEFAULT_PORT,
  DEFAULT_SKIN,
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
  /** One-off message for the user (e.g. the custom photo went missing). */
  const notice = ref<string | null>(null);
  /** Object URL of the on-device custom photo, when one is loaded. */
  const photoUrl = ref<string | null>(null);
  let loaded = false;

  async function load(): Promise<void> {
    const store = persistence();
    settings.value = parseStoredSettings(await store.get(SETTINGS_KEY));
    const server = parseStoredServer(await store.get(SERVER_KEY));
    lastHost.value = server.host;
    lastPort.value = server.port;
    await loadPhoto();
    loaded = true;
  }

  function setPhotoUrl(blob: Blob | null): void {
    if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
    photoUrl.value = blob ? URL.createObjectURL(blob) : null;
  }

  function leaveCustomSkin(message: string): void {
    if (settings.value.skin === CUSTOM_SKIN) {
      settings.value.skin = DEFAULT_SKIN;
      notice.value = message;
    }
  }

  /** Loads the stored photo; a missing or unreadable image falls back to the default skin. */
  async function loadPhoto(): Promise<void> {
    const photo = settings.value.customPhoto;
    if (!photo) return;
    try {
      const blob = await imageStore().get(photo.imageKey);
      if (blob) {
        setPhotoUrl(blob);
        return;
      }
      settings.value.customPhoto = null;
      leaveCustomSkin("Your custom photo is no longer on this device; switched to the Pro skin.");
    } catch {
      // Keep the metadata: storage may work again next launch.
      leaveCustomSkin("Could not read your custom photo; switched to the Pro skin.");
    }
  }

  /** Stores a picked image on the device and activates the custom skin. */
  async function importPhoto(file: Blob): Promise<boolean> {
    try {
      const image = await importImage(file);
      const imageKey = `photo-${Date.now().toString(36)}`;
      await imageStore().put(imageKey, image.blob);
      const previous = settings.value.customPhoto?.imageKey;
      if (previous) await imageStore().delete(previous).catch(() => undefined);
      setPhotoUrl(image.blob);
      settings.value.customPhoto = {
        imageKey,
        width: image.width,
        height: image.height,
        layout: defaultLayout(image.width / image.height),
      };
      settings.value.skin = CUSTOM_SKIN;
      return true;
    } catch {
      notice.value = "Could not use that image. Try another photo.";
      return false;
    }
  }

  async function removePhoto(): Promise<void> {
    const photo = settings.value.customPhoto;
    if (!photo) return;
    try {
      await imageStore().delete(photo.imageKey);
    } catch {
      // Orphaned blobs are harmless; the metadata is gone either way.
    }
    setPhotoUrl(null);
    settings.value.customPhoto = null;
    if (settings.value.skin === CUSTOM_SKIN) settings.value.skin = DEFAULT_SKIN;
  }

  function saveLayout(layout: CustomLayout): void {
    const photo = settings.value.customPhoto;
    if (photo) photo.layout = { version: layout.version, zones: layout.zones.map((zone) => ({ ...zone })) };
  }

  function dismissNotice(): void {
    notice.value = null;
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

  /** Resets preferences; the on-device photo and its calibration are kept. */
  function resetDefaults(): void {
    settings.value = { ...defaultSettings(), customPhoto: settings.value.customPhoto };
  }

  return {
    settings,
    lastHost,
    lastPort,
    notice,
    photoUrl,
    load,
    rememberServer,
    resetDefaults,
    importPhoto,
    removePhoto,
    saveLayout,
    dismissNotice,
  };
});
