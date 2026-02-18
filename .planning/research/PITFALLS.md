# Domain Pitfalls — Viewport/Coordinate Refactor

**Domain:** Phaser 4 runtime editor with CSS grid EditorFrame, ScaleManager patching, and coordinate transform pipeline
**Researched:** 2026-02-18
**Confidence:** HIGH (all pitfalls grounded in existing codebase evidence, not speculative)

---

## Critical Pitfalls

Mistakes that cause the editor to become visually broken or require a rewrite.

---

### Pitfall 1: CSS Grid `auto` Column Causes Canvas Reflow on Selection

**What goes wrong:**
The inspector slot is sized with `auto` in the CSS grid column definition (`grid-template-columns: auto 1fr auto`). When a user selects an object, Tweakpane populates the inspector with 260px of controls. The `auto` column expands to fit, the `1fr` canvas cell shrinks, ResizeObserver fires, `setParentSize()` is called, Phaser recalculates Scale.FIT geometry, and the canvas renders at a smaller size with a shifted offset. Every gizmo, bounding box, and hit area overlay is now wrong — they reference the pre-reflow coordinate frame.

**Why it happens:**
CSS grid `auto` tracks intrinsic content size. Tweakpane builds the inspector DOM lazily on selection, so there is no inspector width before the user clicks. The column is literally zero-width until content appears.

**Consequences:**
- All overlay gizmos shift left by the inspector column width (typically 260px at standard DPR)
- Hit-tests become offset by the same amount — clicking in the "right" spot selects the wrong object
- The bug is invisible until the user selects something, which makes it a near-certain first impression failure
- The ReSize loop feeds back: the shifted canvas triggers another `setParentSize()`, which shifts again

**Evidence in codebase:**
`src/ui/EditorFrame.ts` line 48: `grid-template-columns: auto 1fr auto` — confirmed bug source
`src/ui/EditorFrame.ts` lines 103–111: ResizeObserver calls `scale.setParentSize()` unconditionally
`.planning/PROJECT.md` lines 48–53: Bug documented in project context

**Prevention:**
Replace `auto` with a fixed-width column for the inspector (e.g., `260px`). Apply the same fix to the hierarchy column. Fixed-width columns do not reflow when content appears. The canvas cell (`1fr`) then receives a stable, deterministic fraction of remaining space regardless of panel content.

```css
/* Before (buggy) */
grid-template-columns: auto 1fr auto;

/* After (stable) */
grid-template-columns: 220px 1fr 260px;
```

**Detection:**
Warning sign: canvas visually jumps left on first object click in a fresh editor session. ResizeObserver fires more than once per editor open.

**Phase/Area:** EditorFrame refactor (Phase 1 of the viewport milestone). This is the root cause of the known bug and must be the first fix applied. Do not proceed to coordinate system work until this is stable.

---

### Pitfall 2: ResizeObserver Feedback Loop After `setParentSize()`

**What goes wrong:**
`setParentSize()` in Phaser 4 can trigger layout recalculations that subtly change the observed element's size — especially if Phaser adjusts canvas CSS dimensions (width/height) as part of its Scale.FIT response. If the canvas is a flex-aligned child of the observed cell, the cell's `contentRect` can fluctuate by 1–2px after `setParentSize()` returns, causing the observer to fire again. Each fire calls `setParentSize()` again, producing a loop.

**Why it happens:**
ResizeObserver does not debounce. Phaser's ScaleManager does not expose a "currently resizing" guard. The Phaser canvas uses `style.width`/`style.height` which are CSS pixels — these can differ from `clientWidth` by sub-pixel amounts on retina displays. The observer's `contentRect` reports CSS pixels, so any fractional adjustment causes re-observation.

**Consequences:**
- Infinite loop that locks the browser tab on editor open
- More commonly: a rapid burst of 3–5 resize events before settling, causing canvas flicker on editor activate
- The burst makes `drawDesignBounds()` temporarily show incorrect bounds for 1–2 frames

