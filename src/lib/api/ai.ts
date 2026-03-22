import type { AppSettings } from "@/lib/types";
import type { DetectedBibleReference } from "@/lib/types/smartVerses";
import type { TranscriptAnalysisResult } from "@/lib/types/smartVerses";

export async function searchBibleWithAIWrapper(
    query: string,
    appSettings: AppSettings,
    overrideProvider?: 'openrouter' | 'groq',
    overrideModel?: string,
    translationId?: string
): Promise<DetectedBibleReference[]> {
    const provider = overrideProvider || (appSettings as any).smartVersesProvider || 'groq';
    let model = overrideModel;

    if (!model) {
        if (provider === 'openrouter') model = (appSettings as any).openRouterConfig?.model || "anthropic/claude-3.5-haiku";
        if (provider === 'groq') model = (appSettings as any).groqConfig?.model || "llama-3.3-70b-versatile";
    }

    const response = await fetch('/api/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, provider, model })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to search Bible with AI");
    }

    const data = await response.json();
    return data.results as DetectedBibleReference[];
}

export async function analyzeTranscriptChunkWrapper(
    transcriptChunk: string,
    appSettings: AppSettings,
    detectParaphrases: boolean = true,
    extractKeyPoints: boolean = false,
    options?: {
        overrideProvider?: 'openrouter' | 'groq';
        overrideModel?: string;
        previousChunks?: string[];
        paraphraseStrictMode?: boolean;
    }
): Promise<TranscriptAnalysisResult> {
    const provider = options?.overrideProvider || (appSettings as any).paraphraseProvider || (appSettings as any).globalAIProvider || 'groq';
    const model = options?.overrideModel || (appSettings as any).paraphraseModel;

    const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            transcriptChunk,
            provider,
            model,
            detectParaphrases,
            extractKeyPoints,
            previousChunks: options?.previousChunks || [],
            paraphraseStrictMode: options?.paraphraseStrictMode || false
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to analyze transcript");
    }

    return response.json();
}
