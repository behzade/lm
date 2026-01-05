#!/usr/bin/env bun
import { Effect } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  DEFAULT_SYSTEM_PROMPT,
  getConfigPath,
  loadConfig,
} from "./config";
import { runChatLoop } from "./chat";
import { readClipboard } from "../shared/clipboard";
import { runCommandInherit } from "../shared/command";

const usageText = `Usage: lm [OPTIONS] [PROMPT]

Options:
  -f, --file <path>           Path to a file to add to the context. (repeatable)
  -c, --from-clipboard        Add clipboard content to the context.
  -a, --agent <name>          Name of the agent profile to load.
  -e, --edit-agent <name>     Create or edit an agent profile.
  -m, --model <model>         Override the configured model.
  -u, --api-url <url>         Override the configured API endpoint URL.
  -l, --max-tool-turns <num>  Maximum number of tool-use turns. (default: 5)
  -t, --temperature <float>   Sampling temperature. (default: 0.7)
  -p, --top-p <float>         Nucleus sampling probability. (default: 0.95)
  -h, --help                  Show this help message.
`;

type ParsedArgs = {
  prompt?: string;
  files: string[];
  fromClipboard: boolean;
  agent?: string;
  editAgent?: string;
  model?: string;
  apiUrl?: string;
  maxToolTurns: number;
  temperature: number;
  topP: number;
};

const readStdin = () =>
  Effect.tryPromise(async () => {
    if (process.stdin.isTTY) {
      return "";
    }
    const content = await new Response(process.stdin).text();
    return content.trim();
  });

