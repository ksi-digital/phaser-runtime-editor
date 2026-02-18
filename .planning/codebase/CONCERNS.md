# Codebase Concerns

**Analysis Date:** 2026-02-18

## Tech Debt

**Hit Area Coordinate Transform Complexity:**
- Issue: Hit area rendering requires special handling for `displayOrigin` offset that differs between regular objects and Containers. The same logic is duplicated across `EditorScene.drawHitArea()`, `SelectionManager.getPolygonShapeBounds()`, and `HitAreaGizmo.getTransformHelpers()`.
- Files: `src/EditorScene.ts` (lines 275-290), `src/core/SelectionManager.ts` (lines 135-144), `src/gizmos/HitAreaGizmo.ts` (lines 265-278)
- Impact: Maintenance burden; if the coordinate transform logic needs fixing, changes must be made in three places. Risk of inconsistency between visualization and actual geometry.
- Fix approach: Extract `displayOriginOffset()` and `transformHitAreaPointToScreen()` utility functions into `CoordinateSystem` class to centralize the math.

**Matrix Inversion in SetDesignPosition:**
- Issue: `CoordinateSystem.setDesignPosition()` calls `parentMatrix.invert()` every time a Container child is positioned. Matrix inversion is expensive.
- Files: `src/core/CoordinateSystem.ts` (line 102)
- Impact: During gizmo drags (called every frame), inverting the parent's transform matrix adds unnecessary CPU cost.
- Fix approach: Cache inverted matrices during drag, or use a direct formula for 2D matrix inversion if inversion is called frequently.

**Polygon Shape Bounds Bug Workaround:**
- Issue: Phaser's `Polygon.getBounds()` returns incorrect results when polygon vertices have negative coordinates. Code works around this by manually computing AABB from transformed vertices.
- Files: `src/core/SelectionManager.ts` (lines 129-153)
- Impact: If Phaser fixes this bug in a future version, the workaround becomes dead code. Current approach assumes Phaser's bug persists.
- Fix approach: Add a version check or feature detection to use Phaser's `getBounds()` if the bug is fixed, fall back to custom logic otherwise.

**Hardcoded Depth Constants:**
- Issue: Editor depth layers are scattered as magic numbers (`EDITOR_DEPTH = 100000`, `EDITOR_DEPTH - 1 = 99999`, `100001` for text).
- Files: `src/EditorScene.ts` (lines 10, 92, 97)
- Impact: Hard to maintain; if depth needs adjustment, changes are spread across files. No central config.
- Fix approach: Consolidate depth values in an `EditorConfig` or `EditorDepth` enum.

**No Undo/Redo Mechanism:**
- Issue: Editor changes are ephemeral—they reset on exit. No way to undo intermediate edits during a session.
- Files: Phase 9 not yet implemented
- Impact: Users can't recover from accidental changes within the editor session; they rely on the reset-on-exit behavior.
- Fix approach: Implement UndoManager (Phase 9) with single-level undo stack (snapshot before each transform, restore on Ctrl+Z).

---

## Known Bugs

**Container Hit Area Rendering Assumption:**
- Symptoms: Hit area visualization may be incorrect for Container children if they have non-standard `displayOrigin` values.
- Files: `src/EditorScene.ts` (lines 275-280)
- Trigger: Select a Container child with custom `displayOrigin`; the yellow hit area overlay may not align with the actual hit area.
- Details: Code assumes Containers always have hardcoded `displayOriginX = width * 0.5` (read-only). If a custom hit area is set on a Container child with different origin, the transform offset math breaks.
- Workaround: Hit area gizmo still functions correctly; visual mismatch is display-only.

**Scale Factor Precision in Snapping:**
- Symptoms: Objects snap to grid positions that are off by 1-2 pixels at certain zoom levels.
- Files: `src/core/SnappingEngine.ts`, `src/core/CoordinateSystem.ts`
- Trigger: Run editor at non-standard screen sizes where `(screenW - designW * sf) / 2` is fractional.
- Details: Scale factor is computed as `Math.min(screenW / designW, ...)`, which can produce irrational numbers. Snapping math rounds in design-space, but floating-point errors accumulate.
- Workaround: Rounding to 2 decimal places in `getChanges()` masks this at export time, but gizmo visual may appear misaligned by 1px.

**Empty Container Bounds Fallback:**
- Symptoms: Selecting an empty Container shows a 32x32 bounding box centered on the container origin (hardcoded 16px margin).
- Files: `src/core/SelectionManager.ts` (lines 159-162)
- Trigger: Create a Container with no children, select it in the editor.
- Details: The fallback assumes a minimum selectable size, but this is arbitrary. If the container is supposed to be small, the bounds are visually misleading.
- Workaround: Add children to the container or check the Inspector Info panel to confirm it's empty.

