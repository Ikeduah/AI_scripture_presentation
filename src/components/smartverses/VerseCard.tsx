/**
 * VerseCard
 *
 * Renders a single Bible verse reference card with
 * translation picker, star toggle, Go Live/Off Live buttons,
 * and highlighted verse text.
 */

import React, { useRef } from "react";
import { FaStar, FaRegStar, FaPlay, FaStopCircle } from "react-icons/fa";
import type { DetectedBibleReference } from "@/lib/types/smartVerses";
import type { BibleTranslationSummary } from "@/lib/types/bible";
import { renderHighlightedVerseText } from "@/lib/utils/smartVersesHelpers";

interface VerseCardProps {
  ref_: DetectedBibleReference;
  showGoLive?: boolean;
  isLive: boolean;
  isStarred: boolean;
  borderColor: string;
  translationLabel: string;
  canSwitchTranslation: boolean;
  translationsById: Map<string, BibleTranslationSummary>;
  translationId: string;
  // Translation picker state
  verseCardPickerRefId: string | null;
  verseCardPickerQuery: string;
  filteredVerseCardTranslationOptions: BibleTranslationSummary[];
  // Callbacks
  onToggleStar: (ref: DetectedBibleReference) => void;
  onGoLive: (ref: DetectedBibleReference, options?: { fromChatHistory?: boolean }) => void;
  onOffLive: () => void;
  onTranslationChange: (ref: DetectedBibleReference, translationId: string) => void;
  onPickerOpen: (refId: string | null) => void;
  onPickerQueryChange: (query: string) => void;
}

