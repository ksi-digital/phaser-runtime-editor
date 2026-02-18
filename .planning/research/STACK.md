# Technology Stack: Viewport Management, Coordinate Transforms, Debugging Overlays

**Project:** @gamotions/phaser-runtime-editor — viewport stability milestone
**Researched:** 2026-02-18
**Scope:** Stack dimension only (single-question research)

---

## The Core Problem (Verified from Source)

The CSS grid reflow bug is a **feedback loop**:

1. User selects an object
2. `InspectorPanel.bind()` appends a 260 px wide `.phaser-editor-inspector` div to the inspector slot
3. The inspector slot column (`auto`) grows from 0 px to ~260 px
4. The canvas cell (`1fr`) shrinks by the same amount
5. `ResizeObserver` fires on the canvas cell with the new (smaller) `contentRect`
6. `EditorFrame` calls `scale.setParentSize(newWidth, newHeight)`
7. `setParentSize` calls `refresh()` → `updateScale()` → `updateCenter()`
8. Phaser recalculates Scale.FIT: smaller parent → smaller canvas CSS size → different scale factor
9. `CoordinateSystem.getScaleFactor()` reads `scene.cameras.main.width/height` — these are the **game canvas pixel dimensions** (unchanged), not the CSS-displayed size — but `getOffset()` uses those same values to place gizmos, while the canvas is now **visually** at a different CSS size
10. All gizmos and bounding boxes shift left/right

**Confidence:** HIGH — traced directly through Phaser ScaleManager source (`setParentSize` → `refresh` → `updateScale`) and the existing `EditorFrame` / `CoordinateSystem` code.

---

## Q1: How Scale.FIT Interacts With CSS Container Resizing and ResizeObserver

### What Phaser's Scale.FIT Actually Does (Verified from Source)

Phaser's Scale.FIT operates on **CSS style**, not canvas pixel dimensions:

- `gameSize` (canvas pixel dimensions) = **fixed** — set at game config time, never changes with FIT
- `displaySize` (CSS style w/h) = **variable** — computed via `Size.constrain()` to fit inside parentSize while keeping aspect ratio
- `baseSize` = same as gameSize for FIT mode

When `setParentSize(w, h)` is called:
```
parentSize = {w, h}
displaySize.constrain(w, h, true)  // FIT: maintain aspect ratio, fit inside parent
canvas.style.width  = displaySize.width  + "px"
canvas.style.height = displaySize.height + "px"
// canvas.width / canvas.height UNCHANGED
```

**Key implication:** `scene.cameras.main.width` and `scene.cameras.main.height` always return the **game pixel dimensions** (e.g., 720 × 1280), never the CSS display size. The `CoordinateSystem` class computes scale factor from these camera values — which means it is computing design-space-to-game-space conversion, **not** design-space-to-screen-space. This is correct only when the canvas CSS size equals the game pixel size (zoom = 1, no DPR config).

**Confidence:** HIGH — verified from ScaleManager source lines 1034–1165 and Size.constrain().

### ResizeObserver and setParentSize: The Feedback Loop

The `ResizeObserver` on `canvasCell` fires whenever the canvas cell's `contentRect` changes. This happens:

- When the inspector panel appears/disappears (desired signal)
- When Phaser's `updateScale()` modifies `canvas.style.width/height`, which can cause the grid to reflow if the canvas has `overflow: hidden` or `min-width: 0` constraints

The `updateScale()` path (called from `refresh()` called from `setParentSize()`) ends with `getParentBounds()`, which reads `this.parent.getBoundingClientRect()`. If `scale.parent` is the canvas cell, this re-reads the post-resize size. **However**, Phaser's `step()` method (called every frame via `PRE_STEP`) also polls parent bounds:

```js
step: function (time, delta) {
    this._lastCheck += delta;
    if (this.dirty || this._lastCheck > this.resizeInterval) {
        if (this.getParentBounds()) {  // compares against stored parentSize
            this.refresh();
        }
        this.dirty = false;
        this._lastCheck = 0;
    }
}
```

Setting `scale.dirty = true` (which `windowResize` listener does) or waiting for `resizeInterval` (default 500ms) can trigger additional refresh cycles after the initial ResizeObserver callback.

**Confidence:** HIGH — from ScaleManager source lines 1694–1714, 1541–1547.

---

## Q2: Best Practices for Stable Coordinate Transforms With Container Resizing

### Root Cause of the Coordinate Shift

The current `CoordinateSystem.getScaleFactor()` uses:
```ts
Math.min(scene.cameras.main.width / designWidth, scene.cameras.main.height / designHeight)
```

