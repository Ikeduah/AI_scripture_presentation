export const isDevModeEnabled = (): boolean =>
  import.meta.env.NODE_ENV === "development" &&
  (import.meta.env.VITE_DEV_MODE === "true" ||
    import.meta.env.VITE_SHOW_WINDOWS_WHISPER_ON_MAC === "true");
