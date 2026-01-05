import { Effect } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runCommand, runCommandInherit } from "../shared/command";

const homeDir = os.homedir();
export const journalDir = path.join(homeDir, "journal");
export const notesDir = path.join(journalDir, "notes");

const normalizeTag = (value: string) =>
  value.replace(/[^A-Za-z0-9_-]/g, "").toLowerCase();

const formatDate = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const dateDaysAgo = (days: number) =>
  formatDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

export const entryPathForDate = (date: string) =>
  path.join(journalDir, `${date}.md`);

export const notePathForSlug = (slug: string) =>
  path.join(notesDir, `${slug}.md`);

const ensureFileExists = (filePath: string, title: string) =>
  Effect.tryPromise(async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    try {
      await fs.access(filePath);
      return;
    } catch {
      await fs.writeFile(filePath, `# ${title}\ntags:\n\n`, {
        flag: "wx",
      });
    }
  });

const readFile = (filePath: string) =>
  Effect.tryPromise(() => fs.readFile(filePath, "utf8"));

const statFile = (filePath: string) => Effect.tryPromise(() => fs.stat(filePath));

export const openEntry = (date: string) =>
  Effect.gen(function* (_) {
    const filePath = entryPathForDate(date);
    yield* _(ensureFileExists(filePath, date));
    yield* _(
      runCommandInherit("nvim", [
        "--cmd",
        "let g:journal_mode=1",
        "+ZenMode",
        filePath,
      ])
    );
  });

export const openNote = (slug: string) =>
  Effect.gen(function* (_) {
    const filePath = notePathForSlug(slug);
    yield* _(ensureFileExists(filePath, slug));
    yield* _(
      runCommandInherit("nvim", [
        "--cmd",
        "let g:journal_mode=1",
        "+ZenMode",
        filePath,
      ])
    );
  });

const readSecondLine = (content: string) => {
  const lines = content.split(/\r?\n/);
  return lines[1] ?? "";
};

export const fileHasTag = (filePath: string, want: string) =>
  Effect.tryPromise(async () => {
    const normalizedWant = normalizeTag(want);
    if (!normalizedWant) {
      return false;
    }

    const content = await fs.readFile(filePath, "utf8");
    const line = readSecondLine(content);

    const hashtags = line.match(/#[A-Za-z0-9_-]+/g) ?? [];
    for (const tag of hashtags) {
      if (normalizeTag(tag.slice(1)) === normalizedWant) {
        return true;
      }
    }

    if (/^\s*tags\s*:/i.test(line)) {
      const stripped = line.replace(/^\s*tags\s*:\s*/i, "");
      const cleaned = stripped.replace(/[\[\],]/g, " ");
      const parts = cleaned.split(/\s+/).filter(Boolean);
      for (const part of parts) {
        if (normalizeTag(part) === normalizedWant) {
          return true;
        }
      }
    }

    return false;
  });

const walkMarkdownFiles = (rootDir: string, excludeDir: string[]) =>
  Effect.tryPromise(async () => {
    const results: string[] = [];

    const walk = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (excludeDir.includes(entry.name)) {
            continue;
          }
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          results.push(fullPath);
        }
      }
    };

    await walk(rootDir);

    return results;
  }).pipe(
    Effect.catchAll((error: any) =>
      error?.code === "ENOENT" ? Effect.succeed([]) : Effect.fail(error)
    )
  );

export const listEntryFiles = (tag?: string) =>
  Effect.gen(function* (_) {
    const entries = yield* _(walkMarkdownFiles(journalDir, ["notes"]));
    const sorted = entries.sort().reverse();

    if (!tag) {
      return sorted;
    }

    const filtered: string[] = [];
    for (const filePath of sorted) {
      const hasTag = yield* _(fileHasTag(filePath, tag));
      if (hasTag) {
        filtered.push(filePath);
      }
    }

    return filtered;
  });

