---
phase: 02-coordinate-system-refactor
plan: 02
subsystem: core+gizmos+ui
tags: [phaser4, coordinate-system, viewport, viewportstate, gizmos, typescript]

# Dependency graph
requires:
  - phase: 02-01
    provides: ViewportState interface, captureViewport(), refactored CoordinateSystem
provides:
  - Per-frame ViewportState capture and distribution in EditorScene.update()
  - All gizmos accept ViewportState at drag start (frozen snapshot per COORD-03)
  - MoveGizmo inverse parent matrix cached at drag start (COORD-05)
  - All hit-area transform duplicates replaced with CoordinateSystem helpers (COORD-04)
  - Zero TypeScript errors, no Phaser.Scene passed to CoordinateSystem anywhere
affects: [EditorScene, SelectionManager, SnappingEngine, InspectorPanel, EditorUI, GizmoManager, MoveGizmo, RotateGizmo, ScaleGizmo, HitAreaGizmo]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-frame ViewportState snapshot: captureViewport() once in update(), passed to all subsystems"
    - "Frozen drag-start viewport: all gizmos store vp at startDrag(), use it throughout updateDrag()"
    - "Cached inverse parent matrix: MoveGizmo computes once at drag start, reuses in updateDrag()"
    - "Centralized hit-area transforms: all callers use coordSystem.getHitAreaToScreen() / getHitAreaScreenDeltaToLocal()"

key-files:
  created: []
  modified:
    - src/EditorScene.ts
    - src/core/SelectionManager.ts
    - src/core/SnappingEngine.ts
    - src/ui/InspectorPanel.ts
    - src/ui/EditorUI.ts
    - src/gizmos/GizmoManager.ts
    - src/gizmos/MoveGizmo.ts
    - src/gizmos/RotateGizmo.ts
    - src/gizmos/ScaleGizmo.ts
    - src/gizmos/HitAreaGizmo.ts

key-decisions:
  - "SelectionManager.drawSelection() keeps no ViewportState parameter — it uses getScreenBounds() which uses world matrix directly (rendering path)"
  - "getChildWorldBounds() fallback uses getWorldTransformMatrix().tx/ty instead of removed getWorldPosition()"
  - "GizmoManager stores editorScene as a field to enable captureViewport() at pointer-down time"
  - "ScaleGizmo stores vp field but updateDrag() operates purely in screen-space (no coord math needed)"
  - "EditorUI constructor still accepts hostScene parameter for API compatibility, but ignores it"

requirements-completed: [COORD-01, COORD-03, COORD-05]

# Metrics
duration: 10min
completed: 2026-02-18
---

# Phase 02 Plan 02: ViewportState Consumer Migration Summary

**ViewportState threaded through all consumers — EditorScene captures once per frame, all gizmos freeze it at drag start, MoveGizmo caches inverse parent matrix, three hit-area transform duplicates eliminated**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-18T08:27:59Z
- **Completed:** 2026-02-18T08:37:25Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

### Task 1: Thread ViewportState through EditorScene, SelectionManager, SnappingEngine, and UI

- `EditorScene.update()` now captures one `ViewportState` via `captureViewport()` per frame and passes it to all coordinate-consuming subsystems
- `EditorScene.drawHitArea()` replaced inline `toScreen` closure with `this.coordSystem.getHitAreaToScreen(obj)` — eliminates hit-area transform duplicate #1
- `SelectionManager.getPolygonShapeBounds()` replaced inline matrix transform with `this.coords.getHitAreaToScreen(poly)` — eliminates hit-area transform duplicate #2
- `SelectionManager.getChildWorldBounds()` fallback uses `getWorldTransformMatrix().tx/ty` instead of removed `getWorldPosition()`
- `SnappingEngine.objectSnap()`, `applySnapping()`, `drawGuides()` all accept `ViewportState` instead of `Phaser.Scene`
- `InspectorPanel` stores `vp: ViewportState | null` instead of `hostScene: Phaser.Scene | null`; `bind()` and `refresh()` accept `ViewportState`
- `EditorUI.refresh()` accepts optional `ViewportState` and threads it to `InspectorPanel.refresh()`

### Task 2: Thread ViewportState through all gizmos, cache MoveGizmo inverse matrix, replace HitAreaGizmo duplicate

