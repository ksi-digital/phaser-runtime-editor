# Feature Landscape: Game Editor Debugging, Viewport Stability, Object Identification

**Domain:** Runtime game editor plugin — debugging and inspection tooling
**Researched:** 2026-02-18
**Milestone:** Adding viewport stability, debugging overlays, and unique object identification to a Phaser 4 runtime editor

---

## Research Basis and Confidence

Web access was unavailable. This document synthesises:
- Direct codebase analysis of the existing editor (HIGH confidence — read all source files)
- Author's deep knowledge of Unity 2021–2023 editor tooling conventions (MEDIUM confidence — training data verified against well-documented community patterns)
- Godot 4.x editor conventions (MEDIUM confidence — training data)
- Phaser Editor 2D v3 patterns (MEDIUM confidence — training data)
- General game-editor UI literature published before August 2025

Confidence is noted per feature.

---

## Context: What Already Exists

The editor already has (do not re-build):

| Capability | Implementation |
|---|---|
| Design-bounds overlay (cyan rect) | `EditorScene.drawDesignBounds()` |
| Selection bounding box + corner handles | `SelectionManager.drawSelection()` |
| Hit area overlay (yellow fill + stroke) | `EditorScene.drawHitArea()` |
| Status bar: mouse + selection design/screen coords | `EditorScene.updateCoordBar()` |
| Drag label (angle/scale readout during drag) | `GizmoManager.updateDragLabel()` |
| Inspector: x, y, rotation, scale, origin, alpha, depth | `InspectorPanel` (Tweakpane) |
| Hierarchy with visibility toggle + depth column | `HierarchyPanel` |
| Move/Rotate/Scale gizmos with snapping | `MoveGizmo`, `RotateGizmo`, `ScaleGizmo` |
| Hit area gizmos with vertex handles | `HitAreaGizmo` |
| CSS-grid layout (viewport never shifts on panel open) | `EditorFrame` |

Known bug: inspector panel populates and the viewport shifts. Root cause is `InspectorPanel.bind()` creating a new `<div>` inside the inspector slot that pushes content and causes the inspector slot width to change, which triggers EditorFrame's ResizeObserver, which re-runs `setParentSize()`. The fix is stable inspector slot width (fixed column width in grid, no intrinsic sizing).

---

## Table Stakes

Features developers expect from any game editor debugging tool. Absence makes the tool feel unfinished.

| Feature | Why Expected | Complexity | Confidence | Notes |
|---|---|---|---|---|
| **Stable viewport (no layout shift on inspector populate)** | Core usability — editor must not jump when you click an object | Low | HIGH | EditorFrame already uses CSS grid; fix is constraining inspector column to a fixed pixel width (`width: 260px` in grid-template-columns) rather than `auto`. The `auto` column expands when Tweakpane adds DOM content. |
| **Unique object identity that survives name collisions** | Multiple objects with the same `.name` property break selection, inspector title, change-diff export, and console logs. Unity and Godot both use internal integer IDs alongside display names. | Low | HIGH | Add an integer counter in `PhaserEditorPlugin` or `SelectionManager.getObjectName()`. Pattern: `"Player" → "Player [3]"` when duplicates detected. EditorState can carry `selectedId` as a string `"${type}#${uid}"`. |
| **Origin point crosshair on canvas** | Unity's Scene view and Godot's 2D editor both render a small cross at the transform origin for the selected object. Without it, move-gizmo anchoring is opaque. | Low | HIGH | Already partially exists (center crosshair in `drawSelection()`). Extend to render at the computed origin point (accounting for `originX`/`originY` offset), not just the bounding-box center. |
| **Coordinate readout at pointer (live)** | Every professional 2D game editor (Phaser Editor 2D, Unity 2D, Godot) shows design-space x/y under the cursor in real time. | Low — already partly done | HIGH | `updateCoordBar()` already emits mouse design coords. Table stakes to keep this working after viewport fix; ensure it does not stutter during layout changes. |
| **Object type badge in hierarchy** | Godot hierarchy shows icons (sprite, label, node2D, collider). Phaser Editor 2D shows type icons. Distinguishes objects with the same name at a glance. | Low | MEDIUM | Text badge is sufficient: `[Img]`, `[Spr]`, `[Txt]`, `[Ctr]`, `[Shp]`. Already partially exists via `getObjectName()` fallback; surfacing as a visible badge is the delta. |
| **Inspector shows unique ID** | When multiple objects share a name, the inspector must show which one is selected. | Low | HIGH | Show `id` field in the "Info" folder of `InspectorPanel`. Read from the UID assigned at editor activation. |
| **Bounds overlay for ALL selected objects, not just hit area** | The bounding box already exists, but does not show the display-origin offset visually. Editors display a distinct "origin pin" separate from the AABB to communicate where transforms apply. | Low–Med | HIGH | Delta: render a second marker (diamond or circle) at the object's actual position/origin, separate from the AABB center crosshair. |
| **Hit area debug info in status bar** | When `editingHitArea=true`, status bar should show hit area dimensions so you can nudge precisely without opening inspector. | Low | MEDIUM | Status bar has unused space. Pattern from Godot: "HitArea: Rect(x=10, y=10, w=80, h=60)" |

