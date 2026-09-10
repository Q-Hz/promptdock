<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import appIconUrl from "../../src-tauri/icons/64x64.png";
import { api, type Settings } from "../lib/api";
import { t, translateApiError, type MessageKey } from "../lib/i18n";
import { applyClientSettings } from "../lib/preferences";
import {
  DEFAULT_GLOBAL_HOTKEY,
  DEFAULT_KEY_BINDINGS,
  bindingFromKeyboardEvent,
  formatKeybinding,
} from "../lib/keybindings";

const emit = defineEmits<{
  (e: "close"): void;
  (e: "replay-onboarding"): void;
}>();

type RecordTarget = "hotkey" | "advanceKey" | "newlineKey" | "backKey";
type SettingsSection = "general" | "shortcuts" | "updates" | "guide";

const settings = ref<Settings>({
  hotkey: DEFAULT_GLOBAL_HOTKEY,
  autostart: false,
  theme: "auto",
  language: "auto",
  advanceKey: DEFAULT_KEY_BINDINGS.advance,
  newlineKey: DEFAULT_KEY_BINDINGS.newline,
  backKey: DEFAULT_KEY_BINDINGS.back,
  autoCheckUpdate: false,
});
const originalSettings = ref<Settings>({ ...settings.value });
const hotkeyDraft = ref("");
const recordTarget = ref<RecordTarget | null>(null);
const savedTip = ref(false);
const loaded = ref(false);
const replayButton = ref<HTMLButtonElement | null>(null);
const activeSection = ref<SettingsSection>("general");

const settingsSections: { id: SettingsSection; label: MessageKey }[] = [
  { id: "general", label: "settingsGeneral" },
  { id: "shortcuts", label: "settingsShortcuts" },
  { id: "updates", label: "updates" },
  { id: "guide", label: "onboardingSettingsSection" },
];

defineExpose({
  focusReplayButton: async () => {
    activeSection.value = "guide";
    await nextTick();
    replayButton.value?.focus();
  },
});

const bindingRows: { field: RecordTarget; label: MessageKey }[] = [
  { field: "advanceKey", label: "keyAdvance" },
  { field: "newlineKey", label: "keyNewline" },
  { field: "backKey", label: "keyBack" },
];

type UpdatePhase = "idle" | "checking" | "latest" | "available" | "downloading" | "installing" | "error";
const updatePhase = ref<UpdatePhase>("idle");
const updateVersion = ref("");
const updateError = ref("");
const downloadedBytes = ref(0);
const totalBytes = ref<number | null>(null);
const appVersion = ref("");
let unlistenProgress: (() => void) | undefined;

const downloadPercent = computed(() =>
  totalBytes.value ? Math.min(100, Math.round((downloadedBytes.value / totalBytes.value) * 100)) : null
);

const updateBusy = computed(() => ["checking", "downloading", "installing"].includes(updatePhase.value));

const updateStatusText = computed(() => {
  switch (updatePhase.value) {
    case "latest":
      return t("updateUpToDate");
    case "downloading":
      return downloadPercent.value != null
        ? `${t("downloadingUpdate")} ${downloadPercent.value}%`
        : t("downloadingUpdate");
    case "installing":
      return t("installingUpdate");
    case "error":
      return updateError.value;
    default:
      return "";
  }
});

async function checkUpdates() {
  if (updateBusy.value) return;
  updatePhase.value = "checking";
  updateError.value = "";
  try {
    const info = await api.checkForUpdates();
    if (info) {
      updateVersion.value = info.version;
      updatePhase.value = "available";
    } else {
      updatePhase.value = "latest";
    }
  } catch (err) {
    updateError.value = t("updateCheckFailed", { error: translateApiError(err) });
    updatePhase.value = "error";
  }
}

async function installUpdateNow() {
  downloadedBytes.value = 0;
  totalBytes.value = null;
  updatePhase.value = "downloading";
  try {
    await api.installUpdate();
    updatePhase.value = "installing";
  } catch (err) {
    updateError.value = t("updateInstallFailed", { error: translateApiError(err) });
    updatePhase.value = "error";
  }
}

