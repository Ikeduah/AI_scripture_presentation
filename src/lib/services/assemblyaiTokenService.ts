/**
 * AssemblyAI token helper (Universal Streaming v3)
 *
 * In Electron, token generation is done on the backend (IPC).
 * In Tauri, we do the same via a Rust `invoke` command to avoid WebView CORS issues.
 *
 * We keep a fetch() fallback for non-Tauri contexts (e.g., web preview),
 * but production Tauri should use the invoke path.
 *
 * IMPORTANT: v3 API has a maximum expires_in_seconds of 600 (10 minutes).
 * The endpoint changed from POST /v2/realtime/token to GET /v3/token.
 */

// v3 API limits expires_in_seconds to max 600 seconds (10 minutes)
const MAX_EXPIRES_IN_SECONDS = 600;

export { getAssemblyAITokenWrapper as getAssemblyAITemporaryToken } from "../api/transcription";