**Evidence in codebase:**
`src/ui/EditorFrame.ts` lines 103–111: No debounce, no guard against repeat fires
`.planning/codebase/CONCERNS.md` lines 78–82: "ResizeObserver Infinite Loop Risk" documented as known security/stability concern

**Prevention:**
- Add a size-change guard: store last observed `{width, height}` and skip `setParentSize()` if the new size differs by less than 1px
- Or: debounce the observer callback with `requestAnimationFrame` (one call per paint frame maximum)
- Do NOT use `setTimeout` debouncing — this creates timing race conditions with Phaser's own resize event listener

```typescript
// Guard pattern (preferred over debounce)
private lastObservedW = 0;
private lastObservedH = 0;

this.resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (Math.abs(width - this.lastObservedW) < 1 &&
            Math.abs(height - this.lastObservedH) < 1) continue;
        this.lastObservedW = width;
        this.lastObservedH = height;
        if (width > 0 && height > 0) {
            scale.setParentSize(width, height);
        }
    }
});
```

**Detection:**
Warning sign: browser DevTools "Performance" tab shows recurring `ResizeObserver` callbacks in tight loops after editor open. Also: canvas flickers for ~100ms on editor open before settling.

**Phase/Area:** EditorFrame refactor (same phase as Pitfall 1). Add the guard as part of the fixed-column fix.

---

### Pitfall 3: Coordinate Math Uses Wrong Space — Camera vs. Canvas vs. Renderer

**What goes wrong:**
`CoordinateSystem.getScaleFactor()` derives scale from `scene.cameras.main.width/height`. In Phaser 4 with Scale.FIT, the camera dimensions equal the game's configured `width`/`height` (the design resolution), not the actual canvas pixel size. The actual rendered canvas size lives in `game.scale.displaySize` or `game.canvas.width/height`. If these are conflated, `getScaleFactor()` returns 1.0 (designW/designW = 1), the offset is zero, and all coordinate transforms become identity — objects appear at correct screen positions in design-resolution games but break completely in retina/DPR setups.

**Why it happens:**
Phaser 4's mental model: camera space = design space. Canvas pixels = device pixels at DPR. CSS pixels = what the user sees. Three distinct spaces. Developers familiar with Phaser 3's older Scale approach expect `cameras.main.width` to be the rendered pixel count, but in Phaser 4 it is the virtual viewport width.

**Consequences:**
- `screenToDesign()` returns design coordinates instead of design coordinates (no-op in design-resolution games, wrong in DPR games)
- `drawDesignBounds()` draws the boundary at wrong coordinates — it appears off-center or at the wrong scale
- Gizmo positions are computed in the wrong space — the move gizmo center circle is offset from the selected object's visual position

**Evidence in codebase:**
`src/core/CoordinateSystem.ts` lines 23–25: uses `scene.cameras.main.width` for scale factor calculation — currently works because the demo uses a design-resolution game, but fragile
`src/EditorScene.ts` lines 215–216: `drawDesignBounds()` uses `this.cameras.main` width/height — same assumption
`.planning/PROJECT.md` lines 50–68: Retina DPR configuration documented as a constraint

**Prevention:**
Use `game.scale.displaySize` (the actual canvas CSS-pixel size) for screen-space calculations, not `cameras.main.width/height`. The design width/height are already stored in `CoordinateSystem.designWidth/Height`. The scale factor should be:

```typescript
// Fragile (current): camera dimensions = design dimensions in FIT mode
const sf = Math.min(cameras.main.width / designW, cameras.main.height / designH);

// Correct: actual CSS canvas size vs design dimensions
const displayW = game.scale.displaySize.width;
const displayH = game.scale.displaySize.height;
const sf = Math.min(displayW / designW, displayH / designH);
```

**Detection:**
Warning sign: `getScaleFactor()` returns exactly 1.0 always. Or: the design bounds rectangle in `drawDesignBounds()` fills the entire canvas even when the canvas is portrait on a landscape monitor.

