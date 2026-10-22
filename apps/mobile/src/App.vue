<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from "vue";
import { useConnectionStore } from "./stores/connection.js";
import { useSettingsStore } from "./stores/settings.js";
import ConnectView from "./views/ConnectView.vue";
import GamepadView from "./views/GamepadView.vue";
import SettingsView from "./views/SettingsView.vue";

const connection = useConnectionStore();
const settingsStore = useSettingsStore();
const showSettings = ref(false);
const showPad = computed(() => connection.status === "paired" || connection.reconnecting);

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
    <SettingsView v-if="showSettings" @close="showSettings = false" />
    <GamepadView v-else-if="showPad" :glyphs="settingsStore.settings.skin === 'geo'" @settings="openSettings" />
    <ConnectView v-else />
  </main>
</template>
