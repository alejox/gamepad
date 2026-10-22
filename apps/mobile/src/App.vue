<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useConnectionStore } from "./stores/connection.js";
import ConnectView from "./views/ConnectView.vue";
import GamepadView from "./views/GamepadView.vue";

const connection = useConnectionStore();
const showPad = computed(() => connection.status === "paired" || connection.reconnecting);

// Release safety: never leave keys held when the app loses focus.
function releaseInput(): void {
  connection.releaseAll();
}
function onVisibility(): void {
  if (document.visibilityState === "hidden") releaseInput();
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
    <GamepadView v-if="showPad" />
    <ConnectView v-else />
  </main>
</template>