**Phase/Area:** CoordinateSystem refactor. Must be validated with an actual DPR=2 device or with `window.devicePixelRatio` forced to 2 in DevTools before closing this phase.

---

### Pitfall 4: `zoom: 1/dpr` with Scale.FIT Introduces a Third Coordinate Space

**What goes wrong:**
When consumers configure `zoom: 1/dpr` with Phaser's Scale.FIT mode, the canvas has three distinct coordinate spaces:
1. **Device pixels** — `canvas.width / canvas.height` (game resolution × DPR)
2. **CSS pixels** — what the browser renders at (canvas / DPR via the zoom transform)
3. **Design space** — the authored coordinate system (720×1280)

Pointer events from Phaser's input system arrive in CSS pixels. The editor currently receives pointer coordinates as `pointer.x / pointer.y` — these are CSS pixels on the canvas element. The `CoordinateSystem.screenToDesign()` math converts from "screen space" to design space. But "screen space" must be CSS pixels, not device pixels. If the code ever uses `canvas.width` (device pixels) instead of `displaySize.width` (CSS pixels) in the denominator, the zoom factor is baked in twice, making all click positions wrong by exactly the DPR factor.

**Why it happens:**
`zoom: 1/dpr` tells Phaser to render at full device resolution then shrink the canvas CSS size. This is the correct approach for crisp retina rendering. But it means `canvas.width` (e.g., 2880) is not the same as `displaySize.width` (e.g., 1440 at DPR=2). Phaser's own input system normalizes pointer events through the canvas CSS size, so `pointer.x` is already in CSS pixels. The pitfall is in the *editor's* coordinate math using the wrong size source.

**Consequences:**
- All hit-tests are off by exactly DPR factor — clicking at CSS (100, 200) appears to the editor as design coordinate for CSS (200, 400) on a 2x display
- Gizmo handles are rendered at correct CSS positions but respond to clicks at double the distance from actual position
- Bug is invisible on 1x displays (DPR=1), only appears on retina screens

**Evidence in codebase:**
`.planning/PROJECT.md` lines 50–68: Explicitly documents the DPR configuration used by consumers
`src/core/CoordinateSystem.ts` lines 22–35: `getScaleFactor()` and `getOffset()` — these functions' correctness depends on which size they use
`src/EditorScene.ts` lines 214–218: `drawDesignBounds()` hardcodes `this.cameras.main` dimensions — same DPR risk

**Prevention:**
- Always use `game.scale.displaySize.width/height` (CSS-pixel canvas size) for coordinate math denominator, never `canvas.width/height` (device pixels)
- `pointer.x / pointer.y` from Phaser's input is already in CSS pixels relative to the canvas — do not scale them
- Add a test case in the demo: force DPR=2 in DevTools, verify gizmo positions align visually

**Detection:**
Warning sign: on a retina display, clicking at the center of a gizmo handle does not trigger the drag (need to click at half the expected position). Coordinate bar in the status panel shows doubled coordinates.

**Phase/Area:** CoordinateSystem refactor. Must explicitly validate on DPR=2 configuration; do not rely on DPR=1 testing alone.

---

### Pitfall 5: Name-Based Object Identity Breaks Duplicate Names and Multi-Frame Changes

**What goes wrong:**
`SelectionManager.getObjectName()` returns a string key used in `getChanges()` diff output. `PhaserEditorPlugin.getChanges()` keys the diff by this name string. If two objects share the same name (e.g., two unnamed `TileSprite` objects both become `"Sprite: bg"`) the second entry in the diff overwrites the first. The exported JSON silently loses one object's changes.

Additionally, `HierarchyPanel` internally maps DOM rows to game objects by reference (`rowMap: Map<HTMLElement, GameObject>`), but the row is rebuilt on every `buildTree()` call. If the selection changes rapidly (visibility toggle → rebuild → selection restored), the old selected reference in `EditorState.selected` may point to the DOM row's previous object, not the rebuilt one.

