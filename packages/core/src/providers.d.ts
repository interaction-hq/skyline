declare module "@skyline-ts/imessage" {
  export function bind(
    host: import("./host").SkylineHost,
    config: import("./types").ProviderConfig
  ): void;
}

declare module "@skyline-ts/slack" {
  export function bind(
    host: import("./host").SkylineHost,
    config: import("./types").ProviderConfig
  ): void;
}

declare module "@skyline-ts/whatsapp" {
  export function bind(
    host: import("./host").SkylineHost,
    config: import("./types").ProviderConfig
  ): void;
}

declare module "@skyline-ts/whatsapp-business" {
  export function bind(
    host: import("./host").SkylineHost,
    config: import("./types").ProviderConfig
  ): void;
}

declare module "@skyline-ts/terminal" {
  export function bind(
    host: import("./host").SkylineHost,
    config: import("./types").ProviderConfig
  ): void;
}

declare module "@skyline-ts/telegram" {
  export function bind(
    host: import("./host").SkylineHost,
    config: import("./types").ProviderConfig
  ): void;
}
