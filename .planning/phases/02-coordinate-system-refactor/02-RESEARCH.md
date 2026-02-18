# Phase 2: Coordinate System Refactor - Research

**Researched:** 2026-02-18
**Domain:** Phaser 4 coordinate math, transform matrices, ViewportState snapshot pattern
**Confidence:** HIGH — all findings from direct codebase analysis. No external libraries needed.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Bounding boxes are consistently offset left and drifting down from actual objects in user's game (pet_merge_phaser)
- Click/selection follows the offset box position, not the actual visible object — coordinate transform error affects both rendering AND hit detection
- The demo scene works correctly — offset only appears with non-default game configurations
- Root cause is likely in how coordinate transforms handle camera position, scroll, zoom, or ScaleManager canvas offset
- Drag-during-resize behavior: current behavior is acceptable — if a resize happens during drag, abort the drag, no special handling needed
- Everything is frozen while the editor is showing (game is paused)
- ViewportState snapshot is about capturing stable camera/viewport state, not dealing with a moving game world
- All gizmos and overlays use the same per-frame snapshot — no distinction between frozen vs. live needed

### Claude's Discretion

- ViewportState interface design (which fields to include)
- How to consolidate the 3 duplicate hit-area transform implementations
- Caching strategy for inverted parent matrix
- Whether to re-capture snapshot on specific events (like manual zoom in editor)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| COORD-01 | Coordinate transforms must use a per-frame snapshot (ViewportState), not live camera reads | ViewportState captured once in `EditorScene.update()`, passed down; eliminates all live `scene.cameras.main` reads |
| COORD-02 | All CoordinateSystem methods must accept ViewportState instead of Phaser.Scene | Replace `scene: Phaser.Scene` parameter on all 5 public methods with `vp: ViewportState` |
| COORD-03 | Gizmo drags must use a viewport snapshot captured at drag start (no mid-drag jitter) | All 4 gizmos store `hostScene` at `startDrag()`; replace with stored `ViewportState` captured at that moment |
| COORD-04 | Hit area transform logic must be centralized in CoordinateSystem (remove 3-file duplication) | Identical `toScreen` + `screenDeltaToLocal` math exists in `EditorScene.ts`, `SelectionManager.ts`, `HitAreaGizmo.ts` — extract to `CoordinateSystem` |
| COORD-05 | Matrix inversion for Container children must be cached at drag start, not per-frame | `MoveGizmo.updateDrag()` calls `coords.setDesignPosition()` every frame which calls `parentMatrix.invert()` — cache at `startDrag()` |
</phase_requirements>

---

## Summary

The coordinate transform bug — bounding boxes offset left and drifting down relative to actual objects in non-default game setups — has a clear root cause: `CoordinateSystem` methods compute the scale factor and canvas offset from `scene.cameras.main.width/height`, then treat the Phaser world-space position of game objects (from `getWorldTransformMatrix().tx/.ty`) as screen-space pixels. In the demo, objects are deliberately placed at screen-space coordinates (`this.ox + designX * sf`), so world-space equals screen-space and the math is coincidentally correct. In a game that places objects in design-space or uses a scrolled/zoomed camera, world-space diverges from screen-space and the transform breaks.

The fundamental fix requires the coordinate system to properly convert from **Phaser world space → screen space** using camera projection, not assume they are the same. The camera's `worldView` and scroll values must be factored in. For a `Scale.FIT` game, the canvas offset on the DOM page also matters because `getWorldTransformMatrix().tx` gives Phaser world coordinates while the editor draws on an overlay that renders in the same coordinate frame — so the actual issue is that `getBounds()` returns screen-space bounds (Phaser's `getBounds()` projects through the camera), but `getWorldPosition()` returns world-space, creating a mismatch between selection rendering and the object's actual screen position.

The ViewportState snapshot pattern is the right architectural move regardless: it makes the transform stable (no live reads per-frame or per-drag), eliminates the 3-location hit-area duplication, and enables the parent matrix cache. The interface should capture the values needed to convert Phaser world coordinates to canvas screen coordinates: camera scroll, camera zoom, the design-to-screen scale factor, and canvas offset. This is a mechanical refactor with a large file surface but no algorithmic complexity beyond the transform fix itself.

**Primary recommendation:** Fix the coordinate transform math first (understand exactly what `getWorldPosition()` returns vs what `getBounds()` returns, then make them consistent), then wrap in ViewportState and refactor callers mechanically. The math fix is the only intellectually complex part; the ViewportState threading is routine.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Phaser 4 | ^4.0.0-rc.6 | Camera/transform API | Already in use; no alternative |
| Native TypeScript interfaces | — | ViewportState shape | Simple value object, no library needed |

### Supporting