**Why it happens:**
Phaser game objects do not have built-in unique IDs. The `name` property is set by game code and is not guaranteed unique. Phaser 4 does not assign UUIDs by default. The editor inherited the name-based approach as the most natural human-readable key.

**Consequences:**
- Duplicate-named objects lose one entry in the JSON export — silent data loss
- If the hierarchy rebuilds during editing (e.g., visibility toggle), the selected row can lose sync with the actual selected object in EditorState
- The `getChanges()` diff is used by consumers to write code; incorrect output propagates into their codebase

**Evidence in codebase:**
`src/PhaserEditorPlugin.ts` lines 326–348: `getChanges()` uses `SelectionManager.getObjectName(obj)` as dict key — no collision guard
`src/core/SelectionManager.ts` lines 251–268: `getObjectName()` — fallback chain creates name collisions
`src/ui/HierarchyPanel.ts` lines 200–203: `buildTree()` clears and rebuilds `rowMap` — reference invalidated
`.planning/PROJECT.md` line 70: "Duplicate names" explicitly listed as a known problem

**Prevention:**
- Assign internal editor UUIDs to game objects at editor activate time using a WeakMap keyed by object reference: `editorIds: WeakMap<GameObject, string>`
- Use UUID as the `getChanges()` key internally; include `name` as a human-readable label field in the output
- In `HierarchyPanel`, after `buildTree()`, restore selection by searching `rowMap` for the `EditorState.selected` *reference* (already done via `rowMap.get(row) === state.selected`), not by name

**Detection:**
Warning sign: two objects in hierarchy panel share an identical display name. Exporting changes after editing both shows only one entry for the name. Check with `game.children.list.map(o => o.name).filter((n, i, a) => a.indexOf(n) !== i)` — any non-empty result is a collision.

**Phase/Area:** Object identification phase (separate from coordinate refactor, but should precede any work on `getChanges()` output format).

---

## Moderate Pitfalls

Mistakes that cause incorrect behavior in specific scenarios but do not break the editor entirely.

---

### Pitfall 6: EditorFrame Destroy/Restore Leaves Canvas in Wrong DOM Position

**What goes wrong:**
`EditorFrame.destroy()` uses `originalNextSibling` saved at construction time. If anything removes or reorders DOM elements between EditorFrame construction and destruction — for example, a game framework that dynamically manages the page's DOM — `originalNextSibling.parentNode` may no longer be `originalParent`. The null check on line 134 guards against a detached sibling, but not against `originalParent` itself being removed from the document. `originalParent.appendChild(canvas)` will silently succeed but the canvas is now appended to a detached DOM node, making it invisible.

**Why it happens:**
The "save/restore DOM position" pattern assumes a static DOM tree between activate and deactivate. Game frameworks that use React, Vue, or dynamic layout managers can restructure the DOM at any time.

**Consequences:**
- Editor exits, game canvas disappears (appended to a detached node)
- User must reload the page to recover
- Only reproducible in frameworks with dynamic DOM, not in static HTML games

**Evidence in codebase:**
`src/ui/EditorFrame.ts` lines 130–158: restoration logic, only checks `originalNextSibling.parentNode === originalParent`
`.planning/codebase/CONCERNS.md` lines 120–124: "Canvas Parent Restoration After EditorFrame Destroy" listed as fragile

**Prevention:**
Add a `document.contains(originalParent)` check before restoration. If the original parent is detached, fall back to appending canvas to `document.body`. Log a warning.

```typescript
if (!document.contains(this.originalParent)) {
    console.warn('[EditorFrame] Original canvas parent was removed; restoring to document.body');
    document.body.appendChild(canvas);
} else if (this.originalNextSibling?.parentNode === this.originalParent) {
    this.originalParent.insertBefore(canvas, this.originalNextSibling);
} else {
    this.originalParent.appendChild(canvas);
}
```

**Detection:**
Warning sign: after editor deactivation, canvas is invisible or console shows no errors but canvas is not in the visible DOM tree (`document.querySelector('canvas')` returns null or an element with no visible parent).

