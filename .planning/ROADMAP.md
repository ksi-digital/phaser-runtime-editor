# Roadmap: Phaser Runtime Editor — Viewport & Quality Refactor

**Created:** 2026-02-18
**Depth:** Quick (5 phases)
**Milestone:** v0.2.0 — Viewport stability, coordinate robustness, object identity, debugging UX

---

## Phase 1: Viewport Stability — Fix the Shifting Bug

**Goal:** Selecting an object no longer causes any visual shift of game objects or editor overlays.

**Requirements:** VIEW-01, VIEW-02, VIEW-03, VIEW-04

**Changes:**
- EditorFrame: Replace `grid-template-columns: auto 1fr auto` with fixed pixel widths (`220px 1fr 260px`)
- EditorFrame: Add 1px change guard to ResizeObserver callback to prevent feedback loops
- EditorFrame: Harden destroy/restore (check `document.contains()`, fix autoCenter margin order)
- Verify: selecting objects causes zero layout shift

**Files:** `src/ui/EditorFrame.ts`

**Success criteria:** Open editor → select any object → no visual shift. ResizeObserver fires at most once per editor activation.

**Risk:** LOW — CSS-only change + observer guard. No coordinate math changes.

**Plans:** 1/1 plans complete

Plans:
- [x] 01-01-PLAN.md — Fix CSS grid columns, add ResizeObserver change guard, harden destroy ordering

---

## Phase 2: Coordinate System Refactor — ViewportState + Centralized Transforms

**Goal:** All coordinate math uses a stable per-frame snapshot. Hit area transforms consolidated to single source.

**Requirements:** COORD-01, COORD-02, COORD-03, COORD-04, COORD-05

**Changes:**
- New `ViewportState` interface + `captureViewport()` function in `src/core/ViewportState.ts`
- Refactor all `CoordinateSystem` methods: accept `ViewportState` instead of `Phaser.Scene`
- EditorScene: capture ViewportState once per `update()`, pass to all subsystems
- Gizmos: capture ViewportState at drag start, use frozen snapshot throughout drag
- Extract `getHitAreaToScreen()` and `getHitAreaScreenDeltaToLocal()` into CoordinateSystem
- Replace 3 duplicate hit-area transform implementations with calls to shared methods
- Cache inverted parent matrix at drag start in MoveGizmo

**Files:** `src/core/ViewportState.ts` (new), `src/core/CoordinateSystem.ts`, `src/EditorScene.ts`, `src/gizmos/MoveGizmo.ts`, `src/gizmos/RotateGizmo.ts`, `src/gizmos/ScaleGizmo.ts`, `src/gizmos/HitAreaGizmo.ts`, `src/core/SelectionManager.ts`, `src/core/SnappingEngine.ts`, `src/ui/InspectorPanel.ts`

**Success criteria:** All gizmos, bounding boxes, and hit areas render at correct positions. Dragging during a resize event produces no jitter. No coordinate transform duplication across files.

**Risk:** MEDIUM — large surface area (all coordinate consumers updated). Mechanical but many files.

**Depends on:** Phase 1 (stable viewport eliminates confounding resize events)

**Plans:** 1/2 plans complete

Plans:
- [x] 02-01-PLAN.md — Create ViewportState interface + refactor CoordinateSystem to accept ViewportState + extract hit-area transform helpers
- [ ] 02-02-PLAN.md — Thread ViewportState through all consumers (EditorScene, gizmos, SelectionManager, SnappingEngine, InspectorPanel) + cache MoveGizmo inverse matrix

---

## Phase 3: Object Identification — Unique IDs + Hierarchy Improvements

**Goal:** Every object has a unique editor ID. Duplicate names are disambiguated everywhere.

**Requirements:** OBJ-01, OBJ-02, OBJ-03, OBJ-04

**Changes:**
- Add Symbol-keyed unique ID assignment at editor activation (WeakMap or direct property)
- Update `getChanges()` to use unique IDs as diff keys
- Update HierarchyPanel to show ID suffix for duplicate-named objects
- Update InspectorPanel Info folder to display editor ID
- Show all containers in hierarchy including invisible ones (DEBUG-03 bundled here)

