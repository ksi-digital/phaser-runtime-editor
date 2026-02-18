# Architecture Patterns

**Domain:** Phaser 4 editor plugin — viewport/coordinate system refactoring
**Researched:** 2026-02-18
**Confidence:** HIGH (based on direct codebase analysis; all claims reference specific files and lines)

---

## Recommended Architecture

The refactoring targets four structural problems that currently couple and destabilize the system:

1. `CoordinateSystem` reads live camera dimensions on every call, making transforms volatile during resize events.
2. `EditorFrame`'s `auto 1fr auto` grid columns cause reflows when the Inspector panel grows.
3. Hit-area transform math is duplicated in three files with no shared abstraction.
4. The `PhaserEditorPlugin` uses module-level singletons for its object registry instead of a proper per-game registry.

The sections below define clean component boundaries, the correct data flow, and the order in which changes should be made to avoid regressions.

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `PhaserEditorPlugin` | Plugin lifecycle, toggle, property snapshots, object registry | `EditorScene` (start/stop), `Phaser.Game` (SceneManager) |
| `EditorFrame` | CSS grid layout, canvas relocation, ScaleManager patching, ResizeObserver | `Phaser.Game` (scale), DOM |
| `ViewportState` (new) | Immutable snapshot of `{sf, offsetX, offsetY, canvasW, canvasH}` | `CoordinateSystem`, `EditorScene` |
| `CoordinateSystem` | Design ↔ screen math using a `ViewportState` value (not live camera) | `ViewportState`, gizmos, `SelectionManager`, `SnappingEngine` |
| `EditorState` | Central event bus for selection, tool, snapping config, hit-area mode | All panels, all gizmos |
| `SelectionManager` | Hit-testing, object collection, bounding box drawing | `CoordinateSystem`, `EditorState`, `Phaser.Game` |
| `GizmoManager` | Routes pointer events to the active gizmo | All gizmos, `EditorState` |
| `MoveGizmo / RotateGizmo / ScaleGizmo / HitAreaGizmo` | Interactive manipulation of a single object property | `CoordinateSystem`, `SelectionManager` |
| `HitAreaTransforms` (new, within `CoordinateSystem`) | Shared `toScreen(lx, ly, obj)` and `screenDeltaToLocal(dsx, dsy, obj)` utilities | `HitAreaGizmo`, `SelectionManager`, `EditorScene.drawHitArea` |
| `EditorUI` | Panel lifecycle wiring | `EditorState`, all panels |
| `InspectorPanel` | Tweakpane form bound to selected object | `CoordinateSystem`, `ViewportState` |
| `HierarchyPanel` | HTML tree of scene objects | `EditorState`, `Phaser.Game` |
| `ToolbarPanel` | Tool buttons, snapping controls, Copy Changes button | `EditorState` |
| `SnappingEngine` | Grid and object snap math (stateless) | `CoordinateSystem`, `MoveGizmo` |

---

## Data Flow

### Viewport State Propagation (the core fix)

```
ResizeObserver fires on canvasCell
  ↓
EditorFrame computes new {width, height}
  ↓
Calls scale.setParentSize(w, h)      ← Phaser ScaleManager updates
  AND
EditorScene.onResize() fires
  ↓
EditorScene calls ViewportState.capture(scene.cameras.main)
  → { sf, offsetX, offsetY, canvasW, canvasH } frozen as plain object
  ↓
EditorScene.update() passes ViewportState to CoordinateSystem methods
All gizmo/selection calls use the same frozen snapshot for the whole frame
```

**Key invariant:** `CoordinateSystem` never reads `scene.cameras.main` directly. All methods accept a `ViewportState` parameter (or the `CoordinateSystem` instance stores the last-captured state). No viewport value is re-read mid-frame.

### Selection Flow (unchanged routing, stable coordinates)

```
User click on canvas overlay
  ↓
EditorScene.overlay.pointerdown
  ↓
GizmoManager.handlePointerDown(sx, sy)  ← uses frozen ViewportState
  ├─ YES hit gizmo handle: startDrag(handle, sx, sy, target, hostScene, viewportState)
  └─ NO: continue
  ↓
SelectionManager.hitTest(sx, sy, viewportState)
  ↓
EditorState.selected = hit
  ↓
EVENT_SELECTION_CHANGED
  └─ InspectorPanel.bind(obj)    ← triggers DOM growth in inspector slot
     (CSS grid is fixed-column: inspector slot has fixed px width, cannot grow)
```

