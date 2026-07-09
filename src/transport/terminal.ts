import * as readline from "node:readline";

export interface TerminalSession {
  close: () => void;
  onLine: (line: string) => void;
  prompt: string;
  write: (text: string) => void;
}

export function startTerminalSession(opts: {
  prompt?: string;
  onLine: (line: string) => void;
}): TerminalSession {
  const prompt = opts.prompt ?? "you> ";
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const write = (text: string): void => {
    process.stdout.write(`${text}\n`);
  };

  rl.setPrompt(prompt);
  rl.prompt();

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      opts.onLine(trimmed);
    }
    rl.prompt();
  });

  return {
    close: () => rl.close(),
    onLine: opts.onLine,
    prompt,
    write,
  };
}