const parseArgs = (args: string[]): Effect.Effect<ParsedArgs | null> =>
  Effect.gen(function* (_) {
    const files: string[] = [];
    let fromClipboard = false;
    let agent: string | undefined;
    let editAgent: string | undefined;
    let model: string | undefined;
    let apiUrl: string | undefined;
    let maxToolTurns = 5;
    let temperature = 0.7;
    let topP = 0.95;

    const promptParts: string[] = [];

    let index = 0;
    while (index < args.length) {
      const arg = args[index];
      if (arg === "--") {
        promptParts.push(...args.slice(index + 1));
        break;
      }

      switch (arg) {
        case "-f":
        case "--file": {
          const next = args[index + 1];
          if (!next) {
            yield* _(Effect.sync(() => console.error("Error: --file requires a path.")));
            yield* _(Effect.sync(() => console.log(usageText)));
            return yield* _(Effect.fail(new Error("Missing --file argument")));
          }
          files.push(next);
          index += 2;
          break;
        }
        case "-c":
        case "--from-clipboard":
          fromClipboard = true;
          index += 1;
          break;
        case "-a":
        case "--agent": {
          const next = args[index + 1];
          if (!next) {
            yield* _(Effect.sync(() => console.error("Error: --agent requires a name.")));
            yield* _(Effect.sync(() => console.log(usageText)));
            return yield* _(Effect.fail(new Error("Missing --agent argument")));
          }
          agent = next;
          index += 2;
          break;
        }
        case "-e":
        case "--edit-agent": {
          const next = args[index + 1];
          if (!next) {
            yield* _(Effect.sync(() => console.error("Error: --edit-agent requires a name.")));
            yield* _(Effect.sync(() => console.log(usageText)));
            return yield* _(Effect.fail(new Error("Missing --edit-agent argument")));
          }
          editAgent = next;
          index += 2;
          break;
        }
        case "-m":
        case "--model": {
          const next = args[index + 1];
          if (!next) {
            yield* _(Effect.sync(() => console.error("Error: --model requires a value.")));
            yield* _(Effect.sync(() => console.log(usageText)));
            return yield* _(Effect.fail(new Error("Missing --model argument")));
          }
          model = next;
          index += 2;
          break;
        }
        case "-u":
        case "--api-url": {
          const next = args[index + 1];
          if (!next) {
            yield* _(Effect.sync(() => console.error("Error: --api-url requires a value.")));
            yield* _(Effect.sync(() => console.log(usageText)));
            return yield* _(Effect.fail(new Error("Missing --api-url argument")));
          }
          apiUrl = next;
          index += 2;
          break;
        }
        case "-l":
        case "--max-tool-turns": {
          const next = args[index + 1];
          const parsed = Number(next);
          if (!next || Number.isNaN(parsed)) {
            yield* _(Effect.sync(() => console.error("Error: --max-tool-turns requires a number.")));
            yield* _(Effect.sync(() => console.log(usageText)));
            return yield* _(Effect.fail(new Error("Invalid --max-tool-turns")));
          }
          maxToolTurns = parsed;
          index += 2;
          break;
        }
        case "-t":
        case "--temperature": {
          const next = args[index + 1];
          const parsed = Number(next);
          if (!next || Number.isNaN(parsed)) {
            yield* _(Effect.sync(() => console.error("Error: --temperature requires a number.")));
            yield* _(Effect.sync(() => console.log(usageText)));
            return yield* _(Effect.fail(new Error("Invalid --temperature")));
          }
          temperature = parsed;
          index += 2;
          break;
        }
        case "-p":
        case "--top-p": {
          const next = args[index + 1];
          const parsed = Number(next);
          if (!next || Number.isNaN(parsed)) {
            yield* _(Effect.sync(() => console.error("Error: --top-p requires a number.")));
            yield* _(Effect.sync(() => console.log(usageText)));
            return yield* _(Effect.fail(new Error("Invalid --top-p")));
          }
          topP = parsed;
          index += 2;
          break;
        }
        case "-h":
        case "--help":
          yield* _(Effect.sync(() => console.log(usageText)));
          return null;
        default: {
          if (arg.startsWith("--file=")) {
            files.push(arg.slice("--file=".length));
            index += 1;
            break;
          }
          if (arg.startsWith("-f=")) {
            files.push(arg.slice(3));
            index += 1;
            break;
          }
          if (arg.startsWith("--agent=")) {
            agent = arg.slice("--agent=".length);
            index += 1;
            break;
          }
          if (arg.startsWith("--edit-agent=")) {
            editAgent = arg.slice("--edit-agent=".length);
            index += 1;
            break;
          }
          if (arg.startsWith("--model=")) {
            model = arg.slice("--model=".length);
            index += 1;
            break;
          }
          if (arg.startsWith("--api-url=")) {
            apiUrl = arg.slice("--api-url=".length);
            index += 1;
            break;
          }
          if (arg.startsWith("--max-tool-turns=")) {
            const parsed = Number(arg.slice("--max-tool-turns=".length));
            if (Number.isNaN(parsed)) {
              return yield* _(Effect.fail(new Error("Invalid --max-tool-turns")));
            }
            maxToolTurns = parsed;
            index += 1;
            break;
          }
          if (arg.startsWith("--temperature=")) {
            const parsed = Number(arg.slice("--temperature=".length));
            if (Number.isNaN(parsed)) {
              return yield* _(Effect.fail(new Error("Invalid --temperature")));
            }
            temperature = parsed;
            index += 1;
            break;
          }
          if (arg.startsWith("--top-p=")) {
            const parsed = Number(arg.slice("--top-p=".length));
            if (Number.isNaN(parsed)) {
              return yield* _(Effect.fail(new Error("Invalid --top-p")));
            }
            topP = parsed;
            index += 1;
            break;
          }
          if (arg.startsWith("-")) {
            yield* _(Effect.sync(() => console.error(`Error: Unknown option '${arg}'`)));
            yield* _(Effect.sync(() => console.log(usageText)));
            return yield* _(Effect.fail(new Error("Unknown option")));
          }
          promptParts.push(arg);
          index += 1;
        }
      }
    }

    const prompt = promptParts.length ? promptParts.join(" ") : undefined;

    return {
      prompt,
      files,
      fromClipboard,
      agent,
      editAgent,
      model,
      apiUrl,
      maxToolTurns,
      temperature,
      topP,
    } satisfies ParsedArgs;
  });