onMounted(async () => {
  settings.value = await api.getSettings();
  originalSettings.value = { ...settings.value };
  hotkeyDraft.value = settings.value.hotkey;
  loaded.value = true;
  appVersion.value = await (window as any).__TAURI__.app.getVersion().catch(() => "");
  unlistenProgress = await (window as any).__TAURI__.event.listen(
    "update-download-progress",
    (event: { payload: { chunkLength: number; contentLength: number | null } }) => {
      downloadedBytes.value += event.payload.chunkLength;
      if (event.payload.contentLength != null) totalBytes.value = event.payload.contentLength;
    }
  );
});

onUnmounted(() => {
  unlistenProgress?.();
});

watch(
  () => [settings.value.theme, settings.value.language] as const,
  () => {
    if (loaded.value) applyClientSettings(settings.value);
  }
);

function startRecord(target: RecordTarget) {
  recordTarget.value = target;
  void nextTick(() => {
    document.getElementById(`binding-input-${target}`)?.focus();
  });
}

function onHotkeyKeydown(e: KeyboardEvent) {
  if (!recordTarget.value) return;
  e.preventDefault();
  const target = recordTarget.value;
  const value = bindingFromKeyboardEvent(e, target === "hotkey");
  if (!value) return;
  if (target === "hotkey") hotkeyDraft.value = value;
  else settings.value[target] = value;
  recordTarget.value = null;
}

async function save() {
  settings.value.hotkey = hotkeyDraft.value || DEFAULT_GLOBAL_HOTKEY;
  try {
    await api.setSettings({ ...settings.value });
    originalSettings.value = { ...settings.value };
    savedTip.value = true;
    setTimeout(() => emit("close"), 600);
  } catch (err) {
    alert(
      t("saveFailed", { error: translateApiError(err) }) +
        "\n" +
        t("hotkeyUnavailable")
    );
  }
}

function cancel() {
  applyClientSettings(originalSettings.value);
  emit("close");
}

function onModalKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  event.stopPropagation();
  if (recordTarget.value) {
    recordTarget.value = null;
    return;
  }
  cancel();
}
</script>

