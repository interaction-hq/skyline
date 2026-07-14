export interface TerminalConfig {
  mode: "local";
  platform: "terminal";
    prompt?: string;
}

export const terminal = {
  config(opts?: { prompt?: string }): TerminalConfig {
    return { mode: "local", platform: "terminal", prompt: opts?.prompt };
  },
};