**Key invariant:** Inspector DOM changes cannot change the canvas cell width. The CSS grid uses fixed pixel columns, not `auto` columns.

### Gizmo Drag Flow

```
User drag on handle
  ↓
GizmoManager.handlePointerMove(sx, sy)
  ↓
ActiveGizmo.updateDrag(sx, sy)
  → All coordinate math uses the ViewportState snapshot taken at drag start
  → No recalculation of sf or offsets mid-drag
  ↓
EditorScene.update()
  → ViewportState.capture() called once at top of update()
  → All draw calls use that frame's frozen ViewportState
```

---

## Patterns to Follow

### Pattern 1: Immutable ViewportState Snapshot

**What:** A plain object `{ sf, offsetX, offsetY, canvasW, canvasH }` captured once per frame (or once per resize event) from `scene.cameras.main`. All coordinate math methods accept this as a parameter instead of a live `Phaser.Scene`.

**When:** Whenever coordinate conversion needs to be stable across a single frame or a drag session.

**Example:**

```typescript
// src/core/ViewportState.ts  (new file)

export interface ViewportState {
    readonly sf: number;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly canvasW: number;
    readonly canvasH: number;
}

export function captureViewport(camera: Phaser.Cameras.Scene2D.Camera, designW: number, designH: number): ViewportState {
    const { width: canvasW, height: canvasH } = camera;
    const sf = Math.min(canvasW / designW, canvasH / designH);
    const offsetX = (canvasW - designW * sf) / 2;
    const offsetY = (canvasH - designH * sf) / 2;
    return { sf, offsetX, offsetY, canvasW, canvasH };
}
```

```typescript
// Refactored CoordinateSystem.ts
designToScreen(dx: number, dy: number, vp: ViewportState): { x: number; y: number } {
    return {
        x: vp.offsetX + dx * vp.sf,
        y: vp.offsetY + dy * vp.sf,
    };
}

screenToDesign(sx: number, sy: number, vp: ViewportState): { x: number; y: number } {
    return {
        x: (sx - vp.offsetX) / vp.sf,
        y: (sy - vp.offsetY) / vp.sf,
    };
}
```

**Confidence:** HIGH — this is standard practice for any rendering system that reads GPU/compositor state. The current `scene.cameras.main.width` is a live DOM-dependent value; snapshotting it eliminates mid-frame drift.

---

### Pattern 2: Fixed-Width CSS Grid Columns

**What:** Replace `auto 1fr auto` with `[fixed]px 1fr [fixed]px`. Panel widths are defined at frame creation time and do not react to content size.

**When:** Any CSS grid used to host a Phaser canvas in the center cell. The `auto` keyword for columns causes the browser to recompute column widths when child content grows, which triggers a reflow that can change the center cell's width.

**Example:**

```typescript
// EditorFrame.ts — constructor
const HIERARCHY_W = 220;   // px, match HierarchyPanel wrapper width
const INSPECTOR_W = 280;   // px, match InspectorPanel wrapper width

this.frameEl.style.cssText = `
    position: fixed; top: 0; left: 0;
    width: 100vw; height: 100vh;
    display: grid;
    grid-template-columns: ${HIERARCHY_W}px 1fr ${INSPECTOR_W}px;
    grid-template-rows: auto 1fr auto;
    background: #1a1a1a;
    z-index: 999;
    overflow: hidden;
`;

// Panel slots get overflow: hidden so content cannot expand beyond the fixed column
this.inspectorSlot = this.createSlot('pe-slot-inspector', `
    grid-column: 3; grid-row: 2;
    overflow-y: auto;
    overflow-x: hidden;
    width: ${INSPECTOR_W}px;
    border-left: 1px solid #444;
`);
```

**Why this fixes the bug:** With `auto` columns, a newly-created Tweakpane panel that is 260px wide causes the inspector column to expand to 260px, which shrinks the `1fr` center cell, which triggers `ResizeObserver`, which calls `setParentSize()`, which recalculates `Scale.FIT`, which moves game objects. With `fixed`px columns, the inspector slot is always `INSPECTOR_W` pixels regardless of content.

**Confidence:** HIGH — verified by reading the bug chain in `EditorFrame.ts` lines 44-56, `ResizeObserver` callback at lines 103-111, and `InspectorPanel.bind()` which creates a `div` with `width: 260px`.

