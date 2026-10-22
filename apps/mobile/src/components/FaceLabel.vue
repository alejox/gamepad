<script setup lang="ts">
defineProps<{ button: "a" | "b" | "x" | "y"; glyphs: boolean }>();
</script>

<template>
  <svg v-if="glyphs" class="glyph" viewBox="0 0 24 24" aria-hidden="true">
    <path v-if="button === 'y'" d="M12 4.5 20 18.5H4Z" />
    <circle v-else-if="button === 'b'" cx="12" cy="12" r="7.5" />
    <path v-else-if="button === 'a'" d="M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5" />
    <rect v-else x="5.5" y="5.5" width="13" height="13" />
  </svg>
  <span v-else class="letter">{{ button.toUpperCase() }}</span>
</template>
