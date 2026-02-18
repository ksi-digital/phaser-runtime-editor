---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/core/CoordinateSystem.ts
  - src/core/SelectionManager.ts
  - src/EditorScene.ts
autonomous: true

must_haves:
  truths:
    - "Selection bounding boxes align precisely with the visual position of game objects"
    - "Move gizmo dragging moves objects by the expected amount and stops when pointer stops"
    - "Inspector x/y values match the object's actual design-space position"
    - "Hit-testing clicks on the correct objects (screen coords match bounds)"
  artifacts:
    - path: "src/core/CoordinateSystem.ts"
      provides: "Correct world-to-screen and screen-to-world camera projection"
      contains: "worldToScreen"
    - path: "src/core/SelectionManager.ts"
      provides: "Screen-space bounding boxes via camera projection"
      contains: "worldToScreen"
    - path: "src/EditorScene.ts"
      provides: "ViewportState threaded to drawSelection"
  key_links:
    - from: "src/core/CoordinateSystem.ts"
      to: "ViewportState"
      via: "worldToScreen / screenToWorld methods"
      pattern: "worldToScreen"
    - from: "src/core/SelectionManager.ts"
      to: "src/core/CoordinateSystem.ts"
      via: "getScreenBounds calls worldToScreen on getBounds() results"
      pattern: "coords\\.worldToScreen"
---

<objective>
Fix two Phase 2 regression bugs: (1) selection bounding boxes misaligned from game objects, and (2) move gizmo causing x/y to increase endlessly.

Purpose: Phase 2's coordinate refactor introduced a broken camera projection formula in `getScreenPosition()` and `setDesignPosition()`. The formula `(worldX - scrollX) * zoom + centerX` is wrong — for the default Phaser camera (zoom=1, scrollX=0), it adds `centerX` (half canvas width) to every position. The correct Phaser camera projection is `(worldX - scrollX - centerX) * zoom + centerX`, which collapses to `worldX` for the default camera. Additionally, `getScreenBounds()` returns world-space bounds from Phaser's `getBounds()` without applying camera projection, so bounding boxes are drawn at world coordinates rather than screen coordinates on the editor overlay.

Output: All coordinate transforms produce correct screen/world conversions; bounding boxes overlay objects correctly; move gizmo drag is stable.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@src/core/CoordinateSystem.ts
@src/core/SelectionManager.ts
@src/core/ViewportState.ts
@src/EditorScene.ts
@src/gizmos/MoveGizmo.ts
@src/gizmos/GizmoManager.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix camera projection formula in CoordinateSystem and add worldToScreen/screenToWorld helpers</name>
  <files>src/core/CoordinateSystem.ts</files>
  <action>
The root cause of BOTH bugs is a wrong camera projection formula in CoordinateSystem.

**Bug analysis — camera projection formula:**

The Phaser camera preRender builds a matrix via:
```
matrix.applyITRS(originX, originY, rotation, zoomX, zoomY);
matrix.translate(-scrollX - originX, -scrollY - originY);
```
where `originX = cam.width * 0.5` (same as `cam.centerX` when `cam.x = 0`).

For rotation=0 this produces:
```
screenX = (worldX - scrollX - centerX) * zoom + centerX
```

For the DEFAULT camera (zoom=1, scroll=0, centerX=canvasW/2):
- Correct: `screenX = worldX` (identity — world coords equal screen coords)
- Current buggy formula: `screenX = worldX + centerX` (shifts everything by half the canvas width!)

**Changes to make in CoordinateSystem.ts:**

1. **Add `worldToScreen(worldX, worldY, vp)` method** — Correct Phaser camera projection:
   ```typescript
   worldToScreen(worldX: number, worldY: number, vp: ViewportState): { x: number; y: number } {
       return {
           x: (worldX - vp.cameraScrollX - vp.cameraCenterX) * vp.cameraZoom + vp.cameraCenterX,
           y: (worldY - vp.cameraScrollY - vp.cameraCenterY) * vp.cameraZoom + vp.cameraCenterY,
       };
   }
   ```

2. **Add `screenToWorld(screenX, screenY, vp)` method** — Inverse of the camera projection:
   ```typescript
   screenToWorld(screenX: number, screenY: number, vp: ViewportState): { x: number; y: number } {
       return {
           x: (screenX - vp.cameraCenterX) / vp.cameraZoom + vp.cameraScrollX + vp.cameraCenterX,
           y: (screenY - vp.cameraCenterY) / vp.cameraZoom + vp.cameraScrollY + vp.cameraCenterY,
       };
   }
   ```

3. **Fix `getScreenPosition(obj, vp)`** — Replace the broken formula. Use the new `worldToScreen` for the camera projection step:
   ```typescript
   // Container children: world matrix composes all parent transforms
   // matrix.tx/ty is world-space position
   // Regular objects: obj.x/obj.y is world-space position
   // Then apply camera projection via worldToScreen()
   return this.worldToScreen(worldX, worldY, vp);
   ```
   The code that reads worldX/worldY from the object (either from matrix.tx/ty or obj.x/obj.y) stays the same. Only the final return line changes from the inline broken formula to `this.worldToScreen(worldX, worldY, vp)`.

