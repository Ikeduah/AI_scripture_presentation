export interface NormalizedRemoteTarget {
  host: string;
  port: number;
}

export function normalizeRemoteTranscriptionTarget(
  hostInput: string,
  portInput?: number
): NormalizedRemoteTarget {
  let host = (hostInput || "").trim();
  let port = Number.isFinite(portInput) ? (portInput as number) : 9876;

  if (!host) {
    return { host, port };
  }

  // Strip protocol and paths if a full URL was pasted (http, https, ws, wss).
  host = host.replace(/^(https?|wss?):\/\//i, "");
  const slashIndex = host.indexOf("/");
  if (slashIndex !== -1) {
    host = host.slice(0, slashIndex);
  }

  // Handle user@host patterns.
  const atIndex = host.lastIndexOf("@");
  if (atIndex !== -1) {
    host = host.slice(atIndex + 1);
  }

  // If the host includes a port (e.g., 192.168.1.10:9876), honor it.
  const portMatch = host.match(/:(\d+)$/);
  if (portMatch) {
    const parsed = parseInt(portMatch[1], 10);
    if (!Number.isNaN(parsed)) {
      port = parsed;
    }
    host = host.slice(0, -portMatch[0].length);
  }

  return { host, port };
}
