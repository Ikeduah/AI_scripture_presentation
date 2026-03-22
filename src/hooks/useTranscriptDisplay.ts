/**
 * useTranscriptDisplay
 * 
 * Manages transcript display options, filtering, auto-scroll,
 * download, and report functionality.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type {
  DetectedBibleReference,
  TranscriptionSegment,
  KeyPoint,
} from "@/lib/types/smartVerses";
import {
  type TranscriptDisplayOptions,
  loadTranscriptDisplayOptions,
  saveTranscriptDisplayOptions,
  normalizeTranscriptMarker,
  REPORT_ISSUE_SEEN_KEY,
} from "@/lib/utils/smartVersesHelpers";
import { saveTranscriptFile } from "@/lib/utils/transcriptDownload";
import {
  buildReportPayload,
  sendReportTranscript,
} from "@/lib/services/reportTranscriptService";

interface UseTranscriptDisplayOptions {
  transcriptHistory: TranscriptionSegment[];
  interimTranscript: string;
  detectedReferences: DetectedBibleReference[];
  transcriptKeyPoints: Record<string, KeyPoint[]>;
  transcriptFilterPhrases?: string[];
}

export function useTranscriptDisplay({
  transcriptHistory,
  interimTranscript,
  detectedReferences,
  transcriptKeyPoints,
  transcriptFilterPhrases,
}: UseTranscriptDisplayOptions) {
  // Display options
  const [transcriptDisplayOptions, setTranscriptDisplayOptions] = useState<TranscriptDisplayOptions>(
    () => loadTranscriptDisplayOptions()
  );
  const [transcriptMenuOpen, setTranscriptMenuOpen] = useState(false);
  const [transcriptSearchQuery, setTranscriptSearchQuery] = useState("");
  const transcriptMenuRef = useRef<HTMLDivElement | null>(null);

  // Scroll state
  const transcriptScrollContainerRef = useRef<HTMLDivElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const [autoScrollTranscript, setAutoScrollTranscript] = useState(true);
  const [autoScrollPaused, setAutoScrollPaused] = useState(false);

  // Inline refs expansion
  const [expandedInlineRefIds, setExpandedInlineRefIds] = useState<Set<string>>(() => new Set());

  // Report state
  const [reportedSegmentIds, setReportedSegmentIds] = useState<Set<string>>(() => new Set());
  const [loadingReportSegmentId, setLoadingReportSegmentId] = useState<string | null>(null);
  const [reportIssueSeen, setReportIssueSeen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(REPORT_ISSUE_SEEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [pendingReportConfirmSegmentId, setPendingReportConfirmSegmentId] = useState<string | null>(null);

  // Persist display options
  useEffect(() => {
    saveTranscriptDisplayOptions(transcriptDisplayOptions);
  }, [transcriptDisplayOptions]);

  const handleToggleTranscriptOption = useCallback(
    (key: keyof TranscriptDisplayOptions) => {
      setTranscriptDisplayOptions((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
    },
    []
  );

  // Filter phrases
  const filterPhrases = useMemo(() => {
    if (transcriptFilterPhrases && transcriptFilterPhrases.length > 0) {
      return transcriptFilterPhrases;
    }
    return ["[BLANK_AUDIO]", "[INAUDIBLE]"];
  }, [transcriptFilterPhrases]);

  const transcriptFilterSet = useMemo(() => {
    return new Set(
      filterPhrases.map((phrase) => normalizeTranscriptMarker(phrase))
    );
  }, [filterPhrases]);

  const isMusicMarker = useCallback((text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const isBracketed = /^\s*[[\(].*[\])]\s*\.?\s*$/.test(trimmed);
    if (!isBracketed) return false;
    return normalizeTranscriptMarker(trimmed).includes("music");
  }, []);

  const shouldHideTranscriptText = useCallback(
    (text: string): boolean => {
      if (!text.trim()) return false;
      const normalized = normalizeTranscriptMarker(text);
      return transcriptFilterSet.has(normalized);
    },
    [transcriptFilterSet]
  );

  const filteredTranscriptHistory = useMemo(() => {
    const query = transcriptSearchQuery.trim().toLowerCase();
    const results: TranscriptionSegment[] = [];
    let lastWasMusic = false;

    for (const segment of transcriptHistory) {
      const text = segment.text || "";
      if (shouldHideTranscriptText(text)) continue;

      const isMusic = isMusicMarker(text);
      if (isMusic && lastWasMusic) continue;
      lastWasMusic = isMusic;

      if (query && !text.toLowerCase().includes(query)) continue;
      results.push(segment);
    }

    return results;
  }, [
    transcriptHistory,
    transcriptSearchQuery,
    shouldHideTranscriptText,
    isMusicMarker,
  ]);

  const matchesInterimSearch = useMemo(() => {
    const query = transcriptSearchQuery.trim().toLowerCase();
    if (!interimTranscript) return false;
    if (shouldHideTranscriptText(interimTranscript)) return false;
    if (
      isMusicMarker(interimTranscript) &&
      filteredTranscriptHistory.length > 0 &&
      isMusicMarker(filteredTranscriptHistory[filteredTranscriptHistory.length - 1].text)
    ) {
      return false;
    }
    if (!query) return true;
    return interimTranscript.toLowerCase().includes(query);
  }, [
    interimTranscript,
    transcriptSearchQuery,
    filteredTranscriptHistory,
    shouldHideTranscriptText,
    isMusicMarker,
  ]);

  // Auto-scroll
  useEffect(() => {
    if (autoScrollTranscript && !autoScrollPaused) {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcriptHistory, interimTranscript, autoScrollTranscript, autoScrollPaused]);

  // Menu close handlers
  useEffect(() => {
    if (!transcriptMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!transcriptMenuRef.current) return;
      if (!transcriptMenuRef.current.contains(event.target as Node)) {
        setTranscriptMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTranscriptMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [transcriptMenuOpen]);

  const handleTranscriptScroll = useCallback(() => {
    const el = transcriptScrollContainerRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const atBottom = distanceFromBottom < 60;

    if (!atBottom && autoScrollTranscript) {
      setAutoScrollPaused(true);
      return;
    }

    if (atBottom && autoScrollPaused) {
      setAutoScrollPaused(false);
    }
  }, [autoScrollTranscript, autoScrollPaused]);

  const setAutoScrollFromCheckbox = useCallback((enabled: boolean) => {
    setAutoScrollTranscript(enabled);
    setAutoScrollPaused(false);
    if (enabled) {
      requestAnimationFrame(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, []);

  // Smart resume: resume auto-scroll when clicking outside transcript
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!autoScrollTranscript || !autoScrollPaused) return;
      const el = transcriptScrollContainerRef.current;
      if (!el) return;
      const target = e.target as Node | null;
      if (target && el.contains(target)) return;
      setAutoScrollPaused(false);
      requestAnimationFrame(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [autoScrollTranscript, autoScrollPaused]);

  // Download
  const handleDownloadTranscript = useCallback(
    async (format: "text" | "json") => {
      const combined = [
        ...transcriptHistory.map((s) => s.text),
        ...(interimTranscript ? [interimTranscript] : []),
      ].filter(Boolean);
      const defaultBaseName = `transcript-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}`;

      if (format === "text") {
        const content = combined.join("\n\n");
        const result = await saveTranscriptFile({
          content,
          defaultBaseName,
          extension: "txt",
          mimeType: "text/plain;charset=utf-8",
          filterName: "Text",
        });
        if (result.status === "failed") {
          alert(`Could not save transcript: ${result.error}`);
        }
        return;
      }

      const directReferences = detectedReferences.filter((ref) => ref.source === "direct");
      const paraphraseReferences = detectedReferences.filter((ref) => ref.source === "paraphrase");
      const segments = transcriptHistory.map((segment) => {
        const segmentRefs = detectedReferences.filter(
          (ref) => ref.transcriptText === segment.text
        );
        const keyPoints = transcriptKeyPoints[segment.id];
        return {
          ...segment,
          references: segmentRefs.length ? segmentRefs : undefined,
          keyPoints: keyPoints?.length ? keyPoints : undefined,
        };
      });
      const payload = {
        generatedAt: new Date().toISOString(),
        segments,
        interim: interimTranscript || null,
        references: { direct: directReferences, paraphrase: paraphraseReferences },
      };
      const result = await saveTranscriptFile({
        content: JSON.stringify(payload, null, 2),
        defaultBaseName,
        extension: "json",
        mimeType: "application/json;charset=utf-8",
        filterName: "JSON",
      });
      if (result.status === "failed") {
        alert(`Could not save transcript: ${result.error}`);
      }
    },
    [transcriptHistory, interimTranscript, detectedReferences, transcriptKeyPoints]
  );

  // Report
  const sendReportForSegment = useCallback(
    async (segmentId: string) => {
      const payload = buildReportPayload(
        transcriptHistory,
        segmentId,
        detectedReferences,
        transcriptKeyPoints,
        interimTranscript
      );
      if (!payload) return;
      setLoadingReportSegmentId(segmentId);
      const result = await sendReportTranscript(payload);
      setLoadingReportSegmentId(null);
      if (result.ok) {
        setReportedSegmentIds((prev) => new Set(prev).add(segmentId));
      }
    },
    [transcriptHistory, detectedReferences, transcriptKeyPoints, interimTranscript]
  );

  const handleReportSegment = useCallback(
    (segmentId: string) => {
      if (reportedSegmentIds.has(segmentId) || loadingReportSegmentId != null) return;
      if (!reportIssueSeen) {
        setPendingReportConfirmSegmentId(segmentId);
        return;
      }
      void sendReportForSegment(segmentId);
    },
    [reportedSegmentIds, loadingReportSegmentId, reportIssueSeen, sendReportForSegment]
  );

  const handleReportConfirm = useCallback(() => {
    const segmentId = pendingReportConfirmSegmentId;
    setPendingReportConfirmSegmentId(null);
    try {
      localStorage.setItem(REPORT_ISSUE_SEEN_KEY, "1");
    } catch { /* ignore */ }
    setReportIssueSeen(true);
    if (segmentId) void sendReportForSegment(segmentId);
  }, [pendingReportConfirmSegmentId, sendReportForSegment]);

  const handleReportCancel = useCallback(() => {
    setPendingReportConfirmSegmentId(null);
  }, []);

  const toggleInlineExpanded = useCallback((id: string) => {
    setExpandedInlineRefIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return {
    // Display options
    transcriptDisplayOptions,
    setTranscriptDisplayOptions,
    transcriptMenuOpen,
    setTranscriptMenuOpen,
    transcriptSearchQuery,
    setTranscriptSearchQuery,
    transcriptMenuRef,
    handleToggleTranscriptOption,
    // Scroll
    transcriptScrollContainerRef,
    transcriptEndRef,
    autoScrollTranscript,
    autoScrollPaused,
    handleTranscriptScroll,
    setAutoScrollFromCheckbox,
    // Filtered data
    filteredTranscriptHistory,
    matchesInterimSearch,
    isMusicMarker,
    shouldHideTranscriptText,
    // Inline refs
    expandedInlineRefIds,
    toggleInlineExpanded,
    // Download
    handleDownloadTranscript,
    // Report
    reportedSegmentIds,
    loadingReportSegmentId,
    pendingReportConfirmSegmentId,
    handleReportSegment,
    handleReportConfirm,
    handleReportCancel,
  };
}