---

### Pattern 3: Centralized Hit-Area Transform Utilities

**What:** Extract the repeated `getWorldTransformMatrix()` + `displayOrigin` subtraction logic into two named functions on `CoordinateSystem` (or a separate `HitAreaTransforms` namespace). All three current call sites (`EditorScene.drawHitArea`, `SelectionManager.getPolygonShapeBounds`, `HitAreaGizmo.getTransformHelpers`) use this shared implementation.

**When:** Any coordinate transform that involves a Phaser world transform matrix and frame-space hit area vertices.

**Example:**

```typescript
// Add to CoordinateSystem.ts

/**
 * Returns a toScreen() closure for hit-area points on obj.
 * Handles the displayOrigin subtraction difference between Containers and other objects.
 */
getHitAreaToScreen(obj: Phaser.GameObjects.GameObject): (lx: number, ly: number) => { x: number; y: number } {
    const matrix: Phaser.GameObjects.Components.TransformMatrix =
        (obj as any).getWorldTransformMatrix();
    const isContainer = obj instanceof Phaser.GameObjects.Container;
    const doX = isContainer ? 0 : ((obj as any).displayOriginX ?? 0);
    const doY = isContainer ? 0 : ((obj as any).displayOriginY ?? 0);

    return (lx: number, ly: number) => {
        const adjX = lx - doX;
        const adjY = ly - doY;
        return {
            x: matrix.a * adjX + matrix.c * adjY + matrix.tx,
            y: matrix.b * adjX + matrix.d * adjY + matrix.ty,
        };
    };
}

/**
 * Returns a screenDeltaToLocal() closure for converting screen-space drag deltas
 * to hit-area local-space deltas for obj.
 */
getHitAreaScreenDeltaToLocal(obj: Phaser.GameObjects.GameObject): (dsx: number, dsy: number) => { dx: number; dy: number } {
    const matrix: Phaser.GameObjects.Components.TransformMatrix =
        (obj as any).getWorldTransformMatrix();
    const det = matrix.a * matrix.d - matrix.b * matrix.c;
    return (dsx: number, dsy: number) => ({
        dx: (matrix.d * dsx - matrix.c * dsy) / det,
        dy: (-matrix.b * dsx + matrix.a * dsy) / det,
    });
}
```

**Confidence:** HIGH — the duplication is clearly visible in:
- `src/EditorScene.ts` lines 283-290 (local `toScreen` closure)
- `src/core/SelectionManager.ts` lines 133-146 (matrix multiplication inline)
- `src/gizmos/HitAreaGizmo.ts` lines 265-286 (`getTransformHelpers` private method)

All three implement identical math. The only variation is the `isContainer` check, which is already handled consistently across them.

---

### Pattern 4: ScaleManager Patching via Accessor Replacement

**What:** Instead of directly assigning to `scale.parent` and `scale.parentIsWindow` (internal Phaser properties accessed via `as any` cast), wrap the ScaleManager patching in a well-defined `patchScaleManager(scale, canvasCell) / unpatchScaleManager(scale, savedState)` pair that is isolated to `EditorFrame` and documents exactly which internal properties are touched.

**When:** Whenever interacting with Phaser's ScaleManager internals that are not part of the public API.

**Example:**

```typescript
// In EditorFrame.ts

interface ScaleManagerPatch {
    parent: any;
    parentIsWindow: boolean;
    autoCenter: number;
    canvasMarginLeft: string;
    canvasMarginTop: string;
}

private applyScalePatch(scale: any, canvas: HTMLCanvasElement, newParent: HTMLElement): ScaleManagerPatch {
    const saved: ScaleManagerPatch = {
        parent: scale.parent,
        parentIsWindow: scale.parentIsWindow,
        autoCenter: scale.autoCenter,
        canvasMarginLeft: canvas.style.marginLeft,
        canvasMarginTop: canvas.style.marginTop,
    };

    scale.parent = newParent;
    scale.parentIsWindow = false;
    scale.autoCenter = Phaser.Scale.NO_CENTER;
    canvas.style.marginLeft = '0';
    canvas.style.marginTop = '0';

    return saved;
}

private revertScalePatch(scale: any, canvas: HTMLCanvasElement, saved: ScaleManagerPatch): void {
    scale.parent = saved.parent;
    scale.parentIsWindow = saved.parentIsWindow;
    scale.autoCenter = saved.autoCenter;
    canvas.style.marginLeft = saved.canvasMarginLeft;
    canvas.style.marginTop = saved.canvasMarginTop;
}
```

