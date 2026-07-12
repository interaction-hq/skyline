export interface TerminalConfig {
  mode: "local";
  platform: "terminal";
  /** Label shown in the interactive prompt. */
  prompt?: string;
}

export const terminal = {
  config(opts?: { prompt?: string }): TerminalConfig {
    return { mode: "local", platform: "terminal", prompt: opts?.prompt };
  },
};
