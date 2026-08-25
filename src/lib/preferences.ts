import { ref } from "vue";
import type { Settings } from "./api";
import { setLanguage } from "./i18n";

export type Theme = Settings["theme"];

export const theme = ref<Theme>("auto");

export function applyClientSettings(settings: Settings) {
  theme.value = settings.theme;
  setLanguage(settings.language);
}