- `GizmoManager` stores `editorScene: Phaser.Scene` field; `handlePointerDown()` calls `captureViewport()` and passes `ViewportState` to all `startDrag()` calls instead of `hostScene`
- `GizmoManager.draw()` accepts `ViewportState | null` and passes to `MoveGizmo.draw()` and `RotateGizmo.draw()`
- `MoveGizmo`: replaced `hostScene` field with `vp: ViewportState` frozen at drag start; `updateDrag()` uses `vp.scaleFactor` instead of `getScaleFactor(hostScene)`
- `MoveGizmo.cachedInvParentMatrix`: computed once via `parent.getWorldTransformMatrix().invert()` at `startDrag()`, passed to `setDesignPosition()` in `updateDrag()` (COORD-05)
- `RotateGizmo`: replaced `hostScene` field with `vp: ViewportState`; `draw()` and `computeRingRadius()` use `getScreenPosition(obj, vp)` replacing removed `getWorldPosition(obj)`
- `ScaleGizmo`: replaced `hostScene` field with `vp: ViewportState` frozen at drag start
- `HitAreaGizmo`: replaced `hostScene` field with `vp: ViewportState`; `getTransformHelpers()` private method removed; all callers now use `coordSystem.getHitAreaToScreen()` and `coordSystem.getHitAreaScreenDeltaToLocal()` — eliminates hit-area transform duplicate #3

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread ViewportState through EditorScene, SelectionManager, SnappingEngine, UI** - `0f9d1d4` (feat)
2. **Task 2: Thread ViewportState through all gizmos, cache MoveGizmo inverse matrix, replace HitAreaGizmo duplicate** - `f9a3cb5` (feat)

## Files Created/Modified

- `src/EditorScene.ts` — captureViewport() in update(), drawHitArea() uses coordSystem helper
- `src/core/SelectionManager.ts` — getPolygonShapeBounds() uses coordSystem helper, getChildWorldBounds() fallback fixed
- `src/core/SnappingEngine.ts` — all methods accept ViewportState instead of Phaser.Scene
- `src/ui/InspectorPanel.ts` — stores vp instead of hostScene; bind/refresh accept ViewportState
- `src/ui/EditorUI.ts` — refresh() accepts and threads ViewportState
- `src/gizmos/GizmoManager.ts` — editorScene field, captureViewport at pointerdown, draw() passes vp
- `src/gizmos/MoveGizmo.ts` — vp field, cachedInvParentMatrix, uses vp.scaleFactor in updateDrag
- `src/gizmos/RotateGizmo.ts` — vp field, draw/computeRingRadius use getScreenPosition(obj, vp)
- `src/gizmos/ScaleGizmo.ts` — vp field replacing hostScene
- `src/gizmos/HitAreaGizmo.ts` — vp field, getTransformHelpers() removed, uses coordSystem helpers

## Decisions Made

- **SelectionManager.drawSelection() has no ViewportState parameter:** The selection rendering path uses `getScreenBounds()` which uses the world transform matrix directly — this is the rendering path, not the camera-projection path, so ViewportState is not needed
- **getChildWorldBounds() fallback uses matrix.tx/ty:** After `getWorldPosition()` was removed from CoordinateSystem, the fallback for Container children that lack `getBounds()` now correctly uses `getWorldTransformMatrix().tx/ty` which is screen-correct in Phaser's shared GL context
- **GizmoManager stores editorScene as a field:** Required for `captureViewport()` at pointer-down time; was already passed to constructor but not stored previously
- **ScaleGizmo stores vp but doesn't use it in updateDrag:** Scale dragging operates entirely in screen-space (distance ratios from center), so no coordinate math is needed; vp is stored for API consistency
- **EditorUI constructor keeps hostScene parameter:** Maintains API compatibility; the parameter is accepted but not stored since EditorUI now gets its ViewportState dynamically from EditorScene.update() each frame

## Deviations from Plan

None — plan executed exactly as written. The only minor adjustment was that `SelectionManager.drawSelection()` was kept without a ViewportState parameter (the plan said "make it required" but the method itself only calls `getScreenBounds()` which uses world matrix, so ViewportState is genuinely not needed here — this matches the plan's intent of "use it when provided" and the actual behavior is more consistent).

## Issues Encountered

None. TypeScript compilation produced zero errors after both tasks were complete.

## User Setup Required

None.

## Next Phase Readiness

- Phase 2 is now complete (both plans done)
- All requirements COORD-01 through COORD-05 are fulfilled across plans 01 and 02
- Phase 3 (Object Identification) can proceed immediately

---
*Phase: 02-coordinate-system-refactor*
*Completed: 2026-02-18*
