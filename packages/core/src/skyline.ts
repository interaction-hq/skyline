import { Broker } from "./broker.js";
import { issueSlackTokens } from "./cloud/slack-tokens.js";
import type { SkylineHost } from "./host.js";
import { unsupported } from "./host.js";
import type {
  Channel,
  ChannelTarget,
  Platform,
  ProviderConfig,
  ResolvedLine,
  SkylineApp,
} from "./types.js";

export type { ProviderConfig } from "./types.js";

export interface SkylineOptions {
  projectId?: string;
  projectSecret?: string;
  providers: ProviderConfig[];
}

function createQueue() {
  const buffer: [Channel, import("./types").Message][] = [];
  let resolveNext: (() => void) | null = null;
  let finished = false;

  return {
    done() {
      finished = true;
      resolveNext?.();
      resolveNext = null;
    },
    iterator() {
      return {
        async *[Symbol.asyncIterator]() {
          while (true) {
            if (buffer.length > 0) {
              yield buffer.shift() as [Channel, import("./types").Message];
              continue;
            }
            if (finished) {
              return;
            }
            await new Promise<void>((resolve) => {
              resolveNext = resolve;
            });
          }
        },
      };
    },
    push(item: [Channel, import("./types").Message]) {
      buffer.push(item);
      resolveNext?.();
      resolveNext = null;
    },
  };
}

function createEmitter() {
  const handlers = new Map<
    import("./types").SignalName,
    Set<(signal: unknown, channel: Channel) => void>
  >();
  return {
    emit<K extends import("./types").SignalName>(
      event: K,
      signal: import("./types").SignalMap[K],
      channel: Channel
    ): void {
      const set = handlers.get(event);
      if (!set) {
        return;
      }
      for (const handler of set) {
        try {
          handler(signal, channel);
        } catch {}
      }
    },
    on<K extends import("./types").SignalName>(
      event: K,
      handler: (
        signal: import("./types").SignalMap[K],
        channel: Channel
      ) => void
    ): () => void {
      const set =
        handlers.get(event) ??
        (handlers.set(event, new Set()).get(event) as Set<
          (signal: unknown, channel: Channel) => void
        >);
      set.add(handler as (signal: unknown, channel: Channel) => void);
      return () =>
        set.delete(handler as (signal: unknown, channel: Channel) => void);
    },
  };
}