**Phase/Area:** EditorFrame refactor (part of destroy/restore hardening).

---

### Pitfall 7: ScaleManager State Restoration Does Not Account for `autoCenter` Side Effects

**What goes wrong:**
`EditorFrame.destroy()` restores `scale.autoCenter`, then calls `setParentSize()` with the pre-editor parent dimensions. However, `autoCenter` in Phaser 4 does not just set a flag — when enabled, it recalculates and applies CSS `margin-left`/`margin-top` to center the canvas. The current restore code manually sets `canvas.style.marginLeft` and `canvas.style.marginTop` back to saved values. But if `setParentSize()` runs AFTER margin restoration, Phaser's internal centering logic may overwrite the restored margins, applying centering based on the new (post-edit) canvas size rather than the original.

**Why it happens:**
The order of operations matters: margins must be restored AFTER `setParentSize()` completes, or `setParentSize()` will recalculate and overwrite them.

**Consequences:**
- Canvas is not centered correctly after editor exit when `autoCenter: CENTER_BOTH` is used
- Off-center canvas is cosmetically broken but game logic is unaffected

**Evidence in codebase:**
`src/ui/EditorFrame.ts` lines 140–158: restores margins before calling `setParentSize()` — wrong order
`src/ui/EditorFrame.ts` lines 96–100: sets `autoCenter = NO_CENTER` on enter — correct

**Prevention:**
Call `setParentSize()` first, then restore `autoCenter`, then restore margins. Or: re-call `scale.refresh()` after restoring `autoCenter` to let Phaser recalculate centering from the correct restored state.

**Detection:**
Warning sign: after editor exits, the game canvas is stuck to the left edge of the viewport when it was centered before. Check `canvas.style.marginLeft` after exit — it should be non-zero if `autoCenter: CENTER_BOTH` was active.

**Phase/Area:** EditorFrame refactor (part of destroy/restore hardening).

---

### Pitfall 8: Hit Area Coordinate Transform Divergence Across Three Call Sites

**What goes wrong:**
The same coordinate transform logic (apply world matrix, subtract displayOrigin, handle Container exception) is implemented in three separate places:
- `EditorScene.drawHitArea()` (lines 282–290)
- `SelectionManager.getPolygonShapeBounds()` (lines 133–149)
- `HitAreaGizmo.getTransformHelpers()` (lines 261–287)

If a bug is found in any one implementation — such as the Container displayOrigin exception — it must be fixed in all three. In practice, the implementations have already diverged: `HitAreaGizmo` uses a `det`-based matrix inversion, `SelectionManager` uses raw matrix coefficients, and `EditorScene` uses a different variable naming convention. There is a real risk that a future fix to one site does not get applied to all three.

**Why it happens:**
The transform was added incrementally as each feature was built. At each stage, the developer copied the logic rather than extracting it.

**Consequences:**
- Hit area visualization (yellow overlay in `drawHitArea`) may be in a slightly different position than what the gizmo handles use — causing gizmo handles to snap to positions that don't visually match the overlay
- If the Container exception rule changes, one site may be missed in the fix, causing Container hit areas to render correctly in one view but not another

**Evidence in codebase:**
`.planning/codebase/CONCERNS.md` lines 7–11: explicitly documented as tech debt
`src/EditorScene.ts` lines 275–290, `src/core/SelectionManager.ts` lines 133–149, `src/gizmos/HitAreaGizmo.ts` lines 261–287: three copies confirmed

**Prevention:**
Extract into `CoordinateSystem` as two methods:
- `hitAreaPointToScreen(obj, lx, ly): {x, y}` — applies displayOrigin offset and world matrix
- `screenDeltaToHitAreaLocal(obj, dsx, dsy): {dx, dy}` — inverse for drag deltas

All three consumers call the same methods. Fix once, correct everywhere.

**Detection:**
Warning sign: select a rotated Container with a Rectangle hit area. The yellow overlay outline and the gizmo handles appear at slightly different screen positions. That 1–2px discrepancy is the divergence manifesting.

