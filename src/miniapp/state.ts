// Typed accessors over a flow's returned state.
//
// The wire keeps state as a flat string map — it rides iMessage URL params and a
// proto string map, so string-only is the robust, transport-native shape. These
// helpers give the developer typed reads (number/bool/list/date) without changing
// the wire or the on-device renderer: the encoding lives in one place instead of
// in every agent.

/** A typed, read-only view over a flow's string state map. */
export interface FlowStateReader {
  /** The underlying raw string map (always available). */
  readonly raw: Record<string, string>;
  /** Raw string for `key`, or `undefined` if absent. */
  string(key: string): string | undefined;
  /** Parsed number, or `undefined` if absent/not numeric. */
  number(key: string): number | undefined;
  /** Boolean — `"true"` is true, anything else present is false. */
  bool(key: string): boolean;
  /** Multi-select list — comma-joined on the wire, split here. */
  list(key: string): string[];
  /** ISO-8601 date, or `undefined` if absent/unparseable. */
  date(key: string): Date | undefined;
  /** True when `key` is present with a non-empty value. */
  has(key: string): boolean;
}

/** Wrap a flow's raw string state in typed accessors. */
export function readState(state: Record<string, string>): FlowStateReader {
  return {
    raw: state,
    string(key) {
      return state[key];
    },
    number(key) {
      const value = state[key];
      if (value === undefined || value === "") {
        return undefined;
      }
      const n = Number(value);
      return Number.isNaN(n) ? undefined : n;
    },
    bool(key) {
      return state[key] === "true";
    },
    list(key) {
      const value = state[key];
      if (!value) {
        return [];
      }
      return value.split(",").filter((s) => s.length > 0);
    },
    date(key) {
      const value = state[key];
      if (!value) {
        return undefined;
      }
      const ms = Date.parse(value);
      return Number.isNaN(ms) ? undefined : new Date(ms);
    },
    has(key) {
      const value = state[key];
      return value !== undefined && value !== "";
    },
  };
}