4. **Fix `setDesignPosition(obj, dx, dy, vp)` for non-container objects** — Currently does `t.x = screen.x` which writes screen coords to a world-space property. After converting design to screen via `designToScreen()`, must convert screen to world before assigning:
   ```typescript
   // Non-container branch (the else at the bottom):
   const world = this.screenToWorld(screen.x, screen.y, vp);
   t.x = world.x;
   t.y = world.y;
   ```
   The container branch using `cachedInvParentMatrix.transformPoint(screen.x, screen.y)` also needs fixing — it should pass screen coords through the inverse parent matrix. But since the parent matrix is a world matrix (not including camera), we need to first convert screen→world, THEN apply the inverse parent matrix. Update:
   ```typescript
   // Container branch:
   const world = this.screenToWorld(screen.x, screen.y, vp);
   if (cachedInvParentMatrix != null) {
       const local = cachedInvParentMatrix.transformPoint(world.x, world.y);
       t.x = local.x;
       t.y = local.y;
   } else {
       const parent = (obj as any).parentContainer as Phaser.GameObjects.Container;
       const parentMatrix = parent.getWorldTransformMatrix();
       const inv = parentMatrix.invert();
       const local = inv.transformPoint(world.x, world.y);
       t.x = local.x;
       t.y = local.y;
   }
   ```

5. **Update the JSDoc comments** — Update the class-level comment and method comments to document the correct formulas. Remove the incorrect formula comment at the top of the class that says `screenX = (worldX - cam.scrollX) * cam.zoom + cam.centerX`.

**Important:** Do NOT change `designToScreen`, `screenToDesign`, `getDesignPosition`, `getHitAreaToScreen`, or `getHitAreaScreenDeltaToLocal`. Those methods operate in design-space or use the world matrix directly (for hit areas) and are correct.
  </action>
  <verify>
Run `npx tsc --noEmit` — zero TypeScript errors.

Verify the formula correctness by tracing through manually:
- Default camera (zoom=1, scroll=0, centerX=360 for 720px canvas):
  - `worldToScreen(100, 200)` should give `(100, 200)` (identity)
  - `screenToWorld(100, 200)` should give `(100, 200)` (identity)
  - `getScreenPosition` of obj at x=100 should give screenX=100
  - `setDesignPosition` then `getDesignPosition` round-trip should be stable
  </verify>
  <done>
`getScreenPosition()` returns correct screen coords for default and non-default cameras. `setDesignPosition()` correctly converts screen coords to world coords before writing to obj.x/obj.y. Round-trip `getDesignPosition` -> `setDesignPosition` -> `getDesignPosition` returns the same values (no drift). `worldToScreen` and `screenToWorld` are inverse of each other.
  </done>
</task>

<task type="auto">
  <name>Task 2: Thread ViewportState through SelectionManager.getScreenBounds and drawSelection</name>
  <files>src/core/SelectionManager.ts, src/EditorScene.ts</files>
  <action>
`getScreenBounds()` calls Phaser's `getBounds()` which returns world-space coordinates. These must be projected through the camera to become screen-space coordinates for drawing on the editor overlay. Currently `drawSelection()` and `getScreenBounds()` have no ViewportState parameter, which was a Phase 2 decision that turns out to be wrong.

**Changes to SelectionManager.ts:**

1. **Add `vp: ViewportState` parameter to `getScreenBounds(obj, vp)`.**

2. **For regular objects (the `getBounds()` path):** After getting the world-space rectangle from `getBounds()`, project all four corners through `this.coords.worldToScreen()` and compute the axis-aligned bounding box of the projected corners:
   ```typescript
   const worldBounds = (obj as any).getBounds() as Phaser.Geom.Rectangle;
   // Project all 4 corners from world to screen
   const tl = this.coords.worldToScreen(worldBounds.x, worldBounds.y, vp);
   const tr = this.coords.worldToScreen(worldBounds.x + worldBounds.width, worldBounds.y, vp);
   const bl = this.coords.worldToScreen(worldBounds.x, worldBounds.y + worldBounds.height, vp);
   const br = this.coords.worldToScreen(worldBounds.x + worldBounds.width, worldBounds.y + worldBounds.height, vp);
   const minX = Math.min(tl.x, tr.x, bl.x, br.x);
   const minY = Math.min(tl.y, tr.y, bl.y, br.y);
   const maxX = Math.max(tl.x, tr.x, bl.x, br.x);
   const maxY = Math.max(tl.y, tr.y, bl.y, br.y);
   return new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY);
   ```

3. **For Container bounds (`getContainerBounds`):** Add `vp` parameter. The method calls `getChildWorldBounds` which calls `getBounds()` — same world-space issue. Apply `worldToScreen` projection to the child bounds before accumulating min/max. Also add `vp` parameter to `getChildWorldBounds` and project the fallback `matrix.tx/ty` path through `worldToScreen`.