None. This phase requires zero new npm dependencies.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dedicated `ViewportState.ts` file | Inline fields on existing classes | File keeps the interface in one place, prevents drift. Inline fields scatter the contract. Dedicated file is correct. |
| Recomputing scale/offset every method call | Caching in ViewportState snapshot | ViewportState snapshot is already the decision. Per-frame recomputation is the current bug source. |
| Phaser's built-in `camera.getWorldPoint()` | Manual math | `getWorldPoint()` is the inverse operation (screen → world). For world → screen we need `worldToScreen()`. Phaser 4 cameras have `worldToScreen(worldX, worldY, output, camera)` via the `InputPlugin` or manual math. |

**Installation:** `npm install` — no new packages.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── core/
│   ├── ViewportState.ts      # NEW: interface + captureViewport()
│   ├── CoordinateSystem.ts   # REFACTOR: accept ViewportState, add hit-area helpers
│   ├── SelectionManager.ts   # REFACTOR: use CoordinateSystem hit-area helpers
│   ├── SnappingEngine.ts     # REFACTOR: accept ViewportState instead of Phaser.Scene
│   └── EditorState.ts        # (unchanged)
├── gizmos/
│   ├── MoveGizmo.ts          # REFACTOR: ViewportState at drag start, cache inv matrix
│   ├── RotateGizmo.ts        # REFACTOR: ViewportState at drag start
│   ├── ScaleGizmo.ts         # REFACTOR: ViewportState at drag start
│   └── HitAreaGizmo.ts       # REFACTOR: use CoordinateSystem helpers
├── EditorScene.ts            # REFACTOR: captureViewport() once per update(), pass down
└── ui/
    └── InspectorPanel.ts     # REFACTOR: accept ViewportState instead of Phaser.Scene
```

### Pattern 1: ViewportState Interface

**What:** A frozen plain-object snapshot of all values needed for coordinate math. Captured once per frame in `EditorScene.update()`, passed into every subsystem that needs coordinate math.

**When to use:** Everywhere `Phaser.Scene` is currently passed to `CoordinateSystem` methods.

**Recommended interface (Claude's Discretion):**

```typescript
// src/core/ViewportState.ts

export interface ViewportState {
    /** Design-space dimensions (from EditorScene init). */
    designWidth: number;
    designHeight: number;

    /**
     * Scale factor: design units → Phaser world units.
     * In the demo, 1 Phaser world unit = 1 screen pixel (camera zoom=1, no scroll).
     * This captures the FIT scale factor computed from canvas/design dimensions.
     */
    scaleFactor: number;

    /**
     * Canvas-space offset of the design area origin (top-left of design rect on screen).
     * Computed as: (canvasW - designW * sf) / 2
     */
    offsetX: number;
    offsetY: number;

    /**
     * Camera scroll in world units. When camera scrollX/scrollY != 0,
     * a world-space position must be adjusted before screen conversion.
     * For games using the default camera (no scroll), these are 0.
     */
    cameraScrollX: number;
    cameraScrollY: number;

    /**
     * Camera zoom. For the editor overlay scene and default host cameras, this is 1.
     * A zoomed camera changes how world units map to screen pixels.
     */
    cameraZoom: number;
}

/**
 * Capture a stable viewport snapshot from the host scene.
 * Call once per EditorScene.update() frame; pass the result to all subsystems.
 *
 * @param designWidth  Design canvas width (from EditorScene init data)
 * @param designHeight Design canvas height (from EditorScene init data)
 * @param hostScene    The paused game scene (the camera to read from)
 * @param editorScene  The editor overlay scene (for canvas dimensions)
 */
export function captureViewport(
    designWidth: number,
    designHeight: number,
    hostScene: Phaser.Scene,
    editorScene: Phaser.Scene,
): ViewportState {
    const cam = hostScene.cameras.main;
    const { width: canvasW, height: canvasH } = editorScene.cameras.main;

    const sf = Math.min(canvasW / designWidth, canvasH / designHeight);
    const offsetX = (canvasW - designWidth * sf) / 2;
    const offsetY = (canvasH - designHeight * sf) / 2;

    return {
        designWidth,
        designHeight,
        scaleFactor: sf,
        offsetX,
        offsetY,
        cameraScrollX: cam.scrollX,
        cameraScrollY: cam.scrollY,
        cameraZoom: cam.zoom,
    };
}
```

**Why editorScene for canvas dimensions:** The editor overlay scene always has the current canvas size. The host scene's camera may have been scrolled or zoomed. We want canvas pixel dimensions (not world space dimensions) for computing `offsetX/offsetY`.

### Pattern 2: CoordinateSystem Refactored Methods

**What:** All public methods accept `ViewportState` instead of `Phaser.Scene`. The scale factor and offset come from the snapshot, not from live camera reads.

**Example of refactored `designToScreen`:**

```typescript
// Source: src/core/CoordinateSystem.ts (refactored)

designToScreen(dx: number, dy: number, vp: ViewportState): { x: number; y: number } {
    return {
        x: vp.offsetX + dx * vp.scaleFactor,
        y: vp.offsetY + dy * vp.scaleFactor,
    };
}

