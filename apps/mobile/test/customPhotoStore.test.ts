import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { type ImageStore, memoryImageStore, setImageStore } from "../src/adapters/imageStore.js";
import { memoryPersistence, setPersistence } from "../src/adapters/persistence.js";
import { defaultLayout } from "../src/domain/customLayout.js";
import { useSettingsStore } from "../src/stores/settings.js";

const photo = { imageKey: "photo-1", width: 1600, height: 900, layout: defaultLayout(16 / 9) };

function storedSettings(extra: Record<string, unknown>): Record<string, string> {
  return { "gamepad.settings": JSON.stringify({ skin: "custom", customPhoto: photo, ...extra }) };
}

const failingStore: ImageStore = {
  get: () => Promise.reject(new Error("IndexedDB unavailable")),
  put: () => Promise.reject(new Error("IndexedDB unavailable")),
  delete: () => Promise.reject(new Error("IndexedDB unavailable")),
};

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("custom photo skin on load", () => {
  it("keeps the custom skin when the image is on the device", async () => {
    setPersistence(memoryPersistence(storedSettings({})));
    setImageStore(memoryImageStore({ "photo-1": new Blob(["jpeg"], { type: "image/jpeg" }) }));
    const store = useSettingsStore();
    await store.load();
    expect(store.settings.skin).toBe("custom");
    expect(store.photoUrl).toMatch(/^blob:/);
    expect(store.notice).toBeNull();
  });

  it("falls back to the default skin with a notice when the image is missing", async () => {
    setPersistence(memoryPersistence(storedSettings({})));
    setImageStore(memoryImageStore());
    const store = useSettingsStore();
    await store.load();
    expect(store.settings.skin).toBe("pro");
    expect(store.settings.customPhoto).toBeNull();
    expect(store.photoUrl).toBeNull();
    expect(store.notice).toMatch(/photo/i);
  });

  it("falls back but keeps the photo metadata when storage fails", async () => {
    setPersistence(memoryPersistence(storedSettings({})));
    setImageStore(failingStore);
    const store = useSettingsStore();
    await store.load();
    expect(store.settings.skin).toBe("pro");
    expect(store.settings.customPhoto).toEqual(photo);
    expect(store.notice).toMatch(/photo/i);
  });

  it("removes the photo from the device and leaves the custom skin", async () => {
    const images = memoryImageStore({ "photo-1": new Blob(["jpeg"]) });
    setPersistence(memoryPersistence(storedSettings({})));
    setImageStore(images);
    const store = useSettingsStore();
    await store.load();
    await store.removePhoto();
    expect(await images.get("photo-1")).toBeNull();
    expect(store.settings.customPhoto).toBeNull();
    expect(store.settings.skin).toBe("pro");
  });

  it("saves a calibrated layout", async () => {
    setPersistence(memoryPersistence(storedSettings({})));
    setImageStore(memoryImageStore({ "photo-1": new Blob(["jpeg"]) }));
    const store = useSettingsStore();
    await store.load();
    const layout = defaultLayout(16 / 9);
    layout.zones[0] = { ...layout.zones[0]!, x: 0.05 };
    store.saveLayout(layout);
    expect(store.settings.customPhoto?.layout.zones[0]?.x).toBe(0.05);
  });
});