<template>
  <div
    data-settings-modal
    class="settings-backdrop"
    role="presentation"
    @click.self="cancel"
    @keydown="onModalKeydown"
  >
    <div class="settings-shell" role="dialog" aria-modal="true" :aria-labelledby="'settings-dialog-title'">
      <header class="settings-header">
        <div class="settings-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
            <path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" />
            <path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l1.7-1.3-2-3.4-2.1.9a8 8 0 0 0-2.6-1.5L14.1 3h-4.2l-.3 2.2A8 8 0 0 0 7 6.7l-2.1-.9-2 3.4 1.7 1.3a7.8 7.8 0 0 0 0 3l-1.7 1.3 2 3.4 2.1-.9a8 8 0 0 0 2.6 1.5l.3 2.2h4.2l.3-2.2a8 8 0 0 0 2.6-1.5l2.1.9 2-3.4-1.7-1.3Z" />
          </svg>
        </div>
        <div class="min-w-0 flex-1">
          <h2 id="settings-dialog-title" class="settings-title">{{ t("settingsTitle") }}</h2>
          <p class="settings-subtitle">{{ t("settingsSubtitle") }}</p>
        </div>
        <button type="button" class="icon-button" :aria-label="t('close')" :title="t('close')" @click="cancel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
        </button>
      </header>

      <div class="settings-layout">
        <nav class="settings-nav" :aria-label="t('settingsSections')">
          <button
            v-for="item in settingsSections"
            :key="item.id"
            type="button"
            class="settings-nav-item"
            :class="{ active: activeSection === item.id }"
            :aria-current="activeSection === item.id ? 'page' : undefined"
            @click="activeSection = item.id"
          >
            <svg v-if="item.id === 'general'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" /></svg>
            <svg v-else-if="item.id === 'shortcuts'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 9h1M11 9h1M15 9h2M7 13h4M14 13h3M7 16h10" /></svg>
            <svg v-else-if="item.id === 'updates'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" /><path d="M5 19h14" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3Z" /><path d="M8 16h10M9 8h5M9 11h6" /></svg>
            <span>{{ t(item.label) }}</span>
          </button>
        </nav>

        <main class="settings-content">
          <section v-if="activeSection === 'general'" class="settings-panel" data-settings-section="general">
            <div class="panel-heading">
              <span class="panel-kicker">01</span>
              <div>
                <h3>{{ t("settingsGeneral") }}</h3>
                <p>{{ t("settingsGeneralDescription") }}</p>
              </div>
            </div>

            <div class="setting-card setting-card-grid">
              <div class="setting-field">
                <div class="field-heading">
                  <span>{{ t("theme") }}</span>
                  <small>{{ t("themeDescription") }}</small>
                </div>
                <div class="segmented-control">
                  <button
                    v-for="value in (['auto', 'light', 'dark'] as const)"
                    :key="value"
                    type="button"
                    :class="{ selected: settings.theme === value }"
                    :aria-pressed="settings.theme === value"
                    @click="settings.theme = value"
                  >{{ value === "auto" ? t("automatic") : value === "light" ? t("light") : t("dark") }}</button>
                </div>
              </div>
              <div class="setting-field">
                <div class="field-heading">
                  <span>{{ t("language") }}</span>
                  <small>{{ t("languageDescription") }}</small>
                </div>
                <div class="segmented-control">
                  <button
                    v-for="value in (['auto', 'zh', 'en'] as const)"
                    :key="value"
                    type="button"
                    :class="{ selected: settings.language === value }"
                    :aria-pressed="settings.language === value"
                    @click="settings.language = value"
                  >{{ value === "auto" ? t("automatic") : value === "zh" ? t("chinese") : t("english") }}</button>
                </div>
              </div>
            </div>

            <label class="setting-card toggle-row">
              <span class="setting-icon warm" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v10M7.5 4.1A8 8 0 1 0 16.5 4" /></svg>
              </span>
              <span class="toggle-copy">
                <strong>{{ t("autostart") }}</strong>
                <small>{{ t("autostartDescription") }}</small>
              </span>
              <input v-model="settings.autostart" type="checkbox" class="sr-only peer" />
              <span class="switch" aria-hidden="true"><span /></span>
            </label>
          </section>

          <section v-else-if="activeSection === 'shortcuts'" class="settings-panel" data-settings-section="shortcuts">
            <div class="panel-heading">
              <span class="panel-kicker">02</span>
              <div>
                <h3>{{ t("settingsShortcuts") }}</h3>
                <p>{{ t("settingsShortcutsDescription") }}</p>
              </div>
            </div>

            <div class="shortcut-feature">
              <div>
                <span class="shortcut-label">{{ t("hotkey") }}</span>
                <p>{{ t("hotkeyDescription") }}</p>
              </div>
              <button
                id="binding-input-hotkey"
                type="button"
                class="key-recorder key-recorder-large"
                :class="{ recording: recordTarget === 'hotkey' }"
                @keydown="onHotkeyKeydown"
                @click="startRecord('hotkey')"
              >
                <span>{{ recordTarget === "hotkey" ? t("pressHotkey") : formatKeybinding(hotkeyDraft) }}</span>
                <small>{{ t("change") }}</small>
              </button>
            </div>

            <div class="section-label-row">
              <span>{{ t("launcherKeysSection") }}</span>
              <small>{{ t("launcherKeysDescription") }}</small>
            </div>
            <div class="shortcut-list">
              <div v-for="row in bindingRows" :key="row.field" class="shortcut-row">
                <span>{{ t(row.label) }}</span>
                <button
                  :id="`binding-input-${row.field}`"
                  type="button"
                  class="key-recorder"
                  :class="{ recording: recordTarget === row.field }"
                  @keydown="onHotkeyKeydown"
                  @click="startRecord(row.field)"
                >
                  <code>{{ recordTarget === row.field ? t("pressHotkey") : formatKeybinding(settings[row.field]) }}</code>
                  <small>{{ t("change") }}</small>
                </button>
              </div>
            </div>
            <p class="keyboard-note">{{ t("shortcutEscapeHint") }}</p>
          </section>

          <section v-else-if="activeSection === 'updates'" class="settings-panel" data-settings-section="updates">
            <div class="panel-heading">
              <span class="panel-kicker">03</span>
              <div>
                <h3>{{ t("updates") }}</h3>
                <p>{{ t("settingsUpdatesDescription") }}</p>
              </div>
            </div>

            <div class="version-card">
              <img class="version-app-icon" :src="appIconUrl" alt="" aria-hidden="true" />
              <div class="version-copy">
                <small>PromptDock</small>
                <strong>v{{ appVersion || "—" }}</strong>
                <span>{{ updateStatusText || t("updateReady") }}</span>
              </div>
              <button type="button" class="secondary-button" :disabled="updateBusy" @click="checkUpdates">
                <svg v-if="updatePhase === 'checking'" class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></svg>
                {{ updatePhase === "checking" ? t("checkingUpdate") : t("checkUpdate") }}
              </button>
            </div>
            <div v-if="updatePhase === 'downloading'" class="progress-track" role="progressbar" :aria-valuenow="downloadPercent ?? undefined" aria-valuemin="0" aria-valuemax="100">
              <span :style="{ width: `${downloadPercent ?? 18}%` }" />
            </div>
            <div v-if="updatePhase === 'available'" class="update-banner">
              <span>{{ t("updateAvailable", { version: updateVersion }) }}</span>
              <button type="button" class="primary-button compact" @click="installUpdateNow">{{ t("installUpdate") }}</button>
            </div>
            <p v-if="updatePhase === 'error'" class="error-message" role="alert">{{ updateError }}</p>

            <label class="setting-card toggle-row">
              <span class="setting-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" /><path d="M5 19h14" /></svg>
              </span>
              <span class="toggle-copy">
                <strong>{{ t("autoCheckUpdate") }}</strong>
                <small>{{ t("autoCheckUpdateDescription") }}</small>
              </span>
              <input v-model="settings.autoCheckUpdate" type="checkbox" class="sr-only peer" />
              <span class="switch" aria-hidden="true"><span /></span>
            </label>
          </section>

          <section v-else class="settings-panel" data-settings-section="guide">
            <div class="panel-heading">
              <span class="panel-kicker">04</span>
              <div>
                <h3>{{ t("onboardingSettingsSection") }}</h3>
                <p>{{ t("settingsHelpDescription") }}</p>
              </div>
            </div>
            <div class="guide-card">
              <div class="guide-steps" aria-hidden="true">
                <span class="step-dot active">1</span><i /><span class="step-dot">2</span><i /><span class="step-dot">3</span>
              </div>
              <div class="guide-copy">
                <span>{{ t("onboardingEyebrow") }}</span>
                <h4>{{ t("guideCardTitle") }}</h4>
                <p>{{ t("onboardingSettingsDescription") }}</p>
              </div>
              <button ref="replayButton" type="button" class="secondary-button" @click="emit('replay-onboarding')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 8V4m0 0h4M5 4l3 3a7 7 0 1 1-2 7" /></svg>
                {{ t("onboardingReplay") }}
              </button>
            </div>
          </section>
        </main>
      </div>

      <footer class="settings-footer">
        <div class="footer-actions">
          <button type="button" class="text-button" @click="cancel">{{ t("cancel") }}</button>
          <button type="button" class="primary-button" @click="save">
            <svg v-if="savedTip" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
            {{ savedTip ? t("saved") : t("save") }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.48);
  backdrop-filter: blur(5px);
}

