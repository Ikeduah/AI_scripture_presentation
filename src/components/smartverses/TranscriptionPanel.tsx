import React from "react";
import { FaMicrophone, FaStop, FaExternalLinkAlt, FaSpinner, FaTrash, FaDownload, FaCog, FaCheck, FaThumbsDown, FaPlay, FaChevronUp, FaChevronDown, FaPlus, FaStopCircle } from "react-icons/fa";
import type {
  SmartVersesSettings,
  TranscriptionStatus,
  TranscriptionSegment,
  DetectedBibleReference,
  KeyPoint,
} from "@/lib/types/smartVerses";
import type { AppSettings } from "@/lib/types";
import TranscriptOptionsMenu from "@/components/transcription/TranscriptOptionsMenu";
import { renderHighlightedVerseText } from "@/lib/utils/smartVersesHelpers";
import type { TranscriptDisplayOptions } from "@/lib/utils/smartVersesHelpers";

interface TranscriptionPanelProps {
  settings: SmartVersesSettings;
  appSettings: AppSettings;
  transcriptionStatus: TranscriptionStatus;
  formattedElapsedTime: string;
  canStartTranscription: boolean;
  handleStartTranscription: () => void;
  handleStopTranscription: () => void;
  isStopping: boolean;
  transcriptMenuOpen: boolean;
  setTranscriptMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  transcriptMenuRef: React.RefObject<HTMLDivElement | null>;
  transcriptSearchQuery: string;
  setTranscriptSearchQuery: (v: string) => void;
  transcriptDisplayOptions: TranscriptDisplayOptions;
  handleToggleTranscriptOption: (opt: keyof TranscriptDisplayOptions) => void;
  handleClearTranscript: () => void;
  handleDownloadTranscript: (fmt: "text" | "json") => void;
  handleOpenSmartVersesSettings: () => void;
  transcriptionErrorMessage: string | null;
  audioLevel: number;
  autoScrollTranscript: boolean;
  setAutoScrollFromCheckbox: (v: boolean) => void;
  autoScrollPaused: boolean;
  handleAutoTriggerToggle: (v: boolean) => void;
  transcriptScrollContainerRef: React.RefObject<HTMLDivElement | null>;
  handleTranscriptScroll: () => void;
  transcriptHistory: TranscriptionSegment[];
  interimTranscript: string;
  filteredTranscriptHistory: TranscriptionSegment[];
  matchesInterimSearch: boolean;
  transcriptEndRef: React.RefObject<HTMLDivElement | null>;
  detectedReferences: DetectedBibleReference[];
  transcriptKeyPoints: Record<string, KeyPoint[]>;
  reportedSegmentIds: Set<string>;
  loadingReportSegmentId: string | null;
  handleReportSegment: (id: string) => void;
  liveReferenceId: string | null;
  handleGoLive: (ref: DetectedBibleReference, opts?: any) => void;
  handleOffLive: () => void;
  expandedInlineRefIds: Set<string>;
  toggleInlineExpanded: (id: string) => void;
  activeTranslationCueId: string | null;
  activeTranslationCueLabel: string;
  clearActiveTranslationCue: () => void;
  detectedPanelScrollRef: React.RefObject<HTMLDivElement | null>;
  handleDetectedScroll: () => void;
  detectedPanelCollapsed: boolean;
  setDetectedPanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  recentDetectedReferences: DetectedBibleReference[];
  expandedDetectedIds: Set<string>;
  toggleDetectedExpanded: (id: string) => void;
  addReferenceToChatHistory: (ref: DetectedBibleReference, msg: string) => void;
}

