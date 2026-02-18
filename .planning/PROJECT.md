# Phaser Runtime Editor — Viewport & Quality Refactor

## What This Is

A Phaser 3/4 scene plugin (`@gamotions/phaser-runtime-editor`) that injects a runtime visual editor into any Phaser game — letting developers drag objects, inspect properties, snap to grid, edit hit areas, and export layout changes as JSON. This milestone focuses on fixing critical viewport/coordinate bugs, adding debugging tools, improving object identification, and refactoring the coordinate system for robustness.

## Core Value

The editor's visual overlays (bounding boxes, gizmos, selection highlights) must accurately reflect the actual game object positions — if they drift or shift, the editor is unusable.

## Requirements

### Validated

- ✓ Toggle editor via hotkey (F2) — existing
- ✓ Object selection via canvas click with depth-based priority — existing
- ✓ Hierarchy panel showing scene object tree with expand/collapse — existing
- ✓ Inspector panel with Tweakpane property editing (Transform, Origin, Display, Info, Hit Area) — existing
- ✓ Move/Rotate/Scale gizmos with axis constraints — existing
- ✓ Grid and object snapping with visual guides — existing
- ✓ Hit area visualization and vertex editing (Rectangle/Circle/Polygon) — existing
- ✓ CSS grid editor frame with toolbar, hierarchy, canvas, inspector, status bar — existing
- ✓ Design-space ↔ screen-space coordinate conversion — existing
- ✓ Container-aware world position calculations — existing
- ✓ Property snapshot/restore on editor exit — existing
- ✓ Copy Changes to clipboard (JSON export) — existing

### Active

- [ ] Fix viewport shift when inspector panel populates on selection
- [ ] Fix bounding box misalignment after canvas resize
- [ ] Add unique object identification (not name-based)
- [ ] Show all containers in hierarchy (including invisible ones)
- [ ] Add visual debugging tools for coordinate systems and transforms
- [ ] Refactor CoordinateSystem for robustness with Scale.FIT + retina DPR
- [ ] Centralize hit area coordinate transform logic (currently duplicated in 3 places)

### Out of Scope

- Multi-select (Phase 10 future work) — too complex for this refactor
- Undo/redo system (Phase 9 future work) — separate feature
- Grid overlay visualization — separate feature
- Layout export/import — separate feature
- Phaser 3 backward compatibility testing — focus on Phaser 4

## Context

**The shifting bug:** When a user selects any object, the InspectorPanel populates with Tweakpane controls. The inspector slot in the CSS grid uses `auto` column sizing, so it grows on populate. This causes the canvas cell (column 2, `1fr`) to shrink. The ResizeObserver fires `setParentSize()`, Phaser recalculates Scale.FIT geometry, and the game re-renders at a different scale/offset. All objects and bounding boxes appear shifted left.

**Retina/DPR setup used by consumers:**
```js
const dpr = window.devicePixelRatio || 1;
const config = {
    pixelArt: false,
    antialias: true,
    antialiasGL: true,
    roundPixels: false,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: Math.round(window.innerWidth * dpr),
        height: Math.round(window.innerHeight * dpr),
        zoom: 1 / dpr,
    },
};
```

The editor must work correctly with this configuration where the game resolution is in device pixels and `zoom: 1/dpr` scales the canvas back to CSS pixels.

**Duplicate names:** The hierarchy panel identifies objects by Phaser's `.name` property or fallback type names. Multiple objects can share names (e.g., two "TileSprite" entries), causing ambiguity in selection tracking and hierarchy display.

**Tech debt identified in codebase audit:**
- Hit area coordinate transforms duplicated across 3 files (EditorScene, SelectionManager, HitAreaGizmo)
- Matrix inversion called every frame during gizmo drag (expensive)
- Hardcoded depth constants scattered across files
- Minimal error logging; silent failures in coordinate transforms

## Constraints

- **API compatibility**: Public API (`PhaserEditorPlugin`, `EditorPluginConfig`) must not break for existing consumers
- **Scale mode**: Must work with `Phaser.Scale.FIT` and `autoCenter: CENTER_BOTH`
- **Retina DPR**: Must handle `zoom: 1/dpr` configuration correctly
- **Bundle size**: Keep additions minimal; editor is already ~216 kB bundled
- **Phaser 4 RC6**: Target `phaser@^4.0.0-rc.6` (devDependency)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use fixed-width inspector column instead of `auto` | Prevents CSS grid reflow when inspector content changes | — Pending |
| Use internal unique IDs for object tracking | Names are not unique; need reliable object identity | — Pending |
| Centralize coordinate transforms in CoordinateSystem | Currently duplicated in 3 places; single source of truth | — Pending |

---
*Last updated: 2026-02-18 after initialization*
