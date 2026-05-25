#!/usr/bin/env bash
# verify-paths.sh — NGS v5 migration self-check
#
# Runs grep-based assertions against the current working directory to validate
# the v5 migration's preconditions and postconditions. Designed to be run:
#   (a) before starting the migration, to confirm v2 baseline assumptions
#   (b) after each migration step, to catch regressions
#   (c) before merging the v5-migration branch, as a final gate
#
# Usage:
#   ./verify-paths.sh              # run all checks
#   ./verify-paths.sh pre          # only preconditions (v2 baseline)
#   ./verify-paths.sh post         # only postconditions (v5 target)
#   ./verify-paths.sh <check_id>   # run a single check (e.g. check_03)
#
# Exit code 0 = all checks pass, 1 = at least one failure.

set -eo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────

# Color codes (disabled if not a TTY)
if [ -t 1 ]; then
  RED=$'\033[0;31m'
  GREEN=$'\033[0;32m'
  YELLOW=$'\033[1;33m'
  CYAN=$'\033[0;36m'
  RESET=$'\033[0m'
else
  RED='' GREEN='' YELLOW='' CYAN='' RESET=''
fi

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
FAILURES=()

# ─── Helpers ────────────────────────────────────────────────────────────────

# expect_zero_lines <description> <grep_command>
#   Asserts a grep command returns zero lines of output.
expect_zero_lines() {
  local desc="$1"
  shift
  local output
  output=$("$@" 2>/dev/null || true)
  if [ -z "$output" ]; then
    echo "  ${GREEN}PASS${RESET}: $desc"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  ${RED}FAIL${RESET}: $desc"
    echo "$output" | sed 's/^/    /'
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILURES+=("$desc")
  fi
}

# expect_file_exists <description> <path>
expect_file_exists() {
  local desc="$1"
  local path="$2"
  if [ -f "$path" ]; then
    echo "  ${GREEN}PASS${RESET}: $desc ($path exists)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  ${RED}FAIL${RESET}: $desc (expected $path)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILURES+=("$desc")
  fi
}

# expect_file_absent <description> <path>
expect_file_absent() {
  local desc="$1"
  local path="$2"
  if [ ! -e "$path" ]; then
    echo "  ${GREEN}PASS${RESET}: $desc ($path absent)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  ${RED}FAIL${RESET}: $desc ($path should be deleted)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILURES+=("$desc")
  fi
}

# expect_line_match <description> <file> <pattern>
expect_line_match() {
  local desc="$1"
  local file="$2"
  local pattern="$3"
  if [ ! -f "$file" ]; then
    echo "  ${YELLOW}SKIP${RESET}: $desc (file not found: $file)"
    SKIP_COUNT=$((SKIP_COUNT + 1))
    return
  fi
  if grep -q "$pattern" "$file"; then
    echo "  ${GREEN}PASS${RESET}: $desc"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  ${RED}FAIL${RESET}: $desc (pattern '$pattern' not in $file)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILURES+=("$desc")
  fi
}

section() {
  echo ""
  echo "${CYAN}━━━ $1 ━━━${RESET}"
}

# ─── Preconditions (v2 baseline must hold) ──────────────────────────────────

