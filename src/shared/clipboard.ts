import { Effect } from "effect";
import { commandExists, runCommand } from "./command";

export type ClipboardCommand = {
  cmd: string;
  args: string[];
};

const getWriteCommand = () => {
  switch (process.platform) {
    case "darwin":
      return { cmd: "pbcopy", args: [] } satisfies ClipboardCommand;
    case "linux":
      if (Bun.which("wl-copy")) {
        return { cmd: "wl-copy", args: [] } satisfies ClipboardCommand;
      }
      if (Bun.which("xclip")) {
        return { cmd: "xclip", args: ["-selection", "clipboard"] } satisfies ClipboardCommand;
      }
      return null;
    default:
      return null;
  }
};

const getReadCommand = () => {
  switch (process.platform) {
    case "darwin":
      return { cmd: "pbpaste", args: [] } satisfies ClipboardCommand;
    case "linux":
      if (Bun.which("wl-paste")) {
        return { cmd: "wl-paste", args: [] } satisfies ClipboardCommand;
      }
      if (Bun.which("xclip")) {
        return { cmd: "xclip", args: ["-selection", "clipboard", "-o"] } satisfies ClipboardCommand;
      }
      return null;
    default:
      return null;
  }
};

export const writeClipboard = (text: string) =>
  Effect.gen(function* (_) {
    const command = getWriteCommand();
    if (!command) {
      return yield* _(Effect.fail(new Error("Clipboard utility not found.")));
    }

    const result = yield* _(runCommand(command.cmd, command.args, { stdin: text }));
    if (result.exitCode !== 0) {
      return yield* _(Effect.fail(new Error(result.stderr || "Clipboard write failed.")));
    }
  });

export const readClipboard = () =>
  Effect.gen(function* (_) {
    const command = getReadCommand();
    if (!command) {
      return yield* _(Effect.fail(new Error("Clipboard utility not found.")));
    }

    const result = yield* _(runCommand(command.cmd, command.args));
    if (result.exitCode !== 0) {
      return yield* _(Effect.fail(new Error(result.stderr || "Clipboard read failed.")));
    }

    return result.stdout;
  });

export const hasClipboardSupport = Effect.gen(function* (_) {
  const platform = process.platform;
  if (platform === "darwin") {
    return yield* _(commandExists("pbcopy"));
  }
  if (platform === "linux") {
    const hasWl = yield* _(commandExists("wl-copy"));
    const hasXclip = yield* _(commandExists("xclip"));
    return hasWl || hasXclip;
  }
  return false;
});
