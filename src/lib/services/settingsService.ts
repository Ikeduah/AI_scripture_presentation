import type {
  SmartVersesSettings,
} from "@/lib/types/smartVerses";
import { DEFAULT_SMART_VERSES_SETTINGS, SMART_VERSES_SETTINGS_KEY } from "@/lib/types/smartVerses";
import type { AppSettings } from "@/lib/types";
import { getSecureKey, setSecureKey } from "./secureStore";

const APP_SETTINGS_KEY = "proassist-app-settings";

export async function loadSmartVersesSettingsAsync(): Promise<SmartVersesSettings> {
  let settings = { ...DEFAULT_SMART_VERSES_SETTINGS };
  try {
    const stored = localStorage.getItem(SMART_VERSES_SETTINGS_KEY);
    if (stored) {
      settings = { ...settings, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error("Failed to load settings from localStorage", e);
  }

  // Load API keys securely
  const groqApiKey = await getSecureKey("groqApiKey");
  if (groqApiKey) settings.groqApiKey = groqApiKey;

  return settings;
}

export async function saveSmartVersesSettingsAsync(settings: SmartVersesSettings): Promise<void> {
  const { groqApiKey, ...rest } = settings;
  try {
    localStorage.setItem(SMART_VERSES_SETTINGS_KEY, JSON.stringify(rest));
  } catch (e) {
    console.error("Failed to save settings", e);
  }

  await setSecureKey("groqApiKey", groqApiKey || "");
}

export async function loadAppSettingsAsync(): Promise<AppSettings> {
  let appSettings: AppSettings = { theme: "dark" };
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if (raw) {
      appSettings = JSON.parse(raw) as AppSettings;
    }
  } catch (e) {
    console.error("Failed to load app settings from localStorage", e);
  }

  const openRouterApiKey = await getSecureKey("openRouterApiKey");
  if (openRouterApiKey) {
    if (!appSettings.openRouterConfig) {
       appSettings.openRouterConfig = { apiKey: openRouterApiKey };
    } else {
       appSettings.openRouterConfig.apiKey = openRouterApiKey;
    }
  }

  return appSettings;
}

export async function saveAppSettingsAsync(settings: AppSettings): Promise<void> {
  let openRouterApiKey = "";
  if (settings.openRouterConfig?.apiKey) {
    openRouterApiKey = settings.openRouterConfig.apiKey;
    // We purposefully don't delete it from resting struct to avoid breaking type, but we might want to blank it in localStorage
    settings = {
      ...settings,
      openRouterConfig: {
        ...settings.openRouterConfig,
        apiKey: "" // Do not store in plain text
      }
    };
  }

  try {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("app-settings-changed", { detail: settings }));
  } catch (e) {
    // ignore
  }

  await setSecureKey("openRouterApiKey", openRouterApiKey);
}
