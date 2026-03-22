/**
 * useParaphraseDetection
 *
 * Manages offline + AI-based paraphrase detection and key point extraction.
 * Also handles de-duplication and the apply/repool logic.
 */

import { useCallback, useRef } from "react";
import type {
  SmartVersesSettings,
  DetectedBibleReference,
  SmartVersesChatMessage,
  KeyPoint,
  ParaphrasedVerse,
  TranscriptionSegment,
} from "@/lib/types/smartVerses";
import type { AppSettings } from "@/lib/types";
import {
  analyzeTranscriptChunk,
  resolveParaphrasedVerses,
} from "@/lib/services/smartVersesAIService";
import { analyzeTranscriptChunkOffline } from "@/lib/services/smartVersesOfflineParaphraseService";
import { loadVerseByComponents } from "@/lib/services/smartVersesBibleService";
import { BUILTIN_KJV_ID } from "@/lib/services/bibleLibraryService";
import {
  buildTranscriptReferenceKey,
  loadAppSettings,
} from "@/lib/utils/smartVersesHelpers";

interface UseParaphraseDetectionOptions {
  settingsRef: React.MutableRefObject<SmartVersesSettings>;
  autoTriggerOnDetectionRef: React.MutableRefObject<boolean>;
  detectedReferencesRef: React.MutableRefObject<DetectedBibleReference[]>;
  transcriptionTranslationIdRef: React.MutableRefObject<string>;
  setDetectedReferences: React.Dispatch<React.SetStateAction<DetectedBibleReference[]>>;
  setChatHistory: React.Dispatch<React.SetStateAction<SmartVersesChatMessage[]>>;
  setTranscriptKeyPoints: React.Dispatch<React.SetStateAction<Record<string, KeyPoint[]>>>;
  handleGoLive: (ref: DetectedBibleReference, options?: { fromAutoTrigger?: boolean }) => void;
}

