import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaCog,
  FaArrowLeft,
  FaMicrophone,
  FaRobot,
  FaPalette,
  FaFileExport,
  FaBroadcastTower,
  FaKey,
  FaCheck,
  FaTrash,
  FaPlus,
  FaSpinner,
  FaExternalLinkAlt,
} from "react-icons/fa";
import type { SmartVersesSettings, TranscriptionEngine, ParaphraseDetectionMode, AudioCaptureMode } from "@/lib/types/smartVerses";
import { DEFAULT_SMART_VERSES_SETTINGS, SMART_VERSES_SETTINGS_KEY, AVAILABLE_OFFLINE_MODELS } from "@/lib/types/smartVerses";
import type { AppSettings, AIProvider } from "@/lib/types";
import { GROQ_MODELS, OPENROUTER_MODELS } from "@/lib/types";
import type { ProPresenterConnection } from "@/lib/types/propresenter";

import {
  loadProPresenterConnections,
  saveProPresenterConnections,
  testConnection,
  generateUUID,
} from "@/lib/services/propresenterService";
import {
  loadSmartVersesSettingsAsync,
  saveSmartVersesSettingsAsync,
  loadAppSettingsAsync,
  saveAppSettingsAsync,
} from "@/lib/services/settingsService";
import {
  sectionStyle,
  sectionHeaderStyle,
} from "@/lib/utils/settingsSectionStyles";
import "@/index.css";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get all models for a given provider */
function getModelsForProvider(provider: Exclude<AIProvider, null>): readonly string[] {
  switch (provider) {
    case "groq": return GROQ_MODELS;
    case "openrouter": return OPENROUTER_MODELS;
    default: return [];
  }
}

// ---------------------------------------------------------------------------
// Shared style constants
// ---------------------------------------------------------------------------

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-2) 0",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 500,
  color: "var(--app-text-color)",
};

const hintStyle: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--app-text-color-secondary)",
  marginTop: "2px",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "6px",
  border: "1px solid var(--app-border-color)",
  backgroundColor: "var(--app-input-bg-color)",
  color: "var(--app-input-text-color)",
  fontSize: "0.85rem",
  outline: "none",
  width: "250px",
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };

