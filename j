#!/usr/bin/env bash
set -euo pipefail

journal_dir="$HOME/journal"
notes_dir="$journal_dir/notes"

usage() {
  cat <<'EOF'
Usage: j [options] | j -N

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
EOF
}

# Cross-platform date: GNU date vs BSD date (macOS)
date_days_ago() {
  local n="$1"
  if date -d "today - ${n} day" +%Y-%m-%d >/dev/null 2>&1; then
    date -d "today - ${n} day" +%Y-%m-%d
  else
    # BSD date (macOS)
    date -v -"${n}"d +%Y-%m-%d
  fi
}

entry_path_for_date() {
  local d="$1"
  printf "%s/%s.md" "$journal_dir" "$d"
}

note_path_for_slug() {
  local slug="$1"
  printf "%s/%s.md" "$notes_dir" "$slug"
}

ensure_entry_exists() {
  local d="$1"
  local path
  path="$(entry_path_for_date "$d")"
  if [[ ! -f "$path" ]]; then
    cat >"$path" <<EOF
# $d
tags:

EOF
  fi
}

ensure_note_exists() {
  local slug="$1"
  local path
  path="$(note_path_for_slug "$slug")"
  if [[ ! -f "$path" ]]; then
    cat >"$path" <<EOF
# $slug
tags:

EOF
  fi
}

open_entry() {
  local d="$1"
  mkdir -p "$journal_dir"
  ensure_entry_exists "$d"
  nvim --cmd "let g:journal_mode=1" "+ZenMode" "$(entry_path_for_date "$d")"
}

open_note() {
  local slug="$1"
  mkdir -p "$notes_dir"
  ensure_note_exists "$slug"
  nvim --cmd "let g:journal_mode=1" "+ZenMode" "$(note_path_for_slug "$slug")"
}

# Tag match ONLY on line 2.
# Supports on line 2:
#   tags: ai, work
#   tags: [ai, work]
#   #ai #work
file_has_tag() {
  local file="$1"
  local want="$2"

  awk -v want="$want" '
    function norm(s) { gsub(/[^A-Za-z0-9_-]/, "", s); return tolower(s) }

    BEGIN { w = norm(want); found = 0 }

    NR == 2 {
      line = $0

      # 1) hashtags: #ai #work
      while (match(line, /#[A-Za-z0-9_-]+/)) {
        t = substr(line, RSTART+1, RLENGTH-1)
        if (norm(t) == w) { found = 1; exit }
        line = substr(line, RSTART + RLENGTH)
      }

      # 2) tags: ...   (CSV / space-separated / YAML list)
      if (tolower(line) ~ /^[[:space:]]*tags[[:space:]]*:/) {
        sub(/^[[:space:]]*[Tt]ags[[:space:]]*:[[:space:]]*/, "", line)
        gsub(/[\[\],]/, " ", line)
        n = split(line, a, /[[:space:]]+/)
        for (i = 1; i <= n; i++) {
          if (a[i] != "" && norm(a[i]) == w) { found = 1; exit }
        }
      }
      exit
    }

    END { exit (found ? 0 : 1) }
  ' "$file"
}

# List markdown files, optionally filtered by tag (header-only).
list_entry_files() {
  local tag="${1:-}"

  if [[ -z "$tag" ]]; then
    fd --type f --extension md . "$journal_dir" --exclude 'notes' 2>/dev/null | sort -r
    return
  fi

  fd --type f --extension md . "$journal_dir" --exclude 'notes' 2>/dev/null \
    | while IFS= read -r file; do
        if file_has_tag "$file" "$tag"; then
          echo "$file"
        fi
      done \
    | sort -r
}

# List tags from line 2 across entries (normalized, lowercase).
list_tags() {
  list_entry_files \
    | while IFS= read -r file; do
        awk '
          function norm(s) { gsub(/[^A-Za-z0-9_-]/, "", s); return tolower(s) }
          NR == 2 {
            line = $0
            while (match(line, /#[A-Za-z0-9_-]+/)) {
              t = substr(line, RSTART+1, RLENGTH-1)
              n = norm(t)
              if (n != "") print n
              line = substr(line, RSTART + RLENGTH)
            }
            if (tolower($0) ~ /^[[:space:]]*tags[[:space:]]*:/) {
              sub(/^[[:space:]]*[Tt]ags[[:space:]]*:[[:space:]]*/, "", $0)
              gsub(/[\[\],]/, " ", $0)
              n = split($0, a, /[[:space:]]+/)
              for (i = 1; i <= n; i++) {
                t = norm(a[i])
                if (t != "") print t
              }
            }
            exit
          }
        ' "$file"
      done \
    | sort -u
}

# List note slugs (without .md).
list_note_slugs() {
  fd --type f --extension md . "$notes_dir" 2>/dev/null \
    | sed "s|^$notes_dir/||" \
    | sed 's/\.md$//' \
    | sort
}

# Get first meaningful line of content (skip heading and blank lines)
get_preview_line() {
  local file="$1"
  sed -n '1,12p' "$file" \
    | grep -v '^#' \
    | grep -vi '^[[:space:]]*tags[[:space:]]*:' \
    | grep -v '^[[:space:]]*$' \
    | head -1 \
    | cut -c1-80
}

search_by_date() {
  local tag="${1:-}"
  local selected
  selected=$(
    list_entry_files "$tag" \
      | sed "s|^$journal_dir/||" \
      | fzf --preview "cat $journal_dir/{}" \
            --preview-window=right:60%:wrap \
            --prompt="Select date${tag:+ (tag: $tag)}: "
  )
  [[ -n "${selected:-}" ]] && nvim --cmd "let g:journal_mode=1" "+ZenMode" "$journal_dir/$selected"
}

search_by_content() {
  local selected
  selected=$(rg --line-number --color=always --smart-case "" "$journal_dir" 2>/dev/null \
    | fzf --ansi \
          --delimiter=: \
          --preview "bat --color=always --highlight-line {2} {1} 2>/dev/null || cat {1}" \
          --preview-window=right:60%:wrap:+{2}-10 \
          --prompt="Search content: ")

  if [[ -n "${selected:-}" ]]; then
    local file line
    file="$(echo "$selected" | cut -d: -f1)"
    line="$(echo "$selected" | cut -d: -f2)"
    nvim --cmd "let g:journal_mode=1" "+$line" "+ZenMode" "$file"
  fi
}

timeline_view() {
  local tag="${1:-}"
  local selected

  selected=$(
    list_entry_files "$tag" \
      | while IFS= read -r file; do
          date_part="$(basename "$file" .md)"
          preview_line="$(get_preview_line "$file")"
          if [[ -n "$preview_line" ]]; then
            printf "%s  \033[90m%s\033[0m\n" "$date_part" "$preview_line"
          else
            printf "%s  \033[90m(empty)\033[0m\n" "$date_part"
          fi
        done \
      | fzf --ansi \
            --preview "cat $journal_dir/{1}.md" \
            --preview-window=right:65%:wrap \
            --prompt="Timeline${tag:+ (tag: $tag)}: " \
            --no-sort
  )

  if [[ -n "${selected:-}" ]]; then
    date_selected="$(awk '{print $1}' <<<"$selected")"
    nvim --cmd "let g:journal_mode=1" "+ZenMode" "$journal_dir/${date_selected}.md"
  fi
}

tag_browse() {
  local tag="$1"
  if [[ -z "$tag" ]]; then
    tag="$(
      list_tags \
        | fzf --prompt="Select tag: " \
              --no-multi
    )"
  fi

  if [[ -z "$tag" ]]; then
    exit 0
  fi

  # Reuse the date selector, but constrained to the tag.
  search_by_date "$tag"
}

note_browse() {
  local slug="$1"
  if [[ -z "$slug" ]]; then
    slug="$(
      list_note_slugs \
        | fzf --prompt="Select note: " \
              --preview "cat $notes_dir/{}.md" \
              --preview-window=right:60%:wrap \
              --no-multi
    )"
  fi

  if [[ -z "$slug" ]]; then
    exit 0
  fi

  open_note "$slug"
}