export function useParaphraseDetection({
  settingsRef,
  autoTriggerOnDetectionRef,
  detectedReferencesRef,
  transcriptionTranslationIdRef,
  setDetectedReferences,
  setChatHistory,
  setTranscriptKeyPoints,
  handleGoLive,
}: UseParaphraseDetectionOptions) {
  const aiContextChunksRef = useRef<string[]>([]);

  const applyParaphraseDetections = useCallback(
    (
      resolvedRefs: DetectedBibleReference[],
      transcriptText: string,
      sourceLabel?: string
    ): DetectedBibleReference[] => {
      const currentSettings = settingsRef.current;
      if (!resolvedRefs || resolvedRefs.length === 0) return [];

      const resolvedWithTranscript = resolvedRefs.map((r) => ({
        ...r,
        transcriptText,
      }));

      const recent = detectedReferencesRef.current.slice(-5);
      const recentParaphraseKeys = new Set(
        recent
          .filter((r) => r.source === "paraphrase")
          .map((r) =>
            buildTranscriptReferenceKey(
              r.transcriptText || "",
              r.displayRef || r.reference || ""
            )
          )
      );
      const deduped = resolvedWithTranscript.filter(
        (r) =>
          !recentParaphraseKeys.has(
            buildTranscriptReferenceKey(
              transcriptText,
              r.displayRef || r.reference || ""
            )
          )
      );

      if (deduped.length > 0) {
        const paraphraseKeys = new Set(
          deduped.map((r) =>
            buildTranscriptReferenceKey(
              transcriptText,
              r.displayRef || r.reference || ""
            )
          )
        );
        setDetectedReferences((prev) => {
          const filtered = prev.filter((existing) => {
            if (existing.source !== "direct") return true;
            return !paraphraseKeys.has(
              buildTranscriptReferenceKey(
                existing.transcriptText || "",
                existing.displayRef || existing.reference || ""
              )
            );
          });
          return [...filtered, ...deduped];
        });
      }

      if (currentSettings.autoAddDetectedParaphraseToHistory && deduped.length > 0) {
        const confidence = Math.round((deduped[0].confidence || 0) * 100);
        const label = sourceLabel ? `${sourceLabel}, ` : "";
        setChatHistory((prev) => [
          ...prev,
          {
            id: `paraphrase-${Date.now()}`,
            type: "result",
            content: `Paraphrase detected (${label}${confidence}% confidence)`,
            timestamp: Date.now(),
            references: deduped,
          },
        ]);
      }

      if (currentSettings.autoTriggerOnDetection && deduped.length > 0) {
        handleGoLive(deduped[0], { fromAutoTrigger: true });
      }

      return deduped;
    },
    [handleGoLive, setDetectedReferences, setChatHistory, settingsRef, detectedReferencesRef]
  );

  const updateAiContextChunks = useCallback((text: string, maxChunks: number) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (maxChunks <= 0) {
      aiContextChunksRef.current = [];
      return;
    }
    const next = [...aiContextChunksRef.current, trimmed];
    if (next.length > maxChunks) {
      next.splice(0, next.length - maxChunks);
    }
    aiContextChunksRef.current = next;
  }, []);

  const runParaphraseDetection = useCallback(
    async (
      text: string,
      segment: TranscriptionSegment,
      context: "remote" | "local" = "local",
      translationId?: string
    ): Promise<{
      scriptureReferences: string[];
      keyPoints: KeyPoint[];
      paraphrasedVersesForWs: ParaphrasedVerse[];
    }> => {
      const currentSettings = settingsRef.current;
      const activeTranslationId = translationId || transcriptionTranslationIdRef.current;
      const appSettings = loadAppSettings();
      let scriptureReferences: string[] = [];
      let keyPoints: KeyPoint[] = [];
      let paraphrasedVersesForWs: ParaphrasedVerse[] = [];

      const minWords = Math.max(1, Math.floor(currentSettings.aiMinWordCount ?? 1));
      const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount < minWords) {
        return { scriptureReferences, keyPoints, paraphrasedVersesForWs };
      }

      const paraphraseMode = currentSettings.paraphraseDetectionMode || "offline";
      const allowOfflineParaphrase =
        currentSettings.enableParaphraseDetection && paraphraseMode !== "ai";
      const allowAIParaphrase =
        currentSettings.enableParaphraseDetection && paraphraseMode !== "offline";
      let offlineParaphraseCount = 0;

      const contextChunkCount = Math.max(0, Math.floor(currentSettings.aiContextChunkCount ?? 0));
      const previousChunks =
        contextChunkCount > 0
          ? aiContextChunksRef.current.slice(-contextChunkCount)
          : [];

      // Run offline paraphrase detection
      if (allowOfflineParaphrase) {
        try {
          const offlineAnalysis = await analyzeTranscriptChunkOffline(text, {
            minConfidence: currentSettings.paraphraseConfidenceThreshold,
            maxResults: 3,
            candidateLimit: 160,
          });
          if (offlineAnalysis.paraphrasedVerses.length > 0) {
            const resolvedRefs = await resolveParaphrasedVerses(
              offlineAnalysis.paraphrasedVerses,
              activeTranslationId
            );
            const deduped = applyParaphraseDetections(resolvedRefs, text, "Offline");
            offlineParaphraseCount = deduped.length;
          }
        } catch (offlineError) {
          console.error(`[SmartVerses] Offline paraphrase failed:`, offlineError);
        }
      }

      // Run AI analysis if needed
      const shouldRunAI =
        currentSettings.enableKeyPointExtraction ||
        (allowAIParaphrase && offlineParaphraseCount === 0);

      if (shouldRunAI) {
        try {
          const analysis = await analyzeTranscriptChunk(
            text,
            appSettings,
            allowAIParaphrase && offlineParaphraseCount === 0,
            currentSettings.enableKeyPointExtraction,
            {
              keyPointInstructions: currentSettings.keyPointExtractionInstructions,
              overrideProvider:
                currentSettings.bibleSearchProvider === "offline"
                  ? undefined
                  : currentSettings.bibleSearchProvider,
              overrideModel: currentSettings.bibleSearchModel,
              minParaphraseConfidence: currentSettings.paraphraseConfidenceThreshold,
              maxParaphraseResults: 3,
              minWords: currentSettings.aiMinWordCount,
              previousChunks: previousChunks.length ? previousChunks : undefined,
              paraphraseStrictMode: currentSettings.paraphraseStrictMode,
            }
          );

          if (analysis.keyPoints?.length) {
            keyPoints = analysis.keyPoints;
            setTranscriptKeyPoints((prev) => ({
              ...prev,
              [segment.id]: keyPoints,
            }));
          }

          if (analysis.paraphrasedVerses.length > 0) {
            paraphrasedVersesForWs = analysis.paraphrasedVerses;
          }

          if (allowAIParaphrase && analysis.paraphrasedVerses.length > 0) {
            const resolvedRefs = await resolveParaphrasedVerses(
              analysis.paraphrasedVerses,
              activeTranslationId
            );
            applyParaphraseDetections(resolvedRefs, text);
          }
        } catch (aiError) {
          console.error(`[SmartVerses] AI analysis failed:`, aiError);
        }
      }

      return { scriptureReferences, keyPoints, paraphrasedVersesForWs };
    },
    [applyParaphraseDetections, settingsRef, transcriptionTranslationIdRef, setTranscriptKeyPoints]
  );

  // Repool last detected reference with new translation
  const repoolLastDetectedReference = useCallback(
    async (translationId: string) => {
      const lastRef =
        detectedReferencesRef.current[detectedReferencesRef.current.length - 1];
      if (!lastRef || !lastRef.book || !lastRef.chapter || !lastRef.verse) return;

      const verseData = await loadVerseByComponents(
        lastRef.book,
        lastRef.chapter,
        lastRef.verse,
        translationId
      );
      if (!verseData) return;

      const updatedRef: DetectedBibleReference = {
        ...lastRef,
        reference: verseData.displayRef,
        displayRef: verseData.displayRef,
        verseText: verseData.verseText,
        translationId,
      };

      setDetectedReferences((prev) =>
        prev.map((item) => (item.id === lastRef.id ? updatedRef : item))
      );

      const currentSettings = settingsRef.current;
      setChatHistory((prev) => {
        const updatedHistory = prev.map((msg) => {
          if (!msg.references) return msg;
          return {
            ...msg,
            references: msg.references.map((item) =>
              item.id === lastRef.id ? updatedRef : item
            ),
          };
        });

        const shouldAutoAdd =
          updatedRef.source === "paraphrase"
            ? currentSettings.autoAddDetectedParaphraseToHistory
            : currentSettings.autoAddDetectedToHistory;
        if (!shouldAutoAdd) return updatedHistory;

        return [
          ...updatedHistory,
          {
            id: `transcript-${Date.now()}`,
            type: "result",
            content: `Detected from transcription`,
            timestamp: Date.now(),
            references: [updatedRef],
          },
        ];
      });

      if (autoTriggerOnDetectionRef.current) {
        handleGoLive(updatedRef, { fromAutoTrigger: true });
      }
    },
    [
      handleGoLive,
      settingsRef,
      autoTriggerOnDetectionRef,
      detectedReferencesRef,
      setDetectedReferences,
      setChatHistory,
    ]
  );

  return {
    aiContextChunksRef,
    applyParaphraseDetections,
    updateAiContextChunks,
    runParaphraseDetection,
    repoolLastDetectedReference,
  };
}