export const listTags = () =>
  Effect.gen(function* (_) {
    const files = yield* _(listEntryFiles());
    const tagSet = new Set<string>();

    for (const filePath of files) {
      const content = yield* _(readFile(filePath));
      const line = readSecondLine(content);

      const hashtags = line.match(/#[A-Za-z0-9_-]+/g) ?? [];
      for (const tag of hashtags) {
        const normalized = normalizeTag(tag.slice(1));
        if (normalized) {
          tagSet.add(normalized);
        }
      }

      if (/^\s*tags\s*:/i.test(line)) {
        const stripped = line.replace(/^\s*tags\s*:\s*/i, "");
        const cleaned = stripped.replace(/[\[\],]/g, " ");
        const parts = cleaned.split(/\s+/).filter(Boolean);
        for (const part of parts) {
          const normalized = normalizeTag(part);
          if (normalized) {
            tagSet.add(normalized);
          }
        }
      }
    }

    return Array.from(tagSet).sort();
  });

export const listNoteSlugs = () =>
  Effect.gen(function* (_) {
    const files = yield* _(walkMarkdownFiles(notesDir, []));
    return files
      .map((filePath) => path.basename(filePath, ".md"))
      .sort();
  });

const getPreviewLine = (content: string) => {
  const lines = content.split(/\r?\n/).slice(0, 12);
  for (const line of lines) {
    if (/^\s*#/.test(line)) {
      continue;
    }
    if (/^\s*tags\s*:/i.test(line)) {
      continue;
    }
    if (!line.trim()) {
      continue;
    }
    return line.slice(0, 80);
  }
  return "";
};

const fzfSelect = (lines: string[], options: {
  prompt?: string;
  preview?: string;
  previewWindow?: string;
  ansi?: boolean;
  noSort?: boolean;
  noMulti?: boolean;
  delimiter?: string;
}) =>
  Effect.gen(function* (_) {
    if (lines.length === 0) {
      return "";
    }

    const args: string[] = [];
    if (options.ansi) args.push("--ansi");
    if (options.noSort) args.push("--no-sort");
    if (options.noMulti) args.push("--no-multi");
    if (options.delimiter) args.push("--delimiter", options.delimiter);
    if (options.preview) args.push("--preview", options.preview);
    if (options.previewWindow)
      args.push("--preview-window", options.previewWindow);
    if (options.prompt) args.push("--prompt", options.prompt);

    const result = yield* _(runCommand("fzf", args, { stdin: `${lines.join("\n")}\n` }));
    if (result.exitCode !== 0) {
      return "";
    }

    return result.stdout.trim();
  });

export const searchByDate = (tag?: string) =>
  Effect.gen(function* (_) {
    const files = yield* _(listEntryFiles(tag));
    const relative = files.map((filePath) => path.relative(journalDir, filePath));
    const selection = yield* _(
      fzfSelect(relative, {
        preview: `cat ${journalDir}/{}`,
        previewWindow: "right:60%:wrap",
        prompt: `Select date${tag ? ` (tag: ${tag})` : ""}: `,
      })
    );

    if (!selection) {
      return;
    }

    yield* _(
      runCommandInherit("nvim", [
        "--cmd",
        "let g:journal_mode=1",
        "+ZenMode",
        path.join(journalDir, selection),
      ])
    );
  });

export const searchByContent = () =>
  Effect.gen(function* (_) {
    const result = yield* _(
      runCommand("rg", [
        "--line-number",
        "--color=always",
        "--smart-case",
        "",
        journalDir,
      ])
    );

    if (!result.stdout) {
      return;
    }

    const selection = yield* _(
      fzfSelect(result.stdout.split(/\n/).filter(Boolean), {
        ansi: true,
        delimiter: ":",
        preview:
          "bat --color=always --highlight-line {2} {1} 2>/dev/null || cat {1}",
        previewWindow: "right:60%:wrap:+{2}-10",
        prompt: "Search content: ",
      })
    );

    if (!selection) {
      return;
    }

    const [file, line] = selection.split(":");
    if (!file || !line) {
      return;
    }

    yield* _(
      runCommandInherit("nvim", [
        "--cmd",
        "let g:journal_mode=1",
        `+${line}`,
        "+ZenMode",
        file,
      ])
    );
  });

export const timelineView = (tag?: string) =>
  Effect.gen(function* (_) {
    const files = yield* _(listEntryFiles(tag));
    const lines: string[] = [];

    for (const filePath of files) {
      const datePart = path.basename(filePath, ".md");
      const content = yield* _(readFile(filePath));
      const previewLine = getPreviewLine(content) || "(empty)";
      lines.push(`${datePart}  \x1b[90m${previewLine}\x1b[0m`);
    }

    const selection = yield* _(
      fzfSelect(lines, {
        ansi: true,
        noSort: true,
        preview: `cat ${journalDir}/{1}.md`,
        previewWindow: "right:65%:wrap",
        prompt: `Timeline${tag ? ` (tag: ${tag})` : ""}: `,
      })
    );

    if (!selection) {
      return;
    }

    const dateSelected = selection.split(/\s+/)[0];
    if (!dateSelected) {
      return;
    }

    yield* _(
      runCommandInherit("nvim", [
        "--cmd",
        "let g:journal_mode=1",
        "+ZenMode",
        path.join(journalDir, `${dateSelected}.md`),
      ])
    );
  });

export const tagBrowse = (tag?: string) =>
  Effect.gen(function* (_) {
    let selectedTag = tag ?? "";
    if (!selectedTag) {
      const tags = yield* _(listTags());
      selectedTag = yield* _(
        fzfSelect(tags, { prompt: "Select tag: ", noMulti: true })
      );
    }

    if (!selectedTag) {
      return;
    }

    yield* _(searchByDate(selectedTag));
  });

export const noteBrowse = (slug?: string) =>
  Effect.gen(function* (_) {
    let selected = slug ?? "";
    if (!selected) {
      const notes = yield* _(listNoteSlugs());
      selected = yield* _(
        fzfSelect(notes, {
          prompt: "Select note: ",
          preview: `cat ${notesDir}/{}.md`,
          previewWindow: "right:60%:wrap",
          noMulti: true,
        })
      );
    }

    if (!selected) {
      return;
    }

    yield* _(openNote(selected));
  });

export const openMostRecent = () =>
  Effect.gen(function* (_) {
    const files = yield* _(walkMarkdownFiles(journalDir, []));
    if (files.length === 0) {
      return yield* _(Effect.fail(new Error("No entries found.")));
    }

    let bestFile = files[0];
    let bestMtime = 0;
    for (const filePath of files) {
      const stats = yield* _(statFile(filePath));
      const mtime = Math.floor(stats.mtimeMs / 1000);
      if (mtime >= bestMtime) {
        bestMtime = mtime;
        bestFile = filePath;
      }
    }

    yield* _(
      runCommandInherit("nvim", [
        "--cmd",
        "let g:journal_mode=1",
        "+ZenMode",
        bestFile,
      ])
    );
  });