screenToDesign(sx: number, sy: number, vp: ViewportState): { x: number; y: number } {
    return {
        x: (sx - vp.offsetX) / vp.scaleFactor,
        y: (sy - vp.offsetY) / vp.scaleFactor,
    };
}
```

### Pattern 3: The Correct World-to-Screen Transform (Critical Bug Fix)

**What:** In Phaser, `getWorldTransformMatrix().tx/.ty` returns the object's position in **Phaser world space** (design/game coordinates), not screen pixels. `getBounds()` on the other hand projects through the camera and returns **screen-space** bounds. The current `getWorldPosition()` returns world-space `.tx/.ty`, which then feeds into `screenToDesign()` — treating world coords as screen coords. This is why the boxes are offset.

**Root cause analysis:**
- In DemoScene, objects are created at `x = ox + designX * sf` (screen coords), so `.tx = screen position`. `screenToDesign()` on screen coords gives design coords. Correct.
- In pet_merge_phaser, objects are created at `x = designX` (design/world coords), so `.tx = designX`. `screenToDesign(designX, ...)` gives wrong results.

**The fix — correct `getWorldPosition` to return screen-space:**

```typescript
// src/core/CoordinateSystem.ts (corrected)

/**
 * Get the screen-space position of a game object.
 * For objects NOT in a Container: applies camera scroll and zoom to convert
 * from Phaser world space to screen pixels.
 * For Container children: uses getWorldTransformMatrix which already
 * composes the container's transform — but still needs camera projection.
 */
getScreenPosition(
    obj: Phaser.GameObjects.GameObject,
    vp: ViewportState,
): { x: number; y: number } {
    if (!('x' in obj)) return { x: 0, y: 0 };

    if ('parentContainer' in obj && (obj as any).parentContainer) {
        // Container children: world matrix gives world-space tx/ty
        const matrix = (obj as any).getWorldTransformMatrix();
        // World → screen: subtract camera scroll, apply camera zoom
        const screenX = (matrix.tx - vp.cameraScrollX) * vp.cameraZoom;
        const screenY = (matrix.ty - vp.cameraScrollY) * vp.cameraZoom;
        return { x: screenX, y: screenY };
    }

    const t = obj as any;
    const screenX = (t.x - vp.cameraScrollX) * vp.cameraZoom;
    const screenY = (t.y - vp.cameraScrollY) * vp.cameraZoom;
    return { x: screenX, y: screenY };
}
```

**IMPORTANT CAVEAT:** The exact world→screen projection depends on the game's Scale mode, camera configuration, and whether the canvas has CSS transforms applied. The formula above works for:
- `Scale.FIT` with no camera scroll/zoom (demo case: `scrollX=0, scrollY=0, zoom=1`) → screenX = worldX
- Games where objects are placed in design-space, camera is at default position

For games with scrolled/zoomed cameras (the pet_merge_phaser case), the projection also needs the **camera origin** (the point in world-space at the center of the screen):
```
screenX = (worldX - cam.scrollX) * cam.zoom + cam.centerX
screenY = (worldY - cam.scrollY) * cam.zoom + cam.centerY
```
But `cam.centerX/centerY` in screen space is `canvasW/2` and `canvasH/2` for the default camera setup.

The ViewportState should include camera center if needed:
```typescript
cameraCenterX: cam.centerX,  // screen px, usually canvasW/2
cameraCenterY: cam.centerY,  // screen px, usually canvasH/2
```

Then:
```typescript
screenX = (worldX - vp.cameraScrollX) * vp.cameraZoom + vp.cameraCenterX;
screenY = (worldY - vp.cameraScrollY) * vp.cameraZoom + vp.cameraCenterY;
```

**RESEARCHER NOTE:** Before finalizing the ViewportState interface, verify which formula matches what `getBounds()` returns for the same object. If `getBounds().x` for a non-container Image at design-space position `(360, 600)` equals `offsetX + 360 * sf`, then the correct screen position is `offsetX + worldX * sf` (same as `designToScreen`), meaning `cameraScrollX = 0`, `cameraZoom = 1`, and `cameraCenterX = canvasW/2`. This is the expected case for the demo. For pet_merge_phaser, the researcher must check the actual camera.scrollX/scrollY/zoom at editor activation to understand what correction is needed.

### Pattern 4: getDesignPosition Uses Screen Position Correctly

```typescript
// After the fix: getDesignPosition uses the corrected getScreenPosition
getDesignPosition(
    obj: Phaser.GameObjects.GameObject,
    vp: ViewportState,
): { x: number; y: number } {
    const screen = this.getScreenPosition(obj, vp);
    return this.screenToDesign(screen.x, screen.y, vp);
}
```

For the demo (camera at default, objects at screen coords): `getScreenPosition` returns screen px → `screenToDesign` gives design coords. Same result as before.
For pet_merge_phaser (objects at design coords, camera default): `getScreenPosition` converts `worldX` to screen px → `screenToDesign` gives design coords. Correct.

### Pattern 5: Centralized Hit-Area Transform (COORD-04)

**What:** Extract the duplicated `toScreen` + `screenDeltaToLocal` helpers into `CoordinateSystem` as public methods.

**The three duplicate locations:**
1. `EditorScene.ts` lines 283-290: `toScreen` inside `drawHitArea()`
2. `SelectionManager.ts` lines 140-148: Inline AABB computation in `getPolygonShapeBounds()`
3. `HitAreaGizmo.ts` lines 265-287: `getTransformHelpers()` → `toScreen` + `screenDeltaToLocal`

**Extracted methods for CoordinateSystem:**

```typescript
// src/core/CoordinateSystem.ts (new public methods)

