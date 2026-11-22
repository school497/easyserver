import type {
  CommandMap,
  CommandType,
  InstallStat,
  InstalledPluginRow,
  PluginManifest,
  ServerRow,
  ServerStatusRow,
  UptimeRow,
} from '@easyserver/core';

export interface Account {
  userId: string;
  email: string | null;
  isAnonymous: boolean;
  mfa: { factorId: string; verified: boolean } | null;
}

export interface Member {
  user_id: string;
  created_at: string;
}

export interface LocalFile {
  path: string;
  data: Uint8Array;
}

/** What the backend pushes into app state. */
export interface BackendState {
  account: Account | null;
  servers: ServerRow[];
  selectedId: string | null;
  status: ServerStatusRow | null;
  uptime: UptimeRow[];
  plugins: InstalledPluginRow[];
}

export type SetupState =
  | { phase: 'name'; suggested: string }
  | { phase: 'code'; code: string; expiresAt: string }
  | { phase: 'done' };

export interface Backend {
  mode: 'client' | 'server';
  demo?: boolean;
  init(push: (patch: Partial<BackendState>) => void): Promise<void>;
  select(serverId: string): Promise<void>;
  send<T extends CommandType>(type: T, payload: CommandMap[T], opts?: { timeoutMs?: number }): Promise<any>;
  upload(pluginId: string, files: LocalFile[], onProgress?: (done: number, total: number) => void, folder?: string): Promise<void>;
  /** End-to-end encrypted download of one file from a plugin folder. */
  download(pluginId: string, path: string, folder?: string): Promise<Uint8Array>;
  /** Plugin store */
  sources(): Promise<string[]>;
  onSourcesChanged(cb: () => void): () => void;
  installStats(): Promise<InstallStat[]>;
  /** Optional: preset catalog (demo mode only). */
  demoCatalog?(): { sourceUrl: string; manifest: PluginManifest; iconUrl: string | null }[];

  // ── client only ──
  claimCode?(code: string): Promise<string>;
  leave?(serverId: string): Promise<void>;
  signUpWithEmail?(email: string, password: string): Promise<string>;
  signIn?(email: string, password: string): Promise<'ok' | 'mfa'>;
  verifySignInMfa?(code: string): Promise<void>;
  signOut?(): Promise<void>;
  enrollMfa?(): Promise<{ factorId: string; qr: string; secret: string }>;
  verifyMfa?(factorId: string, code: string): Promise<void>;
  disableMfa?(factorId: string): Promise<void>;

  // ── server only ──
  setupState?(): Promise<SetupState>;
  onSetupChanged?(cb: (s: SetupState) => void): () => void;
  setup?(name: string): Promise<void>;
  newPairingCode?(): Promise<{ code: string; expiresAt: string }>;
  members?(): Promise<Member[]>;
  revoke?(userId: string): Promise<void>;
  getOpenAtLogin?(): Promise<boolean>;
  setOpenAtLogin?(on: boolean): Promise<void>;
  revealDataFolder?(): Promise<string>;
  resetServer?(): Promise<void>;
  keyFingerprint?(): Promise<string | null>;
}