.settings-shell {
  --panel: #ffffff;
  --panel-subtle: #f7f8fa;
  --panel-muted: #eef1f5;
  --line: #e2e6ec;
  --line-strong: #d2d8e1;
  --ink: #172033;
  --muted: #677085;
  --faint: #98a1b3;
  --accent: #2563eb;
  --accent-soft: #eaf1ff;
  display: grid;
  width: min(800px, calc(100vw - 32px));
  height: min(650px, calc(100vh - 32px));
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
  color: var(--ink);
  background: var(--panel);
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 20px;
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.26), 0 2px 8px rgba(15, 23, 42, 0.12);
  animation: settings-enter 180ms ease-out both;
}

:global(.dark .settings-shell) {
  --panel: #171a21;
  --panel-subtle: #1d212a;
  --panel-muted: #252a35;
  --line: #2d3340;
  --line-strong: #3a4251;
  --ink: #edf1f7;
  --muted: #a5adbd;
  --faint: #737d90;
  --accent: #70a0ff;
  --accent-soft: rgba(65, 113, 210, 0.2);
  border-color: rgba(255, 255, 255, 0.09);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.52), 0 2px 10px rgba(0, 0, 0, 0.3);
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 13px;
  min-height: 76px;
  padding: 14px 18px 14px 20px;
  border-bottom: 1px solid var(--line);
}