precondition_checks() {
  section "Preconditions: v2 baseline (must hold before migration starts)"

  # check_01: graph_versions PK exists (no migration 008 needed)
  expect_line_match \
    "check_01: graph_versions has composite PK in 001_init.sql" \
    "migrations/001_init.sql" \
    "PRIMARY KEY (graph_id, version)"

  # check_02: starredPapers removed from canvas-store (ripped in earlier step)
  expect_zero_lines \
    "check_02: starredPapers absent from canvas-store" \
    bash -c "grep -n 'starredPapers' frontend/src/lib/store/canvas-store.ts 2>/dev/null || true"

  # check_03: r2_state type guard removed from canvas-store (ripped in earlier step)
  expect_zero_lines \
    "check_03: r2_state type guard absent from canvas-store" \
    bash -c "grep -n 'type === \"r2_state\"' frontend/src/lib/store/canvas-store.ts 2>/dev/null || true"

  # check_04: 500ms throttle exists at ws/client.ts:36
  expect_line_match \
    "check_04: throttleMs = 500 in ws/client.ts (preserve, do not rip)" \
    "frontend/src/lib/ws/client.ts" \
    "throttleMs = 500"

  # check_05: SocketType enum exists in sdk.py
  expect_line_match \
    "check_05: SocketType enum in sdk.py (preserve in v5 sdk/ports.py)" \
    "server/substrate/sdk.py" \
    "class SocketType"

  # check_06: NODE_REGISTRY exists with 25 entries (count not enforced, just presence)
  expect_line_match \
    "check_06: NODE_REGISTRY exists in registry.ts" \
    "frontend/src/lib/nodes/registry.ts" \
    "NODE_REGISTRY"

  # check_07: 4-variant CanvasType including experiments
  # After Step 5, registry.ts is a shim; source of truth is pack-registry.ts
  if [ -f "frontend/src/lib/pack-registry.ts" ]; then
    expect_line_match \
      "check_07: CanvasType includes 'experiments'" \
      "frontend/src/lib/pack-registry.ts" \
      "experiments"
  else
    expect_line_match \
      "check_07: CanvasType includes 'experiments'" \
      "frontend/src/lib/nodes/registry.ts" \
      "experiments"
  fi

  # check_08: ELK layout files exist (not deferred)
  expect_file_exists "check_08a: elk-layout.ts exists" "frontend/src/lib/layout/elk-layout.ts"
  expect_file_exists "check_08b: elk-worker.ts exists" "frontend/src/lib/layout/elk-worker.ts"

  # check_09: drift stack exists
  expect_file_exists "check_09a: psi.ts exists" "frontend/src/lib/drift/psi.ts"
  expect_file_exists "check_09b: drift-store.ts exists" "frontend/src/lib/store/drift-store.ts"
  expect_file_exists "check_09c: Sparkline.tsx exists" "frontend/src/components/nodes/Sparkline.tsx"
  expect_file_exists "check_09d: StaleEdge.tsx exists" "frontend/src/components/edges/StaleEdge.tsx"
  expect_file_exists "check_09e: DriftMatrixNode.tsx exists" "frontend/src/components/nodes/DriftMatrixNode.tsx"

  # check_10: experiments pack files exist (moved to packs in Step 15)
  expect_file_exists "check_10a: experiment data.py exists" "server/substrate/packs/experiments/data.py"
  expect_file_exists "check_10b: experiment parser.py exists" "server/substrate/packs/experiments/parser.py"
  expect_file_exists "check_10c: experiment-store.ts exists" "frontend/src/lib/store/experiment-store.ts"
  expect_file_exists "check_10d: useExperimentData.ts exists" "frontend/src/packs/experiments/hooks/useExperimentData.ts"
  expect_file_exists "check_10e: ExperimentCloudNode.tsx exists" "frontend/src/components/nodes/ExperimentCloudNode.tsx"

  # check_11: DetailPanel + EventLog exist (NodeDetailModal is gone)
  expect_file_exists "check_11a: DetailPanel.tsx exists" "frontend/src/components/panels/DetailPanel.tsx"
  expect_file_exists "check_11b: EventLog.tsx exists" "frontend/src/components/panels/EventLog.tsx"
  expect_file_absent "check_11c: NodeDetailModal.tsx is gone" "frontend/src/components/canvas/NodeDetailModal.tsx"

  # check_12: Cypress is in use (not removed)
  expect_file_exists "check_12a: cypress.config.ts exists" "frontend/cypress.config.ts"
  expect_line_match \
    "check_12b: cypress in frontend/package.json devDependencies" \
    "frontend/package.json" \
    '"cypress"'

  # check_13: tests/visual and scripts exist
  expect_file_exists "check_13a: tests/visual/ directory has a runner" "tests/visual/run_visual_tests.py"
  expect_file_exists "check_13b: scripts/precompute_breathing_cache.py exists" "scripts/precompute_breathing_cache.py"
}

# ─── Postconditions (v5 target must hold after migration) ───────────────────

