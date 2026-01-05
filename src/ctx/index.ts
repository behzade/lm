#!/usr/bin/env bun
import { Effect } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { writeClipboard } from "../shared/clipboard";
import { minimatch } from "minimatch";

const usageText = `Usage: ctx [OPTIONS] <directory> <ext1> [ext2]...
  Gathers content from a directory and copies it to the system clipboard or prints to stdout.

Arguments:
  <directory>       The target directory to scan.
  <ext1> [ext2]...  One or more file extensions to include.

Options:
  -i <dir>          Directory to ignore (e.g., -i .git -i node_modules).
  -p <pattern>      Filename pattern to ignore (e.g., -p '*_test.lua').
  -s, --stdout      Print to stdout instead of clipboard. Hides progress messages.
  -h, --help        Show this help message.

Examples:
  ctx . lua                  # Gathers all .lua files and copies to clipboard.
  ctx . py -s | wc -l        # Prints all .py files to stdout and counts the lines.
`;

type ParsedArgs = {
  targetDir: string;
  extensions: string[];
  ignoreDirs: string[];
  ignorePatterns: string[];
  stdoutMode: boolean;
};

const normalizeIgnoreDir = (value: string) =>
  value.replace(/\\/g, "/").replace(/\/+$/, "").replace(/^\.\//, "");

const parseArgs = (args: string[]): Effect.Effect<ParsedArgs | null> =>
  Effect.gen(function* (_) {
    const ignoreDirs: string[] = [];
    const ignorePatterns: string[] = [];
    const positional: string[] = [];
    let stdoutMode = false;

    let index = 0;
    while (index < args.length) {
      const arg = args[index];
      switch (arg) {
        case "-i": {
          const next = args[index + 1];
          if (!next) {
            yield* _(Effect.sync(() => console.error("Error: Flag '-i' requires a directory argument.")));
            yield* _(Effect.sync(() => console.log(usageText)));
            return yield* _(Effect.fail(new Error("Missing -i argument")));
          }
          ignoreDirs.push(normalizeIgnoreDir(next));
          index += 2;
          break;
        }
        case "-p": {
          const next = args[index + 1];
          if (!next) {
            yield* _(Effect.sync(() => console.error("Error: Flag '-p' requires a pattern argument.")));
            yield* _(Effect.sync(() => console.log(usageText)));
            return yield* _(Effect.fail(new Error("Missing -p argument")));
          }
          ignorePatterns.push(next);
          index += 2;
          break;
        }
        case "-s":
        case "--stdout":
          stdoutMode = true;
          index += 1;
          break;
        case "-h":
        case "--help":
          yield* _(Effect.sync(() => console.log(usageText)));
          return null;
        default:
          if (arg.startsWith("-")) {
            yield* _(Effect.sync(() => console.error(`Error: Unknown option '${arg}'`)));
            yield* _(Effect.sync(() => console.log(usageText)));
            return yield* _(Effect.fail(new Error("Unknown option")));
          }
          positional.push(arg);
          index += 1;
      }
    }

    if (positional.length < 2) {
      yield* _(Effect.sync(() => console.error("Error: Missing target directory or file extension.")));
      yield* _(Effect.sync(() => console.log(usageText)));
      return yield* _(Effect.fail(new Error("Missing arguments")));
    }

    const targetDir = positional[0];
    const extensions = positional.slice(1).map((ext) => ext.replace(/^\./, ""));

    return { targetDir, extensions, ignoreDirs, ignorePatterns, stdoutMode } satisfies ParsedArgs;
  });

const matchesPattern = (name: string, patterns: string[]) => {
  for (const pattern of patterns) {
    if (minimatch(name, pattern, { matchBase: true })) {
      return true;
    }
  }
  return false;
};

const collectFiles = (
  rootDir: string,
  extensions: string[],
  ignoreDirs: string[],
  ignorePatterns: string[]
) =>
  Effect.tryPromise(async () => {
    const files: string[] = [];
    const normalizedExtensions = extensions.map((ext) => ext.toLowerCase());
    const ignoreDirSet = new Set(ignoreDirs.map(normalizeIgnoreDir));

    const walk = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const relative = normalizeIgnoreDir(path.relative(rootDir, fullPath));
          if (
            ignoreDirSet.has(entry.name) ||
            ignoreDirSet.has(relative) ||
            matchesPattern(entry.name, ignorePatterns)
          ) {
            continue;
          }
          await walk(fullPath);
        } else if (entry.isFile()) {
          if (matchesPattern(entry.name, ignorePatterns)) {
            continue;
          }
          const ext = path.extname(entry.name).replace(/^\./, "").toLowerCase();
          if (normalizedExtensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    };

    await walk(rootDir);
    return files.sort();
  });

const buildOutput = (rootDir: string, files: string[], log: (message: string) => void) =>
  Effect.gen(function* (_) {
    let output = "";
    for (const filePath of files) {
      const relative = `./${path.relative(rootDir, filePath)}`;
      log(` -> Adding: ${relative}`);
      const content = yield* _(Effect.tryPromise(() => fs.readFile(filePath, "utf8")));
      output += `--- FILE: ${relative} ---\n${content}\n\n`;
    }
    return output;
  });

const main = Effect.gen(function* (_) {
  const args = process.argv.slice(2);
  const parsed = yield* _(parseArgs(args));
  if (!parsed) {
    return;
  }

  const { targetDir, extensions, ignoreDirs, ignorePatterns, stdoutMode } = parsed;

  const resolvedDir = path.resolve(targetDir);
  const statResult = yield* _(
    Effect.tryPromise(() => fs.stat(resolvedDir)).pipe(
      Effect.catchAll(() => Effect.succeed(null))
    )
  );

  if (!statResult || !statResult.isDirectory()) {
    return yield* _(
      Effect.fail(new Error(`Error: Directory '${targetDir}' not found.`))
    );
  }

  const log = stdoutMode ? console.error : console.log;
  log(`Gathering context from '${targetDir}'...`);

  const files = yield* _(collectFiles(resolvedDir, extensions, ignoreDirs, ignorePatterns));
  if (files.length === 0) {
    yield* _(Effect.sync(() => console.error("Warning: No matching files were found. Nothing has been changed or printed.")));
    return;
  }

  const output = yield* _(buildOutput(resolvedDir, files, log));

  if (stdoutMode) {
    process.stdout.write(output);
    return;
  }

  yield* _(writeClipboard(output));
  log("-----------------------------------------------------");
  log(`Success! Copied content of ${files.length} files to the clipboard.`);
});

Effect.runPromise(main).catch((error) => {
  if (error instanceof Error && error.message) {
    console.error(error.message);
  }
  process.exitCode = 1;
});
