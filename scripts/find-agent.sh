#!/usr/bin/env bash
# ==============================================================================
# KendaliAI - Agent Discovery Tool (find-agent.sh)
#
# Discovers installed ACP (Agent Client Protocol) and autonomous coding agent
# engines on the local system, queries versions, checks protocols, and verifies
# compatibility with KendaliAI.
#
# Supported Engines:
#   - Google Antigravity (agy)
#   - Command Code (commandcode / cmd)
#   - OpenCode (opencode)
#   - Oh My Pi (omp / ohmypi)
#   - Pi Coding Agent (pi)
#   - Claude Code (claude / claude-code)
#   - OpenAI Codex (codex)
#   - Google Gemini CLI (gemini)
# ==============================================================================

set -o pipefail

# --- Color and Styling ---
USE_COLOR=true
if [ -t 1 ]; then
  if [ -n "${NO_COLOR:-}" ]; then
    USE_COLOR=false
  fi
else
  USE_COLOR=false
fi

# Parse CLI flags
SHOW_JSON=false
FILTER="all" # all | installed | missing
CHECK_GATEWAY=false
GATEWAY_URL="http://localhost:8080"

for arg in "$@"; do
  case "$arg" in
    --json|-j)
      SHOW_JSON=true
      USE_COLOR=false
      ;;
    --installed|-i)
      FILTER="installed"
      ;;
    --missing|-m)
      FILTER="missing"
      ;;
    --gateway|-g)
      CHECK_GATEWAY=true
      ;;
    --no-color)
      USE_COLOR=false
      ;;
    --help|-h)
      cat <<EOF
KendaliAI Agent Discovery Tool

Usage:
  ./scripts/find-agent.sh [options]

Options:
  -j, --json         Output results as a structured JSON array
  -i, --installed    Show only installed agents
  -m, --missing      Show only missing / uninstalled agents
  -g, --gateway      Cross-check discovery status with running KendaliAI gateway API
      --no-color     Disable ANSI colored output
  -h, --help         Display this help message

Examples:
  ./scripts/find-agent.sh
  ./scripts/find-agent.sh --installed
  ./scripts/find-agent.sh --json | jq .
  ./scripts/find-agent.sh --gateway
EOF
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      echo "Run with --help for usage." >&2
      exit 1
      ;;
  esac
done

if [ "$USE_COLOR" = true ]; then
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  GREEN=$'\033[32m'
  RED=$'\033[31m'
  YELLOW=$'\033[33m'
  BLUE=$'\033[34m'
  CYAN=$'\033[36m'
  MAGENTA=$'\033[35m'
  RESET=$'\033[0m'
else
  BOLD=""
  DIM=""
  GREEN=""
  RED=""
  YELLOW=""
  BLUE=""
  CYAN=""
  MAGENTA=""
  RESET=""
fi

# --- Enrich PATH for discovery ---
ENRICHED_PATH="$PATH"
EXTRA_DIRS=(
  "$HOME/.local/bin"
  "$HOME/.opencode/bin"
  "$HOME/.commandcode/bin"
  "$HOME/.cmd/bin"
  "$HOME/.bun/bin"
  "$HOME/.cargo/bin"
  "/opt/homebrew/bin"
  "/opt/homebrew/sbin"
  "/usr/local/bin"
  "/usr/bin"
  "/bin"
)