export const TranscriptionPanel: React.FC<TranscriptionPanelProps> = ({
  settings,
  appSettings,
  transcriptionStatus,
  formattedElapsedTime,
  canStartTranscription,
  handleStartTranscription,
  handleStopTranscription,
  isStopping,
  transcriptMenuOpen,
  setTranscriptMenuOpen,
  transcriptMenuRef,
  transcriptSearchQuery,
  setTranscriptSearchQuery,
  transcriptDisplayOptions,
  handleToggleTranscriptOption,
  handleClearTranscript,
  handleDownloadTranscript,
  handleOpenSmartVersesSettings,
  transcriptionErrorMessage,
  audioLevel,
  autoScrollTranscript,
  setAutoScrollFromCheckbox,
  autoScrollPaused,
  handleAutoTriggerToggle,
  transcriptScrollContainerRef,
  handleTranscriptScroll,
  transcriptHistory,
  interimTranscript,
  filteredTranscriptHistory,
  matchesInterimSearch,
  transcriptEndRef,
  detectedReferences,
  transcriptKeyPoints,
  reportedSegmentIds,
  loadingReportSegmentId,
  handleReportSegment,
  liveReferenceId,
  handleGoLive,
  handleOffLive,
  expandedInlineRefIds,
  toggleInlineExpanded,
  activeTranslationCueId,
  activeTranslationCueLabel,
  clearActiveTranslationCue,
  detectedPanelScrollRef,
  handleDetectedScroll,
  detectedPanelCollapsed,
  setDetectedPanelCollapsed,
  recentDetectedReferences,
  expandedDetectedIds,
  toggleDetectedExpanded,
  addReferenceToChatHistory,
}) => {
  // We need to inline renderDetectedReferenceRow here, or we can pass it as a render prop.
  // We will bring it down from page.tsx if possible, or leave it inside TranscriptionPanel.
  const renderDetectedReferenceRow = (ref: DetectedBibleReference) => {
    const isExpanded = expandedDetectedIds.has(ref.id);
    const isParaphrase = ref.source === "paraphrase";
    const borderColor = isParaphrase ? settings.paraphraseReferenceColor : settings.directReferenceColor;
    const isLive = liveReferenceId === ref.id;

    return (
      <div
        key={ref.id}
        style={{
          border: `1px solid ${isExpanded ? borderColor : "var(--app-border-color)"}`,
          borderRadius: "10px",
          backgroundColor: "var(--app-header-bg)",
          overflow: "hidden",
          marginBottom: "var(--spacing-2)",
        }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleDetectedExpanded(ref.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") toggleDetectedExpanded(ref.id);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--spacing-2)",
            padding: "10px 12px",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
            <span style={{ color: "var(--app-text-color-secondary)", flex: "0 0 auto" }}>
              {isExpanded ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
            </span>
            <span
              style={{
                fontWeight: 700,
                color: isLive ? "#22c55e" : borderColor,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={ref.displayRef}
            >
              {ref.displayRef}
            </span>
            {isParaphrase && ref.confidence != null && (
              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "2px 6px",
                  borderRadius: "999px",
                  backgroundColor: "rgba(59, 130, 246, 0.15)",
                  color: settings.paraphraseReferenceColor,
                  flex: "0 0 auto",
                }}
              >
                {Math.round(ref.confidence * 100)}%
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: "6px", flex: "0 0 auto", alignItems: "center" }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                addReferenceToChatHistory(ref, "Added from detected references");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "8px",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: "pointer",
                backgroundColor: "var(--app-input-bg-color)",
                color: "var(--app-text-color)",
                border: "1px solid var(--app-border-color)",
              }}
            >
              <FaPlus size={10} />
              Add to chat
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isLive) handleGoLive(ref);
              }}
              className={isLive ? "" : "primary"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: isLive ? "default" : "pointer",
                backgroundColor: isLive ? "#22c55e" : undefined,
                color: isLive ? "white" : undefined,
                border: isLive ? "none" : undefined,
              }}
            >
              <FaPlay size={10} />
              Go Live
            </button>
            {isLive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOffLive();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  backgroundColor: "#ef4444",
                  color: "white",
                  border: "none",
                }}
              >
                <FaStopCircle size={10} />
                Off
              </button>
            )}
          </div>
        </div>

        {isExpanded && (
          <div style={{ padding: "0 12px 12px 34px" }}>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: "8px",
                backgroundColor: "var(--app-bg-color)",
                border: "1px solid var(--app-border-color)",
              }}
            >
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>
                {renderHighlightedVerseText(ref.verseText, ref.highlight)}
              </p>
              {isParaphrase && ref.matchedPhrase && (
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: "0.8rem",
                    fontStyle: "italic",
                    color: "var(--app-text-color-secondary)",
                  }}
                >
                  Matched: "{ref.matchedPhrase}"
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      backgroundColor: "var(--app-bg-color)",
      borderRadius: "12px",
      border: "1px solid var(--app-border-color)",
      overflow: "hidden",
    }}>
      {/* Sticky top header: Live Transcription + translation/settings + search */}
      <div style={{
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 10,
        backgroundColor: "var(--app-bg-color)",
        paddingTop: "var(--spacing-2)",
        minHeight: 52,
        boxSizing: "border-box",
      }}>
        {/* Header */}
        <div style={{
          padding: "var(--spacing-3) var(--spacing-4)",
          borderBottom: "1px solid var(--app-border-color)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "var(--app-header-bg)",
          minHeight: 44,
          boxSizing: "border-box",
        }}>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
            <FaMicrophone />
            Live Transcription
            {transcriptionStatus === "recording" && (
              <span style={{
                width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "rgb(239, 68, 68)",
                  animation: "pulse 1s infinite",
                }} />
              )}
              {transcriptionStatus === "waiting_for_browser" && (
                <span style={{
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: "var(--warning)",
                  color: "white",
                  fontWeight: 600,
                }}>
                  Browser
                </span>
              )}
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid var(--app-border-color)",
                  backgroundColor: "var(--app-bg-color)",
                  fontSize: "0.8rem",
                  color:
                    transcriptionStatus === "recording"
                      ? "var(--success)"
                      : "var(--app-text-color-secondary)",
                  fontVariantNumeric: "tabular-nums",
                }}
                title="Transcription elapsed time"
              >
                {formattedElapsedTime}
              </div>
              {canStartTranscription ? (
                <button
                  onClick={handleStartTranscription}
                  className="primary"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <FaMicrophone />
                  {transcriptionStatus === "error" ? "Retry" : "Start"}
                  {settings.runTranscriptionInBrowser && (
                    <FaExternalLinkAlt style={{ fontSize: "0.75rem" }} />
                  )}
                </button>
              ) : transcriptionStatus === "connecting" ? (
                <button disabled className="secondary">
                  Connecting...
                </button>
              ) : transcriptionStatus === "waiting_for_browser" ? (
                <button
                  onClick={handleStopTranscription}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "var(--warning)",
                    color: "white",
                    border: "none",
                    padding: "var(--spacing-2) var(--spacing-3)",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                  title="Click to cancel and close the browser transcription"
                >
                  <FaExternalLinkAlt />
                  Waiting for browser...
                </button>
              ) : (
                <button
                  onClick={handleStopTranscription}
                  disabled={isStopping}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: isStopping ? "rgb(156, 163, 175)" : "rgb(220, 38, 38)",
                    color: "white",
                    border: "none",
                    padding: "var(--spacing-2) var(--spacing-3)",
                    borderRadius: "8px",
                    cursor: isStopping ? "not-allowed" : "pointer",
                    opacity: isStopping ? 0.7 : 1,
                  }}
                >
                  {isStopping ? (
                    <>
                      <FaSpinner style={{ animation: "spin 1s linear infinite" }} />
                      Stopping...
                    </>
                  ) : (
                    <>
                      <FaStop />
                      Stop
                    </>
                  )}
                </button>
              )}
              <TranscriptOptionsMenu
                isOpen={transcriptMenuOpen}
                onToggle={() => setTranscriptMenuOpen((v) => !v)}
                menuRef={transcriptMenuRef as any}
                searchQuery={transcriptSearchQuery}
                onSearchChange={setTranscriptSearchQuery}
                onClearSearch={() => setTranscriptSearchQuery("")}
                options={[
                  {
                    id: "show-transcript",
                    label: "Transcript",
                    checked: transcriptDisplayOptions.showTranscript,
                    onToggle: () => handleToggleTranscriptOption("showTranscript"),
                  },
                  {
                    id: "show-scripture",
                    label: "Scripture refs",
                    checked: transcriptDisplayOptions.showScriptureRefs,
                    onToggle: () => handleToggleTranscriptOption("showScriptureRefs"),
                  },
                  {
                    id: "show-key-points",
                    label: "Key points",
                    checked: transcriptDisplayOptions.showKeyPoints,
                    onToggle: () => handleToggleTranscriptOption("showKeyPoints"),
                  },
                ]}
                actions={[
                  {
                    id: "delete",
                    label: "Delete transcript",
                    icon: <FaTrash size={12} />,
                    onClick: () => {
                      handleClearTranscript();
                      setTranscriptMenuOpen(false);
                    },
                  },
                  {
                    id: "download-text",
                    label: "Download as text",
                    icon: <FaDownload size={12} />,
                    onClick: () => {
                      handleDownloadTranscript("text");
                      setTranscriptMenuOpen(false);
                    },
                  },
                  {
                    id: "download-json",
                    label: "Download as JSON",
                    icon: <FaDownload size={12} />,
                    onClick: () => {
                      handleDownloadTranscript("json");
                      setTranscriptMenuOpen(false);
                    },
                  },
                  { id: "divider", kind: "separator" },
                  {
                    id: "settings",
                    label: "SmartVerses settings",
                    icon: <FaCog size={12} />,
                    onClick: () => {
                      handleOpenSmartVersesSettings();
                      setTranscriptMenuOpen(false);
                    },
                  },
                ]}
                triggerClassName="icon-button"
                triggerStyle={{ padding: "6px" }}
                showSearch={false}
              />
            </div>
          </div>

          {transcriptionErrorMessage && (
            <div
              role="alert"
              style={{
                margin: "var(--spacing-2) var(--spacing-4) 0",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid rgba(239, 68, 68, 0.45)",
                backgroundColor: "rgba(239, 68, 68, 0.08)",
                color: "var(--error)",
                fontSize: "0.85rem",
              }}
            >
              {transcriptionErrorMessage}
            </div>
          )}

          <div style={{
            height: "8px",
            backgroundColor: "var(--app-bg-color)",
            borderBottom: "1px solid var(--app-border-color)",
            position: "relative",
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${Math.max(2, Math.round((transcriptionStatus === "recording" ? audioLevel : 0) * 100))}%`,
              backgroundColor:
                transcriptionStatus === "recording"
                  ? audioLevel > 0.85
                    ? "rgb(220, 38, 38)"
                    : audioLevel > 0.7
                      ? "rgb(234, 179, 8)"
                      : "rgb(34, 197, 94)"
                  : "rgba(148, 163, 184, 0.5)",
              transition: "width 80ms linear, background-color 150ms ease",
            }} />
          </div>

          <div style={{ padding: "var(--spacing-2) var(--spacing-4)", borderBottom: "1px solid var(--app-border-color)" }}>
            <input
              type="text"
              value={transcriptSearchQuery}
              onChange={(e) => setTranscriptSearchQuery(e.target.value)}
              placeholder="Search transcript..."
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid var(--app-border-color)",
                background: "var(--app-input-bg-color)",
                color: "var(--app-input-text-color)",
                fontSize: "0.85rem",
                marginBottom: "var(--spacing-2)",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-3)" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  color: "var(--app-text-color-secondary)",
                  userSelect: "none",
                  cursor: "pointer",
                }}
                title="When enabled, the transcript will stay scrolled to the latest line. Scrolling up pauses it."
              >
                <input
                  type="checkbox"
                  checked={autoScrollTranscript}
                  onChange={(e) => setAutoScrollFromCheckbox(e.target.checked)}
                />
                Auto-scroll
                {autoScrollTranscript && autoScrollPaused && (
                  <span style={{ color: "var(--warning)", fontWeight: 700, marginLeft: "4px" }}>(paused)</span>
                )}
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.85rem",
                  color: "var(--app-text-color-secondary)",
                  userSelect: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                title="When enabled, detected verses go live automatically."
              >
                <input
                  type="checkbox"
                  checked={settings.autoTriggerOnDetection}
                  onChange={(e) => handleAutoTriggerToggle(e.target.checked)}
                />
                Auto-trigger
              </label>
            </div>
          </div>
        </div>

        {/* Transcript Display - scrollable; only this area scrolls */}
        <div
          ref={transcriptScrollContainerRef}
          onScroll={handleTranscriptScroll}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "var(--spacing-4)",
          }}
        >
          {transcriptHistory.length === 0 && !interimTranscript ? (
            <div style={{
              textAlign: "center",
              color: "var(--app-text-color-secondary)",
              padding: "var(--spacing-8)",
            }}>
              {transcriptionStatus === "waiting_for_browser" ? (
                <>
                  <FaExternalLinkAlt size={32} style={{ marginBottom: "var(--spacing-3)", opacity: 0.7, color: "var(--warning)" }} />
                  <p style={{ color: "var(--warning)", fontWeight: 600 }}>Waiting for browser transcription...</p>
                  <p style={{ fontSize: "0.85rem" }}>
                    A browser window has been opened. Select your microphone and click "Start Transcription" there.
                    <br />
                    Transcriptions will appear here automatically.
                  </p>
                </>
              ) : (
                <>
                  <FaMicrophone size={32} style={{ marginBottom: "var(--spacing-3)", opacity: 0.5 }} />
                  <p>Live transcription</p>
                  <p style={{ fontSize: "0.85rem" }}>
                    Click Start to begin transcribing. Bible references will be detected automatically.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div>
              {/* Final transcripts */}
              {filteredTranscriptHistory.length === 0 && transcriptSearchQuery.trim() ? (
                <div style={{ color: "var(--app-text-color-secondary)", fontStyle: "italic", marginBottom: "var(--spacing-3)" }}>
                  No transcript matches "{transcriptSearchQuery}"
                </div>
              ) : null}
              {filteredTranscriptHistory.map((segment, index) => {
                // Check if this segment contains any detected references
                const segmentRefs = detectedReferences.filter(
                  ref => ref.transcriptText === segment.text
                );
                const segmentKeyPoints = transcriptKeyPoints[segment.id] || [];
                const showTranscriptText = transcriptDisplayOptions.showTranscript;
                const showRefs = transcriptDisplayOptions.showScriptureRefs;
                const showKeyPoints = transcriptDisplayOptions.showKeyPoints;
                const hasRefsToShow = showRefs && segmentRefs.length > 0;
                const hasKeyPointsToShow = showKeyPoints && segmentKeyPoints.length > 0;
                const shouldRenderSegment =
                  (showTranscriptText && segment.text) ||
                  hasRefsToShow ||
                  hasKeyPointsToShow;

                if (!shouldRenderSegment) {
                  return null;
                }

                const isReported = reportedSegmentIds.has(segment.id);
                const isReportLoading = loadingReportSegmentId === segment.id;

                return (
                  <div
                    key={`${segment.id}-${segment.timestamp}-${index}`}
                    style={{
                      marginBottom: "var(--spacing-3)",
                      padding: "var(--spacing-3)",
                      borderRadius: "10px",
                      backgroundColor: "var(--app-header-bg)",
                      border: "1px solid var(--app-border-color)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--spacing-2)", minWidth: 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {showTranscriptText && (
                          <p
                            style={{
                              margin: 0,
                              lineHeight: 1.6,
                              color: "var(--app-text-color)",
                            }}
                          >
                            {segment.text}
                          </p>
                        )}
                        {hasRefsToShow && (
                          <div style={{ marginTop: "var(--spacing-2)" }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                              {segmentRefs.map((ref) => {
                                const isParaphrase = ref.source === "paraphrase";
                                const borderColor = isParaphrase
                                  ? settings.paraphraseReferenceColor
                                  : settings.directReferenceColor;
                                const isLive = liveReferenceId === ref.id;
                                const isExpanded = expandedInlineRefIds.has(ref.id);

                                return (
                                  <button
                                    key={ref.id}
                                    onClick={() => !isLive && handleGoLive(ref)}
                                    title={ref.verseText}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      padding: "6px 10px",
                                      borderRadius: "999px",
                                      border: `1px solid ${isLive ? "#22c55e" : borderColor}`,
                                      backgroundColor: "transparent",
                                      color: isLive ? "#22c55e" : borderColor,
                                      cursor: isLive ? "default" : "pointer",
                                      fontWeight: 700,
                                      fontSize: "0.8rem",
                                    }}
                                  >
                                    <FaPlay size={10} />
                                    <span>{ref.displayRef}</span>
                                    {isParaphrase && ref.confidence != null && (
                                      <span
                                        style={{
                                          fontSize: "0.75rem",
                                          padding: "2px 6px",
                                          borderRadius: "999px",
                                          backgroundColor: "rgba(59, 130, 246, 0.15)",
                                          color: settings.paraphraseReferenceColor,
                                        }}
                                      >
                                        {Math.round(ref.confidence * 100)}%
                                      </span>
                                    )}
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleInlineExpanded(ref.id);
                                      }}
                                      title={isExpanded ? "Collapse verse text" : "Expand verse text"}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: "18px",
                                        height: "18px",
                                        borderRadius: "999px",
                                        border: `1px solid ${borderColor}`,
                                        cursor: "pointer",
                                      }}
                                    >
                                      {isExpanded ? <FaChevronUp size={10} /> : <FaChevronDown size={10} />}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Expanded verse text blocks */}
                            {segmentRefs.some((r) => expandedInlineRefIds.has(r.id)) && (
                              <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                                {segmentRefs
                                  .filter((r) => expandedInlineRefIds.has(r.id))
                                  .map((ref) => {
                                    const isParaphrase = ref.source === "paraphrase";
                                    const borderColor = isParaphrase
                                      ? settings.paraphraseReferenceColor
                                      : settings.directReferenceColor;
                                    return (
                                      <div
                                        key={`expanded-${ref.id}`}
                                        style={{
                                          padding: "10px 12px",
                                          borderRadius: "10px",
                                          border: `1px solid ${borderColor}`,
                                          backgroundColor: "var(--app-header-bg)",
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            gap: "10px",
                                            marginBottom: "6px",
                                          }}
                                        >
                                          <div style={{ fontWeight: 800, color: borderColor }}>
                                            {ref.displayRef}
                                          </div>
                                          <button
                                            onClick={() => handleGoLive(ref)}
                                            className="primary"
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              gap: "6px",
                                              padding: "6px 10px",
                                              borderRadius: "8px",
                                              fontSize: "0.8rem",
                                              fontWeight: 800,
                                            }}
                                          >
                                            <FaPlay size={10} />
                                            Go Live
                                          </button>
                                        </div>

                                        <p style={{ margin: 0, lineHeight: 1.5 }}>
                                          {renderHighlightedVerseText(ref.verseText, ref.highlight)}
                                        </p>

                                        {isParaphrase && ref.matchedPhrase && (
                                          <p
                                            style={{
                                              margin: "8px 0 0",
                                              fontSize: "0.8rem",
                                              fontStyle: "italic",
                                              color: "var(--app-text-color-secondary)",
                                            }}
                                          >
                                            Matched: "{ref.matchedPhrase}"
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        )}
                        {hasKeyPointsToShow && (
                          <div
                            style={{
                              marginTop:
                                showTranscriptText || hasRefsToShow ? "var(--spacing-2)" : 0,
                            }}
                          >
                            <div
                              style={{
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                color: "var(--app-text-color-secondary)",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "6px",
                              }}
                            >
                              Key points
                            </div>
                            <div style={{ display: "grid", gap: "6px" }}>
                              {segmentKeyPoints.map((point, index) => (
                                <div
                                  key={`${segment.id}-key-point-${index}`}
                                  style={{
                                    border: "1px solid #f59e0b",
                                    borderLeft: "4px solid #f59e0b",
                                    borderRadius: "8px",
                                    padding: "8px 10px",
                                    backgroundColor: "rgba(245, 158, 11, 0.12)",
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: "10px",
                                  }}
                                >
                                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                                    {point.category && (
                                      <span
                                        style={{
                                          fontSize: "0.7rem",
                                          fontWeight: 700,
                                          letterSpacing: "0.04em",
                                          color: "#f59e0b",
                                          textTransform: "uppercase",
                                        }}
                                      >
                                        {point.category}
                                      </span>
                                    )}
                                    <span
                                      style={{
                                        fontSize: "0.85rem",
                                        lineHeight: "1.4",
                                        color: "var(--app-text-color)",
                                        wordBreak: "break-word",
                                      }}
                                    >
                                      {point.text}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleReportSegment(segment.id)}
                        disabled={isReported || loadingReportSegmentId != null}
                        className="icon-button"
                        title={isReported ? "Reported" : "Report missing scripture detection"}
                        style={{
                          padding: "6px",
                          flexShrink: 0,
                          color: isReported ? "#22c55e" : "var(--app-text-color-secondary)",
                          cursor: isReported || loadingReportSegmentId != null ? "default" : "pointer",
                        }}
                      >
                        {isReportLoading ? (
                          <FaSpinner size={12} style={{ animation: "spin 0.8s linear infinite" }} />
                        ) : isReported ? (
                          <FaCheck size={12} />
                        ) : (
                          <FaThumbsDown size={12} />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Interim transcript */}
              {transcriptDisplayOptions.showTranscript && matchesInterimSearch && (
                <div
                  style={{
                    marginBottom: "var(--spacing-3)",
                    padding: "var(--spacing-3)",
                    borderRadius: "10px",
                    backgroundColor: "var(--app-header-bg)",
                    border: "1px dashed var(--app-border-color)",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      lineHeight: 1.6,
                      color: "var(--app-text-color-secondary)",
                      fontStyle: "italic",
                    }}
                  >
                    {interimTranscript}
                  </p>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>

        {/* Detected References Panel (compact + expandable rows) */}
        {(detectedReferences.length > 0 || activeTranslationCueId) && (
          <div
            style={{
              borderTop: "1px solid var(--app-border-color)",
            }}
          >
            {activeTranslationCueId && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--spacing-2)",
                  padding: "var(--spacing-2) var(--spacing-4)",
                  backgroundColor: "rgba(59, 130, 246, 0.12)",
                  borderBottom: "1px solid var(--app-border-color)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  color: "var(--app-text-color)",
                }}
              >
                <span>
                  {activeTranslationCueLabel
                    ? `${activeTranslationCueLabel} activated`
                    : "Translation activated"}
                </span>
                <button
                  type="button"
                  onClick={clearActiveTranslationCue}
                  title="Clear active translation"
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    fontSize: "1rem",
                    lineHeight: 1,
                    padding: "2px 6px",
                  }}
                >
                  ×
                </button>
              </div>
            )}
            <div
              ref={detectedPanelScrollRef}
              onScroll={handleDetectedScroll}
              style={{
                maxHeight: detectedPanelCollapsed ? "52px" : "320px",
                overflowY: detectedPanelCollapsed ? "hidden" : "auto",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => setDetectedPanelCollapsed((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setDetectedPanelCollapsed((v) => !v);
                }}
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 5,
                  flexShrink: 0,
                  padding: "var(--spacing-2) var(--spacing-4)",
                  backgroundColor: "var(--app-header-bg)",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
                  {detectedPanelCollapsed ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
                  <span>Detected References ({detectedReferences.length})</span>
                </div>
                <span style={{ color: "var(--app-text-color-secondary)", fontWeight: 500 }}>
                  {detectedPanelCollapsed ? "Expand" : "Collapse"}
                </span>
              </div>

              {!detectedPanelCollapsed && (
                <div style={{ padding: "var(--spacing-3) var(--spacing-4)" }}>
                  {recentDetectedReferences.map((ref) => renderDetectedReferenceRow(ref))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

  );
};
