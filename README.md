# lm tools

Small collection of personal CLI tools, rewritten in TypeScript + Effect and run with Bun or Node.

## Requirements
- Bun or Node (>= 18) for the TypeScript CLIs
- For `j`: `nvim`, `fzf`, `rg` (optional: `bat` for nicer previews)

## Install
```sh
bun install
bun link
```

Node (uses `tsx` to run the TypeScript entrypoints):
```sh
npm install
```

## Run
Bun:
```sh
bun run src/j/index.bun.ts
bun run src/ctx/index.bun.ts
bun run src/lm/index.bun.ts
```

Node:
```sh
node --import tsx src/j/index.node.ts
node --import tsx src/ctx/index.node.ts
node --import tsx src/lm/index.node.ts
```

## Tools

### lm
CLI for sending prompts + context to an OpenAI-compatible API (local by default).

Examples:
```sh
lm "Summarize this file" -f notes.txt
cat log.txt | lm -c "Find the error"
lm --edit-agent writing
lm --agent writing "Draft an outline"
```

Config is created at `~/.config/lm/config.json` (or `$XDG_CONFIG_HOME/lm/config.json`):
```json
{
  "model": "local-model",
  "api_url": "http://localhost:1234/v1",
  "api_key_var": "OPENAI_API_KEY"
}
```

Notes:
- `api_key_var` is the name of the environment variable to read. Leave it as `sk-dummy` to skip lookup.
- Agent profiles live in the same config dir as `<name>.md`.
- Models that support tool calls can use the built-in `web_search` tool (DuckDuckGo).

### ctx
Collects files by extension and copies the concatenated content to the clipboard.

Examples:
```sh
ctx . ts tsx -i node_modules -p "*.test.ts"
ctx . md -s > context.txt
```

### j
Journaling helper that opens `~/journal/YYYY-MM-DD.md` in Neovim with search and tag browsing.

Examples:
```sh
j
j -7
j --search
j --tag=work
j --timeline
j --note=ideas
```
