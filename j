#!/usr/bin/env bash

journal_dir="$HOME/journal"
today=$(date +%Y-%m-%d)
filepath="$journal_dir/${today}.md"

# Ensure journal directory exists
mkdir -p "$journal_dir"

usage() {
    echo "Usage: j [option]"
    echo "  (no args)    Open today's journal entry"
    echo "  -d, --date   Search entries by date (fzf + fd)"
    echo "  -s, --search Search entries by content (fzf + rg)"
    echo "  -t, --timeline  Browse entries chronologically with preview"
    echo "  -h, --help   Show this help"
}

# Search by date using fd + fzf
search_by_date() {
    local selected
    selected=$(fd --type f --extension md . "$journal_dir" \
        | sed "s|$journal_dir/||" \
        | sort -r \
        | fzf --preview "cat $journal_dir/{}" \
              --preview-window=right:60%:wrap \
              --prompt="Select date: ")
    
    [[ -n "$selected" ]] && nvim --cmd "let g:journal_mode=1" "+ZenMode" "$journal_dir/$selected"
}

# Search by content using rg + fzf
search_by_content() {
    local selected
    selected=$(rg --line-number --color=always --smart-case "" "$journal_dir" 2>/dev/null \
        | fzf --ansi \
              --delimiter=: \
              --preview "bat --color=always --highlight-line {2} {1} 2>/dev/null || cat {1}" \
              --preview-window=right:60%:wrap:+{2}-10 \
              --prompt="Search content: ")
    
    if [[ -n "$selected" ]]; then
        local file line
        file=$(echo "$selected" | cut -d: -f1)
        line=$(echo "$selected" | cut -d: -f2)
        nvim --cmd "let g:journal_mode=1" "+$line" "+ZenMode" "$file"
    fi
}

# Get first meaningful line of content (skip heading and blank lines)
get_preview_line() {
    local file="$1"
    sed -n '1,10p' "$file" | grep -v '^#' | grep -v '^[[:space:]]*$' | head -1 | cut -c1-60
}

# Timeline view - browse chronologically with first line preview
timeline_view() {
    local selected
    selected=$(
        for file in $(fd --type f --extension md . "$journal_dir" | sort -r); do
            local date_part preview_line
            date_part=$(basename "$file" .md)
            preview_line=$(get_preview_line "$file")
            if [[ -n "$preview_line" ]]; then
                printf "%s  \033[90m%s\033[0m\n" "$date_part" "$preview_line"
            else
                printf "%s  \033[90m(empty)\033[0m\n" "$date_part"
            fi
        done | fzf --ansi \
                   --preview "cat $journal_dir/{1}.md" \
                   --preview-window=right:65%:wrap \
                   --prompt="Timeline: " \
                   --no-sort
    )
    
    if [[ -n "$selected" ]]; then
        local date_selected
        date_selected=$(echo "$selected" | awk '{print $1}')
        nvim --cmd "let g:journal_mode=1" "+ZenMode" "$journal_dir/${date_selected}.md"
    fi
}

# Create today's entry with template if it doesn't exist
create_today() {
    if [[ ! -f "$filepath" ]]; then
        cat > "$filepath" << EOF
# $today

EOF
    fi
    nvim --cmd "let g:journal_mode=1" "+ZenMode" "$filepath"
}

case "${1:-}" in
    -d|--date)
        search_by_date
        ;;
    -s|--search)
        search_by_content
        ;;
    -t|--timeline)
        timeline_view
        ;;
    -h|--help)
        usage
        ;;
    "")
        create_today
        ;;
    *)
        echo "Unknown option: $1"
        usage
        exit 1
        ;;
esac