// ---------------------------------------------------------------------------
// Toggle component
// ---------------------------------------------------------------------------

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(!checked); } }}
      style={{
        position: "relative", width: 44, height: 24, flexShrink: 0, cursor: "pointer",
        backgroundColor: checked ? "var(--app-primary-color)" : "rgba(255,255,255,0.12)",
        borderRadius: 12, transition: "background-color 0.2s ease",
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: checked ? 22 : 3,
        width: 18, height: 18, borderRadius: "50%", backgroundColor: "#fff",
        transition: "left 0.2s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
      }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusDot — green/red connection indicator
// ---------------------------------------------------------------------------

function StatusDot({ connected }: { connected: boolean | null }) {
  const color = connected === null ? "var(--app-text-color-secondary)" : connected ? "var(--success)" : "var(--error)";
  return (
    <div style={{
      width: 8, height: 8, borderRadius: "50%", backgroundColor: color,
      boxShadow: connected ? `0 0 6px ${color}` : "none", flexShrink: 0,
    }} />
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SmartVersesSettings>(DEFAULT_SMART_VERSES_SETTINGS);
  const [appSettings, setAppSettings] = useState<AppSettings>({ theme: "dark" });
  const [activeSection, setActiveSection] = useState<string>("ai");

  // ProPresenter connections
  const [ppConnections, setPpConnections] = useState<ProPresenterConnection[]>([]);
  const [ppTestResults, setPpTestResults] = useState<Record<string, { status: "idle" | "testing" | "ok" | "fail"; message: string }>>({});

  // Microphone devices
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);

  // ---- Load state on mount ----
  useEffect(() => {
    async function loadAll() {
      const sv = await loadSmartVersesSettingsAsync();
      const app = await loadAppSettingsAsync();
      setSettings(sv);
      setAppSettings(app);
      setPpConnections(loadProPresenterConnections());
    }
    loadAll();

    // Jump to section if requested
    try {
      const view = localStorage.getItem("proassist-settings-current-view");
      if (view) {
        setActiveSection(view === "smartVerses" ? "transcription" : view);
        localStorage.removeItem("proassist-settings-current-view");
      }
    } catch { /* ignore */ }

    // Enumerate microphones
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        setMicrophones(devices.filter((d) => d.kind === "audioinput"));
      }).catch(() => {});
    }
  }, []);

  // Navigate-to-settings event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === "smartVerses") setActiveSection("transcription");
      else if (typeof detail === "string") setActiveSection(detail);
    };
    window.addEventListener("navigate-to-settings", handler);
    return () => window.removeEventListener("navigate-to-settings", handler);
  }, []);

  // ---- SmartVerses setting updater ----
  const updateSetting = useCallback(<K extends keyof SmartVersesSettings>(key: K, value: SmartVersesSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSmartVersesSettingsAsync(next).then(() => {
        window.dispatchEvent(new CustomEvent("smartverses-settings-changed", { detail: next }));
      });
      return next;
    });
  }, []);

  // ---- App setting updater ----
  const updateAppSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setAppSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveAppSettingsAsync(next);
      return next;
    });
  }, []);

  // ---- ProPresenter helpers ----
  const updatePpConnection = useCallback((id: string, patch: Partial<ProPresenterConnection>) => {
    setPpConnections((prev) => {
      const next = prev.map((c) => c.id === id ? { ...c, ...patch } : c);
      saveProPresenterConnections(next);
      return next;
    });
  }, []);

  const addPpConnection = useCallback(() => {
    setPpConnections((prev) => {
      const next = [...prev, { id: generateUUID(), name: `ProPresenter ${prev.length + 1}`, apiUrl: "http://localhost:1025", timerIndex: 0, isEnabled: false }];
      saveProPresenterConnections(next);
      return next;
    });
  }, []);

  const removePpConnection = useCallback((id: string) => {
    setPpConnections((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveProPresenterConnections(next);
      return next;
    });
  }, []);

  const handleTestPpConnection = useCallback(async (conn: ProPresenterConnection) => {
    setPpTestResults((prev) => ({ ...prev, [conn.id]: { status: "testing", message: "Connecting..." } }));
    const result = await testConnection(conn);
    setPpTestResults((prev) => ({
      ...prev,
      [conn.id]: { status: result.success ? "ok" : "fail", message: result.message },
    }));
  }, []);

  // ---- Nav items ----
  const sections = useMemo(() => [
    { id: "ai", label: "AI Config", icon: <FaKey size={14} /> },
    { id: "transcription", label: "Transcription", icon: <FaMicrophone size={14} /> },
    { id: "detection", label: "Detection", icon: <FaRobot size={14} /> },
    { id: "display", label: "Display", icon: <FaPalette size={14} /> },
    { id: "output", label: "Output", icon: <FaFileExport size={14} /> },
    { id: "propresenter", label: "ProPresenter", icon: <FaBroadcastTower size={14} /> },
  ], []);

  // ---- Available providers for the global default ----
  const availableProviders = useMemo(() => {
    const providers: Exclude<AIProvider, null>[] = [];
    if (settings.groqApiKey) providers.push("groq");
    if (appSettings.openRouterConfig?.apiKey) providers.push("openrouter");
    return providers;
  }, [settings.groqApiKey, appSettings.openRouterConfig]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", backgroundColor: "var(--app-bg-color)" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: "var(--spacing-3)",
        padding: "var(--spacing-3) var(--spacing-4)", borderBottom: "1px solid var(--app-border-color)",
        backgroundColor: "var(--app-header-bg)", flexShrink: 0,
      }}>
        <button className="icon-button" onClick={() => navigate("/")} title="Back" style={{ padding: "8px" }}>
          <FaArrowLeft size={16} />
        </button>
        <FaCog size={18} style={{ color: "var(--app-text-color-secondary)" }} />
        <h1 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--app-text-color)" }}>Settings</h1>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <nav style={{
          width: 200, flexShrink: 0, borderRight: "1px solid var(--app-border-color)",
          backgroundColor: "var(--app-header-bg)", padding: "var(--spacing-3) 0", overflowY: "auto",
        }}>
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "var(--spacing-2)",
                padding: "10px var(--spacing-4)", border: "none",
                background: activeSection === s.id ? "rgba(59,130,246,0.15)" : "transparent",
                color: activeSection === s.id ? "var(--app-primary-color)" : "var(--app-text-color-secondary)",
                fontSize: "0.85rem", fontWeight: activeSection === s.id ? 600 : 400,
                cursor: "pointer", textAlign: "left",
                borderLeft: activeSection === s.id ? "3px solid var(--app-primary-color)" : "3px solid transparent",
                transition: "all 0.15s ease",
              }}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main style={{ flex: 1, overflowY: "auto", padding: "var(--spacing-6)" }}>

          {/* ================================================================
              AI CONFIG
              ================================================================ */}
          {activeSection === "ai" && (
            <div>
              <h2 style={{ margin: "0 0 var(--spacing-4)", fontSize: "1.15rem", fontWeight: 700, color: "var(--app-text-color)" }}>AI Configuration</h2>

              {/* Default provider */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <FaRobot size={14} style={{ color: "var(--app-primary-color)" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>Default Provider</span>
                </div>
                <div style={rowStyle}>
                  <div>
                    <div style={labelStyle}>Default AI Provider</div>
                    <div style={hintStyle}>
                      {availableProviders.length === 0 ? "Add an API key below to enable" : "Used when no feature-specific override is set"}
                    </div>
                  </div>
                  <select
                    value={appSettings.defaultAIProvider || ""}
                    onChange={(e) => updateAppSetting("defaultAIProvider", (e.target.value || null) as AIProvider)}
                    style={selectStyle}
                  >
                    <option value="">None</option>
                    {availableProviders.map((p) => (
                      <option key={p} value={p!}>{p!.charAt(0).toUpperCase() + p!.slice(1)}</option>
                    ))}
                  </select>
                </div>
                {appSettings.defaultAIProvider && (
                  <div style={rowStyle}>
                    <div><div style={labelStyle}>Default Model</div></div>
                    <select
                      value={appSettings.defaultAIModel || ""}
                      onChange={(e) => updateAppSetting("defaultAIModel", e.target.value)}
                      style={selectStyle}
                    >
                      {getModelsForProvider(appSettings.defaultAIProvider).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Groq */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <FaKey size={14} style={{ color: "var(--app-primary-color)" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>Groq</span>
                  <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer"
                    style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--app-text-color-secondary)", display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                    Get key <FaExternalLinkAlt size={9} />
                  </a>
                </div>
                <div style={rowStyle}>
                  <div>
                    <div style={labelStyle}>API Key</div>
                    <div style={hintStyle}>Used for transcription &amp; AI search</div>
                  </div>
                  <input type="password" value={settings.groqApiKey || ""} onChange={(e) => updateSetting("groqApiKey", e.target.value)} placeholder="gsk_..." style={inputStyle} />
                </div>
                <div style={rowStyle}>
                  <div><div style={labelStyle}>Model</div></div>
                  <select value={settings.groqModel || "llama-3.3-70b-versatile"} onChange={(e) => updateSetting("groqModel", e.target.value)} style={selectStyle}>
                    {GROQ_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* OpenRouter */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <FaRobot size={14} style={{ color: "var(--app-primary-color)" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>OpenRouter</span>
                  <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer"
                    style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--app-text-color-secondary)", display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                    Get key <FaExternalLinkAlt size={9} />
                  </a>
                </div>
                <div style={rowStyle}>
                  <div>
                    <div style={labelStyle}>API Key</div>
                    <div style={hintStyle}>Access all models (Claude, GPT, Llama) through one key</div>
                  </div>
                  <input type="password" value={appSettings.openRouterConfig?.apiKey || ""} onChange={(e) => updateAppSetting("openRouterConfig", { apiKey: e.target.value })} placeholder="sk-or-v1-..." style={inputStyle} />
                </div>
              </div>

              {/* Per-feature AI model overrides */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <FaCog size={14} style={{ color: "var(--app-text-color-secondary)" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>Feature Model Overrides</span>
                </div>
                <div style={hintStyle}>Override the default provider/model for specific features. Leave empty to use the default.</div>

                {/* Spell Check */}
                <div style={{ ...rowStyle, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 160 }}><div style={labelStyle}>Spell Check</div></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value={appSettings.spellCheckModel?.provider || ""}
                      onChange={(e) => {
                        const provider = (e.target.value || undefined) as AIProvider | undefined;
                        updateAppSetting("spellCheckModel", provider ? { provider: provider as "openrouter" | "groq", model: appSettings.spellCheckModel?.model || "" } : undefined);
                      }}
                      style={{ ...selectStyle, width: 120 }}
                    >
                      <option value="">Default</option>
                      <option value="groq">Groq</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                    {appSettings.spellCheckModel?.provider && (
                      <select
                        value={appSettings.spellCheckModel.model || ""}
                        onChange={(e) => updateAppSetting("spellCheckModel", { ...appSettings.spellCheckModel!, model: e.target.value })}
                        style={{ ...selectStyle, width: 200 }}
                      >
                        {getModelsForProvider(appSettings.spellCheckModel.provider).map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                {/* Timer Assistant */}
                <div style={{ ...rowStyle, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 160 }}><div style={labelStyle}>Timer Assistant</div></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value={appSettings.timerAssistantModel?.provider || ""}
                      onChange={(e) => {
                        const provider = (e.target.value || undefined) as AIProvider | undefined;
                        updateAppSetting("timerAssistantModel", provider ? { provider: provider as "openrouter" | "groq", model: appSettings.timerAssistantModel?.model || "" } : undefined);
                      }}
                      style={{ ...selectStyle, width: 120 }}
                    >
                      <option value="">Default</option>
                      <option value="groq">Groq</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                    {appSettings.timerAssistantModel?.provider && (
                      <select
                        value={appSettings.timerAssistantModel.model || ""}
                        onChange={(e) => updateAppSetting("timerAssistantModel", { ...appSettings.timerAssistantModel!, model: e.target.value })}
                        style={{ ...selectStyle, width: 200 }}
                      >
                        {getModelsForProvider(appSettings.timerAssistantModel.provider).map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                {/* Global Assistant */}
                <div style={{ ...rowStyle, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 160 }}><div style={labelStyle}>Global Assistant</div></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value={appSettings.globalAssistantModel?.provider || ""}
                      onChange={(e) => {
                        const provider = (e.target.value || undefined) as AIProvider | undefined;
                        updateAppSetting("globalAssistantModel", provider ? { provider: provider as "openrouter" | "groq", model: appSettings.globalAssistantModel?.model || "" } : undefined);
                      }}
                      style={{ ...selectStyle, width: 120 }}
                    >
                      <option value="">Default</option>
                      <option value="groq">Groq</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                    {appSettings.globalAssistantModel?.provider && (
                      <select
                        value={appSettings.globalAssistantModel.model || ""}
                        onChange={(e) => updateAppSetting("globalAssistantModel", { ...appSettings.globalAssistantModel!, model: e.target.value })}
                        style={{ ...selectStyle, width: 200 }}
                      >
                        {getModelsForProvider(appSettings.globalAssistantModel.provider).map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              TRANSCRIPTION
              ================================================================ */}
          {activeSection === "transcription" && (
            <div>
              <h2 style={{ margin: "0 0 var(--spacing-4)", fontSize: "1.15rem", fontWeight: 700, color: "var(--app-text-color)" }}>Transcription</h2>

              {/* Engine */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <FaMicrophone size={14} style={{ color: "var(--app-primary-color)" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>Engine</span>
                </div>
                <div style={rowStyle}>
                  <div><div style={labelStyle}>Transcription Engine</div></div>
                  <select value={settings.transcriptionEngine} onChange={(e) => updateSetting("transcriptionEngine", e.target.value as TranscriptionEngine)} style={selectStyle}>
                    <option value="offline-whisper-native">Offline Whisper (Native)</option>
                    <option value="offline-whisper">Offline Whisper (WebGPU)</option>
                    <option value="offline-moonshine">Offline Moonshine</option>
                    <option value="groq">Groq (Cloud)</option>
                  </select>
                </div>
                {(settings.transcriptionEngine === "offline-whisper" || settings.transcriptionEngine === "offline-moonshine") && (
                  <>
                    <div style={rowStyle}>
                      <div><div style={labelStyle}>Offline Model</div></div>
                      <select
                        value={settings.transcriptionEngine === "offline-whisper" ? settings.offlineWhisperModel || "" : settings.offlineMoonshineModel || ""}
                        onChange={(e) => {
                          if (settings.transcriptionEngine === "offline-whisper") updateSetting("offlineWhisperModel", e.target.value);
                          else updateSetting("offlineMoonshineModel", e.target.value);
                        }}
                        style={selectStyle}
                      >
                        {AVAILABLE_OFFLINE_MODELS.filter((m) => settings.transcriptionEngine === "offline-whisper" ? m.type === "whisper" : m.type === "moonshine")
                          .map((m) => <option key={m.modelId} value={m.modelId}>{m.name} ({m.size})</option>)}
                      </select>
                    </div>
                    <div style={rowStyle}>
                      <div>
                        <div style={labelStyle}>Language</div>
                        <div style={hintStyle}>Language code for offline transcription</div>
                      </div>
                      <select value={settings.offlineLanguage || "en"} onChange={(e) => updateSetting("offlineLanguage", e.target.value)} style={{ ...selectStyle, width: 150 }}>
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                        <option value="de">German</option>
                        <option value="pt">Portuguese</option>
                        <option value="it">Italian</option>
                        <option value="nl">Dutch</option>
                        <option value="ko">Korean</option>
                        <option value="zh">Chinese</option>
                        <option value="ja">Japanese</option>
                        <option value="ar">Arabic</option>
                        <option value="hi">Hindi</option>
                      </select>
                    </div>
                  </>
                )}
                {settings.transcriptionEngine === "offline-whisper-native" && (
                  <div style={rowStyle}>
                    <div><div style={labelStyle}>Native Model File</div></div>
                    <input value={settings.offlineWhisperNativeModel || "ggml-small.en-q5_1.bin"} onChange={(e) => updateSetting("offlineWhisperNativeModel", e.target.value)} style={inputStyle} />
                  </div>
                )}
              </div>

              {/* Audio Capture */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <FaMicrophone size={14} style={{ color: "#22c55e" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>Audio Capture</span>
                </div>
                <div style={rowStyle}>
                  <div><div style={labelStyle}>Capture Mode</div></div>
                  <select value={settings.audioCaptureMode || "native"} onChange={(e) => updateSetting("audioCaptureMode", e.target.value as AudioCaptureMode)} style={selectStyle}>
                    <option value="native">Native</option>
                    <option value="webrtc">WebRTC (Browser)</option>
                  </select>
                </div>
                <div style={rowStyle}>
                  <div>
                    <div style={labelStyle}>Microphone</div>
                    <div style={hintStyle}>{microphones.length === 0 ? "No microphones detected" : `${microphones.length} device(s) available`}</div>
                  </div>
                  <select
                    value={settings.selectedMicrophoneId || ""}
                    onChange={(e) => updateSetting("selectedMicrophoneId", e.target.value || undefined)}
                    style={selectStyle}
                    disabled={microphones.length === 0}
                  >
                    <option value="">System Default</option>
                    {microphones.map((mic) => (
                      <option key={mic.deviceId} value={mic.deviceId}>{mic.label || `Microphone ${mic.deviceId.slice(0, 8)}`}</option>
                    ))}
                  </select>
                </div>
                <div style={rowStyle}>
                  <div>
                    <div style={labelStyle}>Run Transcription in Browser</div>
                    <div style={hintStyle}>Opens external browser window for transcription</div>
                  </div>
                  <Toggle checked={!!settings.runTranscriptionInBrowser} onChange={(v) => updateSetting("runTranscriptionInBrowser", v)} />
                </div>
                <div style={rowStyle}>
                  <div>
                    <div style={labelStyle}>Time Limit (minutes)</div>
                    <div style={hintStyle}>Prompt to stop after this duration</div>
                  </div>
                  <input type="number" value={settings.transcriptionTimeLimitMinutes ?? 120} onChange={(e) => updateSetting("transcriptionTimeLimitMinutes", parseInt(e.target.value) || 120)} style={{ ...inputStyle, width: 100 }} min={1} />
                </div>
              </div>

              {/* Remote */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <FaBroadcastTower size={14} style={{ color: "#f59e0b" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>Remote Transcription</span>
                </div>
                <div style={rowStyle}>
                  <div><div style={labelStyle}>Enable Remote Transcription</div></div>
                  <Toggle checked={!!settings.remoteTranscriptionEnabled} onChange={(v) => updateSetting("remoteTranscriptionEnabled", v)} />
                </div>
                {settings.remoteTranscriptionEnabled && (
                  <>
                    <div style={rowStyle}>
                      <div><div style={labelStyle}>Host</div></div>
                      <input value={settings.remoteTranscriptionHost || ""} onChange={(e) => updateSetting("remoteTranscriptionHost", e.target.value)} placeholder="192.168.1.x" style={inputStyle} />
                    </div>
                    <div style={rowStyle}>
                      <div><div style={labelStyle}>Port</div></div>
                      <input type="number" value={settings.remoteTranscriptionPort ?? 9876} onChange={(e) => updateSetting("remoteTranscriptionPort", parseInt(e.target.value) || 9876)} style={{ ...inputStyle, width: 100 }} />
                    </div>
                  </>
                )}
                <div style={rowStyle}>
                  <div>
                    <div style={labelStyle}>Stream to WebSocket</div>
                    <div style={hintStyle}>Broadcast transcriptions for other connected clients</div>
                  </div>
                  <Toggle checked={settings.streamTranscriptionsToWebSocket} onChange={(v) => updateSetting("streamTranscriptionsToWebSocket", v)} />
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              DETECTION
              ================================================================ */}
          {activeSection === "detection" && (
            <div>
              <h2 style={{ margin: "0 0 var(--spacing-4)", fontSize: "1.15rem", fontWeight: 700, color: "var(--app-text-color)" }}>Detection Settings</h2>

              {/* Bible Search */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <FaRobot size={14} style={{ color: "var(--app-primary-color)" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>AI Bible Search</span>
                </div>
                <div style={rowStyle}>
                  <div><div style={labelStyle}>Enable AI Search</div></div>
                  <Toggle checked={settings.enableAISearch} onChange={(v) => updateSetting("enableAISearch", v)} />
                </div>
                {settings.enableAISearch && (
                  <>
                    <div style={rowStyle}>
                      <div><div style={labelStyle}>Search Provider</div></div>
                      <select value={settings.bibleSearchProvider || "groq"} onChange={(e) => updateSetting("bibleSearchProvider", e.target.value as SmartVersesSettings["bibleSearchProvider"])} style={selectStyle}>
                        <option value="groq">Groq</option>
                        <option value="openai">OpenAI</option>
                        <option value="gemini">Gemini</option>
                        <option value="offline">Offline</option>
                      </select>
                    </div>
                    <div style={rowStyle}>
                      <div><div style={labelStyle}>Search Model</div></div>
                      <input value={settings.bibleSearchModel || ""} onChange={(e) => updateSetting("bibleSearchModel", e.target.value)} style={inputStyle} />
                    </div>
                    {settings.bibleSearchProvider === "offline" && (
                      <div style={rowStyle}>
                        <div>
                          <div style={labelStyle}>Confidence Threshold</div>
                          <div style={hintStyle}>{Math.round((settings.bibleSearchConfidenceThreshold || 0.6) * 100)}%</div>
                        </div>
                        <input type="range" min={0.1} max={1.0} step={0.05} value={settings.bibleSearchConfidenceThreshold || 0.6} onChange={(e) => updateSetting("bibleSearchConfidenceThreshold", parseFloat(e.target.value))} style={{ width: 200, accentColor: "var(--app-primary-color)" }} />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Paraphrase Detection */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <FaRobot size={14} style={{ color: "#a855f7" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>Paraphrase Detection</span>
                </div>
                <div style={rowStyle}>
                  <div><div style={labelStyle}>Enable Paraphrase Detection</div></div>
                  <Toggle checked={settings.enableParaphraseDetection} onChange={(v) => updateSetting("enableParaphraseDetection", v)} />
                </div>
                {settings.enableParaphraseDetection && (
                  <>
                    <div style={rowStyle}>
                      <div><div style={labelStyle}>Detection Mode</div></div>
                      <select value={settings.paraphraseDetectionMode || "offline"} onChange={(e) => updateSetting("paraphraseDetectionMode", e.target.value as ParaphraseDetectionMode)} style={selectStyle}>
                        <option value="offline">Offline (Embeddings)</option>
                        <option value="ai">AI (Cloud)</option>
                        <option value="hybrid">Hybrid</option>
                      </select>
                    </div>
                    <div style={rowStyle}>
                      <div>
                        <div style={labelStyle}>Confidence Threshold</div>
                        <div style={hintStyle}>{Math.round(settings.paraphraseConfidenceThreshold * 100)}%</div>
                      </div>
                      <input type="range" min={0.1} max={1.0} step={0.05} value={settings.paraphraseConfidenceThreshold} onChange={(e) => updateSetting("paraphraseConfidenceThreshold", parseFloat(e.target.value))} style={{ width: 200, accentColor: "var(--app-primary-color)" }} />
                    </div>
                    <div style={rowStyle}>
                      <div><div style={labelStyle}>Strict Mode</div><div style={hintStyle}>Stricter matching rules (AI only)</div></div>
                      <Toggle checked={!!settings.paraphraseStrictMode} onChange={(v) => updateSetting("paraphraseStrictMode", v)} />
                    </div>
                    <div style={rowStyle}>
                      <div><div style={labelStyle}>Min Word Count</div><div style={hintStyle}>Minimum words before running analysis</div></div>
                      <input type="number" value={settings.aiMinWordCount} onChange={(e) => updateSetting("aiMinWordCount", parseInt(e.target.value) || 6)} style={{ ...inputStyle, width: 80 }} min={1} />
                    </div>
                    <div style={rowStyle}>
                      <div><div style={labelStyle}>Context Chunks</div><div style={hintStyle}>Previous text chunks for AI context</div></div>
                      <input type="number" value={settings.aiContextChunkCount ?? 1} onChange={(e) => updateSetting("aiContextChunkCount", parseInt(e.target.value) || 1)} style={{ ...inputStyle, width: 80 }} min={0} max={10} />
                    </div>
                  </>
                )}
              </div>

              {/* Key Points */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <FaCheck size={14} style={{ color: "#22c55e" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>Key Point Extraction</span>
                </div>
                <div style={rowStyle}>
                  <div><div style={labelStyle}>Enable Key Point Extraction</div></div>
                  <Toggle checked={settings.enableKeyPointExtraction} onChange={(v) => updateSetting("enableKeyPointExtraction", v)} />
                </div>
                {settings.enableKeyPointExtraction && (
                  <div style={{ marginTop: "var(--spacing-2)" }}>
                    <div style={labelStyle}>Custom Instructions</div>
                    <textarea value={settings.keyPointExtractionInstructions || ""} onChange={(e) => updateSetting("keyPointExtractionInstructions", e.target.value)} placeholder="Custom instructions for key point extraction..." rows={3}
                      style={{ ...inputStyle, width: "100%", resize: "vertical", fontFamily: "inherit", marginTop: "var(--spacing-2)" }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================
              DISPLAY
              ================================================================ */}
          {activeSection === "display" && (
            <div>
              <h2 style={{ margin: "0 0 var(--spacing-4)", fontSize: "1.15rem", fontWeight: 700, color: "var(--app-text-color)" }}>Display Settings</h2>
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <FaPalette size={14} style={{ color: "var(--app-primary-color)" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>Verse Display</span>
                </div>
                <div style={rowStyle}>
                  <div><div style={labelStyle}>Default Bible Translation</div></div>
                  <input value={settings.defaultBibleTranslationId || "kjv"} onChange={(e) => updateSetting("defaultBibleTranslationId", e.target.value)} placeholder="kjv" style={{ ...inputStyle, width: 120 }} />
                </div>
                <div style={rowStyle}><div><div style={labelStyle}>Auto-add Direct References to History</div></div><Toggle checked={settings.autoAddDetectedToHistory} onChange={(v) => updateSetting("autoAddDetectedToHistory", v)} /></div>
                <div style={rowStyle}><div><div style={labelStyle}>Auto-add Paraphrased References</div></div><Toggle checked={settings.autoAddDetectedParaphraseToHistory} onChange={(v) => updateSetting("autoAddDetectedParaphraseToHistory", v)} /></div>
                <div style={rowStyle}><div><div style={labelStyle}>Highlight Direct References</div></div><Toggle checked={settings.highlightDirectReferences} onChange={(v) => updateSetting("highlightDirectReferences", v)} /></div>
                <div style={rowStyle}><div><div style={labelStyle}>Highlight Paraphrased References</div></div><Toggle checked={settings.highlightParaphrasedReferences} onChange={(v) => updateSetting("highlightParaphrasedReferences", v)} /></div>
              </div>
              {/* Colors */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <FaPalette size={14} style={{ color: "#ec4899" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>Reference Colors</span>
                </div>
                <div style={rowStyle}>
                  <div><div style={labelStyle}>Direct Reference Color</div></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="color" value={settings.directReferenceColor} onChange={(e) => updateSetting("directReferenceColor", e.target.value)} style={{ width: 36, height: 30, border: "none", cursor: "pointer", borderRadius: 4 }} />
                    <span style={{ fontSize: "0.8rem", color: "var(--app-text-color-secondary)" }}>{settings.directReferenceColor}</span>
                  </div>
                </div>
                <div style={rowStyle}>
                  <div><div style={labelStyle}>Paraphrase Reference Color</div></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="color" value={settings.paraphraseReferenceColor} onChange={(e) => updateSetting("paraphraseReferenceColor", e.target.value)} style={{ width: 36, height: 30, border: "none", cursor: "pointer", borderRadius: 4 }} />
                    <span style={{ fontSize: "0.8rem", color: "var(--app-text-color-secondary)" }}>{settings.paraphraseReferenceColor}</span>
                  </div>
                </div>
              </div>
              {/* Filter Phrases */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <FaTrash size={14} style={{ color: "var(--app-text-color-secondary)" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>Transcript Filter Phrases</span>
                </div>
                <div style={hintStyle}>Phrases to hide from the transcript (e.g. [BLANK_AUDIO])</div>
                <div style={{ marginTop: "var(--spacing-2)" }}>
                  {(settings.transcriptFilterPhrases || []).map((phrase, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <input value={phrase} onChange={(e) => { const u = [...(settings.transcriptFilterPhrases || [])]; u[i] = e.target.value; updateSetting("transcriptFilterPhrases", u); }} style={{ ...inputStyle, flex: 1, width: "auto" }} />
                      <button className="icon-button" onClick={() => { const u = [...(settings.transcriptFilterPhrases || [])]; u.splice(i, 1); updateSetting("transcriptFilterPhrases", u); }} style={{ color: "var(--error)" }}><FaTrash size={12} /></button>
                    </div>
                  ))}
                  <button className="secondary btn-sm" onClick={() => updateSetting("transcriptFilterPhrases", [...(settings.transcriptFilterPhrases || []), ""])} style={{ marginTop: 4 }}>+ Add phrase</button>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              OUTPUT
              ================================================================ */}
          {activeSection === "output" && (
            <div>
              <h2 style={{ margin: "0 0 var(--spacing-4)", fontSize: "1.15rem", fontWeight: 700, color: "var(--app-text-color)" }}>Output Settings</h2>
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <FaFileExport size={14} style={{ color: "var(--app-primary-color)" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>File Output</span>
                </div>
                <div style={rowStyle}><div><div style={labelStyle}>Output Path</div><div style={hintStyle}>Directory for text file output</div></div><input value={settings.bibleOutputPath || ""} onChange={(e) => updateSetting("bibleOutputPath", e.target.value)} placeholder="/path/to/output" style={inputStyle} /></div>
                <div style={rowStyle}><div><div style={labelStyle}>Text File Name</div></div><input value={settings.bibleTextFileName || ""} onChange={(e) => updateSetting("bibleTextFileName", e.target.value)} placeholder="e.g. verse_text.txt" style={inputStyle} /></div>
                <div style={rowStyle}><div><div style={labelStyle}>Reference File Name</div></div><input value={settings.bibleReferenceFileName || ""} onChange={(e) => updateSetting("bibleReferenceFileName", e.target.value)} placeholder="e.g. verse_ref.txt" style={inputStyle} /></div>
                <div style={rowStyle}><div><div style={labelStyle}>Append Translation to Reference</div></div><Toggle checked={!!settings.appendTranslationToReference} onChange={(v) => updateSetting("appendTranslationToReference", v)} /></div>
                <div style={rowStyle}><div><div style={labelStyle}>Clear Text After Live</div><div style={hintStyle}>Clear output files after going live</div></div><Toggle checked={!!settings.clearTextAfterLive} onChange={(v) => updateSetting("clearTextAfterLive", v)} /></div>
                {settings.clearTextAfterLive && (
                  <div style={rowStyle}><div><div style={labelStyle}>Clear Delay (ms)</div></div><input type="number" value={settings.clearTextDelay ?? 0} onChange={(e) => updateSetting("clearTextDelay", parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: 100 }} min={0} step={100} /></div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================
              PROPRESENTER — Connection Manager
              ================================================================ */}
          {activeSection === "propresenter" && (
            <div>
              <h2 style={{ margin: "0 0 var(--spacing-4)", fontSize: "1.15rem", fontWeight: 700, color: "var(--app-text-color)" }}>ProPresenter Integration</h2>

              {/* Auto-trigger */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <FaBroadcastTower size={14} style={{ color: "var(--app-primary-color)" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>Behavior</span>
                </div>
                <div style={rowStyle}>
                  <div>
                    <div style={labelStyle}>Auto-Trigger on Detection</div>
                    <div style={hintStyle}>Automatically go live in ProPresenter when a verse is detected</div>
                  </div>
                  <Toggle checked={settings.autoTriggerOnDetection} onChange={(v) => updateSetting("autoTriggerOnDetection", v)} />
                </div>
              </div>

              {/* Connections */}
              <div style={sectionStyle}>
                <div style={{ ...sectionHeaderStyle, marginBottom: "var(--spacing-3)" }}>
                  <FaBroadcastTower size={14} style={{ color: "#22c55e" }} />
                  <span style={{ fontWeight: 600, color: "var(--app-text-color)" }}>Connections</span>
                  <button className="secondary btn-sm" onClick={addPpConnection} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
                    <FaPlus size={10} /> Add
                  </button>
                </div>

                {ppConnections.length === 0 && (
                  <div style={{ padding: "var(--spacing-4)", textAlign: "center", color: "var(--app-text-color-secondary)", fontSize: "0.85rem" }}>
                    No connections configured. Click &quot;Add&quot; to connect to ProPresenter.
                  </div>
                )}

                {ppConnections.map((conn) => {
                  const testResult = ppTestResults[conn.id] || { status: "idle", message: "" };
                  return (
                    <div
                      key={conn.id}
                      style={{
                        padding: "var(--spacing-3)",
                        backgroundColor: "var(--surface-2)",
                        borderRadius: 8,
                        border: "1px solid var(--app-border-color)",
                        marginBottom: "var(--spacing-3)",
                      }}
                    >
                      {/* Connection header */}
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)", marginBottom: "var(--spacing-2)" }}>
                        <StatusDot connected={testResult.status === "ok" ? true : testResult.status === "fail" ? false : null} />
                        <input
                          value={conn.name}
                          onChange={(e) => updatePpConnection(conn.id, { name: e.target.value })}
                          style={{ ...inputStyle, width: "auto", flex: 1, fontWeight: 600, fontSize: "0.9rem", padding: "4px 8px" }}
                        />
                        <Toggle checked={conn.isEnabled} onChange={(v) => updatePpConnection(conn.id, { isEnabled: v })} />
                        <button className="icon-button" onClick={() => removePpConnection(conn.id)} title="Remove" style={{ color: "var(--error)" }}>
                          <FaTrash size={12} />
                        </button>
                      </div>

                      {/* API URL */}
                      <div style={rowStyle}>
                        <div><div style={labelStyle}>API URL</div></div>
                        <input
                          value={conn.apiUrl}
                          onChange={(e) => updatePpConnection(conn.id, { apiUrl: e.target.value })}
                          placeholder="http://localhost:1025"
                          style={inputStyle}
                        />
                      </div>

                      {/* Timer index */}
                      <div style={rowStyle}>
                        <div><div style={labelStyle}>Timer Index</div><div style={hintStyle}>Which timer slot to use in ProPresenter</div></div>
                        <input
                          type="number"
                          value={conn.timerIndex}
                          onChange={(e) => updatePpConnection(conn.id, { timerIndex: parseInt(e.target.value) || 0 })}
                          style={{ ...inputStyle, width: 80 }}
                          min={0}
                        />
                      </div>

                      {/* Test button + result */}
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)", marginTop: "var(--spacing-2)" }}>
                        <button
                          className="secondary btn-sm"
                          onClick={() => handleTestPpConnection(conn)}
                          disabled={testResult.status === "testing"}
                          style={{ display: "flex", alignItems: "center", gap: 6 }}
                        >
                          {testResult.status === "testing" ? <FaSpinner size={10} style={{ animation: "spin 1s linear infinite" }} /> : <FaCheck size={10} />}
                          Test Connection
                        </button>
                        {testResult.message && (
                          <span style={{
                            fontSize: "0.78rem",
                            color: testResult.status === "ok" ? "var(--success)" : testResult.status === "fail" ? "var(--error)" : "var(--app-text-color-secondary)",
                          }}>
                            {testResult.message}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Help text */}
              <div style={{ fontSize: "0.8rem", color: "var(--app-text-color-secondary)", lineHeight: 1.6 }}>
                <strong>Setup:</strong> In ProPresenter, go to Preferences → Network and enable network access.
                The default API port is <code style={{ backgroundColor: "var(--surface-2)", padding: "1px 4px", borderRadius: 3 }}>1025</code>.
                Make sure both devices are on the same network.
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