4. **For Polygon shapes (`getPolygonShapeBounds`):** This path uses `this.coords.getHitAreaToScreen(poly)` which uses the world matrix directly and produces screen-correct results for rendering (per the Phase 2 decision about hit-area helpers). However, this is only correct because the hit-area helper uses the world matrix which in Phaser's shared GL context IS screen-correct. For the bounding box used in hit-testing (not rendering), we need proper screen coords. Actually, re-examining: `getHitAreaToScreen` returns coords via `matrix.a * adjX + matrix.c * adjY + matrix.tx` — these are world-space transformed coords, and ARE screen-correct when drawn via the Graphics object (because the editor scene camera is default). So the polygon path is actually fine for drawing. But for `hitTest()` comparison with screen pointer coords, these world-matrix coords need to match pointer screen coords. For default camera they do (world = screen). For non-default camera they wouldn't. Since fixing this properly would require rethinking the hit-area transform approach, and the primary bug report is about bounding boxes and move gizmo, keep the polygon path as-is for now (it works for the common case and is a separate concern from the two reported bugs).

5. **Add `vp: ViewportState` parameter to `drawSelection(gfx, vp)`.** Pass `vp` through to `this.getScreenBounds(selected, vp)`.

6. **Add `vp` parameter to `hitTest(screenX, screenY, vp)`** so the bounds comparison uses screen-space bounds. Pass through to `this.getScreenBounds(obj, vp)`.

7. **For the empty container fallback** in `getContainerBounds`: the current code uses `t.x - 16, t.y - 16` which is world coords. Project through `worldToScreen`: `const screen = this.coords.worldToScreen(t.x, t.y, vp)` then use `screen.x - 16, screen.y - 16`.

**Changes to EditorScene.ts:**

1. **Pass `vp` to `selectionMgr.drawSelection(this.gfx, vp)`** in `update()`. The `vp` variable is already computed earlier in `update()`. Handle the null case (no host scene) by skipping drawSelection (which currently does nothing useful without a host scene anyway, but guard it).

2. **Pass `vp` to `selectionMgr.hitTest(pointer.x, pointer.y, vp)`** in the pointerdown handler. This requires capturing a ViewportState at that point — similar to how `GizmoManager.handlePointerDown` already does. Capture a fresh `vp` from `captureViewport()` in the pointerdown handler (one is already captured for the console.log on line 134, so reuse/move it to be captured before the hitTest call).

3. **Update calls to `selectionMgr.getScreenBounds(obj, vp)`** in any other call sites. Search for all `getScreenBounds` calls — `MoveGizmo.draw()` calls it via `selectionMgr.getScreenBounds(obj)`. This is in MoveGizmo.ts line 110. Since MoveGizmo.draw already receives `vp`, pass it through: `selectionMgr.getScreenBounds(obj, vp)`. Same for RotateGizmo, ScaleGizmo, and HitAreaGizmo if they call getScreenBounds — check each.

**Additional files to update (callers of getScreenBounds):**
- `src/gizmos/MoveGizmo.ts` — `draw()` method calls `selectionMgr.getScreenBounds(obj)` → add `vp` param
- `src/gizmos/RotateGizmo.ts` — check if it calls `getScreenBounds`
- `src/gizmos/ScaleGizmo.ts` — check if it calls `getScreenBounds`
- `src/gizmos/HitAreaGizmo.ts` — check if it calls `getScreenBounds`

For any gizmo that calls `getScreenBounds`, add `vp` parameter to its `draw()` signature if not already present, and pass through.
  </action>
  <verify>
Run `npx tsc --noEmit` — zero TypeScript errors.

Run `npm run dev` (or the dev server command) and open the demo. Verify:
1. Select an object — bounding box overlays the object precisely
2. Select the player container — bounding box surrounds all children
3. Use move gizmo to drag an object — x/y change smoothly and stop when pointer stops
4. Release the drag — object stays at the new position (no drift)
5. Inspector panel shows correct design-space coordinates
  </verify>
  <done>
Bounding boxes align precisely with game objects for all object types (images, text, containers, polygons). Move gizmo drag produces stable, bounded position changes. Hit-testing selects the correct object under the pointer. No TypeScript errors.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. Selection bounding boxes align with objects in the demo scene
3. Move gizmo drag moves objects by expected amounts; x/y do not increase endlessly
4. Inspector x/y values are stable and match visual position
5. Clicking on objects selects the correct one (hit-test works with screen-space bounds)
6. Container selection bounding box surrounds all children correctly
</verification>

<success_criteria>
- Both reported bugs are fixed: bounding boxes aligned, move gizmo stable
- Zero TypeScript compilation errors
- No regressions in rotate, scale, or hit-area gizmos
- Coordinate round-trip (getDesignPosition -> setDesignPosition -> getDesignPosition) is stable (no drift)
</success_criteria>

<output>
After completion, create `.planning/quick/2-fix-phase-2-bugs-bounding-boxes-misalign/2-SUMMARY.md`
</output>