---

## Security Considerations

**DOM Injection via Clipboard Fallback:**
- Risk: The "Copy Changes" button uses `navigator.clipboard` with a fallback to `console.log()`. If clipboard fails and user pastes unsanitized JSON into their code, it could execute arbitrary code.
- Files: `src/ui/ToolbarPanel.ts` (lines 243-252)
- Current mitigation: Output is pure JSON (no code generation), and fallback is to console (no auto-execution).
- Recommendations: Keep console output as-is; no security risk currently. If export format changes to code generation (e.g., TypeScript), add explicit warning.

**No Input Validation on Grid Size:**
- Risk: Grid size input accepts numbers 1-200 with no further validation. If a malicious plugin modifies `state.snapping.gridSize` to `Infinity` or `NaN`, snapping could fail or cause division by zero.
- Files: `src/ui/ToolbarPanel.ts` (lines 71-74), `src/core/SnappingEngine.ts`
- Current mitigation: HTML input `min` and `max` constraints; engine doesn't divide by gridSize (only modulo).
- Recommendations: Add explicit runtime validation in `SnappingEngine.gridSnap()` to guard against invalid values.

**ResizeObserver Infinite Loop Risk:**
- Risk: EditorFrame uses ResizeObserver to track canvas cell size changes. If scale.setParentSize() triggers a layout recalculation that changes the cell size, observer could fire repeatedly.
- Files: `src/ui/EditorFrame.ts` (lines 103-111)
- Current mitigation: Observer only calls `setParentSize()` if width/height > 0; Phaser's scale system handles circular updates internally.
- Recommendations: Add a debounce or check `if (newSize !== oldSize)` to prevent redundant updates if already implemented in Phaser.

---

## Performance Bottlenecks

**Hit-Test Iterates All Objects Every Frame:**
- Problem: `SelectionManager.hitTest()` walks all selectable objects in every frame during gizmo drag (via `EditorScene.update()`).
- Files: `src/core/SelectionManager.ts` (lines 64-90)
- Cause: No spatial acceleration (no quadtree or grid). For large scenes (1000+ objects), this is O(n).
- Improvement path: Implement a simple spatial hash or bounding volume hierarchy. Cache results between frames if no object moved.
- Current impact: Acceptable for demo (few dozen objects); may slow down at 1000+ objects.

**Graphics Redrawn Every Frame Without Batching:**
- Problem: `EditorScene.update()` calls `gfx.clear()` and redraws all gizmos, selection box, snap guides, and design bounds every frame.
- Files: `src/EditorScene.ts` (lines 158-178)
- Cause: Phaser Graphics doesn't batch shape rendering; each `lineStyle()`, `strokeRect()`, etc. is a separate draw call.
- Improvement path: Use a render texture to draw static elements (design bounds, grid) once, or batch gizmo drawing.
- Current impact: Minor; frame rate is capped by screen refresh, so overhead is masked. GPU may be underutilized on high-end hardware.

**SelectionManager.getContainerBounds Recurses Children Every Hit-Test:**
- Problem: For each Container in `hitTest()`, bounds are computed by recursing all children and calling `getBounds()` on each.
- Files: `src/core/SelectionManager.ts` (lines 158-181)
- Cause: Container bounds are not cached; recomputed every frame during selection/drag.
- Improvement path: Cache Container bounds in a `Map<Container, Bounds>`, invalidate on child changes.
- Current impact: Low (containers usually few, children usually < 20); manifests only if scene has many deeply-nested containers.

**Inspector Panel Refresh Calls `pane.refresh()` Every Frame:**
- Problem: `EditorUI.refresh()` → `InspectorPanel.refresh()` calls Tweakpane's `pane.refresh()` every frame, even if no values changed.
- Files: `src/ui/InspectorPanel.ts` (line 191), `src/ui/EditorUI.ts` (line 58)
- Cause: Naive per-frame sync without dirty flag. Tweakpane checks internally, but DOM reflow is triggered.
- Improvement path: Only call `refresh()` if values actually changed; add dirty flag to `syncFromObject()`.
- Current impact: Negligible in practice; browser optimizes redundant DOM updates. Visible in DevTools as "style recalc" but <1ms.

---

## Fragile Areas

**Canvas Parent Restoration After EditorFrame Destroy:**
- Files: `src/ui/EditorFrame.ts` (lines 124-159)
- Why fragile: Restoration uses `originalNextSibling` and `originalParent` saved at construction. If the original parent is removed from DOM before `destroy()` is called, insertion fails silently.
- Safe modification: Add null checks before `insertBefore()` / `appendChild()`. Verify parent is still in document via `document.contains()`.
- Test coverage: Demo never removes canvas from DOM during editor session, so this path is untested.

