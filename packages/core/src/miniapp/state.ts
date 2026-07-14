export interface FlowStateReader {
  bool(key: string): boolean;

  date(key: string): Date | undefined;

  has(key: string): boolean;

  list(key: string): string[];

  number(key: string): number | undefined;

  readonly raw: Record<string, string>;

  string(key: string): string | undefined;
}

export function readState(state: Record<string, string>): FlowStateReader {
  return {
    bool(key) {
      return state[key] === "true";
    },
    date(key) {
      const value = state[key];
      if (!value) {
        return;
      }
      const ms = Date.parse(value);
      return Number.isNaN(ms) ? undefined : new Date(ms);
    },
    has(key) {
      const value = state[key];
      return value !== undefined && value !== "";
    },
    list(key) {
      const value = state[key];
      if (!value) {
        return [];
      }
      return value.split(",").filter((s) => s.length > 0);
    },
    number(key) {
      const value = state[key];
      if (value === undefined || value === "") {
        return;
      }
      const n = Number(value);
      return Number.isNaN(n) ? undefined : n;
    },
    raw: state,
    string(key) {
      return state[key];
    },
  };
}
