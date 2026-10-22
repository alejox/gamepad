import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { lockLandscape } from "./adapters/orientation.js";
import { useSettingsStore } from "./stores/settings.js";
import "./styles/base.css";
import "./styles/skins.css";
import "./styles/gamepad.css";

const app = createApp(App).use(createPinia());
void useSettingsStore().load().finally(() => app.mount("#app"));
void lockLandscape();
