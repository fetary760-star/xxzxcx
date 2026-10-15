import * as signalR from '@microsoft/signalr';
import { secureAuthStore } from '@/lib/secure-auth-store'

export interface NotificationData {
  message: string;
  timestamp: Date;
  type?: string;
  priority?: string;
  taskId?: string;
  actionUrl?: string;
}

export interface TaskEventData {
  taskId?: string;
  serialNumber?: string;
  status?: string;
  assignedTo?: string;
  completedBy?: string;
  priority?: string;
}

/**
 * Callback store — keeps references to registered callbacks so they can be
 * re-attached whenever the underlying HubConnection is rebuilt.
 */
interface CallbackStore {
  ReceiveNotification: Array<(data: NotificationData) => void>;
  TaskAssigned: Array<(data: TaskEventData) => void>;
  TaskCompleted: Array<(data: TaskEventData) => void>;
  TaskStatusChanged: Array<(data: TaskEventData) => void>;
  [key: string]: Array<(data: any) => void>;
}

class SignalRService {
  private connection: signalR.HubConnection | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private isManualDisconnect = false;
  private connectionError: string | null = null;

  /**
   * Persistent callback store — survives connection re-initialization.
   */
  private callbacks: CallbackStore = {
    ReceiveNotification: [],
    TaskAssigned: [],
    TaskCompleted: [],
    TaskStatusChanged: [],
  };

  /** Track dynamically registered event names so they survive removeAllListeners() */
  private dynamicEventNames: Set<string> = new Set();

  constructor() {
    // Do not auto-initialize; connect() will initialize lazily
  }

  /**
   * Build the hub URL. Prioritizes the dedicated NEXT_PUBLIC_SIGNALR_HUB_URL
   * env var, then falls back to deriving from NEXT_PUBLIC_API_BASE_URL.
   *
   * FIX: Previously only used NEXT_PUBLIC_API_BASE_URL and stripped /api,
   * ignoring the dedicated SIGNALR_HUB_URL env var that was already configured.
   */
  private buildHubUrls() {
    // Priority 1: Dedicated SignalR hub URL env var
    const dedicatedHubUrl = process.env.NEXT_PUBLIC_SIGNALR_HUB_URL;
    if (dedicatedHubUrl) {
      const hubUrl = dedicatedHubUrl.replace(/\/+$/, ''); // trim trailing slashes
      const negotiateUrl = `${hubUrl}/negotiate`;
      return { hubUrl, negotiateUrl };
    }

    // Priority 2: Derive from API base URL
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
    const baseUrl = apiBaseUrl.replace(/\/api\/?$/, '');
    const hubUrl = `${baseUrl}/notificationHub`;
    const negotiateUrl = `${hubUrl}/negotiate`;
    return { baseUrl, hubUrl, negotiateUrl };
  }

  /**
   * Helper: Get the current auth token from secure in-memory store.
   */
  private getAuthToken(): string {
    return secureAuthStore.getToken() || '';
  }