.settings-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  color: #fff;
  background: linear-gradient(145deg, #3977ef, #1f52c5);
  border-radius: 12px;
  box-shadow: 0 7px 18px rgba(37, 99, 235, 0.25);
}

.settings-mark svg { width: 21px; height: 21px; }
.settings-title { margin: 0; font-size: 17px; font-weight: 700; letter-spacing: -0.015em; }
.settings-subtitle { margin: 2px 0 0; color: var(--muted); font-size: 12px; line-height: 1.4; }

.icon-button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  color: var(--muted);
  background: transparent;
  border: 0;
  border-radius: 9px;
}
.icon-button:hover { color: var(--ink); background: var(--panel-muted); }
.icon-button svg { width: 19px; height: 19px; }

.settings-layout { display: grid; min-height: 0; grid-template-columns: 184px minmax(0, 1fr); }
.settings-nav {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 5px;
  padding: 18px 12px 14px;
  background: var(--panel-subtle);
  border-right: 1px solid var(--line);
}
.settings-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 11px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 9px;
  transition: 140ms ease;
}
.settings-nav-item::before {
  position: absolute;
  left: -12px;
  width: 3px;
  height: 18px;
  content: "";
  background: var(--accent);
  border-radius: 0 3px 3px 0;
  opacity: 0;
  transform: scaleY(0.4);
  transition: 140ms ease;
}
.settings-nav-item:hover { color: var(--ink); background: var(--panel-muted); }
.settings-nav-item.active { color: var(--accent); background: var(--accent-soft); }
.settings-nav-item.active::before { opacity: 1; transform: scaleY(1); }
.settings-nav-item svg { width: 18px; height: 18px; flex: none; }
.settings-content { min-width: 0; overflow-y: auto; scrollbar-gutter: stable; }
.settings-panel { min-height: 100%; padding: 27px 30px 30px; animation: panel-enter 160ms ease-out both; }
.panel-heading { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 23px; }
.panel-kicker {
  display: grid;
  width: 29px;
  height: 29px;
  flex: none;
  place-items: center;
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  background: var(--accent-soft);
  border-radius: 9px;
}
.panel-heading h3 { margin: 0; font-size: 18px; font-weight: 720; letter-spacing: -0.02em; }
.panel-heading p { max-width: 500px; margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.55; }

.setting-card {
  background: var(--panel-subtle);
  border: 1px solid var(--line);
  border-radius: 14px;
}
.setting-card-grid { display: grid; grid-template-columns: 1fr 1fr; overflow: hidden; }
.setting-field { min-width: 0; padding: 17px; }
.setting-field + .setting-field { border-left: 1px solid var(--line); }
.field-heading { display: flex; min-height: 43px; flex-direction: column; gap: 3px; }
.field-heading > span, .section-label-row > span { font-size: 13px; font-weight: 700; }
.field-heading small, .section-label-row small { color: var(--muted); font-size: 11px; font-weight: 400; line-height: 1.35; }
.segmented-control { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; padding: 3px; background: var(--panel-muted); border-radius: 10px; }
.segmented-control button {
  overflow: hidden;
  padding: 7px 4px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: transparent;
  border: 0;
  border-radius: 7px;
}
.segmented-control button:hover { color: var(--ink); }
.segmented-control button.selected { color: var(--accent); background: var(--panel); box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12); }

