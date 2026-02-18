---
phase: quick-1
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ui/HierarchyPanel.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "User can scroll the hierarchy panel up and down without it bouncing back"
    - "User can scroll the hierarchy panel horizontally without it bouncing back"
    - "Selecting an object still scrolls the selected row into view once, not continuously"
  artifacts:
    - path: "src/ui/HierarchyPanel.ts"
      provides: "Fixed hierarchy panel scroll behavior"
      contains: "scrollIntoView"
  key_links:
    - from: "src/ui/HierarchyPanel.ts"
      to: "EditorUI.refresh()"
      via: "refresh() called every frame"
      pattern: "refresh.*updateHighlight"
---

<objective>
Fix hierarchy panel scrollbar erratic bounce-back behavior.

Purpose: The hierarchy panel fights the user's scroll input because `scrollIntoView()` is called every frame via the `refresh()` -> `updateHighlight()` path, and because there are nested scrollable containers causing conflicting scroll behaviors.

Output: A hierarchy panel that respects user scroll position and only auto-scrolls when selection actually changes.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@src/ui/HierarchyPanel.ts
@src/ui/EditorFrame.ts
@src/ui/EditorUI.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix per-frame scrollIntoView and nested scroll containers</name>
  <files>src/ui/HierarchyPanel.ts</files>
  <action>
There are three root causes of the erratic scroll bounce-back:

**Root Cause 1: `scrollIntoView` called every frame.**
The call chain is: `EditorScene.update()` (every frame) -> `editorUI.refresh()` -> `hierarchy.refresh()` -> `updateHighlight()` -> `scrollIntoView()`. This means every single frame, the browser is commanded to smooth-scroll the selected row into view, which fights against any manual scrolling the user does.

Fix: Split `updateHighlight()` into two concerns:
- The visual highlight (CSS class toggle) should happen in `refresh()` / `updateHighlight()` as it does now.
- The `scrollIntoView()` call should ONLY happen when the selection actually changes, NOT every frame.

Concrete changes:
1. Remove ALL `scrollIntoView()` calls from `updateHighlight()`.
2. In `onSelectionChanged()` (which fires only on actual selection change events), after calling `updateHighlight()`, call `scrollIntoView({ block: 'nearest' })` on `this.selectedRow` if it exists. Use `behavior: 'instant'` instead of `'smooth'` to avoid lingering scroll animations that could interfere with user input.
3. Similarly, when `buildTree()` calls `updateHighlight()` at the end (line 242), the scrollIntoView should happen once after the tree rebuild. Add a `scrollToSelected()` helper that does the one-time scroll, and call it after `updateHighlight()` in both `buildTree()` and `onSelectionChanged()`.

**Root Cause 2: Nested scrollable containers.**
The `hierarchySlot` in EditorFrame has `overflow-y: auto` AND the `wrapper` div created by HierarchyPanel also has `overflow-y: auto`. This creates two nested scroll containers which causes unpredictable scroll behavior.

Fix: Remove `overflow-y: auto` from the wrapper's inline style (line 93). The wrapper should fill its parent slot and let the slot handle scrolling. Change the wrapper to:
- Remove `overflow-y: auto` from wrapper style
- Add `height: 100%` to wrapper style so it fills the hierarchy slot
- The hierarchySlot already has `overflow-y: auto` from EditorFrame, so scrolling is handled there

Actually, on reflection, the better fix is the opposite: the wrapper should be the scroll container (since it's the one with the actual content), and the hierarchySlot should NOT scroll. But since we cannot modify EditorFrame in this plan (and the slot is a generic container), the cleanest approach is:
- Keep `overflow-y: auto` on wrapper
- Make the wrapper `height: 100%` to fill the slot
- Remove `overflow-y: auto` from hierarchySlot by adding `overflow-y: hidden` or `overflow: visible` on the wrapper's parent. BUT we cannot modify EditorFrame here.

Better approach: Make the wrapper the sole scroll container. Set wrapper to `height: 100%; overflow-y: auto; overflow-x: hidden;`. The hierarchySlot's `overflow-y: auto` won't trigger because the wrapper fills it exactly with `height: 100%` (no overflow from the slot's perspective). This way only the wrapper scrolls.

**Root Cause 3: No horizontal overflow control.**
The wrapper has no `overflow-x` setting, and rows use `white-space: nowrap`. Long object names can cause horizontal overflow. Add `overflow-x: hidden` to the wrapper to prevent horizontal scrollbar issues.

Summary of changes to `src/ui/HierarchyPanel.ts`:

1. In `createWrapper()` (line 91-99), update the wrapper style:
   - Add `height: 100%`
   - Change `overflow-y: auto` stays
   - Add `overflow-x: hidden`

2. In `updateHighlight()` (lines 348-390): Remove all three `scrollIntoView()` calls (lines 370, 377, 388).

3. Add a new private method `scrollToSelected()`:
   ```typescript
   private scrollToSelected(): void {
       if (this.selectedRow) {
           this.selectedRow.scrollIntoView({ block: 'nearest', behavior: 'instant' });
       }
   }
   ```

4. In `buildTree()` after the `this.updateHighlight()` call on line 242, add `this.scrollToSelected()`.

5. In `onSelectionChanged()` (line 392-394), change to:
   ```typescript
   private onSelectionChanged(): void {
       this.updateHighlight();
       this.scrollToSelected();
   }
   ```
  </action>
  <verify>
  Run `npx tsc --noEmit` to verify no type errors. Then manually test in the editor:
  1. Open the editor with enough objects to require scrolling in the hierarchy
  2. Scroll the hierarchy panel down -- it should stay where scrolled, no bounce-back
  3. Select an object that is off-screen in the hierarchy -- it should scroll into view once
  4. After it scrolls into view, manually scroll away -- it should stay where you scrolled
  5. No horizontal scrollbar should appear
  </verify>
  <done>
  Hierarchy panel scroll position is stable: scrollIntoView only fires on selection change (not every frame), no nested scroll container conflict, no horizontal scrollbar bounce.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- Manual test: scroll hierarchy panel -- no bounce-back behavior
- Manual test: select object -- hierarchy scrolls to it once, then respects user scroll
- No horizontal scrollbar appears on the hierarchy panel
</verification>

<success_criteria>
User can freely scroll the hierarchy panel in both directions without the scroll position being fought or reset. Selection changes cause a single scroll-to-view, not a continuous per-frame scroll animation.
</success_criteria>

<output>
After completion, create `.planning/quick/1-fix-hierarchy-panel-scrollbar-erratic-bo/1-SUMMARY.md`
</output>