const editAgentProfile = (agentName: string) =>
  Effect.gen(function* (_) {
    const configDir = getConfigPath();
    const promptPath = path.join(configDir, `${agentName}.md`);
    const editor = process.env.EDITOR ?? "nano";

    yield* _(Effect.tryPromise(() => fs.mkdir(configDir, { recursive: true })));
    yield* _(Effect.sync(() => console.log(`Opening agent '${agentName}' with ${editor}...`)));
    yield* _(runCommandInherit(editor, [promptPath]));
  });

const loadSystemPrompt = (agentName?: string) =>
  Effect.gen(function* (_) {
    if (!agentName) {
      return DEFAULT_SYSTEM_PROMPT;
    }

    const promptPath = path.join(getConfigPath(), `${agentName}.md`);
    const content = yield* _(
      Effect.tryPromise(() => fs.readFile(promptPath, "utf8")).pipe(
        Effect.catchAll(() =>
          Effect.fail(
            new Error(`Agent not found at '${promptPath}'.`)
          )
        )
      )
    );

    const today = new Date().toISOString().slice(0, 10);
    return `${content}\n\n**Today's date:** ${today}`;
  });

const buildContext = (fromClipboard: boolean, files: string[]) =>
  Effect.gen(function* (_) {
    const contextParts: string[] = [];

    if (fromClipboard) {
      const clipboardContent = yield* _(
        readClipboard().pipe(
          Effect.catchAll((error) =>
            Effect.sync(() => {
              console.error(`Clipboard error: ${error}`);
              return "";
            })
          )
        )
      );
      if (clipboardContent) {
        contextParts.push(
          `--- Content from clipboard ---\n${clipboardContent}`
        );
      }
    }

    for (const filePath of files) {
      const content = yield* _(
        Effect.tryPromise(() => fs.readFile(filePath, "utf8")).pipe(
          Effect.catchAll((error) =>
            Effect.fail(
              new Error(`Error reading file '${filePath}': ${error}`)
            )
          )
        )
      );
      contextParts.push(`--- Content from file: ${filePath} ---\n${content}`);
    }

    return contextParts.join("\n\n");
  });

const getInput = (promptArg?: string) =>
  Effect.gen(function* (_) {
    const parts: string[] = [];
    if (promptArg) {
      parts.push(promptArg);
    }

    const stdinContent = yield* _(readStdin());
    if (stdinContent) {
      parts.push(stdinContent);
    }

    return parts.join("\n\n");
  });

const main = Effect.gen(function* (_) {
  const args = process.argv.slice(2);
  const parsed = yield* _(parseArgs(args));
  if (!parsed) {
    return;
  }

  if (parsed.editAgent) {
    yield* _(editAgentProfile(parsed.editAgent));
    return;
  }

  const config = yield* _(loadConfig());

  const apiUrl = parsed.apiUrl ?? config.api_url;
  const model = parsed.model ?? config.model;
  const apiKeyVar = config.api_key_var ?? "sk-dummy";

  let apiKey = "sk-dummy";
  if (apiKeyVar !== "sk-dummy") {
    apiKey = process.env[apiKeyVar] ?? "";
  }

  if (!apiKey) {
    return yield* _(
      Effect.fail(
        new Error(
          `Error: Environment variable '${apiKeyVar}' is not set and is required.`
        )
      )
    );
  }

  const systemPrompt = yield* _(loadSystemPrompt(parsed.agent));
  const contextStr = yield* _(buildContext(parsed.fromClipboard, parsed.files));
  const userPrompt = yield* _(getInput(parsed.prompt));

  const finalUserMessage = contextStr
    ? `${contextStr}\n\n---\n\n${userPrompt}`
    : userPrompt;

  if (!finalUserMessage) {
    return yield* _(Effect.fail(new Error("Error: Prompt is empty.")));
  }

  yield* _(
    runChatLoop({
      apiUrl,
      apiKey,
      model,
      systemPrompt,
      userMessage: finalUserMessage,
      maxToolTurns: parsed.maxToolTurns,
      temperature: parsed.temperature,
      topP: parsed.topP,
      interactive: process.stdout.isTTY,
    })
  );
});

Effect.runPromise(main).catch((error) => {
  if (error instanceof Error && error.message) {
    console.error(error.message);
  }
  process.exitCode = 1;
});
