# CLI Scripts

This is a collection of command-line interface (CLI) scripts I use for various tasks, with a focus on helper utilities for working with Large Language Models (LLMs).

## Available Scripts

### `lm`

A powerful, single-shot command-line client for interacting with an OpenAI-compatible LLM API. It's designed for deep integration into terminal workflows.

* **Core Functionality**: Takes a prompt from the command line or `stdin` and streams a Markdown-formatted response from an LLM.
* **Flexible Context**: Can prepend content from files (`-f`) and the system clipboard (`-c`) to your prompt.
* **Agent Personas**: Supports loading (`-a`) and editing (`-e`) different system prompts from files located in `$XDG_CONFIG_HOME/lm/` (or `~/.config/lm/`), allowing you to switch the AI's persona (e.g., `coder`, `writer`) on the fly.
* **Polished Output**: Uses `rich` for a clean user experience with spinners and styled Markdown, and correctly renders Right-to-Left (RTL) languages like Farsi.
* **Self-Contained**: Packaged as a single, portable file using a `uv` script runner, which handles all dependencies automatically.

### `ctx`

A shell script to recursively find, filter, and concatenate the content of multiple files from a directory directly to the system clipboard. It's perfect for quickly gathering a large amount of code or text to use as context for an LLM.

* **Core Functionality**: Scans a directory for files with specific extensions, combines their content into a single block of text, and copies it to the clipboard.
* **Filtering**: Allows you to ignore specific directories (`-i`) like `.git` or `node_modules`, and ignore files based on patterns (`-p`) like `*_test.py`.
* **Cross-Platform**: Automatically detects and uses the correct clipboard utility for macOS (`pbcopy`), Wayland (`wl-copy`), and X11 (`xclip`).
* **Usage**:
    ```sh
    ctx [OPTIONS] <directory> <ext1> [ext2]...
    ```
* **Example**: To gather all `.py` and `.md` files in the current directory, while ignoring the `.venv` directory:
    ```sh
    ctx -i .venv . py md
    ```