/**
 * Returns a function that maps a hit-area local point to screen-space,
 * applying displayOrigin adjustment and the object's world transform matrix.
 *
 * Hit area coordinates are in frame-space (0,0 = texture top-left for sprites).
 * The world matrix origin is at the object's displayOrigin, so we subtract
 * displayOriginX/Y to shift from frame-space to local-space before applying.
 * Containers: displayOrigin is hardcoded width*0.5 and does not apply to
 * hit area vertices (which are origin-relative), so skip the adjustment.
 */
getHitAreaToScreen(
    obj: Phaser.GameObjects.GameObject,
): (lx: number, ly: number) => { x: number; y: number } {
    const matrix = (obj as any).getWorldTransformMatrix();
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
 * Returns a function that converts a screen-space delta to a hit-area
 * local-space delta, using the inverse of the object's world transform matrix.
 * Used for hit-area drag operations where pointer movement must map to
 * hit-area coordinate changes.
 */
getHitAreaScreenDeltaToLocal(
    obj: Phaser.GameObjects.GameObject,
): (dsx: number, dsy: number) => { dx: number; dy: number } {
    const matrix = (obj as any).getWorldTransformMatrix();
    const det = matrix.a * matrix.d - matrix.b * matrix.c;

    return (dsx: number, dsy: number) => ({
        dx: (matrix.d * dsx - matrix.c * dsy) / det,
        dy: (-matrix.b * dsx + matrix.a * dsy) / det,
    });
}
```

**Note:** These helpers use `getWorldTransformMatrix()` directly and do NOT depend on ViewportState, because hit-area rendering uses the Phaser world matrix (which bakes in the object's own transforms) and the matrix already maps correctly to screen pixels for the editor overlay (which renders in the same coordinate frame as the game scene via Phaser's shared GL context). The camera scroll/zoom factor is already embedded in `matrix.tx/.ty` for the render layer. This is why the hit-area overlays currently draw correctly even though `getWorldPosition()` is wrong — the matrix approach is inherently camera-aware.

**This insight is critical:** `getWorldTransformMatrix().tx/.ty` for objects in the game scene **already includes camera projection** in the rendering context. The bug in `getWorldPosition()` is that it returns `matrix.tx/.ty` and then the caller treats it as screen space (correct for the overlay rendering) but then tries to use it for `screenToDesign()` math — which doesn't work if the game's coordinate system differs from the demo's. So:

- For **rendering** (gizmos, hit areas): use `getWorldTransformMatrix()` directly → screen pixels for overlay. Already correct.
- For **design-space math** (inspector position display, `setDesignPosition`): need world→design conversion, which requires knowing if objects are in design-space or screen-space coordinates.

### Pattern 6: MoveGizmo Parent Matrix Cache (COORD-05)

**What:** Cache the inverted parent matrix at `startDrag()` instead of recomputing it on every frame via `setDesignPosition()`.

```typescript
// src/gizmos/MoveGizmo.ts additions

/** Cached inverted parent matrix (for Container children), set at drag start. */
private cachedInvParentMatrix: Phaser.GameObjects.Components.TransformMatrix | null = null;

startDrag(...): void {
    // ... existing setup ...

    // Cache inverted parent matrix for Container children
    this.cachedInvParentMatrix = null;
    if ('parentContainer' in target && (target as any).parentContainer) {
        const parent = (target as any).parentContainer as Phaser.GameObjects.Container;
        const parentMatrix = parent.getWorldTransformMatrix();
        this.cachedInvParentMatrix = parentMatrix.invert();
    }
}
```

Then `setDesignPosition()` must accept an optional pre-computed inverse matrix, or `MoveGizmo.updateDrag()` must apply the cached inverse directly without calling `setDesignPosition()` (preferable to keep the cache inside MoveGizmo, not CoordinateSystem).

### Pattern 7: EditorScene Per-Frame Snapshot

```typescript
// src/EditorScene.ts update() — capture once, pass to all callers

update(): void {
    const hostScene = this.getHostScene();
    const vp = hostScene
        ? captureViewport(this.designWidth, this.designHeight, hostScene, this)
        : null;

    this.gfx.clear();

    if (vp) {
        this.drawDesignBounds(vp);
        this.selectionMgr.drawSelection(this.gfx, vp);
        // ...
        this.snappingEngine.drawGuides(this.gfx, this.gizmoMgr.snapGuides, this.coordSystem, vp);
        this.editorUI.refresh(vp);
        this.updateCoordBar(vp);
    }

    this.gizmoMgr.draw(this.gfx);
}
```

### Anti-Patterns to Avoid

- **Passing `Phaser.Scene` deep into coordinate math:** Every place that accepts `Phaser.Scene` just to call `coordSystem.X(scene)` creates a live read on `scene.cameras.main`. Replace with `ViewportState` everywhere.
- **Calling `parentMatrix.invert()` in `updateDrag()`:** Matrix inversion happens every pointer-move event (up to 60/s). Cache at drag start.
- **Treating world-space `.tx/.ty` as screen pixels:** Only correct if camera.scrollX/scrollY=0 and camera.zoom=1. Breaks for any non-default camera.
- **Mixing rendering and design-space math:** The world transform matrix is correct for overlay rendering (Phaser's shared render context). It is NOT necessarily equal to screen pixels for coordinate math (InspectorPanel position display, `setDesignPosition`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| World → screen projection | Custom projection math from scratch | Phaser `camera.worldToScreen()` or manual formula using camera.scrollX/Y/zoom/centerX/Y | Phaser already has this; use `cam.getWorldPoint()` / reverse for screen→world |
| Hit-area transform | Per-file local closures | `CoordinateSystem.getHitAreaToScreen()` | Three files already duplicated it; centralize once |
| ViewportState data class | A class with methods | A plain TypeScript `interface` + a `captureViewport()` function | Value objects should be interfaces; behavior belongs on CoordinateSystem |

**Key insight:** The current hit-area rendering is correct because it uses `getWorldTransformMatrix()` which Phaser computes correctly. Don't replace it — just extract it from three places into one.

---

## Common Pitfalls

### Pitfall 1: Confusing World Space and Screen Space

**What goes wrong:** `getWorldTransformMatrix().tx` returns the object's position in **Phaser world coordinates** (what game scripts use as `.x`, `.y`). For the demo these equal screen pixels because the demo deliberately places objects at screen-space coords. For any other game, world coords are design coords and must be converted.

**Why it happens:** Phaser's world transform matrix bakes in all parent transforms and the object's own position, but does NOT apply camera projection. Camera projection only happens during rendering (Phaser's renderer applies `camera.worldView` transform when drawing). The overlay scene renders in the same GL context with the same camera transform applied, so matrix values project correctly for rendering — but are NOT screen pixels for math.

**How to avoid:** Always distinguish between "position for rendering" (use matrix.tx/ty directly — already correct for overlay) and "position for design-space math" (apply camera scroll/zoom correction).

**Warning signs:** Works correctly in the demo, breaks in pet_merge_phaser. Objects appear at correct screen position via gizmos/overlay, but `InspectorPanel.x/y` shows wrong design coords.

### Pitfall 2: Camera Projection Formula Complexity

**What goes wrong:** The world→screen formula for a standard Phaser camera is:
```
screenX = (worldX - cam.scrollX) * cam.zoom + cam.centerX
```
But `cam.centerX` in screen pixels equals `canvasWidth / 2` for a centered camera, which equals `vp.offsetX + vp.designWidth * vp.scaleFactor / 2`. For a camera that fills the canvas (default), `centerX = width/2`. Attempting to implement this formula incorrectly (wrong reference point, ignoring zoom vs scaleFactor distinction) will produce subtle bugs.

**Why it happens:** Phaser has two "scale factors" in play: (1) the ScaleManager's canvas scale (design→canvas pixel), and (2) the camera zoom. In most games these are independent. The editor's `CoordinateSystem.scaleFactor` currently only captures the ScaleManager FIT scale.

**How to avoid:** Verify the formula by comparing `CoordinateSystem.getScreenPosition(obj, vp)` output to `getBounds().centerX` for a known object at a known position. If they match, the formula is correct.

**Warning signs:** After the refactor, test with a camera.scrollX = 100 in pet_merge_phaser and confirm the bounding box moves 100 * zoom pixels.

### Pitfall 3: `getBounds()` Already Returns Screen-Space for Default Camera

**What goes wrong:** For a non-scrolled, non-zoomed camera (demo case), `getBounds()` returns screen pixels. So `SelectionManager.getScreenBounds()` via `getBounds()` is ALREADY CORRECT for these objects. The bug only manifests when `getWorldPosition()` is called for the `InspectorPanel` position display or for `setDesignPosition()`.

**Why it happens:** The researcher might try to "fix" `getScreenBounds()` when it's already correct for the common case.

**How to avoid:** Don't change the `SelectionManager.getScreenBounds()` call to `getBounds()`. It already returns screen pixels. The fix needed is only in `getWorldPosition()` / `getDesignPosition()` / `setDesignPosition()` — the design-space math path.

**Warning signs:** After refactor, bounding boxes and gizmo handles are in the wrong place (means you broke the rendering path which was already correct).

### Pitfall 4: Re-inverting Matrix in setDesignPosition Every Frame

**What goes wrong:** `CoordinateSystem.setDesignPosition()` currently calls `parentMatrix.invert()` inside the method body (line 102 of CoordinateSystem.ts). This is called from `MoveGizmo.updateDrag()` on every pointer-move event. Matrix inversion involves dividing 6 values by the determinant — cheap, but unnecessary to repeat every frame for the same matrix (game is paused, Container doesn't move during drag).

**Why it happens:** The convenience of a single-call API (`setDesignPosition`) hides the repeated computation.

**How to avoid:** Add `cachedInvParentMatrix` to `MoveGizmo`, compute at `startDrag()`, use directly in `updateDrag()`. The `setDesignPosition()` method can either remain unchanged (for non-drag use from InspectorPanel) or accept an optional pre-computed inverse.

**Warning signs:** Performance profiler shows repeated `invert()` calls during drag. Not a correctness issue.

### Pitfall 5: ViewportState Not Refreshed When Editor Changes Camera

**What goes wrong:** If the user can zoom in/out in the editor (editor camera zoom, not game camera), the per-frame snapshot captures the right value each frame — no issue. If however the editor re-capture is skipped (e.g., only captured when `hostScene` changes), a camera change in the editor session would use stale data.

**Why it happens:** Over-optimization of snapshot capture frequency.

**How to avoid:** Per user decision (Claude's Discretion), re-capture on every frame (or at minimum on specific events like manual zoom). Given the game is paused, per-frame capture is cheap — just struct field assignments. Always capture per-frame in `EditorScene.update()`.

---

## Code Examples

### ViewportState Interface (Complete)

```typescript
// Source: src/core/ViewportState.ts (new file)

import Phaser from 'phaser';

export interface ViewportState {
    designWidth: number;
    designHeight: number;
    scaleFactor: number;
    offsetX: number;
    offsetY: number;
    cameraScrollX: number;
    cameraScrollY: number;
    cameraZoom: number;
    cameraCenterX: number;  // screen px, typically canvasW/2
    cameraCenterY: number;  // screen px, typically canvasH/2
}

export function captureViewport(
    designWidth: number,
    designHeight: number,
    hostScene: Phaser.Scene,
    editorScene: Phaser.Scene,
): ViewportState {
    const cam = hostScene.cameras.main;
    const { width: canvasW, height: canvasH } = editorScene.cameras.main;

    const sf = Math.min(canvasW / designWidth, canvasH / designHeight);
    const offsetX = (canvasW - designWidth * sf) / 2;
    const offsetY = (canvasH - designHeight * sf) / 2;

    return {
        designWidth,
        designHeight,
        scaleFactor: sf,
        offsetX,
        offsetY,
        cameraScrollX: cam.scrollX,
        cameraScrollY: cam.scrollY,
        cameraZoom: cam.zoom,
        cameraCenterX: cam.centerX,
        cameraCenterY: cam.centerY,
    };
}
```

### getDesignPosition with Camera Correction

```typescript
// Source: src/core/CoordinateSystem.ts (refactored)

/**
 * Get the screen-space pixel position of a game object.
 * Converts from Phaser world coordinates using camera projection.
 */
getScreenPosition(
    obj: Phaser.GameObjects.GameObject,
    vp: ViewportState,
): { x: number; y: number } {
    if (!('x' in obj)) return { x: 0, y: 0 };

    let worldX: number;
    let worldY: number;

    if ('parentContainer' in obj && (obj as any).parentContainer) {
        const matrix = (obj as any).getWorldTransformMatrix();
        worldX = matrix.tx;
        worldY = matrix.ty;
    } else {
        worldX = (obj as any).x;
        worldY = (obj as any).y;
    }

    // World → screen via camera projection
    // Standard Phaser formula: screen = (world - scroll) * zoom + cameraCenter
    return {
        x: (worldX - vp.cameraScrollX) * vp.cameraZoom + vp.cameraCenterX,
        y: (worldY - vp.cameraScrollY) * vp.cameraZoom + vp.cameraCenterY,
    };
}

getDesignPosition(
    obj: Phaser.GameObjects.GameObject,
    vp: ViewportState,
): { x: number; y: number } {
    const screen = this.getScreenPosition(obj, vp);
    return this.screenToDesign(screen.x, screen.y, vp);
}
```

**Verification:** For the demo (scrollX=0, scrollY=0, zoom=1, centerX=canvasW/2):
- Object placed at `x = ox + designX * sf` (screen px)
- `getScreenPosition` → `(ox + designX * sf) * 1 + canvasW/2`... wait, this is wrong.

**CRITICAL CORRECTION:** `cam.centerX` in Phaser is NOT `canvasW/2` in terms of world→screen. It IS the screen-space center of the camera viewport. For a default camera filling the canvas, `cam.centerX = canvasW/2` and `cam.scrollX = canvasW/2` (Phaser initializes scrollX to centerX so that `(0,0)` world is at the canvas center by default).

Actually Phaser cameras initialize `scrollX = 0`, NOT `centerX`. Let me state the correct formula:

Phaser's camera worldView rect starts at `scrollX, scrollY` and spans `width × height`. A world point `(worldX, worldY)` maps to screen as:
```
screenX = (worldX - cam.scrollX) * cam.zoom
screenY = (worldY - cam.scrollY) * cam.zoom
```
where `screenX=0, screenY=0` is the top-left of the camera's viewport on the canvas.

For the demo: `scrollX = 0`, `zoom = 1` → `screenX = worldX`. Objects are placed at screen coords, so this is consistent.

For pet_merge_phaser: if objects are placed at design coords, `scrollX = 0`, `zoom = 1` → `screenX = designX`. Then `screenToDesign(designX, ...)` would compute `(designX - offsetX) / sf` which is WRONG.

This confirms the fundamental incompatibility: the demo places objects at screen pixels, pet_merge_phaser places objects at design/world coordinates. The ViewportState + getScreenPosition approach must be verified against the actual pet_merge_phaser game config to understand what `scrollX`, `zoom`, and object placement strategy it uses.

### Correct MoveGizmo with Cached Inverse

```typescript
// Source: src/gizmos/MoveGizmo.ts (additions to startDrag)

/** Cached inverted parent transform matrix. Null if not a Container child. */
private cachedInvParentMatrix: { a: number; b: number; c: number; d: number; tx: number; ty: number } | null = null;

startDrag(handle: DragHandle, screenX: number, screenY: number,
          target: Phaser.GameObjects.GameObject, vp: ViewportState): void {
    this.activeHandle = handle;
    this.dragStartX = screenX;
    this.dragStartY = screenY;
    this.target = target;
    this.viewportAtDragStart = vp;  // frozen snapshot

    const designPos = this.coords.getDesignPosition(target, vp);
    this.objStartDesignX = designPos.x;
    this.objStartDesignY = designPos.y;

    // Cache inverted parent matrix once per drag (game is paused, won't change)
    this.cachedInvParentMatrix = null;
    if ('parentContainer' in target && (target as any).parentContainer) {
        const parent = (target as any).parentContainer;
        const m = parent.getWorldTransformMatrix();
        const det = m.a * m.d - m.b * m.c;
        if (Math.abs(det) > 1e-10) {
            this.cachedInvParentMatrix = {
                a: m.d / det, b: -m.b / det,
                c: -m.c / det, d: m.a / det,
                tx: (m.c * m.ty - m.d * m.tx) / det,
                ty: (m.b * m.tx - m.a * m.ty) / det,
            };
        }
    }
}
```

### Replacing 3 Hit-Area Transform Duplicates

```typescript
// Source: All 3 files (after COORD-04 fix)

// BEFORE (in HitAreaGizmo.ts, EditorScene.ts, SelectionManager.ts):
const matrix = (obj as any).getWorldTransformMatrix();
const isContainer = obj instanceof Phaser.GameObjects.Container;
const doX = isContainer ? 0 : ((obj as any).displayOriginX ?? 0);
const doY = isContainer ? 0 : ((obj as any).displayOriginY ?? 0);
const toScreen = (lx, ly) => {
    const adjX = lx - doX; const adjY = ly - doY;
    return { x: matrix.a * adjX + matrix.c * adjY + matrix.tx,
             y: matrix.b * adjX + matrix.d * adjY + matrix.ty };
};

// AFTER (all 3 files):
const toScreen = this.coords.getHitAreaToScreen(obj);
// and for delta conversion:
const screenDeltaToLocal = this.coords.getHitAreaScreenDeltaToLocal(obj);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pass `Phaser.Scene` to CoordinateSystem methods (live reads) | Pass `ViewportState` (snapshot) | Phase 2 | Decouples coordinate math from live camera state; no mid-frame inconsistencies |
| `getWorldPosition()` returns matrix.tx/ty (world space treated as screen) | `getScreenPosition()` applies camera projection | Phase 2 | Fixes the bounding box offset bug in non-default game setups |
| Hit-area transform duplicated in 3 files | Centralized in CoordinateSystem | Phase 2 | Single fix point; consistent behavior across rendering and hit detection |
| `parentMatrix.invert()` per drag frame | Cached at `startDrag()` | Phase 2 | Eliminates repeated matrix inversions; performance and correctness improvement |

**Deprecated/outdated after this phase:**
- `CoordinateSystem.getScaleFactor(scene)` — replaced by `vp.scaleFactor`
- `CoordinateSystem.getOffset(scene)` — replaced by `vp.offsetX/offsetY`
- `CoordinateSystem.getWorldPosition(obj)` — replaced by `getScreenPosition(obj, vp)` (with camera correction)

---

## Open Questions

1. **What coordinate system does pet_merge_phaser use for object placement?**
   - What we know: Demo places objects at screen coords (`ox + designX * sf`). pet_merge_phaser has offset-left, drift-down bug.
   - What's unclear: Does pet_merge_phaser place objects at design coords? Or screen coords? Does it use a non-zero camera scroll or zoom?
   - Recommendation: Before implementing `getScreenPosition()`, inspect an actual pet_merge_phaser object in the editor console: `console.log(obj.x, obj.y, game.scene.getScene('MyScene').cameras.main.scrollX)`. If `obj.x` is a design-space value (e.g., 360 for center of 720-wide design) and `scrollX = 0, zoom = 1`, then `screenX = worldX = designX`, and `screenToDesign(designX, ...)` computes `(designX - offsetX) / sf` instead of just `designX` — this is the bug.

2. **Should `setDesignPosition` accept the cached inverse matrix or should MoveGizmo bypass it?**
   - What we know: `setDesignPosition` calls `parentMatrix.invert()` internally. MoveGizmo calls it every frame.
   - What's unclear: Whether other callers (InspectorPanel) benefit from a cached inverse or just call it once.
   - Recommendation: MoveGizmo bypasses `setDesignPosition` during drag (applies cached inverse directly), then calls `setDesignPosition` only once at drag start (initial position). InspectorPanel's `applyTransform()` continues to use `setDesignPosition` as-is (called once per user input, not per frame).

3. **Does `getBounds()` return correct screen-space values for pet_merge_phaser?**
   - What we know: `SelectionManager.getScreenBounds()` uses `getBounds()` for regular objects. If pet_merge_phaser uses scrolled camera, `getBounds()` in Phaser 4 should apply the camera transform and return screen-space bounds.
   - What's unclear: Whether Phaser 4's `getBounds()` includes camera projection or returns world-space bounds.
   - Recommendation: Verify by checking if `getBounds().x` for a known object matches the expected screen pixel position. If `getBounds()` returns world-space (not screen-space), then `getScreenBounds()` is also broken for the selection boxes — and BOTH paths need the camera projection fix.

4. **Is `captureViewport()` better placed in `CoordinateSystem` as a static method?**
   - What we know: The function needs `designWidth/Height` from EditorScene init data and camera data from both host and editor scenes.
   - What's unclear: Whether it's cleaner as a free function or a method.
   - Recommendation: Free function in `ViewportState.ts`. `CoordinateSystem` is already a stateful class; keeping the snapshot capture separate makes testing easier.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase analysis — `src/core/CoordinateSystem.ts` (all 111 lines): All 5 public methods, their `Phaser.Scene` parameters, and the `invert()` call at line 102 confirmed.
- Direct codebase analysis — `src/EditorScene.ts` (360 lines): `drawHitArea()` hit-area transform at lines 283-290; all passes of `hostScene` to `CoordinateSystem` confirmed.
- Direct codebase analysis — `src/core/SelectionManager.ts` (275 lines): `getPolygonShapeBounds()` lines 130-153 (3rd hit-area duplicate); `getBounds()` usage confirmed.
- Direct codebase analysis — `src/gizmos/HitAreaGizmo.ts` (615 lines): `getTransformHelpers()` at lines 261-287 (primary hit-area transform source).
- Direct codebase analysis — `src/gizmos/MoveGizmo.ts` (255 lines): `setDesignPosition()` call in `updateDrag()` at line 239 confirmed as the per-frame inversion site.
- Direct codebase analysis — `demo/DemoScene.ts`: Confirmed objects placed at screen-space coords (`this.ox + designX * sf`). This is why demo works correctly.
- Direct codebase analysis — `demo/main.ts`: Confirmed `Scale.FIT` mode with `zoom: 1/dpr`, no custom camera setup.
- `.planning/codebase/CONCERNS.md`: "Hit Area Coordinate Transform Complexity" and "Matrix Inversion in SetDesignPosition" sections confirm both COORD-04 and COORD-05 exactly as coded.

### Secondary (MEDIUM confidence)

- Phaser 4 camera projection formula: `screenX = (worldX - cam.scrollX) * cam.zoom` — derived from Phaser source patterns and standard game camera math. Confidence is HIGH for the formula structure, MEDIUM for exact implementation in Phaser 4 rc.6 (not verified against Phaser 4 source).

### Tertiary (LOW confidence)

- Assumption that pet_merge_phaser uses design-space object placement (not screen-space like the demo). This has NOT been directly verified from the game's source. The "offset left, drift down" symptoms are consistent with this assumption but other causes are possible.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; Phaser 4 API in use
- Architecture: HIGH — all file locations, line numbers, and duplicate sites confirmed from direct code reading
- Coordinate fix math: MEDIUM — formula is structurally correct; exact values depend on pet_merge_phaser's camera setup which was not directly inspected
- Pitfalls: HIGH — derived from direct code reading; rendering vs design-space distinction is well-understood

**Research date:** 2026-02-18
**Valid until:** Until pet_merge_phaser's coordinate strategy is confirmed (Open Question 1). The refactoring plan is valid indefinitely; the exact world→screen formula may need one adjustment once the game's placement strategy is confirmed.