**Phase/Area:** CoordinateSystem refactor (consolidation phase). Must happen before any new hit area editing features are added.

---

### Pitfall 9: Matrix Inversion Called Every Pointer-Move Frame During Drag

**What goes wrong:**
`CoordinateSystem.setDesignPosition()` calls `parentMatrix.invert()` on every call. During a gizmo drag, `updateDrag()` is called every `pointermove` event — potentially 60+ times per second. Each call inverts the parent Container's transform matrix unnecessarily because the matrix does not change during a drag (the Container is not moving; the child is).

**Why it happens:**
The matrix inversion is a stateless utility call — there is no drag lifecycle awareness in `CoordinateSystem`. Each call to `setDesignPosition()` is treated as independent.

**Consequences:**
- On scenes with deeply nested Containers or many drag operations: measurable CPU overhead (matrix inversion is O(1) but with significant constant factor)
- On mobile devices: can cause frame drops during drag

**Evidence in codebase:**
`src/core/CoordinateSystem.ts` lines 99–109: `invert()` called inline without caching
`.planning/codebase/CONCERNS.md` lines 14–17: "Matrix Inversion in SetDesignPosition" documented as tech debt

**Prevention:**
Cache the inverted parent matrix at drag start in `MoveGizmo.startDrag()`. Pass the cached matrix through `updateDrag()` instead of recomputing. Or: expose a `beginDrag(obj)` / `updateDragPosition(dx, dy)` pair on `CoordinateSystem` that caches internally.

**Detection:**
Warning sign: Chrome DevTools Performance flamechart shows `Matrix.invert()` calls clustering during pointermove events when dragging Container children.

**Phase/Area:** CoordinateSystem refactor (performance hardening). Lower priority than visual correctness fixes; address after coordinate space bugs are resolved.

---

## Minor Pitfalls

Issues that are annoying or produce sub-optimal behavior but do not break core functionality.

---

### Pitfall 10: `scale.refresh()` Is Not a Safe Substitute for `setParentSize()` on Body Parent

**What goes wrong:**
When the canvas's original parent is `document.body` with `parentIsWindow = true`, calling `scale.refresh()` after EditorFrame destroy to re-trigger scale calculation does not reliably produce the correct size. `body` height is content-dependent — the canvas itself contributes to body height, creating a circular dependency: the canvas is smaller post-editor, body is smaller, scale refreshes to match smaller body, canvas stays small.

**Why it happens:**
Phaser's `refresh()` reads parent dimensions from the DOM. When the parent is `window`, it should use `window.innerWidth/Height`. But the actual behavior in Phaser 4 RC6 depends on which branch of `getParentBounds()` is hit.

**Consequences:**
- Canvas stays at the smaller editor size after exiting the editor
- The game appears "shrunken" post-exit until the browser is resized

**Evidence in codebase:**
`src/ui/EditorFrame.ts` lines 147–158: explicitly comments on this problem and works around it with `window.innerWidth/Height` — the workaround is correct but fragile if Phaser changes its internal logic
The comment on line 149: "We can't rely on scale.refresh() alone..." confirms this is known

**Prevention:**
Continue using the explicit `window.innerWidth/Height` fallback. Do not replace it with `scale.refresh()` as a "simpler" alternative during the refactor. Document this as an intentional decision in code comments.

**Detection:**
Warning sign: after editor exit, the canvas is ~260px narrower than before the editor opened (exactly the width of the inspector column that was taking space).

**Phase/Area:** EditorFrame refactor. This is already handled; the pitfall is accidentally removing the fix during a "cleanup" refactor.

---

### Pitfall 11: `gfx.clear()` + Full Redraw Every Frame — Hidden Cost at Scale

**What goes wrong:**
`EditorScene.update()` calls `gfx.clear()` then redraws design bounds, selection, hit area overlay, and all gizmos every frame. Phaser Graphics uses WebGL draw calls for each shape. At 60fps with 10+ shapes, this is 600+ draw calls/second. On low-end hardware, this can introduce frame-time spikes that stutter the Phaser game loop.

