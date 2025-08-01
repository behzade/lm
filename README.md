# lm — A CLI Chat Client for OpenAI‑compatible LLMs

A single‑file terminal client for chatting with OpenAI‑compatible APIs. Designed for fast CLI workflows with streaming Markdown, tool use, context injection, and agent personas.

## Highlights
- One‑shot prompts via argv or stdin with live streaming output
- Add context from files (-f) and clipboard (-c)
- Agent personas (-a) stored in ~/.config/lm/ (or $XDG_CONFIG_HOME/lm/); edit with -e
- Clean TUI: spinners, syntax highlighting, RTL text support
- Tool use: web_search
- Self‑contained via uv runner (deps auto‑installed)

## Installation
1) Install uv: https://github.com/astral-sh/uv
2) Make executable and place on PATH:
   chmod +x lm
   mv lm /usr/local/bin/lm

Shebang uses: uv run --script. All Python deps are declared in the script header and managed by uv.

## Configuration
Config path:
- Linux/macOS: $XDG_CONFIG_HOME/lm/config.json or ~/.config/lm/config.json

First run creates default:
```json
{
  "model": "local-model",
  "api_url": "http://localhost:1234/v1",
  "api_key_var": "sk-dummy"
}
```
- model: Target model name
- api_url: OpenAI‑compatible base URL (LM Studio, llama.cpp server, proxies)
- api_key_var: Env var name for API key; if "sk-dummy", no env var required

Export your key if needed, then set api_key_var accordingly:
  export OPENAI_API_KEY=sk-...

## Agent Personas
Persona files live in ~/.config/lm/ (or $XDG_CONFIG_HOME/lm/). Examples: coder.md, writer.md
- Create/edit: lm -e coder
- Use:        lm -a coder "Refactor this function"
When an agent is used, today’s date is appended to the system prompt.

## Usage
Generate a git commit message:
```sh
    git diff HEAD | lm "generate a git commit"
```
Tldr for man pages:
```sh
man find | lm "how do I find all go files excluding test ones"
```

Filter through docker logs:
```sh
docker compose logs worker --tail 200 | lm "filter critical failures into a table"
```

Translate:
```sh
lm -c -a translator "Translate this to italian"
```

Generate a readme:
```sh
ctx . rs -i target -i .devbox -s | lm "generate a readme for this project" > readme.md
```

Summarize a repo:
```sh
ctx -i .git -i node_modules . py md
lm -c "Summarize the repo and outline TODOs"
```

Or with -s flag of ctx to output to stdout:
  ```sh
  ctx -s -i .git -i node_modules . py md | lm -c "Summarize the repo and outline TODOs"
  ```

## Options
```sh
- prompt (arg)              User prompt; if omitted, reads from stdin
- -f, --file PATH           Include file content (repeatable)
- -c, --from-clipboard      Include system clipboard content
- -a, --agent NAME          Load agent persona from config dir
- -e, --edit-agent NAME     Create/edit persona in $EDITOR (default: nano)
- -m, --model NAME          Override configured model
- -u, --api-url URL         Override API base URL
- -l, --max-tool-turns N    Max tool-use turns (default: 5)
- -t, --temperature FLOAT   Sampling temperature (default: 0.2)
- -p, --top-p FLOAT         Nucleus sampling p (default: 0.95)
```

## Streaming, Markdown, RTL
Live streaming with spinner. Renders Markdown and code with syntax highlighting. RTL languages (e.g., Farsi/Arabic) are reshaped/reordered for terminals lacking native RTL support.

## Tools
The client supports OpenAI function-calling tools.

1) web_search
   - Uses DuckDuckGo (ddgs)
   - Returns sources with titles, snippets, URLs

## Token Counters
At end of run, prints token counts if available, e.g. ->:123 <-:456

## Exit Codes
- 1   API/config errors
- 130 Ctrl-C
Readable messages are shown for file/clipboard issues.

## Tips
- Pipe large context via stdin; add -f files for structure
- Keep reusable system prompts as agent files
- Use -l 1 to force a single assistant turn with no tool calls on the final round

## Related: ctx
The companion ctx script recursively gathers files by extension, filters paths, and copies aggregate text to the clipboard—useful for assembling context before lm.
