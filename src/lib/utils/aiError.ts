/**
 * Extract a user-facing error message from an AI/API error.
 * Handles LangChain/OpenAI-style errors and Groq API JSON body.
 */
export function getAIMessageFromError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    const msg = error.message;
    // Try to parse API JSON body embedded in message (e.g. Groq: {"error":{"message":"..."}})
    try {
      const jsonMatch = msg.match(/\{[\s\S]*"error"[\s\S]*\}/);
      if (jsonMatch) {
        const obj = JSON.parse(jsonMatch[0]) as { error?: { message?: string } };
        if (obj?.error?.message) return obj.error.message;
      }
    } catch {
      // ignore parse errors
    }
    return msg;
  }
  const obj = error as {
    response?: { data?: { error?: { message?: string } } };
    error?: { message?: string };
  };
  if (obj?.response?.data?.error?.message) return obj.response.data.error.message;
  if (obj?.error?.message) return obj.error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
