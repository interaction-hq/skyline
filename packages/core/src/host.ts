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
  grpc?: unknown;
  platform: Platform;
  slack?: unknown;
  slackBotUserId?: string;
  slackTeamId?: string;
  streams: StreamHandle[];
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
  dedicatedLines?(config: unknown): ResolvedLine[];
  connectLocal?(config: unknown): void;
  makeChannel(to: string, scopeId?: string): Channel;
  platform: Platform;
}

export interface SkylineHost {
  projectId?: string;
  projectSecret?: string;
  newId(): string;
  queue: InboundQueue;
  emit: Emitter["emit"];
  live: Map<string, LiveLine>;
  ready: Set<string>;
  binders: Map<Platform, PlatformBinder>;
  register(binder: PlatformBinder): void;
  lineFor(to: string): LiveLine;
  lineForPlatform(platform: Platform, scopeId?: string): LiveLine;
  unsupported(platform: Platform, verb: string): never;
}

export function unsupported(platform: Platform, verb: string): never {
  throw new Error(`${verb} is not supported on ${platform}`);
}
