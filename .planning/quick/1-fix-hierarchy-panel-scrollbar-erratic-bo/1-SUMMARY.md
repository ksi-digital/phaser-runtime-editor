---
phase: quick-1
plan: 01
subsystem: ui
tags: [hierarchy-panel, scroll, dom, phaser-editor]

requires: []
provides:
  - Stable hierarchy panel scroll position (no bounce-back)
  - Single-fire scrollIntoView on selection change only
  - Single scroll container (wrapper fills slot, no nested scroll conflict)
affects: [ui, hierarchy-panel]

tech-stack:
  added: []
  patterns:
    - "scrollIntoView separated from highlight: update visual state every frame, scroll only on selection event"
    - "Single DOM scroll container: wrapper fills parent slot height at 100% to prevent nested scroll conflict"

key-files:
  created: []
  modified:
    - src/ui/HierarchyPanel.ts

key-decisions:
  - "scrollIntoView behavior: 'instant' to avoid lingering animation that could fight manual scrolling"
  - "scrollToSelected() is a separate method called only from buildTree() and onSelectionChanged(), not from refresh()/updateHighlight()"
  - "wrapper height: 100% + overflow-x: hidden so wrapper is the sole scroll container inside the hierarchy slot"

patterns-established:
  - "Event-driven scroll: call scrollIntoView in selection-change handler, not in per-frame refresh"

requirements-completed: []

duration: 2min
completed: 2026-02-18
---

# Quick Task 1: Fix Hierarchy Panel Scrollbar Erratic Bounce-back Summary

**scrollIntoView moved out of per-frame refresh into selection-change event handler; wrapper set as sole scroll container with height: 100% and overflow-x: hidden**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-18T10:55:29Z
- **Completed:** 2026-02-18T10:57:25Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Removed all `scrollIntoView()` calls from `updateHighlight()`, which was being called every frame via `EditorScene.update() -> editorUI.refresh() -> hierarchy.refresh() -> updateHighlight()`
- Added private `scrollToSelected()` method using `behavior: 'instant'` to avoid lingering animations
- Called `scrollToSelected()` only after tree rebuild (`buildTree()`) and on actual selection changes (`onSelectionChanged()`)
- Set wrapper to `height: 100%; overflow-y: auto; overflow-x: hidden` so it fills the hierarchy slot exactly, eliminating nested scroll container conflict

## Task Commits

1. **Task 1: Fix per-frame scrollIntoView and nested scroll containers** - `9f2b7e9` (fix)

## Files Created/Modified

- `src/ui/HierarchyPanel.ts` - Moved scrollIntoView from per-frame updateHighlight to selection-change-only scrollToSelected(); added height/overflow CSS to wrapper

## Decisions Made

- Used `behavior: 'instant'` instead of `'smooth'` for `scrollIntoView` to prevent lingering scroll animations that could interfere with subsequent manual scrolling
- `scrollToSelected()` is called explicitly by callers that need it rather than being embedded in `updateHighlight()`, keeping concerns separate (highlight = every frame OK; scroll = only on state change)
- `wrapper` height set to `100%` so it fills the `hierarchySlot` exactly — from the slot's perspective there is no overflow, so the slot's own `overflow-y: auto` never triggers; only the wrapper scrolls

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Hierarchy panel scroll behavior is stable and user-controllable
- No blockers for Phase 2 (Coordinate Refactor)

---
*Phase: quick-1*
*Completed: 2026-02-18*
