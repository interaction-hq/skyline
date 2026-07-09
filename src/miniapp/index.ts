// Skyline apps — the client surface for building iMessage apps.
//
// Two halves, one import:
//   1. Authoring — `defineApp` / `defineRegistry` describe an app once
//      (rendering, bubble, capabilities, ship mode). Used at build/publish time.
//   2. Runtime — `app` is the in-WebView bridge to the shell (context, send,
//      resize, close, events). Used inside a running `web`-mode app.
//
// Ship modes:
//   - hosted:    build a web or flow app, publish a URL + manifest; it shows up
//                in every user's launcher as content inside Interactions.
//   - dedicated: bring your own Apple Developer account and ship a native
//                iMessage app (e.g. to embed your AI agent) on our template +
//                pipeline; you own signing and listing.

export {
  type Action,
  type CapabilityName,
  type Component,
  type ComponentTemplate,
  defineFlow,
  type Flow,
  type FlowState,
  type FlowTheme,
  type Option,
  type PaymentProvider,
  type Screen,
  type Style,
  type TextAlign,
  type TextStyle,
} from "./experience";
export {
  type AppInput,
  type AppManifest,
  type BubbleCaptions,
  type BubblePresentation,
  type BubbleSize,
  type Capabilities,
  defineApp,
  defineRegistry,
  expandTemplate,
  type NativeSpec,
  type Registry,
  type Rendering,
  type ShipMode,
  type SymbolName,
} from "./manifest";

export { heroCard, paymentCard } from "./presets";
export { type SignedRegistry, signRegistry } from "./registry-sign";

export {
  type AppContext,
  type AppEvents,
  app,
  type BubbleUpdate,
  type IncomingMessage,
  type OutgoingMessage,
  type PresentationStyle,
} from "./runtime";
export { type FlowStateReader, readState } from "./state";