function createHost(
  projectId: string | undefined,
  projectSecret: string | undefined,
  emitter: ReturnType<typeof createEmitter>
): SkylineHost {
  const live = new Map<string, import("./host").LiveLine>();
  const binders = new Map<Platform, import("./host").PlatformBinder>();

  const lineFor = (to: string) => {
    const line = live.get(to);
    if (!line) {
      throw new Error(`no ready line for ${to}`);
    }
    return line;
  };

  const lineForPlatform = (platform: Platform, scopeId?: string) => {
    if (scopeId) {
      const scoped = live.get(scopeId);
      if (scoped?.platform === platform) {
        return scoped;
      }
    }
    for (const line of live.values()) {
      if (line.platform === platform) {
        return line;
      }
    }
    throw new Error(`no ready line for platform ${platform}`);
  };

  return {
    binders,
    emit: emitter.emit,
    lineFor,
    lineForPlatform,
    live,
    newId: () => `sky-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    projectSecret,
    queue: createQueue(),
    ready: new Set<string>(),
    register(binder) {
      binders.set(binder.platform, binder);
    },
    unsupported,
  };
}

interface BinderModule {
  bind(host: SkylineHost, config: ProviderConfig): void;
}

async function loadBinder(platform: string): Promise<BinderModule> {
  try {
    switch (platform) {
      case "imessage":
        return (await import("@skyline-ts/imessage")) as BinderModule;
      case "slack":
        return (await import("@skyline-ts/slack")) as BinderModule;
      case "whatsapp":
        return (await import("@skyline-ts/whatsapp")) as BinderModule;
      case "whatsapp_business":
        return (await import("@skyline-ts/whatsapp-business")) as BinderModule;
      case "terminal":
        return (await import("@skyline-ts/terminal")) as BinderModule;
      default:
        throw new Error(`unknown platform: ${platform}`);
    }
  } catch {
    throw new Error(
      `Platform "${platform}" is not installed. Add it with: bun add @skyline-ts/${platform === "whatsapp_business" ? "whatsapp-business" : platform}`
    );
  }
}

async function connectLines(
  host: SkylineHost,
  platform: Platform,
  lines: ResolvedLine[]
): Promise<void> {
  const binder = host.binders.get(platform);
  if (!binder) {
    throw new Error(`no binder registered for ${platform}`);
  }
  if (platform === "imessage" || platform === "whatsapp") {
    await Promise.all(lines.map((line) => binder.connectLine(line)));
    return;
  }
  for (const line of lines) {
    await binder.connectLine(line);
  }
}

export async function Skyline(opts: SkylineOptions): Promise<SkylineApp> {
  const emitter = createEmitter();
  const host = createHost(opts.projectId, opts.projectSecret, emitter);
  const broker = new Broker();

  for (const provider of opts.providers) {
    const mod = await loadBinder(provider.platform);
    mod.bind(host, provider);
  }

  const makeChannel = (to: string, platformHint?: Platform): Channel => {
    const keyed = host.live.get(to)?.platform;
    const platform =
      platformHint ??
      keyed ??
      (host.live.size === 1
        ? host.live.values().next().value?.platform
        : undefined);
    if (!platform) {
      throw new Error(`cannot resolve platform for ${to}`);
    }
    const binder = host.binders.get(platform);
    if (!binder) {
      throw new Error(`no binder for platform ${platform}`);
    }
    const scopeId =
      platform === "slack" ? host.live.get(to)?.slackTeamId : undefined;
    return binder.makeChannel(to, scopeId as string | undefined);
  };

  for (const provider of opts.providers) {
    if (provider.platform === "terminal") {
      continue;
    }

    const binder = host.binders.get(provider.platform);
    if (!binder) {
      continue;
    }

    if (provider.mode === "dedicated") {
      const lines = binder.dedicatedLines?.(provider) ?? [];
      await connectLines(host, provider.platform, lines);
      continue;
    }

    if (!(opts.projectId && opts.projectSecret)) {
      throw new Error(
        "cloud mode requires projectId + projectSecret (or use dedicated lines)"
      );
    }

    if (provider.platform === "slack") {
      const tokens = await issueSlackTokens(opts.projectId, opts.projectSecret);
      const resolved = await broker.resolve(
        { projectId: opts.projectId, projectSecret: opts.projectSecret },
        "slack"
      );
      const endpoint =
        resolved.lines[0]?.address ||
        process.env.SKYLINE_SLACK_ENDPOINT ||
        "slack-grpc.skyline.interactions.co.in:443";
      const lines: ResolvedLine[] = Object.entries(tokens.auth).map(
        ([teamId, accessToken]) => ({
          address: endpoint,
          phone: teamId,
          slack: {
            accessToken,
            endpoint,
            team: tokens.teams[teamId],
            teamId,
          },
          token: accessToken,
        })
      );
      await connectLines(host, "slack", lines);

      const projectId = opts.projectId;
      const projectSecret = opts.projectSecret;
      const scheduleNext = (ttl: number) => {
        broker.scheduleRefresh(ttl, async () => {
          try {
            const next = await issueSlackTokens(projectId, projectSecret);
            for (const [teamId, accessToken] of Object.entries(next.auth)) {
              if (host.live.has(teamId)) {
                continue;
              }
              await connectLines(host, "slack", [
                {
                  address: endpoint,
                  phone: teamId,
                  slack: {
                    accessToken,
                    endpoint,
                    team: next.teams[teamId],
                    teamId,
                  },
                  token: accessToken,
                },
              ]);
            }
            scheduleNext(next.expiresIn);
          } catch {
            scheduleNext(ttl);
          }
        });
      };
      scheduleNext(tokens.expiresIn);
      continue;
    }

    const resolved = await broker.resolve(
      { projectId: opts.projectId, projectSecret: opts.projectSecret },
      provider.platform
    );
    await connectLines(host, provider.platform, resolved.lines);

    const projectId = opts.projectId;
    const projectSecret = opts.projectSecret;
    const platform = provider.platform;
    const scheduleNext = (ttl: number) => {
      broker.scheduleRefresh(ttl, async () => {
        try {
          const next = await broker.resolve(
            { projectId, projectSecret },
            platform
          );
          await connectLines(
            host,
            platform,
            next.lines.filter((l) => !host.live.has(l.phone))
          );
          scheduleNext(next.ttl);
        } catch {
          scheduleNext(ttl);
        }
      });
    };
    scheduleNext(resolved.ttl);
  }

  const resolveTarget = (
    target: string | ChannelTarget
  ): { platform?: Platform; to: string } =>
    typeof target === "string"
      ? { to: target }
      : { platform: target.platform, to: target.to };

  const incoming = host.queue.iterator();

  return {
    channel: (target) => {
      const resolved = resolveTarget(target);
      return makeChannel(resolved.to, resolved.platform);
    },
    async close() {
      broker.cancelRefresh();
      for (const line of host.live.values()) {
        for (const stream of line.streams) {
          stream.cancel();
        }
        const grpc = line.grpc as { close?: () => void } | undefined;
        const wa = line.wa as { close?: () => void } | undefined;
        const wb = line.wb as { close?: () => void } | undefined;
        const slack = line.slack as { close?: () => void } | undefined;
        const terminal = line.terminal as { close?: () => void } | undefined;
        grpc?.close?.();
        wa?.close?.();
        wb?.close?.();
        slack?.close?.();
        terminal?.close?.();
      }
      host.live.clear();
      host.queue.done();
    },
    async createChat(participants, createOpts) {
      if (!participants.length) {
        throw new Error("createChat: needs at least one participant");
      }
      const platform =
        createOpts?.platform ??
        (host.binders.has("imessage")
          ? "imessage"
          : host.binders.keys().next().value);
      if (!platform) {
        throw new Error("createChat: no provider registered");
      }
      const binder = host.binders.get(platform);
      if (!binder?.createChat) {
        throw new Error(`createChat is not supported on ${platform}`);
      }
      const { to } = await binder.createChat(participants);
      return makeChannel(to, platform);
    },
    async createFaceTimeLink(linkOpts) {
      const platform = linkOpts?.platform ?? "imessage";
      const binder = host.binders.get(platform);
      if (!binder?.createFaceTimeLink) {
        throw new Error(`createFaceTimeLink is not supported on ${platform}`);
      }
      return binder.createFaceTimeLink(linkOpts?.handles);
    },
    incoming,
    on: (event, handler) => emitter.on(event, handler),
    ready: host.ready,
  };
}