**Phaser 4 Scene Lifecycle Assumptions:**
- Files: `src/PhaserEditorPlugin.ts` (lines 111-114), `src/EditorScene.ts` (lines 149-150)
- Why fragile: Code assumes `this.events.on('shutdown', ...)` is called when `game.scene.stop()` is invoked. Phaser's lifecycle is complex; if shutdown doesn't fire, cleanup is incomplete.
- Safe modification: Add `once('destroy', ...)` listener as backup. Log warnings if neither fires.
- Test coverage: Mahjong game tests pause/resume cycle, but never stress-tests rapid scene start/stop.

**Property Snapshot Assumes All Objects Have Transform:**
- Files: `src/PhaserEditorPlugin.ts` (lines 230, 271)
- Why fragile: Code checks `'x' in obj` to detect Transform capability, but falls back silently if missing. If a custom GameObject type lacks Transform but is in the scene, it won't be snapshotted.
- Safe modification: Add explicit warning log if `!('x' in obj)`. Consider including all properties (even if undefined) in snapshot for consistency.
- Test coverage: Demo uses standard Phaser types (Image, Container, Text) which all have Transform. Custom types not tested.

**Bounding Box Math for Polygon Shapes:**
- Files: `src/core/SelectionManager.ts` (lines 138-149)
- Why fragile: Manual AABB computation from transformed vertices assumes all transforms are well-behaved (no skew, no NaN). If a Polygon's transform matrix is degenerate, bounds may be invalid.
- Safe modification: Add `isFinite()` checks on min/max values after transform. Return `null` if any are NaN.
- Test coverage: Demo's player polygon has normal scale/rotation; skew and degenerate matrices not tested.

---

## Scaling Limits

**DOM Panel Resize Performance:**
- Current capacity: ~10-20 panels before noticeable slowdown
- Limit: Browser's DOM reflow engine struggles with many overlapping elements at high update frequency
- Scaling path: Virtualize panels (only render visible rows in hierarchy), or move panels off-screen and render to texture

**Scene Size (Object Count):**
- Current capacity: ~500 objects before hit-test noticeable slowdown
- Limit: `SelectionManager.hitTest()` is O(n), no spatial acceleration
- Scaling path: Implement spatial hash or quadtree, batch hit-tests across frames

**Gizmo Rendering:**
- Current capacity: 1 gizmo per selected object (works fine)
- Limit: Graphics object redraws all geometry every frame (no retained batching)
- Scaling path: Use render texture for static shapes, or implement draw call batching in Phaser's Graphics

---

## Dependencies at Risk

**Tweakpane 4.0.0 Bundled:**
- Risk: Tweakpane is bundled into `dist/index.js` (~90kB of the 216kB total). If Tweakpane has a critical vulnerability, it's embedded in the package.
- Impact: Consumers inherit the vulnerability; can't patch without updating the whole package.
- Migration plan: Consider making Tweakpane a peerDependency (like Phaser). Consumers install separately, can patch independently.
- Current rationale: Bundling simplifies setup for users; peerDependency adds complexity.

**@tweakpane/core ^2.0.5 Compatibility:**
- Risk: TypeScript type resolution for Tweakpane's inheritance chain (`Pane` extends `FolderApi` from `@tweakpane/core`) is fragile.
- Impact: If Tweakpane changes its inheritance or removes `@tweakpane/core`, build breaks.
- Current mitigation: `@tweakpane/core` is listed in dependencies; version range is `^2.0.5` (minor updates allowed).
- Recommendations: Lock to exact version (`2.0.5`) if stability is critical, or add integration tests for Tweakpane type resolution.

**Phaser 4 RC6 (Dev)**
- Risk: Package lists `phaser@^4.0.0-rc.6` as devDependency. RC releases have breaking changes.
- Impact: If Phaser 4 final release has API changes, this package breaks.
- Migration plan: Upgrade to final release when available, run full integration tests.
- Current status: Peer dependency accepts `^4.0.0` (any 4.x), so consumers on final release will work; dev dependency may lag.

---

## Missing Critical Features

**No Multi-Select:**
- Problem: Can only select/edit one object at a time. Batch operations require selecting, editing, deselecting, repeating.
- Blocks: Efficient layout work on groups of objects.
- Design approach (Phase 10): Shift+click to add to selection, drag bounding box to select multiple.

