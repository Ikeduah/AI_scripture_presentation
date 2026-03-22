/**
 * TranscriptionLimitPrompt
 * 
 * Snooze / stop banner shown when transcription time limit is reached.
 */

import React from "react";

interface TranscriptionLimitPromptProps {
  show: boolean;
  formattedElapsedTime: string;
  transcriptionLimitLabel: string;
  transcriptionTimeLimitMinutes: number;
  onSnooze: (minutes: number) => void;
  onStop: () => void;
}

const TranscriptionLimitPrompt: React.FC<TranscriptionLimitPromptProps> = ({
  show,
  formattedElapsedTime,
  transcriptionLimitLabel,
  transcriptionTimeLimitMinutes,
  onSnooze,
  onStop,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        top: "var(--spacing-3)",
        left: "50%",
        transform: show
          ? "translate(-50%, 0)"
          : "translate(-50%, -140%)",
        transition: "transform 0.25s ease, opacity 0.25s ease",
        opacity: show ? 1 : 0,
        pointerEvents: show ? "auto" : "none",
        zIndex: 50,
        width: "min(720px, calc(100% - 32px))",
      }}
      aria-hidden={!show}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--spacing-3)",
          padding: "12px 16px",
          borderRadius: "10px",
          border: "1px solid var(--app-border-color)",
          backgroundColor: "var(--app-header-bg)",
          boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ flex: 1, minWidth: "220px" }}>
          <div style={{ fontWeight: 600 }}>
            Continue transcribing?
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--app-text-color-secondary)" }}>
            You&apos;ve been transcribing for {formattedElapsedTime}. Auto-stop in 1 minute.
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={() => onSnooze(30)}
            className="secondary btn-sm"
          >
            Snooze 30 min
          </button>
          <button
            onClick={() => onSnooze(transcriptionTimeLimitMinutes)}
            className="secondary btn-sm"
          >
            Snooze {transcriptionLimitLabel}
          </button>
          <button
            onClick={onStop}
            style={{
              border: "none",
              borderRadius: "8px",
              padding: "6px 12px",
              fontWeight: 600,
              backgroundColor: "rgb(220, 38, 38)",
              color: "white",
              cursor: "pointer",
            }}
          >
            Stop
          </button>
        </div>
      </div>
    </div>
  );
};

export default TranscriptionLimitPrompt;