`scene.cameras.main.width` = `gameSize.width` = design pixel dimensions (e.g., 720).

For a game with `Scale.FIT` and **no DPR config** (demo case):
- design 720 × 1280
- canvas pixel: 720 × 1280
- scaleFactor = min(720/720, 1280/1280) = 1.0 always

This means `CoordinateSystem` computes no scaling at all — design coords ARE screen coords in the game canvas's coordinate system. Gizmos are drawn in that same coordinate system. This works.

**The shift happens** because when `setParentSize()` fires with a smaller parent width, Phaser changes `canvas.style.width` (the CSS size), but gizmo drawing (via `Phaser.GameObjects.Graphics`) uses the **game coordinate system** which hasn't changed. What shifts is the canvas's **position** in the page (if CSS centering is used) — but in this case `autoCenter = NO_CENTER`, so the canvas shouldn't be shifting via margins.

**The actual shift mechanism:** After `setParentSize()`, Phaser emits `scale.on('resize', ...)`. `EditorScene.onResize()` handles this to resize the `overlay` rectangle. However, nothing updates the gizmo positions — gizmos should still be correct because they read from the game objects (which haven't moved), and the game object coordinates are in game-space (unchanged). The visual shift must come from the canvas itself being repositioned in the DOM.

**Deeper investigation:** The CSS grid with `auto 1fr auto` columns: when the inspector appears, the `1fr` column shrinks. The canvas cell itself moves from position 0 to some right offset. But the canvas (now CSS-smaller) is inside a flex-centered cell (`align-items: center; justify-content: center`). The flex centering repositions the canvas within its cell — but pointer events and gizmo drawing are in game coordinates. The overlay rectangle covers the full game area. So the input coordinates (from `pointer.x`, `pointer.y`) come from Phaser's input system, which uses `displayScale` to map DOM events to game coords:

```js
transformX: function (pageX) {
    return (pageX - this.canvasBounds.left) * this.displayScale.x;
}
```

`displayScale = { x: gameSize.width / canvasBounds.width, y: gameSize.height / canvasBounds.height }`

When the canvas CSS shrinks, `canvasBounds.width` shrinks, so `displayScale.x` increases, correctly transforming pointer coords. This part is fine.

**The real issue:** When `EditorFrame` initially calls `scale.setParentSize()` with the canvas cell size, and then the inspector panel appears (growing the `auto` column), Phaser's `setParentSize()` is called with a *different* parent size. The `autoCenter = NO_CENTER` means Phaser doesn't move the canvas via margins. But the **flex-centered canvas cell** centers the (now CSS-smaller) canvas within the cell, changing the canvas's page position. Next frame, Phaser's input system reads the updated `canvasBounds` via `updateBounds()` (called in `refresh()`). At this point, the input coordinates are recalculated against the new canvas position — which is correct. But if the gizmos were drawn *before* the resize event propagated, there's a one-frame misalignment.

**Recommended Fix — Freeze the inspector slot width before content appears:**

The simplest and most reliable fix: set a **fixed min-width or explicit width** on the inspector slot before any content is injected, so the CSS grid column never changes size when content is added.

```ts
// In EditorFrame constructor, after creating inspectorSlot:
this.inspectorSlot.style.width = '270px';  // Fixed width, never auto-resizes
```

This prevents the `auto` column from growing when Tweakpane mounts, eliminating the feedback loop entirely.

**Alternative: Debounce the ResizeObserver callback**

If fixed-width isn't acceptable, debounce the ResizeObserver so rapid consecutive resize events (inspection panel appear → Phaser resize canvas → grid reflows) are collapsed:

```ts
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
this.resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                scale.setParentSize(width, height);
                resizeTimer = null;
            }, 50);
        }
    }
});
```

**Recommended: Use fixed-width inspector, not debounce.** Debounce introduces a 50 ms lag where gizmos render at stale positions. Fixed-width is instant and deterministic.

**Confidence:** HIGH (traced through source) for mechanism; MEDIUM for fixed-width as the primary fix (based on CSS layout reasoning).

---

## Q3: Retina/DPR Configuration With Scale.FIT

### How the Consumer's DPR Config Works

Consumer games use:
```js
const dpr = window.devicePixelRatio || 1;
scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: Math.round(window.innerWidth * dpr),    // e.g., 1440 on 2x display
    height: Math.round(window.innerHeight * dpr),  // e.g., 2772 on 2x display
    zoom: 1 / dpr,                                 // e.g., 0.5
}
```

**What this means in Phaser terms:**

1. `gameSize` = `{1440, 2772}` — the high-res canvas pixel dimensions
2. `zoom = 0.5` — `_resetZoom = true`, triggers CSS size to be `1440 * 0.5 = 720` px wide
3. Scale.FIT then scales that 720 px wide canvas to fit the parent

**Critical effect on `CoordinateSystem`:**
```ts
getScaleFactor(scene: Phaser.Scene): number {
    const { width, height } = scene.cameras.main;  // Returns 1440, 2772 (game pixels)
    return Math.min(width / this.designWidth, height / this.designHeight);
}
```

If `designWidth = 720`, then `scaleFactor = min(1440/720, 2772/1280) = min(2.0, 2.166) = 2.0`.

But the editor gizmos are drawn in game-pixel coordinates (where the canvas is 1440 × 2772 pixels). The game objects exist in game-pixel coordinates too. So gizmo coordinates should match game object coordinates... **but the design-space mapping is wrong**.

If an object is placed at design position (360, 640) — center of a 720 × 1280 design — the game object's `.x` would be `360 * 2.0 = 720` (game pixels), and `designToScreen(360, 640, scene)` would return `{ x: 720 * 2.0 + offset, y: ... }` which would double-apply the DPR.

**Conclusion:** The `CoordinateSystem` class **assumes** that design coordinates equal game-pixel coordinates (ratio 1:1), which is only true when there is no DPR upscaling. With the DPR config, the game canvas is 2x the design dimensions, so all coordinate math produces results that are off by DPR.

**Recommended Fix — Read scale from ScaleManager, not camera:**

Instead of computing scale factor from camera dimensions, read it directly from the ScaleManager's `displayScale` and canvas bounds:

```ts
getScaleFactor(scene: Phaser.Scene): number {
    // scale.displayScale = { baseSize / canvasBounds }
    // We want design-to-screen (CSS pixel), not design-to-game-pixel
    const scale = scene.scale;
    const canvasBounds = scale.canvasBounds;
    return Math.min(
        canvasBounds.width / this.designWidth,
        canvasBounds.height / this.designHeight
    );
}

getOffset(scene: Phaser.Scene): { x: number; y: number } {
    const scale = scene.scale;
    const canvasBounds = scale.canvasBounds;
    const sf = this.getScaleFactor(scene);
    return {
        x: (canvasBounds.width - this.designWidth * sf) / 2,
        y: (canvasBounds.height - this.designHeight * sf) / 2,
    };
}
```

**But wait**: gizmos are drawn in game-pixel space (Graphics object), not CSS-pixel space. Phaser's `Graphics` draws in game coordinates. The pointer events also come in as game coordinates (Phaser transforms them via `displayScale`). So the coordinate system should be **game-pixel space**, not CSS-pixel space.

**Corrected approach for DPR:**

In the DPR config, design dimensions are 720 × 1280, but the game canvas is 1440 × 2772. The game objects are created in game-pixel space where the game is 1440 × 2772. If the consumer places an object at the "visual center" (360, 640 in design), the object's `.x` in game space would be... whatever value they set. The question is: do consumer games set `.x = 360` (design coords) or `.x = 720` (game-pixel coords)?

With the DPR config as shown, the game runs in a 1440 × 2772 coordinate system internally. If the game code places objects at design coordinates (360, 640), those objects appear at the **wrong position** visually (1/4 down and left instead of center). This suggests consumers must use game-pixel coordinates with the DPR config.

**Implication for editor:** The editor's `designWidth`/`designHeight` config must match the consumer's **game-pixel dimensions** (post-DPR), not the visual/CSS dimensions. Or the editor must be informed of the DPR factor and convert.

**Recommended approach:**
- Add a `dpr` parameter to `EditorPluginConfig` (default 1)
- Editor-internal design space = `designWidth * dpr`, `designHeight * dpr`
- OR: document that `designWidth`/`designHeight` must be the game's actual `.width`/`.height` in game config (post-DPR)

**Confidence:** MEDIUM — DPR behavior traced from ScaleManager source, but consumer game object placement convention is inferred, not verified from consumer code.

---

## Q4: Debugging Overlay Patterns

### Verified Approach: Phaser Graphics Object

The existing `gfx = this.add.graphics()` approach is the correct pattern for all overlay drawing in Phaser. It draws in game-pixel space, automatically transformed by camera, and cleared/redrawn each frame. This is the right approach — no changes needed here.

**Specific patterns for this codebase:**

#### Coordinate Grid Overlay

Draw a grid in design-space, converted to game-pixel space:

```ts
private drawCoordinateGrid(gfx: Phaser.GameObjects.Graphics, gridStep = 100): void {
    const hostScene = this.getHostScene()!;
    const sf = this.coordSystem.getScaleFactor(hostScene);
    const offset = this.coordSystem.getOffset(hostScene);

    gfx.lineStyle(1, 0x333333, 0.4);

    // Vertical lines
    for (let x = 0; x <= this.designWidth; x += gridStep) {
        const sx = offset.x + x * sf;
        const sy0 = offset.y;
        const sy1 = offset.y + this.designHeight * sf;
        gfx.beginPath();
        gfx.moveTo(sx, sy0);
        gfx.lineTo(sx, sy1);
        gfx.strokePath();
    }

    // Horizontal lines
    for (let y = 0; y <= this.designHeight; y += gridStep) {
        const sy = offset.y + y * sf;
        const sx0 = offset.x;
        const sx1 = offset.x + this.designWidth * sf;
        gfx.beginPath();
        gfx.moveTo(sx0, sy);
        gfx.lineTo(sx1, sy);
        gfx.strokePath();
    }
}
```

#### Transform Debug Display

For debugging coordinate system issues, render a small diagnostic overlay in HTML (not Phaser Graphics, since Graphics coords themselves may be in question):

```ts
private renderTransformDebug(statusEl: HTMLElement): void {
    const scale = this.game.scale as any;
    const camera = this.cameras.main;
    const canvasBounds = scale.canvasBounds;

    statusEl.textContent = [
        `game: ${camera.width}×${camera.height}`,
        `css: ${Math.round(canvasBounds.width)}×${Math.round(canvasBounds.height)}`,
        `displayScale: ${scale.displayScale.x.toFixed(3)}×${scale.displayScale.y.toFixed(3)}`,
        `zoom: ${scale.zoom}`,
        `dpr: ${window.devicePixelRatio}`,
    ].join(' | ');
}
```

This is useful because it operates outside Phaser's coordinate system and is immune to the coordinate shift bug during debugging.

#### Bounds Visualization Pattern

The existing `drawHitArea` and `drawDesignBounds` patterns are correct. Key rule: always compute screen positions by transforming through the world matrix (`getWorldTransformMatrix()`), not by reading `.x`/`.y` directly. This handles Container children and rotation correctly. The existing code already does this.

**Confidence:** HIGH for "use Graphics + world matrix" pattern (directly from existing working code); MEDIUM for specific grid drawing pattern (standard game-editor pattern, not Phaser-specific docs).

---

## Q5: Unique Object Identification Beyond .name Property

### The Problem

`SelectionManager.getObjectName()` falls back to type+texture for unnamed objects. The `getChanges()` diff in `PhaserEditorPlugin` uses object name as the dict key. Two unnamed objects of the same type and texture produce duplicate keys, and the diff is unreliable.

### Recommended Approach: Stable ID Assignment at Editor Activation

**Pattern:** Assign a symbol-keyed property at activation time, not at construction:

```ts
// In PhaserEditorPlugin or EditorState
const EDITOR_ID = Symbol('__phaserEditorId__');
let nextId = 1;

function assignEditorId(obj: Phaser.GameObjects.GameObject): string {
    if (!(obj as any)[EDITOR_ID]) {
        (obj as any)[EDITOR_ID] = `obj_${nextId++}`;
    }
    return (obj as any)[EDITOR_ID];
}

function getEditorId(obj: Phaser.GameObjects.GameObject): string | undefined {
    return (obj as any)[EDITOR_ID];
}
```

**Why Symbol, not string key:**
- Symbol keys don't show up in `for...in`, `Object.keys()`, `JSON.stringify()`
- No risk of collision with game code that uses string properties
- Survives any `.name` or property changes to the game object

**Why assign at activation, not construction:**
- Plugin doesn't control object construction
- Assignment at activation is clean: assign during `snapshotProperties()` loop
- IDs persist for the editor session; cleared when editor deactivates

**Why NOT use object reference directly as Map key (current approach):**
The current `propertySnapshot` Map already uses object references as keys — which is correct for Map lookups. The issue is only when converting to a serializable diff (the `getChanges()` method uses name as string key). The fix is to use the editor ID instead of display name for diff keys:

```ts
// In getChanges():
const id = getEditorId(obj) ?? SelectionManager.getObjectName(obj);
diff[id] = changes;
```

**Alternative: Object index in display list**

Using scene + index as ID: `${sceneKey}[${scene.children.list.indexOf(obj)}]`. This is stable within a session but changes if objects are added/removed. Only suitable for read-only display, not for diff keys.

**Confidence:** HIGH for "use Symbol-keyed property" approach (standard JS pattern, no Phaser-specific constraints); HIGH that current name-as-key approach has the duplicate key bug.

---

## Anti-Patterns to Avoid

### Do NOT: Compute Scale Factor from Camera Dimensions Alone

```ts
// WRONG for DPR configs:
getScaleFactor(scene) {
    return Math.min(camera.width / designWidth, camera.height / designHeight);
}
```

`camera.width` is game-pixel dimensions, which equals design dimensions only when DPR = 1 and zoom = 1. With `zoom: 1/dpr`, the camera dimensions are `dpr * designDimensions`, causing a `dpr`-factor error in coordinate computation.

**Instead:** Either read `scale.canvasBounds` for CSS-pixel space conversion, or document that `designWidth/designHeight` must be provided in game-pixel coordinates (post-DPR), which is the currently documented convention.

### Do NOT: Use Tweakpane's Auto-Sizing Container Without Explicit Width

The Tweakpane pane defaults to auto-width based on its container. If the container is a CSS grid `auto` column, adding Tweakpane content causes the column to grow, triggering the resize feedback loop. Always set an explicit `min-width` or `width` on the inspector slot before mounting Tweakpane.

### Do NOT: Use ResizeObserver Without Hysteresis or Stable Parent Size

If the ResizeObserver observes a cell that can change size as a *side effect* of the operation it triggers (canvas CSS resize → grid reflow → cell size change → ResizeObserver fires again), you have an infinite loop potential. Mitigate by:
1. Fixing the column width (preferred), OR
2. Only calling `setParentSize` when the size change exceeds a threshold (e.g., > 2px)

### Do NOT: Rely on `scale.refresh()` After Modifying Parent

`scale.refresh()` reads from the already-stored `parentSize`. If you've patched `scale.parent` to point to a new element, call `scale.getParentBounds()` first, then `scale.refresh()`. Or use `scale.setParentSize()` with explicit dimensions (the current approach, which is correct).

### Do NOT: Read Input Pointer Coordinates Before `updateBounds()` Runs

After a resize, Phaser's `updateBounds()` (which updates `canvasBounds`) runs inside `refresh()`. If you sample pointer coordinates in the same frame as a resize event but before `refresh()` completes, you get coordinates transformed against stale canvas bounds. This is unavoidable in extreme edge cases but is not the primary bug here.

**Confidence:** HIGH for all anti-patterns (derived from ScaleManager source analysis).

---

## Recommended Implementation Order

1. **Fix viewport stability first** — set explicit width on inspector slot before Tweakpane mounts. This eliminates the resize feedback loop with one line of CSS.

2. **Verify coordinate system with DPR** — add `console.log` of `scale.zoom`, `scale.gameSize`, `scale.canvasBounds` on editor activation to determine if the DPR scenario is actually broken in production. If consumers pass `designWidth = window.innerWidth * dpr`, the current math works. If they pass `designWidth = window.innerWidth` (visual width), the math is wrong by DPR factor.

3. **Add Symbol-based IDs** — assign during `snapshotProperties()`, use in `getChanges()` keys.

4. **Add grid overlay toggle** — implement as an optional debug toggle in the toolbar, using the grid pattern from Q4.

5. **Add transform debug panel** — DOM-based (not Phaser Graphics), shows ScaleManager internals, useful for diagnosing future viewport issues.

---

## Sources

| Claim | Source | Confidence |
|-------|--------|------------|
| `setParentSize` calls `refresh()` | ScaleManager.js lines 744–749 (node_modules) | HIGH |
| FIT mode uses CSS style, not canvas pixels | ScaleManager.js lines 1149–1164; Size.js constrain() | HIGH |
| `camera.width` = gameSize, not CSS | ScaleManager.js `width` getter line 1806 | HIGH |
| `step()` polls bounds every 500ms | ScaleManager.js lines 1694–1714 | HIGH |
| `updateCenter()` uses margin-based centering | ScaleManager.js lines 1208–1240 | HIGH |
| `displayScale = baseSize / canvasBounds` | ScaleManager.js line 976 | HIGH |
| Symbol properties invisible to JSON/for-in | MDN/JavaScript spec | HIGH |
| Fixed-width column prevents reflow | CSS grid spec | MEDIUM (layout reasoning) |
| DPR coordinate error magnitude | ScaleManager zoom handling + CoordinateSystem code | MEDIUM |