---

## Differentiators

Features that go beyond table stakes and provide competitive advantage for a runtime plugin. Not expected; highly valued.

| Feature | Value Proposition | Complexity | Confidence | Notes |
|---|---|---|---|---|
| **Object ID persistence across editor sessions** | Stable IDs (e.g. based on scene/index path, not runtime counter) allow the change-diff export to refer to objects by a stable key, not fragile display names | Medium | MEDIUM | Assign IDs based on scene key + object index in `scene.children.list` at snapshot time. Fragility note: if user adds objects at runtime between editor sessions, indices shift. Document this limitation. |
| **Coordinate space toggle** | Show design-space vs screen-space vs world-space for selected object. Currently the status bar mixes both. A toggle (Design / Screen) in the toolbar lets devs verify transforms in the space they care about. | Low–Med | MEDIUM | Unity Scene view has "Global/Local" toggle. Phaser has a single design-space for this plugin. A toggle to show screen-space px alongside design-space coordinates is the MVP. |
| **Dimension readout in inspector** | Show computed display width/height (from getBounds) alongside x/y. Devs need this when calculating layout offsets. Godot's inspector shows computed size in the Transform section. | Low | MEDIUM | Read `getBounds()` and display as read-only `width` and `height` in Transform folder. Complexity: ContainerBounds path already exists in SelectionManager. |
| **Color-coded object type rows in hierarchy** | Different colors per type (sprite=blue, text=green, container=purple) makes scanning a large hierarchy faster. Godot does this with icons; color-only is the minimal implementation. | Low | MEDIUM | CSS `data-type` attribute on `.pe-row` elements, single injected stylesheet. Doesn't require rebuild on every refresh. |
| **Inspector auto-width stabilisation via CSS variable** | Instead of fixing a hardcoded `260px`, expose the panel width as a CSS custom property (`--pe-inspector-width: 260px`) on the frame element, letting consumers override it without forking the plugin. | Very Low | HIGH | Pure CSS refactor, no logic change. Differentiator because most embedded editor plugins hardcode panel widths. |
| **Keyboard shortcut: focus selected object in hierarchy** | Press `F` with an object selected to scroll the hierarchy to that object. Unity does this. Godot does this. Phaser Editor 2D does this. | Low | HIGH | `HierarchyPanel.scrollIntoView()` call already exists for click events; wire `KeyboardEvent` listener in `EditorScene` to trigger `hierarchy.focusSelected()`. |
| **Overlay opacity control** | The semi-transparent dim overlay (`0x000000, 0.15`) is currently hardcoded. A slider in the toolbar (0–50%) lets devs see the game better during inspection without exiting the editor. | Low | LOW | Nice touch; not standard. Most editors use a fixed-opacity mode indicator. Flag as LOW because it adds toolbar complexity for marginal benefit. |

---

## Anti-Features

Features to explicitly NOT build in this milestone. Each has a reason and an alternative.

| Anti-Feature | Why Avoid | What to Do Instead |
|---|---|---|
| **Undo/redo stack** | Full undo/redo requires a command pattern, action history, and inverse operations for all transform types including hit areas. Estimated 3–5x the complexity of this milestone. Currently CONCERNS.md documents it as Phase 9 work. | Changes reset on editor exit (existing behavior). Document Ctrl+Z as "out of scope, coming Phase 9". |
| **Multi-object selection** | Multi-select requires bounding-box of multiple objects, gizmos that affect all selected, copy/paste logic. Completely orthogonal to debugging overlays. | Single-select with clear ID disambiguation. Document multi-select as Phase 10. |
| **Scene serialisation / import** | JSON export already exists (Copy Changes). Full scene import/export is a separate domain with complex dependency on Phaser's object constructors. | Keep "Copy Changes" as the export surface. Do not add import in this milestone. |
| **Custom debug overlays API** | A public API letting consumers draw their own overlays via callbacks would require a stable extension point design. Premature while the rendering loop itself is being stabilised. | Expose the `gfx` Graphics object or a hook in EditorScene — only after internal overlays are stable. |
| **Pixel ruler / measurement tool** | Rulers along viewport edges are a Photoshop/Figma pattern. Useful for pure layout tools; not expected in game editor plugins. Adds DOM surface area and maintenance burden. | The status-bar coordinate readout serves the same measurement function with less complexity. |
| **In-editor object creation/deletion** | Creating new game objects at runtime without knowing constructor arguments and asset loading state is fragile. Deletion requires scene-graph cleanup Phaser doesn't expose cleanly. | Inspector property editing + visibility toggle is sufficient for this milestone. |
| **Gizmo axis-aligned world-space mode** | Unity supports "global" vs "local" gizmo axes. For a 2D game, design-space is fixed; there is no camera rotation. Adding a global/local toggle would add complexity with no benefit unless the host scene uses camera rotations (unsupported). | Design-space coordinates are implicitly "global 2D". Document limitation. |
| **Tweakpane plugin extensions** | Tweakpane has a plugin ecosystem (color pickers, thumbnails, etc.). Integrating them adds bundle size and peerDep complexity before the core inspector is stable. | Use only stock Tweakpane bindings for this milestone. |

