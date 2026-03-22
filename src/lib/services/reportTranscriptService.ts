/**
 * Report Transcript Service
 *
 * Sends a transcript segment (and prior context) to the team when the user
 * reports that a scripture reference was not detected. Uses the same JSON
 * shape as the "Download as JSON" export for consistency.
 */

import type {
  TranscriptionSegment,
  DetectedBibleReference,
  KeyPoint,
} from "@/lib/types/smartVerses";

/** Base URL for the report API. Set at build time via VITE_REPORT_TRANSCRIPT_URL (e.g. GitHub Actions variable). Local dev: set in .env.local. */
const REPORT_TRANSCRIPT_BASE_URL = import.meta.env.VITE_REPORT_TRANSCRIPT_URL || "";

export interface ReportTranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
  references?: DetectedBibleReference[];
  keyPoints?: KeyPoint[];
}

export interface ReportTranscriptPayload {
  /** When this report was generated (ISO 8601). */
  generatedAt: string;
  /** The segment the user reported (missing scripture detection). */
  reportedSegmentId: string;
  /** Up to 3 segments: the reported segment plus the previous 2 for context. */
  segments: ReportTranscriptSegment[];
  /** Interim transcript at time of report, if any. */
  interim: string | null;
  /** All direct references in the included segments. */
  references: {
    direct: DetectedBibleReference[];
    paraphrase: DetectedBibleReference[];
  };
}

export type ReportTranscriptResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Builds the report payload for a given segment: that segment plus the
 * previous 2 segments (same format as download JSON).
 */
export function buildReportPayload(
  transcriptHistory: TranscriptionSegment[],
  reportedSegmentId: string,
  detectedReferences: DetectedBibleReference[],
  transcriptKeyPoints: Record<string, KeyPoint[]>,
  interimTranscript: string | null
): ReportTranscriptPayload | null {
  const index = transcriptHistory.findIndex((s) => s.id === reportedSegmentId);
  if (index < 0) return null;

  const start = Math.max(0, index - 2);
  const slice = transcriptHistory.slice(start, index + 1);

  const directReferences = detectedReferences.filter((r) => r.source === "direct");
  const paraphraseReferences = detectedReferences.filter(
    (r) => r.source === "paraphrase"
  );

  const segments: ReportTranscriptSegment[] = slice.map((segment) => {
    const segmentRefs = detectedReferences.filter(
      (ref) => ref.transcriptText === segment.text
    );
    const keyPoints = transcriptKeyPoints[segment.id];
    return {
      id: segment.id,
      text: segment.text,
      timestamp: segment.timestamp,
      isFinal: segment.isFinal,
      references:
        segmentRefs.length > 0 ? segmentRefs : undefined,
      keyPoints: keyPoints?.length ? keyPoints : undefined,
    };
  });

  const refsInSlice = new Set(slice.map((s) => s.text));
  const directInSlice = directReferences.filter((r) =>
    r.transcriptText != null ? refsInSlice.has(r.transcriptText) : false
  );
  const paraphraseInSlice = paraphraseReferences.filter((r) =>
    r.transcriptText != null ? refsInSlice.has(r.transcriptText) : false
  );

  return {
    generatedAt: new Date().toISOString(),
    reportedSegmentId,
    segments,
    interim: interimTranscript || null,
    references: {
      direct: directInSlice,
      paraphrase: paraphraseInSlice,
    },
  };
}

/**
 * Sends the report payload to the server. URL comes from VITE_REPORT_TRANSCRIPT_URL (build time or .env.local).
 */
export async function sendReportTranscript(
  payload: ReportTranscriptPayload
): Promise<ReportTranscriptResult> {
  const base = (REPORT_TRANSCRIPT_BASE_URL || "").replace(/\/$/, "");
  if (!base) {
    return { ok: false, error: "Report API URL not configured" };
  }
  const url = `${base}/report-transcript`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: text || `HTTP ${res.status}`,
      };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
