<script setup lang="ts">
import { useConnectionStore } from "../stores/connection.js";

const connection = useConnectionStore();
</script>

<template>
  <section class="pad no-select">
    <span class="dot" :class="{ ok: connection.status === 'paired' }" />
    <span>{{ connection.reconnecting ? "Reconnecting…" : `${connection.latencyMs ?? "–"} ms` }}</span>
    <button type="button" @pointerdown.prevent="connection.disconnect()">Disconnect</button>
  </section>
</template>

<style scoped>
.pad {
  height: 100%;
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ff5a5a;
}
.dot.ok {
  background: #3ddc84;
}
</style>
