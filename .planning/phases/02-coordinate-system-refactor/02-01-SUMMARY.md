---
phase: 02-coordinate-system-refactor
plan: 01
subsystem: core
tags: [phaser4, coordinate-system, viewport, camera-projection, typescript]

# Dependency graph
requires:
  - phase: 01-viewport-stability
    provides: EditorScene structure and CoordinateSystem class to refactor
provides:
  - ViewportState interface and captureViewport() function in src/core/ViewportState.ts
  - Refactored CoordinateSystem with ViewportState params on all public methods
  - getScreenPosition() applying correct world-to-screen camera projection
  - Centralized getHitAreaToScreen() and getHitAreaScreenDeltaToLocal() helpers
affects: [02-02-coordinate-system-refactor, EditorScene, SelectionManager, SnappingEngine, MoveGizmo, RotateGizmo, ScaleGizmo, HitAreaGizmo, InspectorPanel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ViewportState snapshot: frozen plain-object captured once per frame, passed to all coordinate math"
    - "World-to-screen camera projection: (worldX - scrollX) * zoom + centerX"
    - "Centralized hit-area transform closures via getHitAreaToScreen() / getHitAreaScreenDeltaToLocal()"

key-files:
  created:
    - src/core/ViewportState.ts
  modified:
    - src/core/CoordinateSystem.ts

key-decisions:
  - "ViewportState includes cameraCenterX/Y to support the full Phaser camera projection formula"
  - "captureViewport() uses editorScene.cameras.main for canvas dimensions, hostScene.cameras.main for scroll/zoom"
  - "setDesignPosition() accepts optional cachedInvParentMatrix parameter for COORD-05 optimization"
  - "Hit-area helpers use world matrix directly (no ViewportState) because rendering uses Phaser shared GL context"
  - "Tasks 1 and 2 committed together since they are both in CoordinateSystem.ts and form one cohesive change"

patterns-established:
  - "Pattern: All CoordinateSystem methods accept ViewportState, never Phaser.Scene"
  - "Pattern: World→screen = (world - scroll) * zoom + cameraCenter"
  - "Pattern: Hit-area transforms are closures returned from CoordinateSystem methods"

requirements-completed: [COORD-01, COORD-02, COORD-04]

# Metrics
duration: 10min
completed: 2026-02-18
---

# Phase 02 Plan 01: ViewportState and CoordinateSystem Refactor Summary

**ViewportState frozen snapshot interface + CoordinateSystem refactored to fix world-to-screen projection bug and centralize hit-area transform helpers**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-18T08:14:00Z
- **Completed:** 2026-02-18T08:24:58Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 refactored)

## Accomplishments

- Created `src/core/ViewportState.ts` with the `ViewportState` interface (10 fields: designWidth/Height, scaleFactor, offsetX/Y, cameraScrollX/Y, cameraZoom, cameraCenterX/Y) and `captureViewport()` free function that produces a frozen snapshot
- Refactored all 5 `CoordinateSystem` public methods to accept `ViewportState` instead of `Phaser.Scene`; removed `getScaleFactor()` and `getOffset()` (now redundant)
- Replaced broken `getWorldPosition()` with `getScreenPosition()` that correctly applies the Phaser camera projection formula: `(worldX - scrollX) * zoom + centerX`
- Added `getHitAreaToScreen()` and `getHitAreaScreenDeltaToLocal()` as public methods, centralizing hit-area transform logic that was duplicated in EditorScene.ts, HitAreaGizmo.ts, and SelectionManager.ts

## Task Commits

Each task was committed atomically:

1. **Task 1 + Task 2: Create ViewportState and refactor CoordinateSystem** - `d360af0` (feat)

_Note: Tasks 1 and 2 were committed together as they both operate on CoordinateSystem.ts and form one cohesive atomic change._

**Plan metadata:** _(to be committed with this SUMMARY)_

## Files Created/Modified

- `src/core/ViewportState.ts` — New file: ViewportState interface + captureViewport() function
- `src/core/CoordinateSystem.ts` — Refactored: ViewportState params, getScreenPosition() with camera projection, two hit-area helper methods added

## Decisions Made

- **cameraCenterX/Y included in ViewportState:** The full Phaser camera projection formula requires the camera's screen-space center point; omitting it would produce incorrect results for scrolled cameras
- **editorScene for canvas dimensions in captureViewport():** The host scene camera may be scrolled/zoomed; the editor overlay scene always has the actual canvas pixel dimensions
- **Optional cachedInvParentMatrix on setDesignPosition():** Prepares for COORD-05 (MoveGizmo caching) without breaking existing callers that pass null
- **Hit-area helpers use world matrix only (no ViewportState):** The Phaser shared GL context makes matrix.tx/ty already screen-correct for rendering; these helpers are for rendering, not design-space math
- **Tasks 1 and 2 committed together:** Both tasks touch CoordinateSystem.ts; splitting would leave the file in an inconsistent state between commits

## Deviations from Plan

None - plan executed exactly as written. Both tasks complete in a single atomic commit as they're in the same file set.

## Issues Encountered

None. TypeScript compilation of the two target files produces no errors. Downstream caller errors (EditorScene, SnappingEngine, MoveGizmo, RotateGizmo, InspectorPanel, SelectionManager) are expected and will be resolved in Plan 02.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (02-02-PLAN.md) can proceed immediately — it updates all callers of CoordinateSystem to pass ViewportState instead of Phaser.Scene
- The coordinate math foundation is complete and correct
- All downstream compile errors are known and tracked (they are all "Argument of type 'Scene' is not assignable to parameter of type 'ViewportState'" — mechanical replacements)

---
*Phase: 02-coordinate-system-refactor*
*Completed: 2026-02-18*