**Why it happens:**
The simplest correct approach is full redraw every frame. It was intentionally chosen for correctness over performance during initial implementation.

**Consequences:**
- Not an issue on desktop with discrete GPU
- May cause visible stutter on integrated graphics or mobile
- Performance appears fine in simple demo, worsens proportionally with scene complexity

**Evidence in codebase:**
`src/EditorScene.ts` lines 158–178: `gfx.clear()` followed by full redraw sequence
`.planning/codebase/CONCERNS.md` lines 95–100: documented as a known bottleneck

**Prevention:**
During the refactor, do not add more per-frame draw calls without measuring. Keep the design bounds draw as a "dirty" operation (only redraw when camera size changes). Static guide lines (design boundary) can be rendered to a RenderTexture once and reused.

**Detection:**
Warning sign: Chrome DevTools shows `Phaser.GameObjects.Graphics` taking >2ms per frame in the "EditorScene" update. Enable Phaser's built-in stats panel to monitor draw call count.

**Phase/Area:** Performance is not the primary concern of the viewport refactor. Address only if the refactor introduces new per-frame computations.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| EditorFrame fixed-column | Pitfall 1: CSS reflow on inspector populate | Switch `auto` to fixed `px` widths; verify no reflow in DevTools |
| ResizeObserver hardening | Pitfall 2: feedback loop | Add 1px change guard before `setParentSize()` |
| CoordinateSystem refactor | Pitfall 3: camera vs. display size | Use `game.scale.displaySize`, not `cameras.main` dimensions |
| Retina/DPR support | Pitfall 4: zoom multiplied twice | Verify all pointer event coords stay in CSS pixels; test at DPR=2 |
| Object identification | Pitfall 5: name collisions in diff | Introduce WeakMap UUID registry before touching `getChanges()` |
| EditorFrame destroy | Pitfall 6: detached parent | Add `document.contains()` check; fallback to body |
| EditorFrame destroy | Pitfall 7: autoCenter margin order | Restore autoCenter AFTER `setParentSize()`, not before |
| Hit area consolidation | Pitfall 8: three-site divergence | Extract `CoordinateSystem.hitAreaPointToScreen()` before fixing any hit area bug |
| Drag performance | Pitfall 9: per-frame invert | Cache inverted matrix at drag start, not per `updateDrag()` |
| CoordinateSystem refactor | Pitfall 10: `refresh()` body loop | Keep `window.innerWidth/Height` fallback; do not simplify it away |
| Any new gizmo draw code | Pitfall 11: per-frame draw bloat | Measure draw call count; defer to RenderTexture for static elements |

---

## Sources

All pitfalls are grounded in direct codebase evidence:

- `src/ui/EditorFrame.ts` — CSS grid definition, ResizeObserver implementation, destroy/restore logic
- `src/core/CoordinateSystem.ts` — coordinate space assumptions (camera vs. display)
- `src/EditorScene.ts` — drawDesignBounds coordinate space, per-frame redraw pattern
- `src/core/SelectionManager.ts` — hit area transform (duplicate site 1), name-based identity
- `src/gizmos/HitAreaGizmo.ts` — hit area transform (duplicate site 2), matrix inversion in drag
- `src/PhaserEditorPlugin.ts` — name-keyed getChanges() diff output
- `.planning/codebase/CONCERNS.md` — tech debt and known bug catalogue (HIGH confidence: codebase analysis)
- `.planning/PROJECT.md` — known bug description, DPR configuration used by consumers, active requirements

**Confidence on DPR/zoom pitfalls:** MEDIUM — the DPR configuration is documented in PROJECT.md as a consumer constraint; the specific breakage mode is inferred from coordinate space analysis of the codebase. Not confirmed by reproduction at DPR=2.

**Confidence on all other pitfalls:** HIGH — directly observable in the codebase or explicitly documented in CONCERNS.md.