# Search inside nvm node versions if present
if [ -d "$HOME/.nvm/versions/node" ]; then
  for node_dir in "$HOME/.nvm/versions/node"/*/bin; do
    if [ -d "$node_dir" ]; then
      EXTRA_DIRS+=("$node_dir")
    fi
  done
fi

for p in "${EXTRA_DIRS[@]}"; do
  if [ -d "$p" ]; then
    case ":$ENRICHED_PATH:" in
      *:"$p":*) ;;
      *) ENRICHED_PATH="$p:$ENRICHED_PATH" ;;
    esac
  fi
done

export PATH="$ENRICHED_PATH"

# --- Helper: locate binary ---
resolve_bin() {
  local primary="$1"
  shift || true
  local candidates=("$primary")
  if [ "$#" -gt 0 ]; then
    candidates+=("$@")
  fi

  for name in "${candidates[@]}"; do
    [ -z "$name" ] && continue
    if [[ "$name" = /* ]]; then
      if [ -x "$name" ]; then
        echo "$name"
        return 0
      fi
    else
      local found
      found=$(command -v "$name" 2>/dev/null || which "$name" 2>/dev/null || true)
      if [ -n "$found" ] && [ -x "$found" ]; then
        echo "$found"
        return 0
      fi
      # Also scan explicit extra dirs directly in case which misses
      for dir in "${EXTRA_DIRS[@]}"; do
        if [ -x "$dir/$name" ]; then
          echo "$dir/$name"
          return 0
        fi
      done
    fi
  done

  return 1
}

# --- Helper: get version safely with timeout ---
get_version() {
  local bin="$1"
  local ver=""

  if command -v python3 >/dev/null 2>&1; then
    ver=$(python3 -c "
import subprocess, sys
try:
    out = subprocess.check_output(['$bin', '--version'], stderr=subprocess.STDOUT, timeout=2.5)
    lines = [l.strip() for l in out.decode('utf-8', errors='ignore').split('\n') if l.strip()]
    if lines:
        print(lines[0])
    else:
        sys.exit(1)
except Exception:
    sys.exit(1)
" 2>/dev/null || true)
  fi

  if [ -z "$ver" ]; then
    if command -v timeout >/dev/null 2>&1; then
      ver=$(timeout 2 "$bin" --version 2>&1 | head -n 1 | tr -d '\r' || true)
    else
      ver=$("$bin" --version 2>&1 | head -n 1 | tr -d '\r' || true)
    fi
  fi

  # Clean version text - strip ANSI codes
  ver=$(printf '%s\n' "$ver" | sed -E 's/\x1B\[[0-9;]*[a-zA-Z]//g')
  echo "$ver"
}

# --- Define Supported Agents ---
# Format: ID|DISPLAY_NAME|PRIMARY_CMD|ALIASES|PROTOCOL|DEFAULT_MODEL|INSTALL_HINT
AGENTS_DEF=(
  "agy|Google Antigravity|agy|antigravity|stream-json|gemini-3.8-flash-high|https://antigravity.google/docs/cli"
  "commandcode|Command Code|commandcode|cmd|acp|claude-sonnet-5-5|npm i -g commandcode"
  "opencode|OpenCode|opencode||acp|Kenari/glm-5-3-flash|curl -fsSL https://opencode.ai/install.sh | bash"
  "omp|Oh My Pi (OMP)|omp|ohmypi|acp|claude-sonnet-4-5|bun i -g @ohmypi/cli"
  "pi|Pi Coding Agent|pi|pi-agent|rpc-json|google/gemini-2.5-flash|npm i -g @withpi/cli"
  "claude-code|Claude Code|claude|claude-code claude-code-acp|acp|sonnet|npm i -g @anthropic-ai/claude-code"
  "codex|OpenAI Codex|codex|codex-acp|acp|deepseek-v4-1-flash|npm i -g @openai/codex"
  "gemini|Google Gemini CLI|gemini||acp|gemini-2.5-pro|npm i -g @google/gemini-cli"
)

# --- Gather Information ---
TOTAL=0
INSTALLED_COUNT=0
MISSING_COUNT=0

JSON_RESULTS=()
TABLE_ROWS=()

for item in "${AGENTS_DEF[@]}"; do
  IFS='|' read -r id name cmd aliases proto model hint <<< "$item"
  TOTAL=$((TOTAL + 1))

  alias_args=()
  if [ -n "$aliases" ]; then
    for al in $aliases; do
      alias_args+=("$al")
    done
  fi

  bin_path=""
  if bin_path=$(resolve_bin "$cmd" "${alias_args[@]}"); then
    available=true
    INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
    version=$(get_version "$bin_path")
    if [ -z "$version" ]; then
      version="detected"
    fi
  else
    available=false
    MISSING_COUNT=$((MISSING_COUNT + 1))
    bin_path=""
    version="-"
  fi

  # Apply filter
  if [ "$FILTER" = "installed" ] && [ "$available" = false ]; then
    continue
  fi
  if [ "$FILTER" = "missing" ] && [ "$available" = true ]; then
    continue
  fi

  # JSON collection
  if [ "$SHOW_JSON" = true ]; then
    esc_name=$(printf '%s' "$name" | sed 's/"/\\"/g')
    esc_path=$(printf '%s' "$bin_path" | sed 's/"/\\"/g')
    esc_ver=$(printf '%s' "$version" | sed 's/"/\\"/g')
    esc_model=$(printf '%s' "$model" | sed 's/"/\\"/g')
    esc_proto=$(printf '%s' "$proto" | sed 's/"/\\"/g')
    esc_hint=$(printf '%s' "$hint" | sed 's/"/\\"/g')

    json_obj="{\"id\":\"$id\",\"name\":\"$esc_name\",\"available\":$available,\"command\":\"$cmd\",\"path\":\"$esc_path\",\"version\":\"$esc_ver\",\"protocol\":\"$esc_proto\",\"default_model\":\"$esc_model\",\"install_hint\":\"$esc_hint\"}"
    JSON_RESULTS+=("$json_obj")
  else
    TABLE_ROWS+=("$id|$name|$available|$bin_path|$version|$proto|$model|$hint")
  fi
done

# --- JSON Output ---
if [ "$SHOW_JSON" = true ]; then
  echo "["
  len=${#JSON_RESULTS[@]}
  for ((i=0; i<len; i++)); do
    if [ "$i" -lt $((len - 1)) ]; then
      echo "  ${JSON_RESULTS[$i]},"
    else
      echo "  ${JSON_RESULTS[$i]}"
    fi
  done
  echo "]"
  exit 0
fi

# --- Formatted Human Output ---
echo
echo "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════════════════════════════════╗${RESET}"
echo "${BOLD}${CYAN}║                              KendaliAI Agent Discovery                                   ║${RESET}"
echo "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════════════════════════════════╝${RESET}"
echo "${DIM}Scanning for installed ACP & autonomous coding agents on this machine...${RESET}"
echo

# Table Header
printf "%-10s %-22s %-22s %-12s %s\n" "STATUS" "AGENT" "VERSION" "PROTOCOL" "BINARY LOCATION"
echo "${DIM}--------------------------------------------------------------------------------------------------${RESET}"

for row in "${TABLE_ROWS[@]}"; do
  IFS='|' read -r id name available bin_path version proto model hint <<< "$row"

  if [ "$available" = true ]; then
    status_label="${GREEN}✔ FOUND${RESET}  "
    ver_clean=$(printf '%s' "$version" | cut -c 1-21)
    disp_path="${bin_path/#$HOME/~}"
    printf "%s %s%-22s%s %-22s %s%-12s%s %s%s%s\n" \
      "$status_label" \
      "$BOLD" "$name" "$RESET" \
      "$ver_clean" \
      "$CYAN" "$proto" "$RESET" \
      "$DIM" "$disp_path" "$RESET"
  else
    status_label="${RED}✖ MISSING${RESET}"
    printf "%s %s%-22s%s %-22s %s%-12s%s %s%s%s\n" \
      "$status_label" \
      "$DIM" "$name" "$RESET" \
      "-" \
      "$DIM" "$proto" "$RESET" \
      "$YELLOW" "Install: $hint" "$RESET"
  fi
done

echo "${DIM}--------------------------------------------------------------------------------------------------${RESET}"
echo

# Summary box
pct=$(( INSTALLED_COUNT * 100 / TOTAL ))
if [ "$INSTALLED_COUNT" -eq "$TOTAL" ]; then
  badge="${GREEN}${BOLD}ALL READY (${INSTALLED_COUNT}/${TOTAL} - 100%)${RESET}"
elif [ "$INSTALLED_COUNT" -gt 0 ]; then
  badge="${CYAN}${BOLD}${INSTALLED_COUNT}/${TOTAL} INSTALLED (${pct}%)${RESET}"
else
  badge="${RED}${BOLD}NONE FOUND (0/${TOTAL})${RESET}"
fi

echo -e "Summary: $badge (${GREEN}${INSTALLED_COUNT} installed${RESET}, ${RED}${MISSING_COUNT} missing${RESET})"

# Gateway Status Check
if [ "$CHECK_GATEWAY" = true ]; then
  echo
  echo -e "${BOLD}Checking KendaliAI Gateway at ${GATEWAY_URL}...${RESET}"
  if curl -sf "${GATEWAY_URL}/health" >/dev/null 2>&1; then
    gw_agents=$(curl -sf "${GATEWAY_URL}/api/acp/agents" 2>/dev/null || true)
    if [ -n "$gw_agents" ]; then
      echo -e "${GREEN}✔ Gateway is ONLINE.${RESET} Registered agents API responded successfully."
    else
      echo -e "${YELLOW}▲ Gateway is online, but /api/acp/agents returned empty or non-200.${RESET}"
    fi
  else
    echo -e "${YELLOW}▲ KendaliAI Gateway is not running at ${GATEWAY_URL}.${RESET} (Run '${BOLD}kendaliai start -d${RESET}' or '${BOLD}make dev${RESET}')"
  fi
fi

# Local Custom Agents Check
AGENTS_DIR="$HOME/.kendaliai/agents"
if [ -d "$AGENTS_DIR" ]; then
  CUSTOM_COUNT=$(find "$AGENTS_DIR" -name "*.yaml" -o -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
  if [ -n "$CUSTOM_COUNT" ] && [ "$CUSTOM_COUNT" -gt 0 ]; then
    echo
    echo -e "${DIM}Local agent manifests found: ${BOLD}$CUSTOM_COUNT${RESET} ${DIM}in ~/.kendaliai/agents/${RESET}"
  fi
fi

echo