const VerseCard: React.FC<VerseCardProps> = ({
  ref_,
  showGoLive = true,
  isLive,
  isStarred,
  borderColor,
  translationLabel,
  canSwitchTranslation,
  translationsById,
  translationId,
  verseCardPickerRefId,
  verseCardPickerQuery,
  filteredVerseCardTranslationOptions,
  onToggleStar,
  onGoLive,
  onOffLive,
  onTranslationChange,
  onPickerOpen,
  onPickerQueryChange,
}) => {
  const isParaphrase = ref_.source === "paraphrase";
  const pickerContainerRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      key={ref_.id}
      style={{
        padding: "var(--spacing-3)",
        borderRadius: "8px",
        backgroundColor: "var(--app-header-bg)",
        border: `2px solid ${isLive ? "#22c55e" : borderColor}`,
        marginBottom: "var(--spacing-2)",
      }}
    >
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: "var(--spacing-2)",
      }}>
        <div style={{
          fontWeight: 600,
          color: isLive ? "#22c55e" : borderColor,
          display: "flex",
          alignItems: "center",
          gap: "var(--spacing-2)",
        }}>
          {ref_.displayRef}
          {translationLabel && canSwitchTranslation && (
            <div
              ref={ref_.id === verseCardPickerRefId ? pickerContainerRef : undefined}
              style={{ position: "relative", display: "inline-flex" }}
            >
              <button
                type="button"
                onClick={() => {
                  if (verseCardPickerRefId === ref_.id) {
                    onPickerOpen(null);
                  } else {
                    onPickerQueryChange("");
                    onPickerOpen(ref_.id);
                  }
                }}
                title={translationsById.get(translationId)?.fullName ?? translationId}
                style={{
                  fontSize: "0.7rem",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  backgroundColor: "rgba(59, 130, 246, 0.2)",
                  color: "var(--app-input-text-color)",
                  fontWeight: 600,
                  border: "1px solid var(--app-border-color)",
                  cursor: "pointer",
                }}
              >
                {translationLabel}
              </button>
              {verseCardPickerRefId === ref_.id && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    minWidth: "320px",
                    width: "320px",
                    backgroundColor: "var(--app-bg-color)",
                    border: "1px solid var(--app-border-color)",
                    borderRadius: "8px",
                    boxShadow: "0 10px 24px rgba(0, 0, 0, 0.15)",
                    zIndex: 50,
                    maxHeight: "320px",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: "var(--spacing-2)", borderBottom: "1px solid var(--app-border-color)", flexShrink: 0 }}>
                    <input
                      type="text"
                      value={verseCardPickerQuery}
                      onChange={(e) => onPickerQueryChange(e.target.value)}
                      placeholder="Search translations..."
                      autoFocus
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: "0.9rem",
                        border: "1px solid var(--app-border-color)",
                        borderRadius: "6px",
                        backgroundColor: "var(--app-input-bg-color)",
                        color: "var(--app-input-text-color)",
                        outline: "none",
                      }}
                    />
                  </div>
                  <div style={{ overflowY: "auto", flex: 1, maxHeight: "260px" }}>
                    {filteredVerseCardTranslationOptions.length === 0 ? (
                      <div
                        style={{
                          padding: "var(--spacing-3)",
                          fontSize: "0.85rem",
                          color: "var(--app-text-color-secondary)",
                        }}
                      >
                        No translations match &quot;{verseCardPickerQuery}&quot;
                      </div>
                    ) : (
                      filteredVerseCardTranslationOptions.map((translation) => (
                        <button
                          key={translation.id}
                          type="button"
                          onClick={() => {
                            onTranslationChange(ref_, translation.id);
                            onPickerOpen(null);
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "8px 12px",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                            color: "var(--app-text-color)",
                            fontSize: "0.8rem",
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{translation.shortName}</span>
                          <span style={{ fontSize: "0.75rem", color: "var(--app-text-color-secondary)" }}>
                            {translation.fullName}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {!canSwitchTranslation && translationLabel && (
            <span
              style={{
                fontSize: "0.7rem",
                padding: "2px 6px",
                borderRadius: "4px",
                backgroundColor: "rgba(59, 130, 246, 0.2)",
                color: "var(--app-input-text-color)",
                fontWeight: 600,
              }}
            >
              {translationLabel}
            </span>
          )}
          {isParaphrase && ref_.confidence && (
            <span style={{
              fontSize: "0.75rem",
              padding: "2px 6px",
              borderRadius: "4px",
              backgroundColor: "rgba(59, 130, 246, 0.2)",
              color: borderColor,
            }}>
              {Math.round(ref_.confidence * 100)}%
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "var(--spacing-2)", alignItems: "center" }}>
          <button
            onClick={() => onToggleStar(ref_)}
            className="icon-button"
            title={isStarred ? "Unstar" : "Star"}
            style={{
              padding: "6px",
              color: isStarred ? "#f59e0b" : "var(--app-text-color-secondary)",
            }}
          >
            {isStarred ? <FaStar size={12} /> : <FaRegStar size={12} />}
          </button>
          {showGoLive && (
            <div style={{ display: "flex", gap: "var(--spacing-2)", alignItems: "center" }}>
              <button
                onClick={() => !isLive && onGoLive(ref_, { fromChatHistory: true })}
                className={isLive ? "" : "primary"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "6px 12px",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: isLive ? "default" : "pointer",
                  backgroundColor: isLive ? "#22c55e" : undefined,
                  color: isLive ? "white" : undefined,
                  border: isLive ? "none" : undefined,
                }}
              >
                {isLive ? (
                  <>
                    <span style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: "white",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }} />
                    Live
                  </>
                ) : (
                  <>
                    <FaPlay size={10} />
                    Go Live
                  </>
                )}
              </button>
              {isLive && (
                <button
                  onClick={onOffLive}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    backgroundColor: "#ef4444",
                    color: "white",
                    border: "none",
                  }}
                >
                  <FaStopCircle size={10} />
                  Off Live
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <p style={{
        margin: 0,
        fontSize: "0.9rem",
        lineHeight: 1.5,
        color: "var(--app-text-color)",
      }}>
        {renderHighlightedVerseText(ref_.verseText, ref_.highlight)}
      </p>
      {isParaphrase && ref_.matchedPhrase && (
        <p style={{
          margin: "var(--spacing-2) 0 0",
          fontSize: "0.8rem",
          fontStyle: "italic",
          color: "var(--app-text-color-secondary)",
        }}>
          Matched: &quot;{ref_.matchedPhrase}&quot;
        </p>
      )}
    </div>
  );
};

export default VerseCard;
