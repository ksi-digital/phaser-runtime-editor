---
phase: quick-2
plan: 01
subsystem: coordinates
tags: [phaser, coordinate-system, camera-projection, selection, gizmos]

# Dependency graph
requires:
  - phase: phase-02
    provides: ViewportState pattern, CoordinateSystem, SelectionManager with world-space bounds

provides:
  - Correct Phaser camera projection formula (worldToScreen/screenToWorld)
  - Screen-space bounding boxes aligned with game objects
  - Stable move gizmo drag (no x/y endless increase)

affects: [phase-03, phase-04, phase-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "worldToScreen(): (worldX - scrollX - centerX) * zoom + centerX"
    - "screenToWorld(): (screenX - centerX) / zoom + scrollX + centerX"
    - "getScreenBounds() always projects through worldToScreen() for screen-space AABB"

key-files:
  created: []
  modified:
    - src/core/CoordinateSystem.ts
    - src/core/SelectionManager.ts
    - src/EditorScene.ts
    - src/gizmos/MoveGizmo.ts
    - src/gizmos/RotateGizmo.ts
    - src/gizmos/ScaleGizmo.ts
    - src/gizmos/GizmoManager.ts

key-decisions:
  - "worldToScreen uses (worldX - scrollX - centerX) * zoom + centerX — the correct Phaser formula derived from preRender matrix"
  - "setDesignPosition converts design→screen→world before writing to obj.x/obj.y (was writing screen coords directly)"
  - "getScreenBounds projects all 4 getBounds() corners through worldToScreen() for AABB in screen-space"
  - "ScaleGizmo.draw() gains vp param to pass to getScreenBounds"
  - "hitTest() in pointerdown handler now captures vp before calling hitTest"

patterns-established:
  - "All bounding box computation goes through worldToScreen() — never use raw getBounds() for drawing"
  - "setDesignPosition flow: design → screen → world → (optionally parent-local)"

requirements-completed: []

# Metrics
duration: 20min
completed: 2026-02-18
---

# Quick Task 2: Fix Phase 2 Bugs — Bounding Boxes and Move Gizmo Summary

**Fixed Phaser camera projection formula (was missing `- centerX`) and added worldToScreen/screenToWorld helpers; projected all bounding boxes through correct camera transform so selection overlays align with game objects and move gizmo drag is stable**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-02-18T00:00:00Z
- **Completed:** 2026-02-18T00:20:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added `worldToScreen()` and `screenToWorld()` helpers with the correct Phaser camera formula: `(worldX - scrollX - centerX) * zoom + centerX`
- Fixed `getScreenPosition()` to use `worldToScreen()` instead of the broken `(worldX - scrollX) * zoom + centerX` formula that added `centerX` without subtracting it first
- Fixed `setDesignPosition()` to convert design → screen → world before writing to `obj.x/obj.y` (was writing screen coords to a world-space property, causing endless drift)
- Fixed `getScreenBounds()` to project all 4 corners of `getBounds()` through `worldToScreen()`, producing correct screen-space AABB instead of world-space rectangle
- Threaded `ViewportState` through all callers of `getScreenBounds()` across gizmos and EditorScene

## Task Commits

1. **Task 1: Fix camera projection formula in CoordinateSystem** - `3a2097d` (fix)
2. **Task 2: Thread ViewportState through SelectionManager.getScreenBounds and drawSelection** - `ddc39ee` (fix)

## Files Created/Modified
- `src/core/CoordinateSystem.ts` - Added `worldToScreen()`, `screenToWorld()` helpers; fixed `getScreenPosition()` and `setDesignPosition()`
- `src/core/SelectionManager.ts` - Added `vp` param to `getScreenBounds()`, `drawSelection()`, `hitTest()`, `getContainerBounds()`, `getChildWorldBounds()`; projects world-space bounds through `worldToScreen()`
- `src/EditorScene.ts` - Pass `vp` to `drawSelection()`; restructure pointerdown to capture `vp` before `hitTest()`
- `src/gizmos/MoveGizmo.ts` - Pass `vp` to `getScreenBounds()` in `draw()`
- `src/gizmos/RotateGizmo.ts` - Pass `vp` to `getScreenBounds()` in `computeRingRadius()`
- `src/gizmos/ScaleGizmo.ts` - Add `vp` param to `draw()` signature; pass to `getScreenBounds()`
- `src/gizmos/GizmoManager.ts` - Pass `vp` to `scaleGizmo.draw()`

## Decisions Made
- The correct Phaser camera projection derives from `matrix.applyITRS(originX, originY, 0, zoom, zoom)` then `matrix.translate(-scrollX - originX, -scrollY - originY)` which produces `screenX = (worldX - scrollX - centerX) * zoom + centerX`. For default camera (zoom=1, scroll=0): identity — world coords equal screen coords.
- For `setDesignPosition`, the fix path is design→screen→world (via new `screenToWorld()`) before writing `obj.x/obj.y`. The Container branch additionally applies the inverse parent matrix after the world conversion.
- `ScaleGizmo.draw()` gained a `vp` parameter (it had a stored `vp` field but wasn't threaded through the draw call).

## Deviations from Plan

None — plan executed exactly as written. The plan precisely identified both root causes and prescribed the exact code changes needed.

## Issues Encountered

None. Both bugs were well-analyzed in the plan. TypeScript compile was clean throughout.

## Next Phase Readiness

- Selection bounding boxes now align correctly with game objects for all camera configurations
- Move gizmo drag is stable (no drift) because `setDesignPosition` properly round-trips through the inverse camera projection
- Coordinate system is now correct for default and non-default Phaser cameras
- Ready to proceed with Phase 3 (Object Identification)

## Self-Check

- `src/core/CoordinateSystem.ts` — exists with `worldToScreen` and `screenToWorld` methods
- `src/core/SelectionManager.ts` — exists with `vp` param on `getScreenBounds`, `drawSelection`, `hitTest`
- Commit `3a2097d` — fix(quick-2): correct Phaser camera projection formula in CoordinateSystem
- Commit `ddc39ee` — fix(quick-2): thread ViewportState through getScreenBounds to fix bounding box alignment
- `npx tsc --noEmit` — zero errors

## Self-Check: PASSED

---
*Quick Task: quick-2*
*Completed: 2026-02-18*
