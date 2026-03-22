/**
 * useTranscription
 *
 * Full transcription lifecycle: start, stop, audio level, interim/final handling,
 * transcription timer, limit prompt, remote/browser WebSocket connections,
 * and interim direct-parse scheduling.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type {
  SmartVersesSettings,
  DetectedBibleReference,
  SmartVersesChatMessage,
  TranscriptionSegment,
  KeyPoint,
  ParaphrasedVerse,
  TranscriptionStatus,
} from "@/lib/types/smartVerses";
import type { AppSettings } from "@/lib/types";
import {
  createTranscriptionService,
  type ITranscriptionService,
} from "@/lib/services/transcriptionService";
import {
  detectAndLookupReferences,
} from "@/lib/services/smartVersesBibleService";
import {
  findTranslationCue,
} from "@/lib/services/bibleLibraryService";
import {
  getAssemblyAITemporaryToken,
} from "@/lib/services/assemblyaiTokenService";
import {
  broadcastTranscriptionStatusMessage,
  broadcastTranscriptionStreamMessage,
} from "@/lib/services/transcriptionBroadcastService";
import { LiveSlidesWebSocket, getLiveSlidesServerInfo } from "@/lib/services/liveSlideService";
import type { WsTranscriptionStatus, WsTranscriptionStream } from "@/lib/types/liveSlides";
import { mapAudioLevel } from "@/lib/utils/audioMeter";
import { normalizeRemoteTranscriptionTarget } from "@/lib/utils/remoteTranscription";
import { isModelDownloaded } from "@/lib/services/offlineModelService";
import { isNativeWhisperModelDownloaded } from "@/lib/services/nativeWhisperModelService";
import { getOfflineModelPreloadStatus } from "@/lib/services/offlineModelPreloadService";
import {
  resolveParaphrasedVerses,
} from "@/lib/services/smartVersesAIService";
import {
  normalizeReferenceMarker,
  resolveReferencesFromList,
} from "@/lib/utils/smartVersesHelpers";

interface UseTranscriptionOptions {
  settings: SmartVersesSettings;
  appSettings: AppSettings;
  settingsRef: React.MutableRefObject<SmartVersesSettings>;
  autoTriggerOnDetectionRef: React.MutableRefObject<boolean>;
  transcriptionTranslationIdRef: React.MutableRefObject<string>;
  setDetectedReferences: React.Dispatch<React.SetStateAction<DetectedBibleReference[]>>;
  detectedReferencesRef: React.MutableRefObject<DetectedBibleReference[]>;
  setChatHistory: React.Dispatch<React.SetStateAction<SmartVersesChatMessage[]>>;
  handleGoLive: (ref: DetectedBibleReference, options?: { fromAutoTrigger?: boolean }) => void;
  handleTranslationCue: (cueTranslationId: string | null) => Promise<void>;
  runParaphraseDetection: (
    text: string,
    segment: TranscriptionSegment,
    context?: "remote" | "local",
    translationId?: string
  ) => Promise<{
    scriptureReferences: string[];
    keyPoints: KeyPoint[];
    paraphrasedVersesForWs: ParaphrasedVerse[];
  }>;
  applyParaphraseDetections: (
    refs: DetectedBibleReference[],
    text: string,
    label?: string
  ) => DetectedBibleReference[];
  updateAiContextChunks: (text: string, maxChunks: number) => void;
  aiContextChunksRef: React.MutableRefObject<string[]>;
}

export function useTranscription({
  settings,
  appSettings,
  settingsRef,
  autoTriggerOnDetectionRef,
  transcriptionTranslationIdRef,
  setDetectedReferences,
  detectedReferencesRef,
  setChatHistory,
  handleGoLive,
  handleTranslationCue,
  runParaphraseDetection,
  applyParaphraseDetections,
  updateAiContextChunks,
  aiContextChunksRef,
}: UseTranscriptionOptions) {
  // Core transcription state
  const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionStatus>("idle");
  const [isStopping, setIsStopping] = useState(false);
  const [transcriptionErrorMessage, setTranscriptionErrorMessage] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [transcriptHistory, setTranscriptHistory] = useState<TranscriptionSegment[]>([]);
  const [transcriptKeyPoints, setTranscriptKeyPoints] = useState<Record<string, KeyPoint[]>>({});
  const [audioLevel, setAudioLevel] = useState(0);
  const audioLevelRef = useRef(0);

  // Timer state
  const [transcriptionElapsedMs, setTranscriptionElapsedMs] = useState(0);
  const [showTranscriptionLimitPrompt, setShowTranscriptionLimitPrompt] = useState(false);

  // Refs
  const transcriptionServiceRef = useRef<ITranscriptionService | null>(null);
  const transcriptionStartRef = useRef<number | null>(null);
  const transcriptionNextPromptAtRef = useRef<number | null>(null);
  const transcriptionPromptTimeoutRef = useRef<number | null>(null);
  const transcriptionPromptReasonRef = useRef<"limit" | "snooze" | null>(null);
  const transcriptionStatusRef = useRef<TranscriptionStatus>("idle");
  const isStoppingRef = useRef(false);

  // WebSocket refs
  const browserTranscriptionWsRef = useRef<LiveSlidesWebSocket | null>(null);
  const remoteTranscriptionWsRef = useRef<LiveSlidesWebSocket | null>(null);
  const remoteTranscriptionStatusUnsubRef = useRef<(() => void) | null>(null);
  const remoteRebroadcastAllowedRef = useRef<boolean>(true);

  // Interim parsing refs
  const latestInterimTextRef = useRef<string>("");
  const lastInterimDirectSignatureRef = useRef<string>("");
  const lastInterimParseAtRef = useRef<number>(0);
  const interimParseInFlightRef = useRef<boolean>(false);
  const lastInterimWordCountRef = useRef<number>(0);
  const pendingInterimUiTextRef = useRef<string>("");
  const interimUiTimerRef = useRef<number | null>(null);

  // Detected panel state
  const [detectedPanelCollapsed, setDetectedPanelCollapsed] = useState(false);
  const [expandedDetectedIds, setExpandedDetectedIds] = useState<Set<string>>(() => new Set());
  const detectedPanelScrollRef = useRef<HTMLDivElement | null>(null);
  const [autoScrollDetectedPaused, setAutoScrollDetectedPaused] = useState(false);

  // Keep status ref in sync
  useEffect(() => {
    transcriptionStatusRef.current = transcriptionStatus;
  }, [transcriptionStatus]);

  // =============================================================================
  // EVENT BRIDGE
  // =============================================================================
  const emitTranscriptionStream = useCallback((message: WsTranscriptionStream) => {
    window.dispatchEvent(
      new CustomEvent("transcription-stream", { detail: message })
    );
  }, []);

  const emitTranscriptionStatus = useCallback(
    (status: TranscriptionStatus, stopping: boolean) => {
      window.dispatchEvent(
        new CustomEvent("transcription-status-changed", {
          detail: { status, isStopping: stopping },
        })
      );
    },
    []
  );

  useEffect(() => {
    emitTranscriptionStatus(transcriptionStatus, isStopping);
  }, [emitTranscriptionStatus, transcriptionStatus, isStopping]);

  useEffect(() => {
    const handleStatusRequest = () => {
      emitTranscriptionStatus(transcriptionStatus, isStopping);
    };
    window.addEventListener("transcription-status-request", handleStatusRequest);
    return () => window.removeEventListener("transcription-status-request", handleStatusRequest);
  }, [emitTranscriptionStatus, transcriptionStatus, isStopping]);

  // Broadcast transcription status to WebSocket
  useEffect(() => {
    if (settings.remoteTranscriptionEnabled || !settings.streamTranscriptionsToWebSocket) return;
    if (transcriptionStatus === "recording") {
      broadcastTranscriptionStatusMessage({
        type: "transcription_status",
        status: "recording",
        timestamp: Date.now(),
      }).catch(() => {});
      return;
    }
    if (transcriptionStatus === "idle" || transcriptionStatus === "error") {
      broadcastTranscriptionStatusMessage({
        type: "transcription_status",
        status: "stopped",
        timestamp: Date.now(),
        reason: transcriptionStatus === "error"
          ? transcriptionErrorMessage || "Transcription stopped on server."
          : "Transcription stopped on server.",
      }).catch(() => {});
    }
  }, [
    transcriptionStatus,
    transcriptionErrorMessage,
    settings.remoteTranscriptionEnabled,
    settings.streamTranscriptionsToWebSocket,
  ]);

  // =============================================================================
  // INTERIM PARSING
  // =============================================================================
  const shouldAttemptDirectParse = useCallback((text: string): boolean => {
    const trimmed = text.trim();
    if (trimmed.length < 3) return false;
    return /\d/.test(trimmed) && /[a-zA-Z]/.test(trimmed);
  }, []);

  const getInterimTailForParsing = useCallback(
    (text: string, tailWordCount = 30): string => {
      const words = text.trim().split(/\s+/).filter(Boolean);
      if (words.length <= tailWordCount) return text.trim();
      return words.slice(-tailWordCount).join(" ");
    },
    []
  );

  const scheduleInterimDirectParse = useCallback(
    (text: string) => {
      latestInterimTextRef.current = text;
      const now = Date.now();
      const minIntervalMs = 150;
      if (now - lastInterimParseAtRef.current < minIntervalMs) return;
      if (interimParseInFlightRef.current) return;

      const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount - lastInterimWordCountRef.current < 2) return;
      lastInterimWordCountRef.current = wordCount;

      lastInterimParseAtRef.current = now;
      interimParseInFlightRef.current = true;

      (async () => {
        const latest = latestInterimTextRef.current;
        const tail = getInterimTailForParsing(latest);
        try {
          const refs = await detectAndLookupReferences(tail, {
            aggressiveSpeechNormalization: true,
            translationId: transcriptionTranslationIdRef.current,
          });
          if (!refs.length) return;

          const sig = refs
            .map((r) => (r.displayRef || "").trim().toLowerCase())
            .filter(Boolean)
            .sort()
            .join("|");
          if (!sig || sig === lastInterimDirectSignatureRef.current) return;
          lastInterimDirectSignatureRef.current = sig;

          const existing = new Set(
            detectedReferencesRef.current
              .map((r) => (r.displayRef || "").trim().toLowerCase())
              .filter(Boolean)
          );
          const newRefs = refs.filter(
            (r) => !existing.has((r.displayRef || "").trim().toLowerCase())
          );
          if (newRefs.length) {
            setDetectedReferences((prev) => [...prev, ...newRefs]);
          }
        } catch (e) {
          console.debug("[SmartVerses] Interim direct-parse failed:", e);
        }
      })().finally(() => {
        interimParseInFlightRef.current = false;
      });
    },
    [getInterimTailForParsing, transcriptionTranslationIdRef, detectedReferencesRef, setDetectedReferences]
  );

  const queueInterimUiUpdate = useCallback(
    (text: string) => {
      pendingInterimUiTextRef.current = text;
      if (interimUiTimerRef.current) return;

      interimUiTimerRef.current = window.setTimeout(() => {
        interimUiTimerRef.current = null;
        const latest = pendingInterimUiTextRef.current;
        setInterimTranscript(latest);

        emitTranscriptionStream({
          type: "transcription_stream",
          kind: "interim",
          timestamp: Date.now(),
          engine: settings.transcriptionEngine,
          text: latest,
          audio_level: audioLevelRef.current,
        });

        if (settings.streamTranscriptionsToWebSocket) {
          broadcastTranscriptionStreamMessage({
            type: "transcription_stream",
            kind: "interim",
            timestamp: Date.now(),
            engine: settings.transcriptionEngine,
            text: latest,
            audio_level: audioLevelRef.current,
          }).catch(() => {});
        }
      }, 250);
    },
    [emitTranscriptionStream, settings.streamTranscriptionsToWebSocket, settings.transcriptionEngine]
  );

  // =============================================================================
  // WEBSOCKET CONNECTIONS
  // =============================================================================
  const disconnectBrowserTranscriptionWs = useCallback(() => {
    if (browserTranscriptionWsRef.current) {
      browserTranscriptionWsRef.current.disconnect();
      browserTranscriptionWsRef.current = null;
    }
  }, []);

  const disconnectRemoteTranscriptionWs = useCallback(() => {
    if (remoteTranscriptionWsRef.current) {
      remoteTranscriptionWsRef.current.disconnect();
      remoteTranscriptionWsRef.current = null;
    }
    if (remoteTranscriptionStatusUnsubRef.current) {
      remoteTranscriptionStatusUnsubRef.current();
      remoteTranscriptionStatusUnsubRef.current = null;
    }
  }, []);

  const openBrowserTranscription = useCallback(async () => {
    try {
      const opener = await import("@tauri-apps/plugin-opener");
      let wsHost = "localhost";
      let wsPort = 9876;
      try {
        const serverInfo = await getLiveSlidesServerInfo();
        if (serverInfo) { wsHost = serverInfo.local_ip; wsPort = serverInfo.server_port; }
      } catch { /* defaults */ }

      let tempToken = "";
      // AssemblyAI token generation removed since AssemblyAI is deprecated

      const params = new URLSearchParams({
        wsHost,
        wsPort: String(wsPort),
        ...(tempToken ? { token: tempToken } : {}),
      });

      const baseUrl = import.meta.env.NODE_ENV === "development"
        ? `http://localhost:1420/browser-transcription.html`
        : `http://${wsHost}:${wsPort}/browser-transcription.html`;

      await opener.openUrl(`${baseUrl}?${params.toString()}`);
    } catch (error) {
      console.error("Failed to open browser transcription:", error);
      const params = new URLSearchParams({ wsHost: "localhost", wsPort: "9876" });
    }
  }, []);

  const connectToBrowserTranscriptionWs = useCallback(async () => {
    try {
      const serverInfo = await getLiveSlidesServerInfo();
      if (!serverInfo.server_running) return;

      const wsUrl = `ws://${serverInfo.local_ip}:${serverInfo.server_port}/ws`;
      const ws = new LiveSlidesWebSocket(wsUrl, "browser-transcription", "viewer");
      browserTranscriptionWsRef.current = ws;
      await ws.connect();

      ws.onMessage(async (message) => {
        if (message.type === "transcription_status") {
          const statusMessage = message as WsTranscriptionStatus;
          if (statusMessage.status === "recording") {
            setTranscriptionErrorMessage(null);
            setTranscriptionStatus((prev) => prev === "recording" ? prev : "recording");
            return;
          }
          if (statusMessage.status === "stopped") {
            const wasActive = transcriptionStatusRef.current === "recording" || transcriptionStatusRef.current === "connecting";
            setTranscriptionStatus("idle");
            setInterimTranscript("");
            if (wasActive) setTranscriptionErrorMessage(statusMessage.reason || "Remote transcription stopped.");
            return;
          }
        }

        if (message.type !== "transcription_stream") return;
        const m = message as WsTranscriptionStream;
        const normalized: WsTranscriptionStream = { ...m, type: "transcription_stream", kind: m.kind, timestamp: m.timestamp || Date.now(), engine: m.engine || settings.transcriptionEngine, text: m.text || "" };
        if (normalized.kind === "interim" || (normalized.kind === "final" && normalized.text)) emitTranscriptionStream(normalized);

        if (m.kind === "interim") {
          setInterimTranscript(m.text || "");
          scheduleInterimDirectParse(m.text || "");
          setTranscriptionStatus((prev) => prev === "waiting_for_browser" ? "recording" : prev);
        } else if (m.kind === "final" && m.text) {
          setInterimTranscript("");
          setTranscriptionStatus((prev) => prev === "waiting_for_browser" ? "recording" : prev);

          const segment: TranscriptionSegment = m.segment || { id: `segment-${Date.now()}`, text: m.text, timestamp: Date.now(), isFinal: true };
          setTranscriptHistory(prev => [...prev, segment]);

          const cueTranslationId = await findTranslationCue(m.text || "");
          if (cueTranslationId) await handleTranslationCue(cueTranslationId);
          const activeTranslationId = cueTranslationId || transcriptionTranslationIdRef.current;

          if (m.key_points?.length) {
            const normalizedKeyPoints: KeyPoint[] = m.key_points.map((point) => ({ text: point.text, category: point.category as KeyPoint["category"] }));
            if (normalizedKeyPoints.length > 0) setTranscriptKeyPoints((prev) => ({ ...prev, [segment.id]: normalizedKeyPoints }));
          }

          detectAndLookupReferences(m.text, { aggressiveSpeechNormalization: true, translationId: activeTranslationId }).then(async (directRefs) => {
            if (directRefs.length > 0) {
              setDetectedReferences(prev => [...prev, ...directRefs]);
              if (settings.autoAddDetectedToHistory) {
                setChatHistory(prev => [...prev, { id: `transcript-${Date.now()}`, type: "result", content: `Detected from transcription`, timestamp: Date.now(), references: directRefs }]);
              }
              if (autoTriggerOnDetectionRef.current) handleGoLive(directRefs[0], { fromAutoTrigger: true });
            }
          });
        }
      });
    } catch (error) {
      console.error("[SmartVerses] Failed to connect to browser transcription WebSocket:", error);
    }
  }, [emitTranscriptionStream, handleGoLive, handleTranslationCue, scheduleInterimDirectParse, settings, autoTriggerOnDetectionRef, transcriptionTranslationIdRef, setDetectedReferences, setChatHistory]);

  const connectToRemoteTranscriptionWs = useCallback(async () => {
    const { host, port } = normalizeRemoteTranscriptionTarget(settings.remoteTranscriptionHost || "", settings.remoteTranscriptionPort);
    if (!host) {
      setTranscriptionStatus("error");
      setTranscriptionErrorMessage("Remote transcription host is missing.");
      return;
    }

    try {
      setTranscriptionErrorMessage(null);
      disconnectRemoteTranscriptionWs();
      const wsUrl = `ws://${host}:${port}/ws`;
      const ws = new LiveSlidesWebSocket(wsUrl, "remote-transcription", "viewer");
      remoteTranscriptionWsRef.current = ws;

      if (remoteTranscriptionStatusUnsubRef.current) { remoteTranscriptionStatusUnsubRef.current(); remoteTranscriptionStatusUnsubRef.current = null; }
      remoteTranscriptionStatusUnsubRef.current = ws.onStatus((status) => {
        if (status.status === "connected") { setTranscriptionErrorMessage(null); if (transcriptionStatusRef.current === "error") setTranscriptionStatus("connecting"); return; }
        if (status.status === "error" || status.status === "disconnected") {
          if (isStoppingRef.current || transcriptionStatusRef.current === "idle") return;
          setTranscriptionStatus("error");
          setTranscriptionErrorMessage(`Remote connection ${status.status === "error" ? "failed" : "closed"}.`);
        }
      });

      try {
        const localInfo = await getLiveSlidesServerInfo();
        remoteRebroadcastAllowedRef.current = !(localInfo?.server_running && localInfo.local_ip === host && localInfo.server_port === port);
      } catch { remoteRebroadcastAllowedRef.current = true; }

      await ws.connect();

      ws.onMessage((message) => {
        if (message.type === "transcription_status") {
          const sm = message as WsTranscriptionStatus;
          if (sm.status === "recording") { setTranscriptionErrorMessage(null); setTranscriptionStatus((prev) => prev === "recording" ? prev : "recording"); return; }
          if (sm.status === "stopped") {
            const wasActive = transcriptionStatusRef.current === "recording" || transcriptionStatusRef.current === "connecting";
            setTranscriptionStatus("idle"); setInterimTranscript("");
            if (wasActive) setTranscriptionErrorMessage(sm.reason || "Remote transcription stopped.");
            return;
          }
        }
        if (message.type !== "transcription_stream") return;
        const m = message as WsTranscriptionStream;
        const normalized: WsTranscriptionStream = { ...m, type: "transcription_stream", kind: m.kind, timestamp: m.timestamp || Date.now(), engine: m.engine || settings.transcriptionEngine, text: m.text || "" };
        if (normalized.kind === "interim" || (normalized.kind === "final" && normalized.text)) emitTranscriptionStream(normalized);
        if (m.kind === "interim") { setInterimTranscript(m.text || ""); setTranscriptionStatus((prev) => prev === "connecting" ? "recording" : prev); }
        else if (m.kind === "final" && m.text) {
          setInterimTranscript("");
          setTranscriptionStatus((prev) => prev === "connecting" ? "recording" : prev);
          const segment: TranscriptionSegment = m.segment || { id: `segment-${Date.now()}`, text: m.text, timestamp: Date.now(), isFinal: true };
          setTranscriptHistory((prev) => [...prev, segment]);

          if (m.key_points?.length) {
            const nkp: KeyPoint[] = m.key_points.map((p) => ({ text: p.text, category: p.category as KeyPoint["category"] }));
            if (nkp.length > 0) setTranscriptKeyPoints((prev) => ({ ...prev, [segment.id]: nkp }));
          }

          (async () => {
            const cs = settingsRef.current;
            let scriptureReferences = m.scripture_references || [];
            let keyPoints: KeyPoint[] = (m.key_points as KeyPoint[]) || [];
            const paraphrasedVerses = m.paraphrased_verses || [];
            const paraphraseRefKeys = new Set(paraphrasedVerses.map((v) => normalizeReferenceMarker(v.reference || "")).filter(Boolean));

            if (paraphraseRefKeys.size > 0 && scriptureReferences.length > 0) {
              scriptureReferences = scriptureReferences.filter((r) => !paraphraseRefKeys.has(normalizeReferenceMarker(r || "")));
            }
            if (keyPoints.length > 0) setTranscriptKeyPoints((prev) => ({ ...prev, [segment.id]: keyPoints }));

            if (scriptureReferences.length > 0) {
              const resolvedDirect = await resolveReferencesFromList(scriptureReferences, m.text, transcriptionTranslationIdRef.current);
              const filteredDirect = paraphraseRefKeys.size > 0 ? resolvedDirect.filter((ref) => !paraphraseRefKeys.has(normalizeReferenceMarker(ref.displayRef || ref.reference || ""))) : resolvedDirect;
              if (filteredDirect.length > 0) {
                setDetectedReferences((prev) => [...prev, ...filteredDirect]);
                if (cs.autoAddDetectedToHistory) setChatHistory((prev) => [...prev, { id: `transcript-${Date.now()}`, type: "result", content: `Detected from transcription`, timestamp: Date.now(), references: filteredDirect }]);
                if (autoTriggerOnDetectionRef.current) handleGoLive(filteredDirect[0], { fromAutoTrigger: true });
              }
            }

            if (paraphrasedVerses.length > 0) {
              const resolved = await resolveParaphrasedVerses(paraphrasedVerses, transcriptionTranslationIdRef.current);
              if (resolved.length > 0) applyParaphraseDetections(resolved, m.text, "Remote");
            }

            if (!cs.remoteTranscriptionEnabled && scriptureReferences.length === 0 && paraphrasedVerses.length === 0 && (cs.enableParaphraseDetection || cs.enableKeyPointExtraction)) {
              const result = await runParaphraseDetection(m.text, segment, "remote", transcriptionTranslationIdRef.current);
              scriptureReferences = [...new Set([...scriptureReferences, ...result.scriptureReferences])];
              keyPoints = result.keyPoints;
            }

            if (cs.streamTranscriptionsToWebSocket && remoteRebroadcastAllowedRef.current) {
              broadcastTranscriptionStreamMessage({ type: "transcription_stream", kind: m.kind, timestamp: m.timestamp || Date.now(), engine: m.engine || cs.transcriptionEngine, text: m.text, audio_level: m.audio_level ?? audioLevelRef.current, segment: m.segment as TranscriptionSegment | undefined, scripture_references: scriptureReferences.length ? scriptureReferences : undefined, key_points: keyPoints.length ? keyPoints.map((kp) => ({ text: kp.text, category: kp.category })) : undefined, paraphrased_verses: paraphrasedVerses.length ? paraphrasedVerses : undefined }).catch(() => {});
            }
          })();
        }
      });
    } catch (error) {
      console.error("[SmartVerses] Failed to connect to remote transcription WS:", error);
      setTranscriptionStatus("error");
      setTranscriptionErrorMessage(error instanceof Error ? error.message : "Failed to connect.");
    }
  }, [runParaphraseDetection, applyParaphraseDetections, disconnectRemoteTranscriptionWs, emitTranscriptionStream, settings, handleGoLive, scheduleInterimDirectParse, settingsRef, autoTriggerOnDetectionRef, transcriptionTranslationIdRef, setDetectedReferences, setChatHistory]);

  // =============================================================================
  // START / STOP TRANSCRIPTION
  // =============================================================================
  const handleStartTranscription = useCallback(async () => {
    setTranscriptionErrorMessage(null);
    latestInterimTextRef.current = "";
    lastInterimDirectSignatureRef.current = "";
    lastInterimParseAtRef.current = 0;
    lastInterimWordCountRef.current = 0;
    aiContextChunksRef.current = [];

    if (settings.remoteTranscriptionEnabled) {
      setTranscriptionStatus("connecting");
      await connectToRemoteTranscriptionWs();
      return;
    }

    // AssemblyAI is deprecated, remove API key validation
    if (settings.transcriptionEngine === "groq" && !settings.groqApiKey) {
      alert("Please configure your Groq API key in Settings → Transcription");
      return;
    }

    const preloadStatus = getOfflineModelPreloadStatus();
    if (settings.transcriptionEngine === "offline-whisper") {
      const modelId = settings.offlineWhisperModel || "onnx-community/whisper-base";
      if (!isModelDownloaded(modelId)) {
        const progressLabel = preloadStatus?.modelId === modelId && preloadStatus.phase !== "ready" && preloadStatus.progress ? ` (${Math.round(preloadStatus.progress)}%)` : "";
        alert(progressLabel ? `Model still downloading${progressLabel}.` : "Model not downloaded. Go to Settings.");
        return;
      }
    }
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    if (settings.transcriptionEngine === "offline-whisper-native") {
      if (!isTauri) {
        alert("Native Whisper is only available in the desktop application.");
        return;
      }
      const fileName = settings.offlineWhisperNativeModel || "ggml-small.en-q5_1.bin";
      const isDownloaded = await isNativeWhisperModelDownloaded(fileName);
      if (!isDownloaded) { alert("Native Whisper model not downloaded."); return; }
    }
    if (settings.transcriptionEngine === "offline-moonshine") {
      if (!isTauri) {
        alert("Moonshine is only available in the desktop application.");
        return;
      }
      const modelId = settings.offlineMoonshineModel || "onnx-community/moonshine-base-ONNX";
      if (!isModelDownloaded(modelId)) {
        const progressLabel = preloadStatus?.modelId === modelId && preloadStatus.phase !== "ready" && preloadStatus.progress ? ` (${Math.round(preloadStatus.progress)}%)` : "";
        alert(progressLabel ? `Model still downloading${progressLabel}.` : "Model not downloaded. Go to Settings.");
        return;
      }
    }

    if (settings.runTranscriptionInBrowser) {
      setTranscriptionStatus("waiting_for_browser");
      await connectToBrowserTranscriptionWs();
      await openBrowserTranscription();
      return;
    }

    setTranscriptionStatus("connecting");

    try {
      const service = createTranscriptionService(settings, {
        onInterimTranscript: (text) => {
          const isLocalEngine = settings.transcriptionEngine === "offline-whisper-native" || settings.transcriptionEngine === "offline-whisper" || settings.transcriptionEngine === "offline-moonshine";
          scheduleInterimDirectParse(text);
          if (isLocalEngine) { queueInterimUiUpdate(text); return; }
          setInterimTranscript(text);
          emitTranscriptionStream({ type: "transcription_stream", kind: "interim", timestamp: Date.now(), engine: settings.transcriptionEngine, text, audio_level: audioLevelRef.current });
          if (settings.streamTranscriptionsToWebSocket) {
            broadcastTranscriptionStreamMessage({ type: "transcription_stream", kind: "interim", timestamp: Date.now(), engine: settings.transcriptionEngine, text, audio_level: audioLevelRef.current }).catch(() => {});
          }
        },
        onFinalTranscript: async (text, segment) => {
          setTranscriptHistory(prev => [...prev, segment]);
          setInterimTranscript("");
          const currentSettings = settingsRef.current;

          const cueTranslationId = await findTranslationCue(text);
          if (cueTranslationId) await handleTranslationCue(cueTranslationId);
          const activeTranslationId = cueTranslationId || transcriptionTranslationIdRef.current;

          const directRefs = await detectAndLookupReferences(text, { aggressiveSpeechNormalization: true, translationId: activeTranslationId });
          let keyPoints: KeyPoint[] = [];
          let scriptureReferences: string[] = [];
          let paraphrasedVersesForWs: ParaphrasedVerse[] = [];

          if (directRefs.length > 0) {
            setDetectedReferences(prev => [...prev, ...directRefs]);
            scriptureReferences = Array.from(new Set(directRefs.map((r) => (r.displayRef || "").trim()).filter(Boolean)));
            if (currentSettings.autoAddDetectedToHistory) {
              setChatHistory(prev => [...prev, { id: `transcript-${Date.now()}`, type: "result", content: `Detected from transcription`, timestamp: Date.now(), references: directRefs }]);
            }
            if (autoTriggerOnDetectionRef.current && directRefs.length > 0) handleGoLive(directRefs[0], { fromAutoTrigger: true });
          } else if (currentSettings.enableParaphraseDetection || currentSettings.enableKeyPointExtraction) {
            const result = await runParaphraseDetection(text, segment, "local", activeTranslationId);
            scriptureReferences = result.scriptureReferences;
            keyPoints = result.keyPoints;
            paraphrasedVersesForWs = result.paraphrasedVersesForWs;
          }

          updateAiContextChunks(text, Math.max(0, Math.floor(currentSettings.aiContextChunkCount ?? 0)));

          emitTranscriptionStream({ type: "transcription_stream", kind: "final", timestamp: Date.now(), engine: currentSettings.transcriptionEngine, text, audio_level: audioLevelRef.current, segment, scripture_references: scriptureReferences.length ? scriptureReferences : undefined, key_points: keyPoints.length ? keyPoints.map((kp) => ({ text: kp.text, category: kp.category })) : undefined, paraphrased_verses: paraphrasedVersesForWs.length ? paraphrasedVersesForWs : undefined });

          if (currentSettings.streamTranscriptionsToWebSocket) {
            broadcastTranscriptionStreamMessage({ type: "transcription_stream", kind: "final", timestamp: Date.now(), engine: currentSettings.transcriptionEngine, text, audio_level: audioLevelRef.current, segment, scripture_references: scriptureReferences.length ? scriptureReferences : undefined, key_points: keyPoints.length ? keyPoints : undefined, paraphrased_verses: paraphrasedVersesForWs.length ? paraphrasedVersesForWs : undefined }).catch(() => {});
          }
        },
        onError: (error) => {
          console.error("Transcription error:", error);
          setTranscriptionStatus("error");
          setTranscriptionErrorMessage(error instanceof Error ? error.message : "Transcription error.");
        },
        onStatusChange: (status) => {
          setTranscriptionStatus(status);
          if (status === "recording") setTranscriptionErrorMessage(null);
          if (status !== "recording") setAudioLevel(0);
        },
        onConnectionClose: () => {
          setTranscriptionStatus("idle");
          setAudioLevel(0);
        },
        onAudioLevel: (level) => {
          const mapped = mapAudioLevel(level);
          audioLevelRef.current = mapped;
          setAudioLevel((prev) => prev * 0.65 + mapped * 0.35);
        },
      });

      service.setAudioCaptureMode?.(settings.audioCaptureMode === "native" ? "native" : "webrtc");
      if (settings.audioCaptureMode === "native") service.setNativeMicrophoneDeviceId?.(settings.selectedNativeMicrophoneId || null);
      if (settings.selectedMicrophoneId) service.setMicrophone(settings.selectedMicrophoneId);

      await service.startTranscription();
      transcriptionServiceRef.current = service;
    } catch (error) {
      console.error("Failed to start transcription:", error);
      setTranscriptionStatus("error");
      setTranscriptionErrorMessage(error instanceof Error ? error.message : "Failed to start transcription.");
      alert(`Failed to start transcription: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [settings, appSettings, connectToRemoteTranscriptionWs, handleGoLive, handleTranslationCue, runParaphraseDetection, applyParaphraseDetections, emitTranscriptionStream, queueInterimUiUpdate, scheduleInterimDirectParse, settingsRef, autoTriggerOnDetectionRef, transcriptionTranslationIdRef, setDetectedReferences, setChatHistory, updateAiContextChunks, aiContextChunksRef, connectToBrowserTranscriptionWs, openBrowserTranscription]);

  const handleStopTranscription = useCallback(async () => {
    setIsStopping(true);
    isStoppingRef.current = true;
    try {
      if (transcriptionServiceRef.current) {
        await transcriptionServiceRef.current.stopTranscription();
        transcriptionServiceRef.current.destroy?.();
        transcriptionServiceRef.current = null;
      }
      disconnectBrowserTranscriptionWs();
      disconnectRemoteTranscriptionWs();
      latestInterimTextRef.current = "";
      pendingInterimUiTextRef.current = "";
      lastInterimDirectSignatureRef.current = "";
      lastInterimParseAtRef.current = 0;
      lastInterimWordCountRef.current = 0;
      if (interimUiTimerRef.current) { clearTimeout(interimUiTimerRef.current); interimUiTimerRef.current = null; }
      setTranscriptionStatus("idle");
      setInterimTranscript("");
      setTranscriptionErrorMessage(null);
    } finally {
      setIsStopping(false);
      isStoppingRef.current = false;
    }
  }, [disconnectBrowserTranscriptionWs, disconnectRemoteTranscriptionWs]);

  // =============================================================================
  // TIMER / LIMIT
  // =============================================================================
  const isRemoteTranscription = settings.remoteTranscriptionEnabled;
  const transcriptionTimeLimitMinutes = Math.max(1, settings.transcriptionTimeLimitMinutes ?? 120);
  const transcriptionTimeLimitMs = transcriptionTimeLimitMinutes * 60 * 1000;

  const formatElapsedTime = useCallback((ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, []);

  const formatSnoozeLabel = useCallback((minutes: number) => {
    if (minutes >= 60 && minutes % 60 === 0) { const hours = minutes / 60; return `${hours} hr${hours === 1 ? "" : "s"}`; }
    return `${minutes} min`;
  }, []);

  const formattedElapsedTime = useMemo(() => formatElapsedTime(transcriptionElapsedMs), [formatElapsedTime, transcriptionElapsedMs]);
  const canStartTranscription = transcriptionStatus === "idle" || transcriptionStatus === "error";
  const transcriptionLimitLabel = useMemo(() => formatSnoozeLabel(transcriptionTimeLimitMinutes), [formatSnoozeLabel, transcriptionTimeLimitMinutes]);

  const clearTranscriptionPromptTimeout = useCallback(() => {
    if (transcriptionPromptTimeoutRef.current) {
      window.clearTimeout(transcriptionPromptTimeoutRef.current);
      transcriptionPromptTimeoutRef.current = null;
    }
  }, []);

  const resetTranscriptionTimer = useCallback(() => {
    transcriptionStartRef.current = null;
    transcriptionNextPromptAtRef.current = null;
    transcriptionPromptReasonRef.current = null;
    setTranscriptionElapsedMs(0);
    setShowTranscriptionLimitPrompt(false);
    clearTranscriptionPromptTimeout();
  }, [clearTranscriptionPromptTimeout]);

  const openTranscriptionLimitPrompt = useCallback(() => {
    if (isRemoteTranscription || showTranscriptionLimitPrompt) return;
    setShowTranscriptionLimitPrompt(true);
    clearTranscriptionPromptTimeout();
    transcriptionPromptTimeoutRef.current = window.setTimeout(() => {
      if (transcriptionStatusRef.current !== "idle") handleStopTranscription();
      setShowTranscriptionLimitPrompt(false);
    }, 60 * 1000);
  }, [clearTranscriptionPromptTimeout, handleStopTranscription, isRemoteTranscription, showTranscriptionLimitPrompt]);

  const handleTranscriptionSnooze = useCallback((minutes: number) => {
    transcriptionNextPromptAtRef.current = Date.now() + minutes * 60 * 1000;
    transcriptionPromptReasonRef.current = "snooze";
    setShowTranscriptionLimitPrompt(false);
    clearTranscriptionPromptTimeout();
  }, [clearTranscriptionPromptTimeout]);

  const handleTranscriptionPromptStop = useCallback(() => {
    setShowTranscriptionLimitPrompt(false);
    clearTranscriptionPromptTimeout();
    handleStopTranscription();
  }, [clearTranscriptionPromptTimeout, handleStopTranscription]);

  // Timer effects
  useEffect(() => {
    if (transcriptionStatus === "idle" || transcriptionStatus === "error") { resetTranscriptionTimer(); return; }
    if (transcriptionStatus !== "recording") return;
    if (!transcriptionStartRef.current) {
      const now = Date.now();
      transcriptionStartRef.current = now;
      transcriptionNextPromptAtRef.current = isRemoteTranscription ? null : now + transcriptionTimeLimitMs;
      transcriptionPromptReasonRef.current = isRemoteTranscription ? null : "limit";
      setTranscriptionElapsedMs(0);
    }
    const intervalId = window.setInterval(() => {
      if (!transcriptionStartRef.current) return;
      const now = Date.now();
      setTranscriptionElapsedMs(now - transcriptionStartRef.current);
      if (isRemoteTranscription) return;
      const nextPromptAt = transcriptionNextPromptAtRef.current;
      if (nextPromptAt && now >= nextPromptAt && !showTranscriptionLimitPrompt) openTranscriptionLimitPrompt();
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [transcriptionStatus, transcriptionTimeLimitMs, showTranscriptionLimitPrompt, openTranscriptionLimitPrompt, resetTranscriptionTimer, isRemoteTranscription]);

  // Start/stop event listeners
  useEffect(() => {
    const handleStartRequest = () => { if (transcriptionStatus !== "idle") return; handleStartTranscription(); };
    const handleStopRequest = () => { if (transcriptionStatus === "idle") return; handleStopTranscription(); };
    window.addEventListener("transcription-start-request", handleStartRequest);
    window.addEventListener("transcription-stop-request", handleStopRequest);
    return () => {
      window.removeEventListener("transcription-start-request", handleStartRequest);
      window.removeEventListener("transcription-stop-request", handleStopRequest);
    };
  }, [handleStartTranscription, handleStopTranscription, transcriptionStatus]);

  const handleClearTranscript = useCallback(() => {
    setTranscriptHistory([]);
    setDetectedReferences([]);
    setTranscriptKeyPoints({});
    setInterimTranscript("");
  }, [setDetectedReferences]);

  const handleAutoTriggerToggle = useCallback((enabled: boolean) => {
    // This needs to dispatch the settings update via the parent
    window.dispatchEvent(
      new CustomEvent("smartverses-auto-trigger-toggle", { detail: { enabled } })
    );
  }, []);

  const toggleDetectedExpanded = useCallback((id: string) => {
    setExpandedDetectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDetectedScroll = useCallback(() => {
    const el = detectedPanelScrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const atBottom = distanceFromBottom < 40;
    if (!atBottom && !autoScrollDetectedPaused) { setAutoScrollDetectedPaused(true); return; }
    if (atBottom && autoScrollDetectedPaused) setAutoScrollDetectedPaused(false);
  }, [autoScrollDetectedPaused]);

  // Detected refs auto-scroll
  useEffect(() => {
    if (detectedPanelCollapsed) return;
    const el = detectedPanelScrollRef.current;
    if (!el) return;
    if (!autoScrollDetectedPaused) el.scrollTop = el.scrollHeight;
  }, [detectedReferencesRef.current.length, detectedPanelCollapsed, autoScrollDetectedPaused]);

  // Keep detected refs ref in sync
  useEffect(() => {
    detectedReferencesRef.current = detectedReferencesRef.current; // parent manages this
  }, []);

  const recentDetectedReferences = useMemo(() => {
    return detectedReferencesRef.current.slice().reverse();
  }, [detectedReferencesRef.current.length]);

  return {
    // Transcription state
    transcriptionStatus,
    isStopping,
    transcriptionErrorMessage,
    interimTranscript,
    transcriptHistory,
    transcriptKeyPoints,
    setTranscriptKeyPoints,
    audioLevel,
    // Timer
    transcriptionElapsedMs,
    showTranscriptionLimitPrompt,
    formattedElapsedTime,
    canStartTranscription,
    transcriptionLimitLabel,
    transcriptionTimeLimitMinutes,
    isRemoteTranscription,
    // Actions
    handleStartTranscription,
    handleStopTranscription,
    handleClearTranscript,
    handleTranscriptionSnooze,
    handleTranscriptionPromptStop,
    handleAutoTriggerToggle,
    // Detected panel
    detectedPanelCollapsed,
    setDetectedPanelCollapsed,
    expandedDetectedIds,
    toggleDetectedExpanded,
    detectedPanelScrollRef,
    handleDetectedScroll,
    recentDetectedReferences,
    // Emit helpers
    emitTranscriptionStream,
  };
}