**Files:** `src/PhaserEditorPlugin.ts`, `src/core/SelectionManager.ts`, `src/ui/HierarchyPanel.ts`, `src/ui/InspectorPanel.ts`

**Success criteria:** Two "TileSprite" objects show distinct names in hierarchy. Exporting changes produces separate entries for each. Inspector shows unique ID.

**Risk:** LOW — additive changes, no coordinate math involved.

**Depends on:** None (can run in parallel with Phase 2 if needed)

---

## Phase 4: Debugging & UX Polish

**Goal:** Editor provides accurate visual debugging aids and useful inspector data.

**Requirements:** DEBUG-01, DEBUG-02, DEBUG-04

**Changes:**
- Fix origin crosshair to render at actual transform origin (accounting for originX/originY), not AABB center
- Add type badges to hierarchy rows: `[Img]`, `[Spr]`, `[Txt]`, `[Ctr]`, `[TileSpr]`, `[Shp]`
- Add computed width/height (from getBounds) as read-only fields in Inspector Transform folder

**Files:** `src/core/SelectionManager.ts`, `src/ui/HierarchyPanel.ts`, `src/ui/InspectorPanel.ts`

**Success criteria:** Origin pin is visually separate from AABB center for objects with non-0.5 origins. Hierarchy shows type badges. Inspector shows computed dimensions.

**Risk:** LOW — visual additions, no architectural changes.

**Depends on:** Phase 2 (origin crosshair uses ViewportState), Phase 3 (hierarchy changes)

---

## Phase 5: Robustness — Plugin Registry + ScaleManager Isolation

**Goal:** Editor is robust in multi-game environments and Phaser internal changes.

**Requirements:** ROBUST-01, ROBUST-02, ROBUST-03, ROBUST-04

**Changes:**
- Replace module-level `activePluginInstance` / `editorSceneRegistered` singletons with `WeakMap<Phaser.Game, PluginRegistry>`
- Extract ScaleManager patch/revert into named `applyScalePatch()` / `revertScalePatch()` methods
- (VIEW fixes from Phase 1 already cover ROBUST-03 and ROBUST-04)

**Files:** `src/PhaserEditorPlugin.ts`, `src/ui/EditorFrame.ts`

**Success criteria:** Two Phaser.Game instances can each toggle their editor independently. ScaleManager patch logic is in two named methods, not inline.

**Risk:** LOW — self-contained refactors within single files.

**Depends on:** Phase 1 (EditorFrame already modified)

---

## Phase Summary

| Phase | Goal | Requirements | Risk | Depends On |
|-------|------|-------------|------|------------|
| 1 | Viewport stability | Complete    | 2026-02-18 | — |
| 2 | Coordinate refactor | COORD-01–05 | MEDIUM | Phase 1 |
| 3 | Object identification | OBJ-01–04, DEBUG-03 | LOW | — |
| 4 | Debugging & UX | DEBUG-01–02, DEBUG-04 | LOW | Phase 2, 3 |
| 5 | Robustness | ROBUST-01–04 | LOW | Phase 1 |

**Parallelization:** Phase 1 first (blocks 2 and 5). Then Phase 2 + Phase 3 in parallel. Phase 4 after both. Phase 5 can run alongside Phase 3 or 4.

```
Phase 1 ──→ Phase 2 ──→ Phase 4
         ╲              ╱
          → Phase 3 ──→
         ╲
          → Phase 5
```

---

## Requirement Coverage

All 21 v1 requirements mapped:
- Phase 1: 4 (VIEW)
- Phase 2: 5 (COORD)
- Phase 3: 4 + 1 (OBJ + DEBUG-03)
- Phase 4: 3 (DEBUG)
- Phase 5: 4 (ROBUST)
- Unmapped: 0

---
*Roadmap created: 2026-02-18*
*Last updated: 2026-02-18 after initial creation*
