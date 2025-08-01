# lm — A CLI Chat Client for OpenAI-compatible LLMs

A single-file command-line client for chatting with OpenAI-compatible APIs. Built for terminal workflows, with streaming Markdown output, tool use, context injection, and agent personas.

## Highlights

- Single-shot prompts from argv or stdin, with live streaming output.
- Context from files (-f) and clipboard (-c).
- Agent personas (-a) loaded from ~/.config/lm/ (or $XDG_CONFIG_HOME/lm/).
- Create/edit agent prompts (-e) in your editor.
- Clean TUI: rich spinners, syntax highlighting, RTL text support.
- Tool use: web_search and write_to_file with interactive confirmation.
- Self-contained via uv runner (installs deps automatically).

## Installation

1) Ensure you have uv installed (https://github.com/astral-sh/uv).
2) Make the script executable and place it on your PATH:

   chmod +x lm
   mv lm /usr/local/bin/lm   # or anywhere on PATH

The shebang uses: uv run --script
All Python dependencies are declared in the script header and auto-managed by uv.

## Configuration

Config lives at:
- Linux/macOS: $XDG_CONFIG_HOME/lm/config.json or ~/.config/lm/config.json

On first run, a default config is created:
{
  "model": "local-model",
  "api_url": "http://localhost:1234/v1",
  "api_key_var": "sk-dummy"
}

- model: Model name for your target server.
- api_url: Base URL of an OpenAI-compatible API (e.g., LM Studio, llama.cpp server, OpenAI proxy).
- api_key_var: Name of the env var holding your API key. If set to "sk-dummy", no env var is required.

Export your key if needed:
  export OPENAI_API_KEY=sk-... then set "api_key_var": "OPENAI_API_KEY" in config.json

## Agent Personas

Agent prompt files live in ~/.config/lm/ (or $XDG_CONFIG_HOME/lm/). Example: coder.md, writer.md.

- Create/edit: lm -e coder
- Use:        lm -a coder "Refactor this function"

When an agent is used, the script appends today’s date to the system prompt.

## Usage

Basic:
  echo "Explain RAG" | lm
  lm "Write a bash script to list large files"

Add context from files and clipboard:
  lm -f README.md -f main.py -c "Summarize"

Choose model and API endpoint:
  lm -m mistral -u http://localhost:8080/v1 "Summarize this"

Sampling controls:
  lm -t 0.2 -p 0.95 "Give me 3 ideas"

Limit tool turns (chain-of-thought with tools):
  lm -l 3 "Find latest release notes for project X and save a summary"

## Options

- prompt (arg)     The user prompt. If omitted, reads from stdin.
- -f, --file PATH  Add file content to context. Repeatable.
- -c, --from-clipboard  Include system clipboard content.
- -a, --agent NAME Load agent persona from config dir.
- -e, --edit-agent NAME  Create/edit an agent persona in $EDITOR (default: nano).
- -m, --model NAME Override configured model.
- -u, --api-url URL Override configured API base URL.
- -l, --max-tool-turns N  Max tool-use turns (default: 5).
- -t, --temperature FLOAT Sampling temperature (default: 0.2).
- -p, --top-p FLOAT Nucleus sampling p (default: 0.95).

## Streaming, Markdown, and RTL

Responses stream live with a spinner. Rich renders Markdown, code blocks, and syntax highlighting. RTL languages (e.g., Farsi/Arabic) are reshaped/reordered for terminals that lack native RTL support.

## Tools

The client can call tools via the OpenAI function-calling interface.

Available tools:

1) web_search
   - Uses DuckDuckGo (ddgs) to retrieve results.
   - Returns a formatted list of sources with titles, snippets, and URLs.

2) write_to_file
   - Proposes creating a new file with provided content.
   - Interactive preview with syntax highlighting and y/Enter or n/Esc confirmation.
   - Fails if the target file already exists.

You’ll see a "Tool call(s) requested by model..." notice when tools are invoked.

## Token Counters

At the end of a run, input and output token counts are shown if available, e.g.:
  ->:123 <-:456

## Exit Codes and Errors

- Returns 1 on API/config errors.
- Returns 130 on Ctrl-C.
- Displays readable messages for file/clipboard issues.

## Tips

- Pipe large context in via stdin, and still reference files with -f for structure.
- Keep reusable system prompts as agent files for quick switching.
- Use -l 1 to force a single assistant turn with no tool calls on the final round.

## Related utility: ctx

The companion ctx script recursively gathers files by extension, filters paths, and copies the aggregate text to the clipboard. Great for assembling context before calling lm.

Example:
```
  ctx -i .git -i node_modules . py md
  lm -c "Summarize the repo and outline TODOs"
```
