import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
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

const isDirectoryInfo = (info: unknown) =>
  Boolean(
    (info as { type?: string })?.type?.toLowerCase?.() === "directory" ||
      (info as { isDirectory?: () => boolean })?.isDirectory?.()
  );

const isFileInfo = (info: unknown) =>
  Boolean(
    (info as { type?: string })?.type?.toLowerCase?.() === "file" ||
      (info as { isFile?: () => boolean })?.isFile?.()
  );

const parseArgs = (args: string[]): Effect.Effect<ParsedArgs | null> =>
  Effect.gen(function* () {
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
            yield* Effect.sync(() =>
              console.error("Error: Flag '-i' requires a directory argument.")
            );
            yield* Effect.sync(() => console.log(usageText));
            return yield* Effect.fail(new Error("Missing -i argument"));
          }
          ignoreDirs.push(normalizeIgnoreDir(next));
          index += 2;
          break;
        }
        case "-p": {
          const next = args[index + 1];
          if (!next) {
            yield* Effect.sync(() =>
              console.error("Error: Flag '-p' requires a pattern argument.")
            );
            yield* Effect.sync(() => console.log(usageText));
            return yield* Effect.fail(new Error("Missing -p argument"));
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
          yield* Effect.sync(() => console.log(usageText));
          return null;
        default:
          if (arg.startsWith("-")) {
            yield* Effect.sync(() => console.error(`Error: Unknown option '${arg}'`));
            yield* Effect.sync(() => console.log(usageText));
            return yield* Effect.fail(new Error("Unknown option"));
          }
          positional.push(arg);
          index += 1;
      }
    }

    if (positional.length < 2) {
      yield* Effect.sync(() =>
        console.error("Error: Missing target directory or file extension.")
      );
      yield* Effect.sync(() => console.log(usageText));
      return yield* Effect.fail(new Error("Missing arguments"));
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
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files: string[] = [];
    const normalizedExtensions = extensions.map((ext) => ext.toLowerCase());
    const ignoreDirSet = new Set(ignoreDirs.map(normalizeIgnoreDir));

    const walk = (dir: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const entries = yield* fs.readDirectory(dir);
        for (const entry of entries) {
          const name =
            typeof entry === "string"
              ? entry
              : (entry as { name?: string }).name ?? "";
          if (!name) {
            continue;
          }
          const fullPath = path.join(dir, name);
          const info = yield* fs.stat(fullPath);
          if (isDirectoryInfo(info)) {
            const relative = normalizeIgnoreDir(path.relative(rootDir, fullPath));
            if (
              ignoreDirSet.has(name) ||
              ignoreDirSet.has(relative) ||
              matchesPattern(name, ignorePatterns)
            ) {
              continue;
            }
            yield* walk(fullPath);
          } else if (isFileInfo(info)) {
            if (matchesPattern(name, ignorePatterns)) {
              continue;
            }
            const ext = path.extname(name).replace(/^\./, "").toLowerCase();
            if (normalizedExtensions.includes(ext)) {
              files.push(fullPath);
            }
          }
        }
      });

    yield* walk(rootDir);
    return files.sort();
  });

const buildOutput = (rootDir: string, files: string[], log: (message: string) => void) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    let output = "";
    for (const filePath of files) {
      const relative = `./${path.relative(rootDir, filePath)}`;
      log(` -> Adding: ${relative}`);
      const content = yield* fs.readFileString(filePath);
      output += `--- FILE: ${relative} ---\n${content}\n\n`;
    }
    return output;
  });

export const main = Effect.gen(function* () {
  const args = process.argv.slice(2);
  const parsed = yield* parseArgs(args);
  if (!parsed) {
    return;
  }

  const { targetDir, extensions, ignoreDirs, ignorePatterns, stdoutMode } = parsed;

  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const resolvedDir = path.resolve(targetDir);
  const statResult = yield* fs.stat(resolvedDir).pipe(
    Effect.catchAll(() => Effect.succeed(null))
  );

  if (!statResult || !isDirectoryInfo(statResult)) {
    return yield* Effect.fail(
      new Error(`Error: Directory '${targetDir}' not found.`)
    );
  }

  const log = stdoutMode ? console.error : console.log;
  log(`Gathering context from '${targetDir}'...`);

  const files = yield* collectFiles(resolvedDir, extensions, ignoreDirs, ignorePatterns);
  if (files.length === 0) {
    yield* Effect.sync(() =>
      console.error("Warning: No matching files were found. Nothing has been changed or printed.")
    );
    return;
  }

  const output = yield* buildOutput(resolvedDir, files, log);

  if (stdoutMode) {
    process.stdout.write(output);
    return;
  }

  yield* writeClipboard(output);
  log("-----------------------------------------------------");
  log(`Success! Copied content of ${files.length} files to the clipboard.`);
});
