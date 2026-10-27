<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { useConnectionStore } from "./stores/connection.js";
import { useSettingsStore } from "./stores/settings.js";
import { CUSTOM_SKIN } from "./domain/settings.js";
import CalibrationView from "./views/CalibrationView.vue";
import ConnectView from "./views/ConnectView.vue";
import CustomGamepadView from "./views/CustomGamepadView.vue";
import GamepadView from "./views/GamepadView.vue";
import SettingsView from "./views/SettingsView.vue";

const connection = useConnectionStore();
const settingsStore = useSettingsStore();
const showSettings = ref(false);
const calibrating = ref(false);
const showPad = computed(() => connection.status === "paired" || connection.reconnecting);
/** The custom photo skin renders only once its on-device image is loaded. */
const customPhoto = computed(() =>
  settingsStore.settings.skin === CUSTOM_SKIN ? settingsStore.settings.customPhoto : null,
);

let noticeTimer = 0;
watchEffect(() => {
  if (!settingsStore.notice) return;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => settingsStore.dismissNotice(), 6000);
});

watchEffect(() => {
  document.documentElement.dataset.skin = settingsStore.settings.skin;
});

// Release safety: never leave keys held when the app loses focus.
function releaseInput(): void {
  connection.releaseAll();
}
function onVisibility(): void {
  if (document.visibilityState === "hidden") releaseInput();
}

function openSettings(): void {
  // The pad unmounts while settings are open; release first.
  releaseInput();
  showSettings.value = true;
}

onMounted(() => {
  window.addEventListener("blur", releaseInput);
  window.addEventListener("pagehide", releaseInput);
  document.addEventListener("visibilitychange", onVisibility);
});
onBeforeUnmount(() => {
  window.removeEventListener("blur", releaseInput);
  window.removeEventListener("pagehide", releaseInput);
  document.removeEventListener("visibilitychange", onVisibility);
});
</script>

<template>
  <main class="app" @contextmenu.prevent>
    <CalibrationView v-if="calibrating" @close="calibrating = false" />
    <SettingsView v-else-if="showSettings" @close="showSettings = false" @calibrate="calibrating = true" />
    <CustomGamepadView
      v-else-if="showPad && customPhoto && settingsStore.photoUrl"
      :photo="customPhoto"
      :photo-url="settingsStore.photoUrl"
      @settings="openSettings"
    />
    <GamepadView v-else-if="showPad" :glyphs="settingsStore.settings.skin === 'geo'" @settings="openSettings" />
    <ConnectView v-else />
    <button v-if="settingsStore.notice" type="button" class="notice" @click="settingsStore.dismissNotice()">
      {{ settingsStore.notice }}
    </button>
  </main>
</template>

<style scoped>
.notice {
  position: fixed;
  left: 50%;
  bottom: max(12px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  max-width: calc(100% - 32px);
  padding: 8px 14px;
  border: 0;
  border-radius: 10px;
  background: rgba(28, 33, 48, 0.95);
  color: #e8ecf4;
  font: inherit;
  font-size: 0.85rem;
  z-index: 10;
}
</style>