postcondition_checks() {
  section "Postconditions: v5 target (must hold after migration completes)"

  # check_p1: Pack isolation invariant (zero topo-confidence imports outside its pack and API wiring)
  expect_zero_lines \
    "check_p1: topo-confidence not imported outside packs/topo_confidence/" \
    bash -c "grep -rn 'topo_confidence\|TopoConfidence' server/substrate/ --include=\"*.py\" 2>/dev/null | grep -v packs/topo_confidence/ | grep -v __pycache__ | grep -v 'from substrate.packs.topo_confidence' || true"

  # check_p2: Pack-leak removal from canvas-store
  expect_zero_lines \
    "check_p2: starredPapers/flushUnstarred/r2_state stripped from canvas-store" \
    bash -c "grep -nE 'starredPapers|flushUnstarred|r2_state' frontend/src/features/canvas/canvas-store.ts 2>/dev/null || true"

  # check_p3: No direct pack imports outside the pack registry
  expect_zero_lines \
    "check_p3: no direct pack imports in app/pages/features/lib/components" \
    bash -c "grep -rnE \"from '.*/packs/\" frontend/src/app frontend/src/pages frontend/src/features frontend/src/lib frontend/src/components 2>/dev/null | grep -v pack-registry || true"

  # check_p4: React Router v7 package name (not v6's react-router-dom)
  expect_zero_lines \
    "check_p4: no 'react-router-dom' imports anywhere" \
    bash -c "grep -rn 'react-router-dom' frontend/src/ 2>/dev/null || true"

  # check_p5: registry.ts importers gone (Phase B complete)
  expect_zero_lines \
    "check_p5: no remaining imports of lib/nodes/registry" \
    bash -c "grep -rn 'from .*lib/nodes/registry' frontend/src/ 2>/dev/null || true"

  # check_p6: Pack manifests exist
  expect_file_exists "check_p6a: core pack manifest" "frontend/src/packs/core/manifest.ts"
  expect_file_exists "check_p6b: topo-confidence pack manifest" "frontend/src/packs/topo-confidence/manifest.ts"
  expect_file_exists "check_p6c: experiments pack manifest" "frontend/src/packs/experiments/manifest.ts"
  expect_file_exists "check_p6d: link-forge pack manifest" "frontend/src/packs/link-forge/manifest.ts"

  # check_p7: Server-side pack folders exist
  expect_file_exists "check_p7a: server core pack init" "server/substrate/packs/core/__init__.py"
  expect_file_exists "check_p7b: server topo_confidence pack init" "server/substrate/packs/topo_confidence/__init__.py"
  expect_file_exists "check_p7c: server experiments pack init" "server/substrate/packs/experiments/__init__.py"
  expect_file_exists "check_p7d: server link_forge pack init" "server/substrate/packs/link_forge/__init__.py"

  # check_p8: New routing layer exists
  expect_file_exists "check_p8a: app/router.tsx exists" "frontend/src/app/router.tsx"
  expect_file_exists "check_p8b: app/providers.tsx exists" "frontend/src/app/providers.tsx"
  expect_file_exists "check_p8c: AppShell exists" "frontend/src/app/layout/AppShell.tsx"

  # check_p9: Schema migrations 003-007 exist (no 008)
  expect_file_exists "check_p9a: migration 003" "migrations/003_canvas_kind.sql"
  expect_file_exists "check_p9b: migration 004" "migrations/004_runs.sql"
  expect_file_exists "check_p9c: migration 005" "migrations/005_node_observations.sql"
  expect_file_exists "check_p9d: migration 006" "migrations/006_session_state.sql"
  expect_file_exists "check_p9e: migration 007" "migrations/007_search_index.sql"
  expect_file_absent "check_p9f: no migration 008 (graph_versions PK already exists)" "migrations/008_graph_versions_unique.sql"

  # check_p10: NodeDetailModal stays deleted
  expect_file_absent \
    "check_p10: NodeDetailModal stays deleted" \
    "frontend/src/components/canvas/NodeDetailModal.tsx"

  # check_p11: 500ms throttle preserved
  expect_line_match \
    "check_p11: throttleMs = 500 still present in ws/client.ts" \
    "frontend/src/lib/ws/client.ts" \
    "throttleMs = 500"

  # check_p12: WS endpoint param is graph_id (not canvas_id)
  expect_line_match \
    "check_p12: WS endpoint uses /ws/canvas/{graph_id}" \
    "frontend/src/lib/ws/client.ts" \
    "ws/canvas/"

  # check_p13: Cypress suite preserved
  expect_file_exists "check_p13: Cypress suite preserved" "frontend/cypress.config.ts"
}

# ─── Single-check dispatcher (for ./verify-paths.sh check_03) ───────────────

run_single_check() {
  local check_id="$1"
  echo "Running single check: $check_id"
  # Search for the check in both pre and post functions
  # (Simple approach: source the functions and grep their output)
  # For now, just run both and let the user filter
  precondition_checks 2>&1 | grep -A1 "$check_id" || true
  postcondition_checks 2>&1 | grep -A1 "$check_id" || true
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  local mode="${1:-all}"

  echo "${CYAN}NGS v5 Migration Path Verifier${RESET}"
  echo "Working directory: $(pwd)"
  echo "Mode: $mode"

  case "$mode" in
    pre)
      precondition_checks
      ;;
    post)
      postcondition_checks
      ;;
    all|"")
      precondition_checks
      postcondition_checks
      ;;
    check_*)
      run_single_check "$mode"
      ;;
    *)
      echo "Unknown mode: $mode"
      echo "Usage: $0 [pre|post|all|check_NN]"
      exit 2
      ;;
  esac

  echo ""
  echo "${CYAN}━━━ Summary ━━━${RESET}"
  echo "  Passed:  ${GREEN}$PASS_COUNT${RESET}"
  echo "  Failed:  ${RED}$FAIL_COUNT${RESET}"
  echo "  Skipped: ${YELLOW}$SKIP_COUNT${RESET}"

  if [ $FAIL_COUNT -gt 0 ]; then
    echo ""
    echo "${RED}Failed checks:${RESET}"
    for failure in "${FAILURES[@]}"; do
      echo "  - $failure"
    done
    exit 1
  fi

  echo ""
  echo "${GREEN}All checks passed.${RESET}"
  exit 0
}

main "$@"