file_mtime() {
  local file="$1"
  if stat -f %m "$file" >/dev/null 2>&1; then
    stat -f %m "$file"
  else
    stat -c %Y "$file"
  fi
}

open_most_recent() {
  local file=""
  local best_ts=0
  local mtime

  while IFS= read -r f; do
    mtime="$(file_mtime "$f" 2>/dev/null || true)"
    [[ -z "$mtime" ]] && continue
    if [[ "$mtime" -ge "$best_ts" ]]; then
      best_ts="$mtime"
      file="$f"
    fi
  done < <(fd --type f --extension md . "$journal_dir" 2>/dev/null)

  if [[ -z "$file" ]]; then
    echo "No entries found." >&2
    exit 1
  fi

  nvim --cmd "let g:journal_mode=1" "+ZenMode" "$file"
}

main() {
  mkdir -p "$journal_dir"

  local mode="today"
  local tag=""
  local days_ago=""
  local note_slug=""

  # Special case: single arg like -1 / -7
  if [[ $# -eq 1 && "${1:-}" =~ ^-[0-9]+$ ]]; then
    days_ago="${1#-}"
    mode="offset"
  else
    # General arg parsing (supports combining --timeline with --tag)
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -h|--help)
          usage
          exit 0
          ;;
        -d|--date)
          mode="date"
          shift
          ;;
        -s|--search)
          mode="search"
          shift
          ;;
        -l|--timeline)
          mode="timeline"
          shift
          ;;
        -t|--tag)
          shift
          tag="${1:-}"
          shift || true
          # If only a tag is provided, default to tag browsing
          [[ "$mode" == "today" ]] && mode="tag"
          ;;
        -t=*|--tag=*)
          tag="${1#*=}"
          shift
          [[ "$mode" == "today" ]] && mode="tag"
          ;;
        -n|--note)
          mode="note"
          shift
          if [[ $# -gt 0 && "${1:-}" != -* ]]; then
            note_slug="$1"
            shift
          fi
          ;;
        -n=*|--note=*)
          mode="note"
          note_slug="${1#*=}"
          shift
          ;;
        -c|--continue)
          mode="continue"
          shift
          ;;
        -[0-9]*)
          # Allow -N among other args (last one wins)
          if [[ "$1" =~ ^-[0-9]+$ ]]; then
            days_ago="${1#-}"
            mode="offset"
            shift
          else
            echo "Unknown option: $1" >&2
            usage
            exit 1
          fi
          ;;
        *)
          echo "Unknown option: $1" >&2
          usage
          exit 1
          ;;
      esac
    done
  fi

  case "$mode" in
    today)
      open_entry "$(date +%Y-%m-%d)"
      ;;
    offset)
      d="$(date_days_ago "$days_ago")"
      open_entry "$d"
      ;;
    date)
      search_by_date "$tag"
      ;;
    search)
      search_by_content
      ;;
    timeline)
      timeline_view "$tag"
      ;;
    tag)
      tag_browse "$tag"
      ;;
    note)
      note_browse "$note_slug"
      ;;
    continue)
      open_most_recent
      ;;
    *)
      echo "Unknown mode: $mode" >&2
      exit 1
      ;;
  esac
}

main "$@"
