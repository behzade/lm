import { Effect } from "effect";
import { commandExists, runCommand } from "./command";

export type ClipboardCommand = {
  cmd: string;
  args: string[];
};

const getWriteCommand = Effect.gen(function* () {
  switch (process.platform) {
    case "darwin":
      return { cmd: "pbcopy", args: [] } satisfies ClipboardCommand;
    case "linux":
      if (yield* commandExists("wl-copy")) {
        return { cmd: "wl-copy", args: [] } satisfies ClipboardCommand;
      }
      if (yield* commandExists("xclip")) {
        return {
          cmd: "xclip",
          args: ["-selection", "clipboard"],
        } satisfies ClipboardCommand;
      }
      return null;
    default:
      return null;
  }
});

const getReadCommand = Effect.gen(function* () {
  switch (process.platform) {
    case "darwin":
      return { cmd: "pbpaste", args: [] } satisfies ClipboardCommand;
    case "linux":
      if (yield* commandExists("wl-paste")) {
        return { cmd: "wl-paste", args: [] } satisfies ClipboardCommand;
      }
      if (yield* commandExists("xclip")) {
        return {
          cmd: "xclip",
          args: ["-selection", "clipboard", "-o"],
        } satisfies ClipboardCommand;
      }
      return null;
    default:
      return null;
  }
});

export const writeClipboard = (text: string) =>
  Effect.gen(function* () {
    const command = yield* getWriteCommand;
    if (!command) {
      return yield* Effect.fail(new Error("Clipboard utility not found."));
    }

    const result = yield* runCommand(command.cmd, command.args, { stdin: text });
    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        new Error(result.stderr || "Clipboard write failed.")
      );
    }
  });

export const readClipboard = () =>
  Effect.gen(function* () {
    const command = yield* getReadCommand;
    if (!command) {
      return yield* Effect.fail(new Error("Clipboard utility not found."));
    }

    const result = yield* runCommand(command.cmd, command.args);
    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        new Error(result.stderr || "Clipboard read failed.")
      );
    }

    return result.stdout;
  });

export const hasClipboardSupport = Effect.gen(function* () {
  const platform = process.platform;
  if (platform === "darwin") {
    return yield* commandExists("pbcopy");
  }
  if (platform === "linux") {
    const hasWl = yield* commandExists("wl-copy");
    const hasXclip = yield* commandExists("xclip");
    return hasWl || hasXclip;
  }
  return false;
});
