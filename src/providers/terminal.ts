export interface TerminalConfig {
  platform: "terminal";
  mode: "local";
  /** Label shown in the interactive prompt. */
  prompt?: string;
}

export const terminal = {
  config(opts?: { prompt?: string }): TerminalConfig {
    return { platform: "terminal", mode: "local", prompt: opts?.prompt };
  },
};
