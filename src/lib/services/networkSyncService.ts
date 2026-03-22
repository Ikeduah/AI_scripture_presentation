import { invoke } from "@tauri-apps/api/core";
import type { Playlist, PlaylistItem } from "@/lib/types";
import type { ScheduleItem } from "@/lib/types/propresenter";
import type { NetworkSyncMode, NetworkSyncSettings, NetworkSyncConnectionState, NetworkSyncCallbacks, SyncMessage, SyncServerInfo, DEFAULT_NETWORK_SYNC_SETTINGS, DEFAULT_NETWORK_SYNC_CONNECTION_STATE, SyncPlaylistItemMessage, SyncPlaylistDeleteMessage, SyncScheduleMessage, SyncFullStateMessage, SyncJoinMessage, SyncWelcomeMessage } from "@/lib/types/networkSync";

// Storage key for settings
const NETWORK_SYNC_SETTINGS_KEY = "proassist-network-sync-settings";

// ============================================================================
// Settings Management
// ============================================================================

export function loadNetworkSyncSettings(): NetworkSyncSettings {
  try {
    const stored = localStorage.getItem(NETWORK_SYNC_SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_NETWORK_SYNC_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error("Failed to load network sync settings:", e);
  }
  return { ...DEFAULT_NETWORK_SYNC_SETTINGS };
}

export function saveNetworkSyncSettings(settings: NetworkSyncSettings): void {
  try {
    localStorage.setItem(NETWORK_SYNC_SETTINGS_KEY, JSON.stringify(settings));
    // Notify in-app listeners (storage event won't fire in same window)
    window.dispatchEvent(new CustomEvent("network-sync-settings-changed"));
  } catch (e) {
    console.error("Failed to save network sync settings:", e);
  }
}

// ============================================================================
// Tauri Commands
// ============================================================================

export async function startSyncServer(port: number, mode: string): Promise<SyncServerInfo> {
  return await invoke<SyncServerInfo>("start_sync_server", { port, mode });
}

export async function stopSyncServer(): Promise<void> {
  return await invoke("stop_sync_server");
}

export async function getSyncServerInfo(): Promise<SyncServerInfo> {
  return await invoke<SyncServerInfo>("get_sync_server_info");
}

export async function broadcastSyncMessage(message: SyncMessage): Promise<void> {
  const json = JSON.stringify(message);
  return await invoke("broadcast_sync_message", { message: json });
}

export async function updateSyncPlaylists(playlists: Playlist[]): Promise<void> {
  return await invoke("update_sync_playlists", { playlists });
}

export async function getLocalIp(): Promise<string> {
  return await invoke<string>("get_local_ip");
}

// ============================================================================
// WebSocket Client for Slave/Peer Mode
// ============================================================================

export class NetworkSyncWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private clientId: string;
  private clientMode: string;
  private callbacks: NetworkSyncCallbacks = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectionState: NetworkSyncConnectionState = { ...DEFAULT_NETWORK_SYNC_CONNECTION_STATE };

  constructor(host: string, port: number, clientMode: "slave" | "peer") {
    this.url = `ws://${host}:${port}/sync`;
    this.clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.clientMode = clientMode;
  }

  setCallbacks(callbacks: NetworkSyncCallbacks): void {
    this.callbacks = callbacks;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.url.startsWith("ws://") && !this.url.startsWith("wss://")) {
          const error = new Error(`Invalid WebSocket URL: ${this.url}`);
          console.error("[NetworkSync]", error);
          reject(error);
          return;
        }

        console.log("[NetworkSync] Connecting to:", this.url);
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("[NetworkSync] Connected to sync server");
          this.reconnectAttempts = 0;
          this.updateConnectionState({ clientConnected: true, error: null });

          // Send join message
          const joinMsg: SyncJoinMessage = {
            type: "sync_join",
            clientMode: this.clientMode,
            clientId: this.clientId,
          };
          this.send(joinMsg);
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as SyncMessage;
            this.handleMessage(message);
          } catch (e) {
            console.error("[NetworkSync] Failed to parse message:", e);
          }
        };

        this.ws.onerror = (error) => {
          console.error("[NetworkSync] WebSocket error:", error);
          this.updateConnectionState({ error: "Connection error" });
          reject(error);
        };

        this.ws.onclose = (event) => {
          console.log("[NetworkSync] Connection closed:", event.code, event.reason);
          this.updateConnectionState({ clientConnected: false });
          this.attemptReconnect();
        };
      } catch (e) {
        console.error("[NetworkSync] Failed to create WebSocket:", e);
        reject(e);
      }
    });
  }

  private handleMessage(message: SyncMessage): void {
    switch (message.type) {
      case "sync_welcome": {
        const welcome = message as SyncWelcomeMessage;
        console.log("[NetworkSync] Received welcome from server:", welcome.serverId);
        this.updateConnectionState({ 
          connectedClients: welcome.connectedClients,
          lastSyncTime: Date.now()
        });
        break;
      }

      case "sync_playlist_item": {
        const itemMsg = message as SyncPlaylistItemMessage;
        if (this.callbacks.onPlaylistItemSync) {
          this.callbacks.onPlaylistItemSync(itemMsg.playlistId, itemMsg.item, itemMsg.action);
        }
        this.updateConnectionState({ lastSyncTime: Date.now() });
        break;
      }

      case "sync_playlist_delete": {
        const deleteMsg = message as SyncPlaylistDeleteMessage;
        if (this.callbacks.onPlaylistItemDelete) {
          this.callbacks.onPlaylistItemDelete(deleteMsg.playlistId, deleteMsg.itemId);
        }
        this.updateConnectionState({ lastSyncTime: Date.now() });
        break;
      }

      case "sync_schedule": {
        const scheduleMsg = message as SyncScheduleMessage;
        if (this.callbacks.onScheduleSync) {
          this.callbacks.onScheduleSync(scheduleMsg.schedule, scheduleMsg.currentSessionIndex);
        }
        this.updateConnectionState({ lastSyncTime: Date.now() });
        break;
      }

      case "sync_full_state": {
        const fullState = message as SyncFullStateMessage;
        if (this.callbacks.onFullStateSync) {
          this.callbacks.onFullStateSync(
            fullState.playlists as Playlist[] | undefined,
            fullState.schedule,
            fullState.currentSessionIndex
          );
        }
        this.updateConnectionState({ lastSyncTime: Date.now() });
        break;
      }

      case "sync_error": {
        console.error("[NetworkSync] Server error:", message);
        this.updateConnectionState({ error: (message as { message: string }).message });
        if (this.callbacks.onError) {
          this.callbacks.onError((message as { message: string }).message);
        }
        break;
      }
    }
  }

  private updateConnectionState(updates: Partial<NetworkSyncConnectionState>): void {
    this.connectionState = { ...this.connectionState, ...updates };
    if (this.callbacks.onConnectionStateChange) {
      this.callbacks.onConnectionStateChange(this.connectionState);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log("[NetworkSync] Max reconnect attempts reached");
      this.updateConnectionState({ error: "Max reconnect attempts reached" });
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`[NetworkSync] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch((err) => {
        console.warn("[NetworkSync] Reconnection attempt failed:", err);
      });
    }, delay);
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.maxReconnectAttempts = 0; // Prevent reconnection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.updateConnectionState({ clientConnected: false });
  }

  send(message: SyncMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  // Send sync messages (for peer mode)
  sendPlaylistItemSync(playlistId: string, item: PlaylistItem, action: "create" | "update"): void {
    const msg: SyncPlaylistItemMessage = {
      type: "sync_playlist_item",
      playlistId,
      item,
      action,
      timestamp: Date.now(),
    };
    this.send(msg);
  }

  sendPlaylistItemDelete(playlistId: string, itemId: string): void {
    const msg: SyncPlaylistDeleteMessage = {
      type: "sync_playlist_delete",
      playlistId,
      itemId,
      timestamp: Date.now(),
    };
    this.send(msg);
  }

  sendScheduleSync(schedule: ScheduleItem[], currentSessionIndex: number | null): void {
    const msg: SyncScheduleMessage = {
      type: "sync_schedule",
      schedule,
      currentSessionIndex,
      timestamp: Date.now(),
    };
    this.send(msg);
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getConnectionState(): NetworkSyncConnectionState {
    return this.connectionState;
  }
}

// ============================================================================
// Network Sync Manager - Singleton for managing sync state
// ============================================================================

class NetworkSyncManager {
  private static instance: NetworkSyncManager | null = null;
  private settings: NetworkSyncSettings;
  private wsClient: NetworkSyncWebSocket | null = null;
  private serverRunning = false;
  private callbackRegistry = new Map<string, NetworkSyncCallbacks>();
  private aggregatedCallbacks: NetworkSyncCallbacks = {
    onPlaylistItemSync: (playlistId, item, action) => {
      this.callbackRegistry.forEach((callbacks) =>
        callbacks.onPlaylistItemSync?.(playlistId, item, action)
      );
    },
    onPlaylistItemDelete: (playlistId, itemId) => {
      this.callbackRegistry.forEach((callbacks) =>
        callbacks.onPlaylistItemDelete?.(playlistId, itemId)
      );
    },
    onScheduleSync: (schedule, currentSessionIndex) => {
      this.callbackRegistry.forEach((callbacks) =>
        callbacks.onScheduleSync?.(schedule, currentSessionIndex)
      );
    },
    onFullStateSync: (playlists, schedule, currentSessionIndex) => {
      this.callbackRegistry.forEach((callbacks) =>
        callbacks.onFullStateSync?.(playlists, schedule, currentSessionIndex)
      );
    },
    onConnectionStateChange: (state) => {
      this.callbackRegistry.forEach((callbacks) =>
        callbacks.onConnectionStateChange?.(state)
      );
    },
    onError: (error) => {
      this.callbackRegistry.forEach((callbacks) => callbacks.onError?.(error));
    },
  };

  private constructor() {
    this.settings = loadNetworkSyncSettings();
  }

  static getInstance(): NetworkSyncManager {
    if (!NetworkSyncManager.instance) {
      NetworkSyncManager.instance = new NetworkSyncManager();
    }
    return NetworkSyncManager.instance;
  }

  setCallbacks(callbacks: NetworkSyncCallbacks): void {
    this.callbackRegistry.set("default", callbacks);
    this.syncCallbacks();
  }

  registerCallbacks(id: string, callbacks: NetworkSyncCallbacks): () => void {
    this.callbackRegistry.set(id, callbacks);
    this.syncCallbacks();
    return () => this.unregisterCallbacks(id);
  }

  unregisterCallbacks(id: string): void {
    this.callbackRegistry.delete(id);
    this.syncCallbacks();
  }

  private syncCallbacks(): void {
    if (this.wsClient) {
      this.wsClient.setCallbacks(this.aggregatedCallbacks);
    }
  }

  async start(): Promise<void> {
    const settings = loadNetworkSyncSettings();
    this.settings = settings;

    if (settings.mode === "off") {
      return;
    }

    // Start server for master or peer mode
    if (settings.mode === "master" || settings.mode === "peer") {
      try {
        await startSyncServer(settings.serverPort, settings.mode);
        this.serverRunning = true;
        console.log(`[NetworkSync] Server started on port ${settings.serverPort}`);
      } catch (e) {
        console.error("[NetworkSync] Failed to start server:", e);
        throw e;
      }
    }

    // Connect to remote for slave or peer mode
    if (settings.mode === "slave" || settings.mode === "peer") {
      if (!settings.remoteHost) {
        throw new Error("Remote host is required for slave/peer mode");
      }

      this.wsClient = new NetworkSyncWebSocket(
        settings.remoteHost,
        settings.remotePort,
        settings.mode
      );
      this.wsClient.setCallbacks(this.aggregatedCallbacks);

      try {
        await this.wsClient.connect();
        console.log(`[NetworkSync] Connected to ${settings.remoteHost}:${settings.remotePort}`);
      } catch (e) {
        console.error("[NetworkSync] Failed to connect to remote:", e);
        // Don't throw for peer mode - server is still running
        if (settings.mode === "slave") {
          throw e;
        }
      }
    }
  }

  async stop(): Promise<void> {
    if (this.wsClient) {
      this.wsClient.disconnect();
      this.wsClient = null;
    }

    if (this.serverRunning) {
      try {
        await stopSyncServer();
        this.serverRunning = false;
      } catch (e) {
        console.error("[NetworkSync] Failed to stop server:", e);
      }
    }
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  // Broadcast methods (for master/peer mode)
  async broadcastPlaylistItemSync(
    playlistId: string,
    item: PlaylistItem,
    action: "create" | "update"
  ): Promise<void> {
    const settings = loadNetworkSyncSettings();
    if (!settings.syncPlaylists) return;
    if (settings.mode !== "master" && settings.mode !== "peer") return;

    // Skip live slides items
    if (item.liveSlidesSessionId) return;

    const msg: SyncPlaylistItemMessage = {
      type: "sync_playlist_item",
      playlistId,
      item,
      action,
      timestamp: Date.now(),
    };

    // Broadcast via server
    if (this.serverRunning) {
      await broadcastSyncMessage(msg);
    }

    // Also send via client connection (for peer mode)
    if (this.wsClient && this.wsClient.isConnected) {
      this.wsClient.send(msg);
    }
  }

  async broadcastPlaylistItemDelete(playlistId: string, itemId: string): Promise<void> {
    const settings = loadNetworkSyncSettings();
    if (!settings.syncPlaylists) return;
    if (settings.mode !== "master" && settings.mode !== "peer") return;

    const msg: SyncPlaylistDeleteMessage = {
      type: "sync_playlist_delete",
      playlistId,
      itemId,
      timestamp: Date.now(),
    };

    if (this.serverRunning) {
      await broadcastSyncMessage(msg);
    }

    if (this.wsClient && this.wsClient.isConnected) {
      this.wsClient.send(msg);
    }
  }

  async broadcastScheduleSync(
    schedule: ScheduleItem[],
    currentSessionIndex: number | null
  ): Promise<void> {
    const settings = loadNetworkSyncSettings();
    if (!settings.syncSchedule) return;
    if (settings.mode !== "master" && settings.mode !== "peer") return;

    const msg: SyncScheduleMessage = {
      type: "sync_schedule",
      schedule,
      currentSessionIndex,
      timestamp: Date.now(),
    };

    if (this.serverRunning) {
      await broadcastSyncMessage(msg);
    }

    if (this.wsClient && this.wsClient.isConnected) {
      this.wsClient.send(msg);
    }
  }

  async broadcastFullState(playlists: Playlist[], schedule: ScheduleItem[], currentSessionIndex: number | null): Promise<void> {
    const settings = loadNetworkSyncSettings();
    if (settings.mode !== "master" && settings.mode !== "peer") return;

    // Filter out live slides items from playlists
    const filteredPlaylists = playlists.map(playlist => ({
      ...playlist,
      items: playlist.items.filter(item => !item.liveSlidesSessionId)
    }));

    const msg: SyncFullStateMessage = {
      type: "sync_full_state",
      playlists: settings.syncPlaylists ? filteredPlaylists : undefined,
      schedule: settings.syncSchedule ? schedule : undefined,
      currentSessionIndex: settings.syncSchedule ? currentSessionIndex : undefined,
      timestamp: Date.now(),
    };

    if (this.serverRunning) {
      await broadcastSyncMessage(msg);
      // Also update cached state
      if (settings.syncPlaylists) {
        await updateSyncPlaylists(filteredPlaylists);
      }
    }
  }

  getSettings(): NetworkSyncSettings {
    return this.settings;
  }

  isServerRunning(): boolean {
    return this.serverRunning;
  }

  isClientConnected(): boolean {
    return this.wsClient?.isConnected ?? false;
  }

  getClientConnectionState(): NetworkSyncConnectionState {
    return this.wsClient?.getConnectionState() ?? { ...DEFAULT_NETWORK_SYNC_CONNECTION_STATE };
  }
}

// Export singleton instance
export const networkSyncManager = NetworkSyncManager.getInstance();

// Helper function to get comprehensive sync status
export interface SyncStatus {
  mode: NetworkSyncMode;
  serverRunning: boolean;
  serverConnectedClients: number;
  clientConnected: boolean;
  clientError: string | null;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const settings = loadNetworkSyncSettings();
  let serverInfo: SyncServerInfo = { 
    running: false, 
    connected_clients: 0,
    port: settings.serverPort,
    local_ip: ""
  };
  
  try {
    serverInfo = await getSyncServerInfo();
  } catch {
    // Server might not be running
  }

  return {
    mode: settings.mode,
    serverRunning: serverInfo.running,
    serverConnectedClients: serverInfo.connected_clients,
    clientConnected: networkSyncManager.isClientConnected(),
    clientError: networkSyncManager.getClientConnectionState().error,
  };
}