**No Delete/Hide Shortcut:**
- Problem: No keyboard shortcut to hide or delete selected objects. Must use Inspector panel.
- Blocks: Quick workflow optimization.
- Design approach (Phase 9): Delete key hides selected (non-destructive), Shift+Delete removes from scene.

**No Keyboard Nudge:**
- Problem: Can only move objects via gizmo drag. No arrow key support for 1px nudges.
- Blocks: Precise pixel-perfect positioning.
- Design approach (Phase 9): Arrow keys nudge 1px, Shift+Arrow keys nudge 10px.

**No Grid Overlay:**
- Problem: Snapping grid is invisible; users can't see the snap target until the object moves.
- Blocks: Predictable layout on grid.
- Design approach (Phase 10): Checkbox to draw grid lines at snapping intervals (faint cyan).

**No Layout Export/Import:**
- Problem: Export copies individual object positions, but can't save/load entire scene layouts.
- Blocks: Serialization of complex scenes.
- Design approach (Phase 8): JSON format with all objects, relationships, hit areas. Import to reposition batch.

---

## Test Coverage Gaps

**Hit Area Editing:**
- What's not tested: Dragging hit area handles, especially for non-rectangular shapes.
- Files: `src/gizmos/HitAreaGizmo.ts`
- Risk: Polygon hit area vertex dragging may have off-by-one errors or coordinate transform bugs that only appear during manual testing.
- Priority: High (hit area is a new feature, Phase 7b)

**Container Hierarchy Editing:**
- What's not tested: Dragging Container children while the Container is rotated/scaled.
- Files: `src/core/CoordinateSystem.ts` (setDesignPosition with parentContainer)
- Risk: Matrix inversion may fail or produce incorrect local coordinates for deeply nested containers.
- Priority: High (common use case for complex scenes)

**Polygon Shape Bounds:**
- What's not tested: Polygon shapes with negative vertex coordinates, or rotated polygons.
- Files: `src/core/SelectionManager.ts` (getPolygonShapeBounds)
- Risk: AABB computation may produce invalid bounds (minX > maxX) if polygon is degenerate.
- Priority: Medium (workaround for Phaser bug; assumed rare)

**Scale.FIT Edge Cases:**
- What's not tested: Screen sizes where design area width is larger than canvas width (letterboxing), or extreme aspect ratios.
- Files: `src/core/CoordinateSystem.ts` (getScaleFactor, getOffset)
- Risk: Offset calculation may produce negative values, gizmo rendering may appear off-screen.
- Priority: Medium (edge case; most games use standard aspect ratios)

**Editor Exit Cleanup:**
- What's not tested: Rapid editor toggle (F2 F2 F2...) to stress cleanup logic.
- Files: `src/EditorScene.ts` (onShutdown), `src/PhaserEditorPlugin.ts` (deactivate)
- Risk: Memory leaks if event listeners aren't unsubscribed, or DOM elements left behind.
- Priority: Medium (affects long play sessions)

**Tweakpane Folder Disposal:**
- What's not tested: Selecting rapidly between objects with different hit area types (rect/circle/polygon) to verify Tweakpane folders are properly disposed.
- Files: `src/ui/InspectorPanel.ts` (bind/dispose cycle)
- Risk: Tweakpane memory leak if folders aren't removed from DOM before pane.dispose().
- Priority: Low (infrequent interaction pattern)

---

## Miscellaneous Concerns

**Error Logging is Minimal:**
- Issue: Only two console.log patterns are used: info (`[PhaserEditor]`) and errors caught in try-catch with generic "cleanup error" message.
- Files: Throughout `src/`
- Impact: Hard to debug issues in production. Silent failures in gizmo drag or coordinate transforms.
- Recommendation: Add structured logging levels (error, warn, info, debug) with more context.

**No Configuration Validation:**
- Issue: Plugin config (`designWidth`, `designHeight`, `hotkey`) is read from `game.config` but never validated.
- Files: `src/PhaserEditorPlugin.ts` (lines 84-95)
- Impact: If `designHeight` is 0 or negative, math breaks (division by zero in `getScaleFactor()`).
- Recommendation: Validate dimensions are positive, hotkey is a valid key name.

**Unused Imports:**
- Issue: No obvious unused imports detected, but TypeScript imports are not checked with strict unused variable rules.
- Files: All `src/**/*.ts`
- Recommendation: Enable `noUnusedLocals` and `noUnusedParameters` in `tsconfig.json`.

**Console Output Spammy During Drag:**
- Issue: SelectionManager logs "Selected: ..." on every click, but also logs during gizmo drag if selection changes (shouldn't happen).
- Files: `src/EditorScene.ts` (line 133)
- Recommendation: Only log on actual selection change, not every frame.

---

*Concerns audit: 2026-02-18*