  private initializeConnection() {
    if (this.connection && this.connection.state !== signalR.HubConnectionState.Disconnected) {
      return;
    }

    const { hubUrl } = this.buildHubUrls();

    if (process.env.NODE_ENV === 'development') {
      try { console.debug(`SignalR: initializing connection to ${hubUrl}`); } catch {}
    }

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => this.getAuthToken(),
        withCredentials: true,
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.ServerSentEvents | signalR.HttpTransportType.LongPolling
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          if (retryContext.previousRetryCount < 3) return 2000;
          if (retryContext.previousRetryCount < 6) return 5000;
          if (retryContext.previousRetryCount < 10) return 10000;
          return null; // Stop retrying after 10 attempts
        }
      })
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.setupEventHandlers();
    this.reattachCallbacks();
  }

  /**
   * Re-attach all stored callbacks to the current connection object.
   */
  private reattachCallbacks() {
    if (!this.connection) return;

    for (const [eventName, handlers] of Object.entries(this.callbacks)) {
      for (const handler of handlers) {
        this.connection.on(eventName, handler);
      }
    }

    if (process.env.NODE_ENV === 'development') {
      const totalHandlers = Object.values(this.callbacks).reduce((sum, arr) => sum + arr.length, 0);
      try {
        console.debug(`SignalR: re-attached ${totalHandlers} callback(s) to new connection`);
      } catch {}
    }
  }

  private setupEventHandlers() {
    if (!this.connection) return;

    this.connection.onclose((error) => {
      if (process.env.NODE_ENV === 'development') {
        try { console.debug('SignalR: connection closed', error); } catch {}
      }

      if (error) {
        this.connectionError = error.message || 'Connection closed unexpectedly';
      }

      // withAutomaticReconnect handles reconnection automatically.
      // onclose fires AFTER withAutomaticReconnect has exhausted its retries,
      // or if the disconnect was manual.
      if (!this.isManualDisconnect) {
        this.reconnectAttempts = this.maxReconnectAttempts;
      }
    });

    this.connection.onreconnecting((error) => {
      if (process.env.NODE_ENV === 'development') {
        try { console.debug('SignalR: reconnecting', error); } catch {}
      }
      if (error) this.connectionError = error.message || 'Reconnecting...';
    });

    this.connection.onreconnected((connectionId) => {
      if (process.env.NODE_ENV === 'development') {
        try { console.debug('SignalR: reconnected', connectionId); } catch {}
      }
      this.reconnectAttempts = 0;
      this.connectionError = null;

      // Re-join user group after reconnection
      void this.joinUserGroup();
    });
  }

  /**
   * Probe the negotiate endpoint to check if the backend is reachable.
   * Includes the auth token for compatibility with [Authorize] hubs.
   *
   * Returns: 'reachable' | 'unreachable' | 'error'
   */
  private async probeNegotiate(): Promise<'reachable' | 'unreachable' | 'error'> {
    const { negotiateUrl } = this.buildHubUrls();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      const token = this.getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const resp = await fetch(negotiateUrl, {
        method: 'POST',
        credentials: 'include',
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (resp.ok || resp.status === 200) {
        return 'reachable';
      }

      // 401/403 might mean the server is running but auth is required
      // This is still "reachable" — SignalR will handle auth via accessTokenFactory
      if (resp.status === 401 || resp.status === 403) {
        return 'reachable';
      }

      return 'unreachable';
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        try { console.debug('SignalR: negotiate probe failed', err); } catch {}
      }
      return 'error';
    }
  }

  /**
   * Connect to the SignalR hub.
   *
   * FIX: The probe is now a SOFT check. If the probe fails, we still attempt
   * the connection because:
   * 1. The negotiate endpoint might have different CORS rules than the WebSocket
   * 2. The probe fetch might fail due to network quirks that don't affect SignalR
   * 3. The actual SignalR client has its own negotiate logic built in
   *
   * We only skip the connection attempt if the probe explicitly returns
   * 'unreachable' (non-2xx, non-401/403 response).
   */
  async connect(): Promise<boolean> {
    const currentState = this.connection?.state;
    if (currentState === signalR.HubConnectionState.Connecting ||
        currentState === signalR.HubConnectionState.Reconnecting) {
      if (process.env.NODE_ENV === 'development') {
        try { console.debug('SignalR: connect already in progress'); } catch {}
      }
      return false;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.connectionError = 'Offline: cannot connect to notification server';
      return false;
    }

    if (currentState === signalR.HubConnectionState.Connected) {
      return true;
    }

    this.isManualDisconnect = false;
    this.connectionError = null;

    // Soft probe — check if backend is reachable, but don't block on failure
    const probeResult = await this.probeNegotiate();

    if (probeResult === 'unreachable') {
      // Server explicitly returned an error status — don't bother connecting
      this.connectionError = 'Backend server returned an error. Please ensure the API is running.';
      if (process.env.NODE_ENV === 'development') {
        try { console.debug('SignalR: probe got non-recoverable status, skipping connection'); } catch {}
      }
      return false;
    }

    // 'reachable' or 'error' (probe failed) — still try to connect
    // SignalR's own negotiate might succeed even if our fetch probe didn't
    if (probeResult === 'error') {
      if (process.env.NODE_ENV === 'development') {
        try { console.debug('SignalR: probe failed, but attempting connection anyway (SignalR has its own negotiate)'); } catch {}
      }
    }

    // Initialize connection
    if (!this.connection || this.connection.state === signalR.HubConnectionState.Disconnected) {
      this.initializeConnection();
    }

    try {
      await this.connection!.start();

      this.reconnectAttempts = 0;
      this.connectionError = null;

      if (process.env.NODE_ENV === 'development') {
        try { console.debug('SignalR: connected successfully'); } catch {}
      }

      // Join user group after successful connection
      void this.joinUserGroup();

      return true;
    } catch (startErr: any) {
      const msg = startErr?.message ?? String(startErr);
      if (msg.includes('ERR_CONNECTION_REFUSED') || msg.includes('Failed to fetch')) {
        this.connectionError = 'Cannot reach notification server. Ensure backend is running and reachable.';
      } else if (msg.includes('negotiate')) {
        this.connectionError = 'Failed to negotiate connection. Check backend configuration and CORS settings.';
      } else if (msg.includes('401') || msg.includes('403')) {
        this.connectionError = 'Authentication failed. Please log in again.';
      } else if (msg.includes('413')) {
        this.connectionError = 'Connection payload too large.';
      } else {
        this.connectionError = msg;
      }

      if (process.env.NODE_ENV === 'development') {
        try { console.error('SignalR: connection start failed', msg); } catch {}
      }
      return false;
    }
  }

  async disconnect() {
    this.isManualDisconnect = true;

    if (this.connection && this.connection.state !== signalR.HubConnectionState.Disconnected) {
      try {
        await this.connection.stop().catch(() => {});
        this.connectionError = null;
        this.reconnectAttempts = 0;

        if (process.env.NODE_ENV === 'development') {
          try { console.debug('SignalR: disconnected'); } catch {}
        }
      } catch {
        // suppressed
      }
    }
  }

  private async joinUserGroup() {
    try {
      const userId = this.getCurrentUserId();
      if (userId && this.connection?.state === signalR.HubConnectionState.Connected) {
        await this.connection.invoke('JoinUserGroup', userId).catch(() => {});
        if (process.env.NODE_ENV === 'development') {
          try { console.debug(`SignalR: joined user group User_${userId}`); } catch {}
        }
      }
    } catch {
      this.connectionError = 'Failed to join user group';
    }
  }

  private getCurrentUserId(): string | null {
    try {
      const user = secureAuthStore.getUser();
      if (user) {
        return user.id?.toString() || user.userId?.toString() || user.user_id?.toString() || null;
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * Register a callback for ReceiveNotification events.
   */
  onNotificationReceived(callback: (notification: NotificationData) => void) {
    if (!this.callbacks.ReceiveNotification) {
      this.callbacks.ReceiveNotification = [];
    }
    this.callbacks.ReceiveNotification.push(callback);

    if (this.connection) {
      this.connection.on('ReceiveNotification', callback);
    }

    if (process.env.NODE_ENV === 'development') {
      try { console.debug('SignalR: registered ReceiveNotification handler'); } catch {}
    }
  }

  /**
   * Register a callback for TaskAssigned events.
   */
  onTaskAssigned(callback: (data: TaskEventData) => void) {
    if (!this.callbacks.TaskAssigned) {
      this.callbacks.TaskAssigned = [];
    }
    this.callbacks.TaskAssigned.push(callback);

    if (this.connection) {
      this.connection.on('TaskAssigned', callback);
    }

    if (process.env.NODE_ENV === 'development') {
      try { console.debug('SignalR: registered TaskAssigned handler'); } catch {}
    }
  }

  /**
   * Register a callback for TaskCompleted events.
   */
  onTaskCompleted(callback: (data: TaskEventData) => void) {
    if (!this.callbacks.TaskCompleted) {
      this.callbacks.TaskCompleted = [];
    }
    this.callbacks.TaskCompleted.push(callback);

    if (this.connection) {
      this.connection.on('TaskCompleted', callback);
    }

    if (process.env.NODE_ENV === 'development') {
      try { console.debug('SignalR: registered TaskCompleted handler'); } catch {}
    }
  }

  /**
   * Register a callback for TaskStatusChanged events.
   */
  onTaskStatusChanged(callback: (data: TaskEventData) => void) {
    if (!this.callbacks.TaskStatusChanged) {
      this.callbacks.TaskStatusChanged = [];
    }
    this.callbacks.TaskStatusChanged.push(callback);

    if (this.connection) {
      this.connection.on('TaskStatusChanged', callback);
    }

    if (process.env.NODE_ENV === 'development') {
      try { console.debug('SignalR: registered TaskStatusChanged handler'); } catch {}
    }
  }

  /**
   * Register a callback for any custom event name.
   */
  on(eventName: string, callback: (data: any) => void) {
    if (!this.callbacks[eventName]) {
      this.callbacks[eventName] = [];
    }
    this.callbacks[eventName].push(callback);

    if (!['ReceiveNotification', 'TaskAssigned', 'TaskCompleted', 'TaskStatusChanged'].includes(eventName)) {
      this.dynamicEventNames.add(eventName);
    }

    if (this.connection) {
      this.connection.on(eventName, callback);
    }
  }

  /**
   * Remove all callbacks for a specific event.
   */
  off(eventName: string) {
    delete this.callbacks[eventName];
    this.dynamicEventNames.delete(eventName);

    if (this.connection) {
      this.connection.off(eventName);
    }
  }

  /**
   * Remove all registered listeners from both the persistent store
   * and the current connection object. Preserves dynamic event names.
   */
  removeAllListeners() {
    if (this.connection) {
      for (const eventName of Object.keys(this.callbacks)) {
        this.connection.off(eventName);
      }
    }

    const preservedDynamicNames = new Set(this.dynamicEventNames);

    this.callbacks = {
      ReceiveNotification: [],
      TaskAssigned: [],
      TaskCompleted: [],
      TaskStatusChanged: [],
    };

    for (const name of preservedDynamicNames) {
      this.callbacks[name] = [];
    }
    this.dynamicEventNames = preservedDynamicNames;
  }

  /**
   * Get connection state derived directly from connection.state.
   */
  getConnectionState(): string {
    if (!this.connection) return 'Disconnected';
    switch (this.connection.state) {
      case signalR.HubConnectionState.Connected: return 'Connected';
      case signalR.HubConnectionState.Connecting: return 'Connecting';
      case signalR.HubConnectionState.Reconnecting: return 'Reconnecting';
      case signalR.HubConnectionState.Disconnected: return 'Disconnected';
      case signalR.HubConnectionState.Disconnecting: return 'Disconnecting';
      default: return 'Unknown';
    }
  }

  getConnectionError(): string | null {
    return this.connectionError;
  }

  isConnectionActive(): boolean {
    return this.connection?.state === signalR.HubConnectionState.Connected;
  }

  isCurrentlyConnecting(): boolean {
    const state = this.connection?.state;
    return state === signalR.HubConnectionState.Connecting ||
           state === signalR.HubConnectionState.Reconnecting;
  }

  resetReconnectAttempts() {
    this.reconnectAttempts = 0;
    this.connectionError = null;
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  getMaxReconnectAttempts(): number {
    return this.maxReconnectAttempts;
  }
}

export const signalRService = new SignalRService();