---

## Feature Dependencies

```
Stable viewport (fixed grid column width)
  → Inspector populate no longer triggers ResizeObserver cascade
  → Coordinate readout remains stable during inspect

Unique object IDs (UID counter)
  → Inspector "Info" folder shows UID
  → Hierarchy row can show UID as tooltip (hover)
  → getChanges() diff keyed by UID, not display name
  → Deduplication logic in getObjectName() uses UID suffix

Origin crosshair (accurate origin pin)
  → Requires SelectionManager.getScreenBounds() position (already computed)
  → Requires coordinateSystem.designToScreen() for origin offset
  → No new dependencies

Dimension readout in inspector
  → Requires SelectionManager.getScreenBounds() (already computed)
  → No new dependencies; read-only Tweakpane bindings

Coordinate space toggle (Design/Screen toggle)
  → Requires CoordinateSystem.designToScreen() / screenToDesign() (already exist)
  → Updates inspector x/y labels when toggled
  → Status bar format changes

Hit area status bar info
  → Requires EditorState.editingHitArea (already exists)
  → Reads hit area geometry (already available in EditorScene.drawHitArea())
  → Writes to EditorFrame.setStatusText() (already exists)
```

---

## MVP Recommendation for This Milestone

### Must Build (Table Stakes)

1. **Fix viewport stability** — change `grid-template-columns: auto 1fr auto` to `grid-template-columns: 220px 1fr 260px` in `EditorFrame`. This is the reported bug. Complexity: 10 minutes of work.

2. **Unique object IDs** — add a `WeakMap<GameObject, number>` with an auto-increment counter in `SelectionManager` or a new `ObjectRegistry`. Use IDs in `getObjectName()` for duplicate disambiguation and in `getChanges()` as the diff key. Complexity: Low (2–4 hours).

3. **Accurate origin crosshair** — modify `SelectionManager.drawSelection()` to draw the origin pin at `(x, y)` transformed by `designToScreen()`, separate from the AABB center crosshair already drawn. Complexity: Low (1 hour).

4. **Inspector UID display** — add a `uid` read-only binding in the "Info" folder of `InspectorPanel`. Complexity: Trivial once IDs exist.

5. **Hit area status bar context** — when `editingHitArea=true`, append hit area dimensions to the status bar text in `updateCoordBar()`. Complexity: Low (30 minutes).

### Build if Time Permits (High-Value Differentiators)

6. **Object type badge in hierarchy** — add a `[Spr]`/`[Txt]`/`[Img]`/`[Ctr]` prefix to hierarchy row labels. Complexity: Low (1 hour).

7. **Dimension readout in inspector** — add read-only `width`/`height` fields to the Transform folder, populated from `getBounds()`. Complexity: Low (1–2 hours).

8. **Keyboard `F` to focus in hierarchy** — wire a keydown listener to call `HierarchyPanel.scrollSelectedIntoView()`. Complexity: Low (30 minutes).

### Defer

- **Coordinate space toggle** — defer; the status bar already shows both. Adding a toolbar toggle clutters the UI before the stability fix lands.
- **Color-coded rows** — defer; visual polish. Hierarchy is functional without it.
- **Overlay opacity slider** — defer; no user-reported need.
- All anti-features — explicitly out of scope.

---

## Sources

**Codebase (HIGH confidence):**
- `src/ui/EditorFrame.ts` — grid layout, ResizeObserver pattern, `auto` column sizing
- `src/ui/InspectorPanel.ts` — Tweakpane bind/dispose, Info folder
- `src/core/SelectionManager.ts` — `drawSelection()`, `getObjectName()`, bounding box computation
- `src/EditorScene.ts` — `updateCoordBar()`, `drawDesignBounds()`, `drawHitArea()`, overlay depth layers
- `src/core/EditorState.ts` — `editingHitArea`, `selected`, event system
- `.planning/codebase/CONCERNS.md` — known bugs including viewport shift, missing features list

**Industry conventions (MEDIUM confidence, training data):**
- Unity Scene view: Gizmos, origin pin, coordinate toolbar, selection AABB with handles, object icon system (Unity 2021–2023 docs)
- Godot 4 editor: Inspector with computed size display, hierarchy type icons, `F` key to focus selection in tree (Godot 4.x docs)
- Phaser Editor 2D v3: Design-space coordinate overlay, object type classification, canvas-beside-panel layout pattern
- "Game Engine Architecture" (Jason Gregory, 3rd ed.) — editor overlay and debugging tool design principles