**Why this matters for robustness:** The current code in `EditorFrame.constructor()` (lines 96-100) and `EditorFrame.destroy()` (lines 141-145) does this inline with scattered `as any` casts. The patch/revert pair makes the fragile surface explicit and testable. If Phaser 4 renames these fields in a future RC, there is now a single place to update.

**Confidence:** MEDIUM — the current approach works for Phaser 4 RC6. The internal field names (`parent`, `parentIsWindow`, `autoCenter`) have been stable across Phaser 3 releases and appear in the same form in RC6. However, these are private/internal fields with no API stability guarantee.

---

### Pattern 5: Per-Game Object Registry for Plugin Instances

**What:** Replace the module-level `activePluginInstance` and `editorSceneRegistered` singletons in `PhaserEditorPlugin.ts` with a `WeakMap<Phaser.Game, PluginRegistry>` keyed on the game instance. This allows multiple Phaser game instances in the same JavaScript module (common in test environments and iframe-based editors) without the instances interfering.

**When:** Any Phaser scene plugin that must maintain module-level state across scenes within the same game but isolated from other game instances.

**Example:**

```typescript
// src/PhaserEditorPlugin.ts

interface PluginRegistry {
    activeInstance: PhaserEditorPlugin | null;
    editorSceneRegistered: boolean;
    domListenerRegistered: boolean;
}

// WeakMap allows GC when the game instance is destroyed
const gameRegistry = new WeakMap<Phaser.Game, PluginRegistry>();

function getRegistry(game: Phaser.Game): PluginRegistry {
    if (!gameRegistry.has(game)) {
        gameRegistry.set(game, {
            activeInstance: null,
            editorSceneRegistered: false,
            domListenerRegistered: false,
        });
    }
    return gameRegistry.get(game)!;
}

// In boot():
const reg = getRegistry(this.game);
reg.activeInstance = this;
if (!reg.domListenerRegistered) {
    window.addEventListener('keydown', (e) => {
        if (reg.activeInstance && e.key === reg.activeInstance.hotkey) {
            e.preventDefault();
            reg.activeInstance.toggle();
        }
    });
    reg.domListenerRegistered = true;
}
```

**Confidence:** HIGH — `WeakMap<K, V>` keyed on object identity is the canonical JavaScript pattern for per-instance state that avoids memory leaks. The current module-level `let activePluginInstance: PhaserEditorPlugin | null` in `PhaserEditorPlugin.ts` lines 23-25 is a known anti-pattern for shared-module environments.

---

### Pattern 6: Drag-Start Viewport Snapshot for Gizmo Stability

**What:** At `startDrag()` time, each gizmo captures a `ViewportState` snapshot. All `updateDrag()` calls use that snapshot, not the current frame's viewport. This prevents the gizmo from drifting if a resize occurs during drag.

**When:** Any interactive drag that converts screen-space pointer deltas to design-space or local-space.

**Example:**

```typescript
// MoveGizmo.ts — startDrag
startDrag(handle, screenX, screenY, target, hostScene, viewportState: ViewportState): void {
    // ...existing logic...
    this.dragViewport = viewportState;  // frozen at drag start

    const designPos = this.coords.getDesignPosition(target, viewportState);
    this.objStartDesignX = designPos.x;
    this.objStartDesignY = designPos.y;
}

// updateDrag — always uses this.dragViewport, not a new snapshot
updateDrag(screenX: number, screenY: number): void {
    const sf = this.dragViewport.sf;  // stable for entire drag
    // ...rest of logic...
}
```

**Confidence:** HIGH — `MoveGizmo.updateDrag()` currently calls `this.coords.getScaleFactor(this.hostScene)` at line 204, which reads `scene.cameras.main.width`. If a resize fires during drag, `sf` changes mid-drag, causing the object to jump. Snapshotting at drag start eliminates this.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Reading `scene.cameras.main` on Every Coordinate Call

**What:** `CoordinateSystem.getScaleFactor(scene)` reads `scene.cameras.main.width` and `height` on every invocation (current behavior in `src/core/CoordinateSystem.ts` lines 22-25).

**Why bad:** Camera dimensions are a live DOM-dependent value that can change during a browser layout pass. Calling this method multiple times in a single frame (e.g., once for selection box, once for gizmo, once for inspector) can return different values if a resize event fired between calls.