.toggle-row { display: flex; align-items: center; gap: 13px; margin-top: 14px; padding: 15px 16px; cursor: pointer; }
.setting-icon { display: grid; width: 34px; height: 34px; flex: none; place-items: center; color: var(--accent); background: var(--accent-soft); border-radius: 10px; }
.setting-icon.warm { color: #ba6415; background: #fff0d9; }
:global(.dark .setting-icon.warm) { color: #ffbd6e; background: rgba(180, 95, 18, 0.2); }
.setting-icon svg { width: 18px; height: 18px; }
.toggle-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
.toggle-copy strong { font-size: 13px; font-weight: 700; }
.toggle-copy small { color: var(--muted); font-size: 11px; line-height: 1.4; }
.switch { position: relative; width: 38px; height: 22px; flex: none; background: var(--line-strong); border-radius: 999px; transition: 160ms ease; }
.switch span { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; background: #fff; border-radius: 50%; box-shadow: 0 1px 4px rgba(15, 23, 42, 0.25); transition: 160ms ease; }
.peer:checked + .switch { background: var(--accent); }
.peer:checked + .switch span { transform: translateX(16px); }
.peer:focus-visible + .switch { outline: 2px solid var(--accent); outline-offset: 3px; }

.shortcut-feature {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(230px, auto);
  align-items: center;
  gap: 20px;
  padding: 17px 18px;
  color: var(--ink);
  background: var(--panel-subtle);
  border: 1px solid var(--line);
  border-radius: 15px;
}
.shortcut-label { font-size: 13px; font-weight: 700; }
.shortcut-feature p { margin: 4px 0 0; color: var(--muted); font-size: 11px; line-height: 1.45; }
.key-recorder {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 190px;
  padding: 8px 10px;
  color: var(--ink);
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  transition: 140ms ease;
}
.key-recorder:hover { border-color: var(--accent); }
.key-recorder:focus-visible, .key-recorder.recording { border-color: var(--accent); outline: 3px solid var(--accent-soft); }
.key-recorder-large { min-height: 42px; }
.key-recorder > span, .key-recorder code { overflow: hidden; font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace; font-size: 11px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.key-recorder small { color: var(--accent); font-size: 10px; font-weight: 700; }
.section-label-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 22px 2px 8px; }
.shortcut-list { overflow: hidden; border: 1px solid var(--line); border-radius: 13px; }
.shortcut-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 10px 12px 10px 15px; }
.shortcut-row + .shortcut-row { border-top: 1px solid var(--line); }
.shortcut-row > span { color: var(--muted); font-size: 12px; font-weight: 600; }
.keyboard-note { margin: 10px 2px 0; color: var(--faint); font-size: 10px; }

.version-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  overflow: hidden;
  padding: 18px;
  background: var(--panel-subtle);
  border: 1px solid var(--line);
  border-radius: 15px;
}
.version-app-icon {
  width: 52px;
  height: 52px;
  flex: none;
  object-fit: contain;
  filter: drop-shadow(0 5px 8px rgba(15, 23, 42, 0.18));
}
.version-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.version-copy small { color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.version-copy strong { margin-top: 1px; font-size: 18px; letter-spacing: -0.02em; }
.version-copy span { overflow: hidden; margin-top: 2px; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.progress-track { height: 4px; margin: -3px 14px 0; overflow: hidden; background: var(--panel-muted); border-radius: 999px; }
.progress-track span { display: block; height: 100%; background: var(--accent); border-radius: inherit; transition: width 180ms ease; }
.update-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; padding: 10px 12px; color: var(--accent); font-size: 12px; font-weight: 700; background: var(--accent-soft); border-radius: 10px; }
.error-message { margin: 10px 2px 0; color: #dc2626; font-size: 11px; line-height: 1.45; }

.guide-card {
  position: relative;
  overflow: hidden;
  padding: 24px;
  background: linear-gradient(145deg, var(--panel-subtle), var(--panel));
  border: 1px solid var(--line);
  border-radius: 16px;
}
.guide-card::after { position: absolute; right: -54px; bottom: -62px; width: 160px; height: 160px; content: ""; background: radial-gradient(circle, rgba(37, 99, 235, 0.18), transparent 68%); }
.guide-steps { display: flex; align-items: center; width: 196px; margin-bottom: 24px; }
.step-dot { display: grid; width: 27px; height: 27px; flex: none; place-items: center; color: var(--muted); font-size: 10px; font-weight: 800; background: var(--panel); border: 1px solid var(--line-strong); border-radius: 50%; }
.step-dot.active { color: #fff; background: var(--accent); border-color: var(--accent); box-shadow: 0 0 0 5px var(--accent-soft); }
.guide-steps i { height: 1px; flex: 1; background: var(--line-strong); }
.guide-copy { max-width: 390px; margin-bottom: 24px; }
.guide-copy > span { color: var(--accent); font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
.guide-copy h4 { margin: 5px 0 6px; font-size: 17px; letter-spacing: -0.015em; }
.guide-copy p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; }

.primary-button, .secondary-button, .text-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 34px;
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 9px;
  transition: 140ms ease;
}
.primary-button { color: #fff; background: #2563eb; border: 1px solid #2563eb; box-shadow: 0 4px 11px rgba(37, 99, 235, 0.2); }
.primary-button:hover { background: #1d4ed8; border-color: #1d4ed8; transform: translateY(-1px); }
.primary-button.compact { min-height: 30px; padding: 5px 10px; font-size: 11px; box-shadow: none; }
.primary-button svg, .secondary-button svg { width: 15px; height: 15px; }
.secondary-button { color: var(--ink); background: var(--panel); border: 1px solid var(--line-strong); }
.secondary-button:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
.secondary-button:disabled { cursor: not-allowed; opacity: 0.58; }
.text-button { color: var(--muted); background: transparent; border: 1px solid transparent; }
.text-button:hover { color: var(--ink); background: var(--panel-muted); }
.spin { animation: spin 800ms linear infinite; }

.settings-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  min-height: 64px;
  padding: 12px 18px;
  background: var(--panel);
  border-top: 1px solid var(--line);
}
.footer-actions { display: flex; gap: 7px; }

button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

@keyframes settings-enter { from { opacity: 0; transform: translateY(6px) scale(0.99); } }
@keyframes panel-enter { from { opacity: 0; transform: translateX(4px); } }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 680px) {
  .settings-shell { height: min(690px, calc(100vh - 20px)); }
  .settings-header { min-height: 68px; }
  .settings-layout { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .settings-nav { flex-direction: row; overflow-x: auto; padding: 8px 10px; border-right: 0; border-bottom: 1px solid var(--line); }
  .settings-nav-item { justify-content: center; min-width: max-content; padding: 8px 10px; }
  .settings-nav-item::before { display: none; }
  .settings-panel { padding: 22px 20px 24px; }
}

@media (max-width: 520px) {
  .settings-backdrop { padding: 10px; }
  .settings-shell { width: calc(100vw - 20px); }
  .settings-subtitle, .settings-nav-item span { display: none; }
  .settings-nav-item { min-width: 42px; }
  .settings-nav-item svg { width: 19px; height: 19px; }
  .setting-card-grid { grid-template-columns: 1fr; }
  .setting-field + .setting-field { border-top: 1px solid var(--line); border-left: 0; }
  .shortcut-feature { grid-template-columns: 1fr; }
  .key-recorder-large { width: 100%; }
  .shortcut-row { align-items: flex-start; flex-direction: column; gap: 6px; }
  .shortcut-row .key-recorder { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .settings-shell, .settings-panel, .spin { animation: none; }
}
</style>
