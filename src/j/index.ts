#!/usr/bin/env bun
import { Effect } from "effect";
import {
  dateDaysAgo,
  journalDir,
  noteBrowse,
  openEntry,
  openMostRecent,
  searchByContent,
  searchByDate,
  tagBrowse,
  timelineView,
} from "./actions";
import * as fs from "node:fs/promises";

const usageText = `Usage: j [options] | j -N

  (no args)          Open today's journal entry
  -N                 Open entry for N days ago (e.g. -1 = yesterday, -7 = 7 days ago)

Browse/search:
  -d, --date         Select entry by date (fzf + fd)
  -s, --search       Search entries by content (fzf + rg)  [full scan]

Timeline:
  -l, --timeline     Browse entries chronologically with preview
                     Combine with tag filter: j -l -t=ai

Tags (line 2 only, not full document):
  -t, --tag TAG      Browse entries that contain TAG on line 2
  -t, --tag          Pick a tag from a list, then browse entries
  -t=TAG, --tag=TAG  Same (example: j -t=ai)

  -h, --help         Show this help

Tag conventions supported (line 2 only):
  - tags: ai, work
  - tags: [ai, work]
  - hashtags: #ai #work

Notes:
  -n, --note [SLUG]  Open note (if SLUG omitted, pick from list)
  -n=SLUG, --note=SLUG
  -c, --continue     Open most recently modified entry (daily or note)
`;

type Mode =
  | "today"
  | "offset"
  | "date"
  | "search"
  | "timeline"
  | "tag"
  | "note"
  | "continue";

type ParsedArgs = {
  mode: Mode;
  tag?: string;
  daysAgo?: number;
  noteSlug?: string;
};

const formatDate = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const parseArgs = (args: string[]): Effect.Effect<ParsedArgs | null> =>
  Effect.gen(function* (_) {
    if (args.length === 1 && /^-\d+$/.test(args[0])) {
      return { mode: "offset", daysAgo: Number(args[0].slice(1)) } satisfies ParsedArgs;
    }

    let mode: Mode = "today";
    let tag: string | undefined;
    let daysAgo: number | undefined;
    let noteSlug: string | undefined;

    let index = 0;
    while (index < args.length) {
      const arg = args[index];

      switch (arg) {
        case "-h":
        case "--help":
          yield* _(Effect.sync(() => console.log(usageText)));
          return null;
        case "-d":
        case "--date":
          mode = "date";
          index += 1;
          break;
        case "-s":
        case "--search":
          mode = "search";
          index += 1;
          break;
        case "-l":
        case "--timeline":
          mode = "timeline";
          index += 1;
          break;
        case "-t":
        case "--tag": {
          const next = args[index + 1];
          if (next && !next.startsWith("-")) {
            tag = next;
            index += 2;
          } else {
            tag = "";
            index += 1;
          }
          if (mode === "today") mode = "tag";
          break;
        }
        case "-n":
        case "--note": {
          mode = "note";
          const next = args[index + 1];
          if (next && !next.startsWith("-")) {
            noteSlug = next;
            index += 2;
          } else {
            index += 1;
          }
          break;
        }
        case "-c":
        case "--continue":
          mode = "continue";
          index += 1;
          break;
        default: {
          if (arg.startsWith("--tag=")) {
            tag = arg.slice("--tag=".length);
            if (mode === "today") mode = "tag";
            index += 1;
            break;
          }
          if (arg.startsWith("-t=")) {
            tag = arg.slice(3);
            if (mode === "today") mode = "tag";
            index += 1;
            break;
          }
          if (arg.startsWith("--note=")) {
            mode = "note";
            noteSlug = arg.slice("--note=".length);
            index += 1;
            break;
          }
          if (arg.startsWith("-n=")) {
            mode = "note";
            noteSlug = arg.slice(3);
            index += 1;
            break;
          }
          if (/^-\d+$/.test(arg)) {
            daysAgo = Number(arg.slice(1));
            mode = "offset";
            index += 1;
            break;
          }

          yield* _(Effect.sync(() => console.error(`Unknown option: ${arg}`)));
          yield* _(Effect.sync(() => console.log(usageText)));
          return yield* _(Effect.fail(new Error("Unknown option")));
        }
      }
    }

    return { mode, tag, daysAgo, noteSlug } satisfies ParsedArgs;
  });

const main = Effect.gen(function* (_) {
  const args = process.argv.slice(2);
  const parsed = yield* _(parseArgs(args));
  if (!parsed) {
    return;
  }

  yield* _(Effect.tryPromise(() => fs.mkdir(journalDir, { recursive: true })));

  switch (parsed.mode) {
    case "today":
      yield* _(openEntry(formatDate(new Date())));
      break;
    case "offset":
      if (parsed.daysAgo === undefined) {
        return;
      }
      yield* _(openEntry(dateDaysAgo(parsed.daysAgo)));
      break;
    case "date":
      yield* _(searchByDate(parsed.tag));
      break;
    case "search":
      yield* _(searchByContent());
      break;
    case "timeline":
      yield* _(timelineView(parsed.tag));
      break;
    case "tag":
      yield* _(tagBrowse(parsed.tag));
      break;
    case "note":
      yield* _(noteBrowse(parsed.noteSlug));
      break;
    case "continue":
      yield* _(openMostRecent());
      break;
    default:
      yield* _(Effect.fail(new Error(`Unknown mode: ${parsed.mode}`)));
  }
});

Effect.runPromise(main).catch((error) => {
  if (error instanceof Error && error.message) {
    console.error(error.message);
  }
  process.exitCode = 1;
});
