import type {
  Channel,
  Message,
  Platform,
  ResolvedLine,
  SignalMap,
  SignalName,
} from "./types.js";

export interface StreamHandle {
  cancel: () => void;
}

export interface LiveLine {
  discord?: unknown;
  googlechat?: unknown;
  grpc?: unknown;
  /** When true, providers may attach a JSON-safe wire snapshot on `message.raw`. */
  includeRaw?: boolean;
  line?: unknown;
  platform: Platform;
  slack?: unknown;
  teams?: unknown;
  slackBotUserId?: string;
  slackTeamId?: string;
  streams: StreamHandle[];
  telegram?: unknown;
  terminal?: unknown;
  wa?: unknown;
  wb?: unknown;
}

export interface InboundQueue {
  done(): void;
  iterator(): AsyncIterable<[Channel, Message]>;
  push(item: [Channel, Message]): void;
}

export interface Emitter {
  emit<K extends SignalName>(
    event: K,
    signal: SignalMap[K],
    channel: Channel
  ): void;
  on<K extends SignalName>(
    event: K,
    handler: (signal: SignalMap[K], channel: Channel) => void
  ): () => void;
}

export interface PlatformBinder {
  connectLine(line: ResolvedLine): Promise<void> | void;
  connectLocal?(config: unknown): void;
  createChat?(participants: string[]): Promise<{ to: string }>;
  createFaceTimeLink?(handles?: string[]): Promise<{ url: string }>;
  dedicatedLines?(config: unknown): ResolvedLine[];
  makeChannel(to: string, scopeId?: string): Channel;
  platform: Platform;
}

export interface SkylineHost {
  binders: Map<Platform, PlatformBinder>;
  emit: Emitter["emit"];
  lineFor(to: string): LiveLine;
  lineForPlatform(platform: Platform, scopeId?: string): LiveLine;
  live: Map<string, LiveLine>;
  newId(): string;
  projectId?: string;
  projectSecret?: string;
  queue: InboundQueue;
  ready: Set<string>;
  register(binder: PlatformBinder): void;
  unsupported(platform: Platform, verb: string): never;
}

export class UnsupportedError extends Error {
  constructor(
    readonly platform: Platform,
    readonly verb: string
  ) {
    super(`${verb} is not supported on ${platform}`);
    this.name = "UnsupportedError";
  }
}

export function unsupported(platform: Platform, verb: string): never {
  throw new UnsupportedError(platform, verb);
}