**Instead:** Capture once per frame at the top of `EditorScene.update()`, store as `this.currentViewport: ViewportState`, pass to all methods that need it.

---

### Anti-Pattern 2: `auto` Columns in the Editor Grid

**What:** `grid-template-columns: auto 1fr auto` (current in `EditorFrame.ts` line 50).

**Why bad:** `auto` for a grid column means "as wide as the content." When `InspectorPanel.bind()` creates a Tweakpane pane with `width: 260px`, the browser expands the inspector column to 260px. This shrinks the `1fr` center cell, which triggers the `ResizeObserver`, which calls `scale.setParentSize()`, which triggers `Scale.FIT` recalculation, which repositions all game objects. This is the documented root cause of the inspector-populates-→-objects-shift bug.

**Instead:** Use `${INSPECTOR_W}px 1fr ${HIERARCHY_W}px` with explicit pixel widths that match the actual panel widths. Set `overflow: hidden` on panel slots so content cannot exceed the column width.

---

### Anti-Pattern 3: Duplicating Hit-Area Transform Math

**What:** The `toScreen(lx, ly)` closure pattern with `displayOriginX/Y` subtraction and matrix multiplication appears verbatim in three files: `EditorScene.drawHitArea()`, `SelectionManager.getPolygonShapeBounds()`, and `HitAreaGizmo.getTransformHelpers()`.

**Why bad:** All three must stay in sync. If the `isContainer` check logic changes (e.g., Phaser 4 makes `displayOriginX` settable on Containers), only one site is likely to be updated, causing visual inconsistency between hit-test bounds and the drawn overlay.

**Instead:** Extract into `CoordinateSystem.getHitAreaToScreen(obj)` as described in Pattern 3. All three sites call the shared function.

---

### Anti-Pattern 4: Module-Level Singletons for Per-Game State

**What:** `let activePluginInstance: PhaserEditorPlugin | null = null` and `let editorSceneRegistered = false` at module scope in `PhaserEditorPlugin.ts` (lines 23-25).

**Why bad:** If two `Phaser.Game` instances exist in the same JS context (e.g., one for game, one for UI preview in a studio environment), the second game's plugin will overwrite `activePluginInstance`, breaking the first game's keyboard toggle. `editorSceneRegistered` prevents registering the editor scene for the second game entirely.

**Instead:** Use `WeakMap<Phaser.Game, PluginRegistry>` as described in Pattern 5.

---

## Refactoring Order

The dependencies between changes constrain the order:

### Phase 1: CSS Grid Fix (No Dependencies — Fix the Bug First)

Change `EditorFrame`'s column template from `auto 1fr auto` to fixed pixel widths. This is a single-line change that immediately stops the reflow cycle. It does not depend on any other refactoring.

**Files changed:** `src/ui/EditorFrame.ts`
**Risk:** LOW — only affects CSS layout, not coordinate math.
**Validates:** The inspector-populates-→-objects-shift bug disappears.

---

### Phase 2: ViewportState Type (Foundation for Coordinate Refactor)

Define `ViewportState` interface and `captureViewport()` function in a new `src/core/ViewportState.ts`. No consumers yet — just the type definition and capture function.

**Files changed:** `src/core/ViewportState.ts` (new)
**Risk:** NONE — additive only.

---

### Phase 3: Refactor CoordinateSystem to Accept ViewportState

Change all `CoordinateSystem` methods that currently accept `Phaser.Scene` to instead accept `ViewportState`. This is the breaking API change — all call sites must be updated simultaneously.

**Files changed:**
- `src/core/CoordinateSystem.ts` — method signatures
- `src/EditorScene.ts` — pass `this.currentViewport` (captured once per `update()`)
- `src/gizmos/MoveGizmo.ts` — `updateDrag`, `startDrag`
- `src/gizmos/RotateGizmo.ts` — `draw` (for `getWorldPosition`)
- `src/gizmos/ScaleGizmo.ts` — `draw`
- `src/gizmos/HitAreaGizmo.ts` — `getTransformHelpers`, `updateMoveRect/Circle/Polygon`
- `src/ui/InspectorPanel.ts` — `syncFromObject`, `applyTransform`
- `src/core/SnappingEngine.ts` — `objectSnap`, `drawGuides`
- `src/core/SelectionManager.ts` — `getPolygonShapeBounds`

