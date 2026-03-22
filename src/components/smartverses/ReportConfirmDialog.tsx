/**
 * ReportConfirmDialog
 * 
 * First-time confirmation dialog for reporting missing scripture.
 */

import React from "react";

interface ReportConfirmDialogProps {
  show: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ReportConfirmDialog: React.FC<ReportConfirmDialogProps> = ({
  show,
  onConfirm,
  onCancel,
}) => {
  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.5)",
      }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-labelledby="report-confirm-title"
        style={{
          maxWidth: 360,
          padding: "var(--spacing-4)",
          borderRadius: 12,
          backgroundColor: "var(--app-header-bg)",
          border: "1px solid var(--app-border-color)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p id="report-confirm-title" style={{ margin: "0 0 var(--spacing-3)", fontWeight: 600, color: "var(--app-text-color)" }}>
          Report missing scripture
        </p>
        <p style={{ margin: "0 0 var(--spacing-4)", fontSize: "0.9rem", color: "var(--app-text-color-secondary)", lineHeight: 1.5 }}>
          This will send this segment (and the previous two for context) to our team so we can improve detection next time.
        </p>
        <div style={{ display: "flex", gap: "var(--spacing-2)", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid var(--app-border-color)",
              background: "transparent",
              color: "var(--app-text-color)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="primary"
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportConfirmDialog;
