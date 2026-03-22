/**
 * useSmartVersesSettings
 * 
 * Manages SmartVerses settings and app-level settings with
 * cross-tab synchronization and event-driven reload.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  SmartVersesSettings,
} from "@/lib/types/smartVerses";
import { DEFAULT_SMART_VERSES_SETTINGS, SMART_VERSES_SETTINGS_KEY } from "@/lib/types/smartVerses";
import type { AppSettings } from "@/lib/types";
import {
  loadSmartVersesSettingsAsync,
  loadAppSettingsAsync,
} from "@/lib/services/settingsService";

export function useSmartVersesSettings() {
  const [settings, setSettings] = useState<SmartVersesSettings>(DEFAULT_SMART_VERSES_SETTINGS);
  const [appSettings, setAppSettings] = useState<AppSettings>({ theme: "dark" });

  const settingsRef = useRef<SmartVersesSettings>(DEFAULT_SMART_VERSES_SETTINGS);
  const autoTriggerOnDetectionRef = useRef<boolean>(
    DEFAULT_SMART_VERSES_SETTINGS.autoTriggerOnDetection
  );

  const reloadSettings = useCallback(async () => {
    const smartVersesSettings = await loadSmartVersesSettingsAsync();
    const appSettingsData = await loadAppSettingsAsync();

    console.log("[SmartVerses] SmartVerses Settings:", JSON.stringify({
      provider: smartVersesSettings.bibleSearchProvider,
      model: smartVersesSettings.bibleSearchModel,
      enableAISearch: smartVersesSettings.enableAISearch,
      hasGroqKey: !!smartVersesSettings.groqApiKey,
    }));
    console.log("[SmartVerses] App Settings:", JSON.stringify({
      defaultProvider: appSettingsData.defaultAIProvider,
      hasOpenRouterKey: !!appSettingsData.openRouterConfig?.apiKey,
    }));

    setSettings(smartVersesSettings);
    setAppSettings(appSettingsData);
  }, []);

  // Initialization + cross-tab sync
  useEffect(() => {
    reloadSettings();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SMART_VERSES_SETTINGS_KEY || e.key === "proassist_app_settings") {
        reloadSettings();
      }
    };

    const handleSettingsChanged = () => {
      console.log("[SmartVerses] Settings changed event received");
      reloadSettings();
    };

    const handleFocus = () => reloadSettings();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reloadSettings();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("app-settings-changed", handleSettingsChanged);
    window.addEventListener("smartverses-settings-changed", handleSettingsChanged);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("app-settings-changed", handleSettingsChanged);
      window.removeEventListener("smartverses-settings-changed", handleSettingsChanged);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [reloadSettings]);

  // Keep refs in sync
  useEffect(() => {
    autoTriggerOnDetectionRef.current = settings.autoTriggerOnDetection;
  }, [settings.autoTriggerOnDetection]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  return {
    settings,
    setSettings,
    appSettings,
    settingsRef,
    autoTriggerOnDetectionRef,
    reloadSettings,
  };
}