**Risk:** MEDIUM — large surface area, but mechanical: search/replace `hostScene` parameter with `viewportState`.
**Note:** Some gizmos call `getWorldPosition(obj)` which reads from the object's world transform matrix — this does NOT need `ViewportState`. Only the design ↔ screen conversion calls need it.

---

### Phase 4: Add Drag-Start Viewport Snapshot to Gizmos

After Phase 3, each gizmo's `startDrag()` captures `ViewportState` and stores it. `updateDrag()` uses the frozen snapshot. This prevents mid-drag resize jitter.

**Files changed:**
- `src/gizmos/MoveGizmo.ts`
- `src/gizmos/RotateGizmo.ts`
- `src/gizmos/ScaleGizmo.ts`
- `src/gizmos/HitAreaGizmo.ts`

**Risk:** LOW — contained within gizmo classes.

---

### Phase 5: Centralize Hit-Area Transform Utilities

Add `getHitAreaToScreen()` and `getHitAreaScreenDeltaToLocal()` to `CoordinateSystem`. Replace the three duplicated implementations with calls to these methods.

**Files changed:**
- `src/core/CoordinateSystem.ts` — add two methods
- `src/EditorScene.ts` — replace `drawHitArea()` local closure
- `src/core/SelectionManager.ts` — replace inline matrix multiplication in `getPolygonShapeBounds()`
- `src/gizmos/HitAreaGizmo.ts` — replace `getTransformHelpers()` private method

**Risk:** LOW — pure refactor, no behavior change.
**Validates:** All three sites draw identical shapes for the same input.

---

### Phase 6: Per-Game Plugin Registry

Replace module-level singletons with `WeakMap<Phaser.Game, PluginRegistry>`. This is self-contained within `PhaserEditorPlugin.ts`.

**Files changed:** `src/PhaserEditorPlugin.ts`
**Risk:** LOW — no public API change, behavior identical for single-game case.

---

### Phase 7: ScaleManager Patch Isolation (Optional, for Robustness)

Extract the patch/revert logic into named `applyScalePatch()` / `revertScalePatch()` methods within `EditorFrame`. Document which internal Phaser fields are touched. This is a refactor with no behavior change.

**Files changed:** `src/ui/EditorFrame.ts`
**Risk:** NONE — internal refactor only.

---

## Scalability Considerations

| Concern | Current State | After Refactoring |
|---------|--------------|-------------------|
| Resize stability | Bug: inspector growth → canvas shrink → object shift | Fixed by Phase 1 (fixed columns) + Phase 3 (ViewportState) |
| Drag jitter on resize | Bug: `sf` changes mid-drag if resize fires | Fixed by Phase 4 (drag-start snapshot) |
| Hit-area transform divergence | Tech debt: 3 files, identical math | Fixed by Phase 5 (centralized utility) |
| Multi-game isolation | Bug: second game overwrites first game's toggle | Fixed by Phase 6 (WeakMap registry) |
| ScaleManager fragility | Fragile: inline `as any` casts | Improved by Phase 7 (named patch/revert) |
| Performance: `getScaleFactor` per call | Acceptable at current scale | Eliminated after Phase 3 (cached in ViewportState) |

---

## Sources

- Direct codebase analysis: all files in `src/` as of 2026-02-18
- `src/ui/EditorFrame.ts` — CSS grid definition (line 50), ResizeObserver (lines 103-111), ScaleManager patch (lines 96-100), revert (lines 141-145)
- `src/core/CoordinateSystem.ts` — live `scene.cameras.main` reads (lines 22-25, 29-31)
- `src/EditorScene.ts` — `drawDesignBounds` duplicates CoordinateSystem math (lines 215-216), `drawHitArea` local `toScreen` closure (lines 283-290)
- `src/core/SelectionManager.ts` — matrix math in `getPolygonShapeBounds` (lines 133-146)
- `src/gizmos/HitAreaGizmo.ts` — `getTransformHelpers` (lines 265-286)
- `src/gizmos/MoveGizmo.ts` — `getScaleFactor(this.hostScene)` called in `updateDrag` (line 204)
- `src/PhaserEditorPlugin.ts` — module-level singletons (lines 23-25), `activePluginInstance` pattern
- `.planning/codebase/CONCERNS.md` — hit area transform duplication, ResizeObserver infinite loop risk, canvas parent restoration fragility
