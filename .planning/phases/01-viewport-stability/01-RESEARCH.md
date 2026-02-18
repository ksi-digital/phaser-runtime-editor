# Phase 1: Viewport Stability - Research

**Researched:** 2026-02-18
**Domain:** CSS Grid layout, ResizeObserver, Phaser ScaleManager lifecycle
**Confidence:** HIGH — all findings verified against the actual codebase. No external libraries needed.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Fixed widths: 220px left (hierarchy), 260px right (inspector) — confirmed
- Panels are NOT resizable — no drag handles, no user-adjustable widths
- Always show both panels regardless of screen size — no responsive breakpoints or auto-collapse
- Content that exceeds panel width should truncate with ellipsis (no horizontal scrollbar)
- Browser resize is a rare/unexpected scenario — optimize for simplicity, not robustness
- Game canvas maintains its current position on resize (no re-fit/re-center)
- If a resize causes visual glitches, user can toggle editor off/on to fix — acceptable recovery path
- No special overlay sync logic needed — simplest implementation wins
- Editor deactivation must be zero-footprint: fully revert to original game state with no residual changes
- Selection is cleared on deactivation — reactivating starts fresh with nothing selected
- Panel removal is instant (no CSS transitions or animations)
- Assume DOM container always exists when deactivate is called — no defensive existence checks needed

### Claude's Discretion

- ResizeObserver guard scope: whether to suppress resize events during selection changes or rely solely on the CSS fix
- Exact autoCenter margin restoration approach (as long as the game returns to its original state)
- ResizeObserver debounce/throttle timing if needed

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VIEW-01 | Selecting an object must not cause any visual shift of game objects or editor overlays | Root cause is `auto` column widths in CSS grid; fix is fixed pixel widths (VIEW-03). Once columns are fixed, selection no longer causes layout reflow. |
| VIEW-02 | ResizeObserver must not trigger feedback loops (guard against sub-pixel oscillation) | A 1px change guard (compare new dimensions to last-reported dimensions) stops oscillation. CSS fix alone reduces frequency; the guard ensures correctness. |
| VIEW-03 | CSS grid columns must use fixed pixel widths for hierarchy and inspector panels | Single-line change: `auto 1fr auto` → `220px 1fr 260px` at `EditorFrame.ts` line 50. |
| VIEW-04 | Canvas cell must maintain stable dimensions regardless of panel content changes | Direct consequence of VIEW-03. Fixed-width columns make the `1fr` canvas cell immune to side-panel content changes. |
</phase_requirements>

---

## Summary

The visual shift when selecting objects is caused by a cascade of three linked behaviors in `EditorFrame.ts`. First, the CSS grid uses `auto` width for the left and right panel columns (`grid-template-columns: auto 1fr auto`). When an object is selected, the inspector panel (Tweakpane) renders its property fields, changing the panel's intrinsic content width. The `auto` column re-measures its content and resizes, which causes the `1fr` canvas cell to shrink or grow. Second, the ResizeObserver on the canvas cell fires in response to this size change and calls `scale.setParentSize(width, height)`. Third, Phaser's ScaleManager repositions the canvas within the cell in response. The result is a visible jump every time a selection causes content to appear or change in either side panel.

The fix is strictly scoped to `EditorFrame.ts` and involves three coordinated changes. Replace `auto` column widths with `220px` and `260px` fixed pixel values — this eliminates the root cause entirely by making side-panel content changes invisible to the grid layout engine. Add a size-change guard to the ResizeObserver so it only calls `setParentSize()` when the canvas cell dimensions actually change by at least 1px — this prevents sub-pixel oscillation that can occur in fractional DPR environments. Harden the `destroy()` method by checking `document.contains()` before canvas re-insertion, and apply margin restoration after `setParentSize()` completes, not before.

These are isolated, low-risk changes. No coordinate math, no gizmo logic, no other files are affected. The ResizeObserver change guard is a defensive improvement: the CSS fix removes the trigger, the guard prevents a feedback loop if something else (a future browser resize) causes the observer to fire.

**Primary recommendation:** Fix `grid-template-columns` first (single-line change). Add the ResizeObserver guard as a 4-line addition. Harden `destroy()` as a correctness fix. Verify all VIEW-0x requirements pass manually.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native CSS Grid | Browser-native | Panel layout | No library needed; `grid-template-columns` with fixed px values is the correct primitive |
| ResizeObserver | Browser-native | Canvas cell size tracking | Already in use; no replacement needed |
| Phaser ScaleManager | Phaser 4.0.0-rc.6 | Canvas resize notification | Already used via `scale.setParentSize()` |

### Supporting

None. This phase requires zero new dependencies.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fixed px column widths | CSS `min-content` or `max-content` | Both re-measure content; defeats the purpose. Fixed px is the only correct choice. |
| 1px change guard | Debounce (e.g., 16ms) | Debounce delays response; change guard is immediate and precise. Debounce is only needed if the observer fires multiple times in a single frame, which fixed columns prevent. |
| `document.contains()` check | No check (user said assume DOM exists) | Per user decision, the existence check is NOT required in the deactivate path. ROBUST-03 mentions it but user overrode with "assume DOM container always exists when deactivate is called." Apply `document.contains()` only if there is a structural reason it could be absent — there isn't in this scope. |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

No structural changes. All changes are within the existing file:

```
src/
└── ui/
    └── EditorFrame.ts    # The only file touched in this phase
```

### Pattern 1: Fixed-Width CSS Grid Columns

**What:** Replace content-driven `auto` columns with explicit pixel widths. The `1fr` center column then receives all remaining space and is immune to side-panel content changes.

**When to use:** Any time panel dimensions must not influence the viewport.

**Example:**

```typescript
// BEFORE (current — causes shift):
grid-template-columns: auto 1fr auto;

// AFTER (fixed — no shift):
grid-template-columns: 220px 1fr 260px;
```

Source: Direct analysis of `src/ui/EditorFrame.ts` lines 50-51.

The hierarchy slot and inspector slot already declare their inner `width` (220px and 260px respectively via wrapper divs inside those slots). Setting the column to the same value is coherent. Content that overflows horizontally must be truncated — already handled by `overflow-y: auto` on the slots; add `overflow-x: hidden` if needed.

### Pattern 2: ResizeObserver Change Guard

**What:** Store the last-reported canvas cell dimensions. Only call `setParentSize()` when the new dimensions differ by more than 1px in either axis. This prevents sub-pixel oscillation.

**When to use:** Whenever a ResizeObserver drives a layout-affecting side effect (like `setParentSize()`).

**Example:**

```typescript
// Add two instance fields:
private lastObservedWidth = 0;
private lastObservedHeight = 0;

// In constructor, update ResizeObserver callback:
this.resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
            // Guard: only notify Phaser if size actually changed by >= 1px
            if (
                Math.abs(width - this.lastObservedWidth) >= 1 ||
                Math.abs(height - this.lastObservedHeight) >= 1
            ) {
                this.lastObservedWidth = width;
                this.lastObservedHeight = height;
                scale.setParentSize(width, height);
            }
        }
    }
});
```

Source: Direct analysis of `src/ui/EditorFrame.ts` lines 103-111 and CONCERNS.md "ResizeObserver Infinite Loop Risk."

### Pattern 3: Destroy Method Hardening

**What:** Restore the autoCenter-driven margin values AFTER `setParentSize()` completes, not before. This ensures the ScaleManager doesn't overwrite the restored margin values.

**When to use:** Any time ScaleManager state is being patched and restored.

**Context:** The current `destroy()` method (lines 124-158) restores margin at lines 144-145, THEN calls `setParentSize()` at line 158. The `setParentSize()` call triggers Phaser's resize pipeline which recalculates margins if `autoCenter` is active. Because `scale.autoCenter` is restored first (line 142), `setParentSize()` will run with autoCenter active and may overwrite the restored margin values.

**Correct order:**

```typescript
destroy(): void {
    this.resizeObserver.disconnect();

    const canvas = this.game.canvas;
    const scale = this.game.scale as any;

    // 1. Remove frame from DOM
    this.frameEl.remove();

    // 2. Move canvas back to original position
    if (this.originalNextSibling && this.originalNextSibling.parentNode === this.originalParent) {
        this.originalParent.insertBefore(canvas, this.originalNextSibling);
    } else {
        this.originalParent.appendChild(canvas);
    }

    // 3. Restore ScaleManager parent references (but NOT margins yet)
    scale.parent = this.savedParent;
    scale.parentIsWindow = this.savedParentIsWindow;
    scale.autoCenter = this.savedAutoCenter;

    // 4. Tell ScaleManager the correct parent dimensions — this triggers
    //    the resize pipeline including margin calculation if autoCenter != NO_CENTER
    const parentW = this.savedParentIsWindow
        ? window.innerWidth
        : this.savedParent.getBoundingClientRect().width;
    const parentH = this.savedParentIsWindow
        ? window.innerHeight
        : this.savedParent.getBoundingClientRect().height;
    scale.setParentSize(parentW, parentH);

    // 5. Apply saved margins LAST — overrides whatever autoCenter computed,
    //    restoring the exact pre-editor state
    canvas.style.marginLeft = this.savedMarginLeft;
    canvas.style.marginTop = this.savedMarginTop;
}
```

Source: Requirements ROBUST-04 ("autoCenter margin restoration must happen AFTER setParentSize() completes") and direct analysis of `src/ui/EditorFrame.ts` lines 140-158.

Note: Per user decision, no `document.contains()` check is needed in `destroy()`. The "assume DOM container always exists" decision overrides ROBUST-03 for this phase.

### Pattern 4: Panel Content Overflow Handling

**What:** Panel content that exceeds 220px (hierarchy) or 260px (inspector) must truncate, not cause horizontal scroll or overflow that forces the grid column wider.

**Why needed:** Even with fixed grid columns, if the panel div's content can force its container to expand (e.g., via `min-width: max-content` or missing `overflow: hidden`), the column could still grow.

**Example:**

The hierarchy panel already sets `width: 220px` and `overflow-y: auto` on its wrapper. The inspector panel sets `width: 260px`. The hierarchy CSS injects `.pe-name { overflow: hidden; text-overflow: ellipsis }`. This is already correct.

The grid column slots (`pe-slot-hierarchy`, `pe-slot-inspector`) use `overflow-y: auto`. They do not currently set `overflow-x: hidden`. However, because the wrapper divs inside declare explicit widths matching the column widths, horizontal overflow should not occur. Verify this during implementation — if a slot can grow wider than its column, add `overflow-x: hidden` to the slot's CSS.

### Anti-Patterns to Avoid

- **`auto` columns with dynamic content:** `auto` in grid-template-columns means "size to content." Any panel that changes content size will change its column width, causing the adjacent cells to shift. Never use `auto` for sidebar columns.
- **Restoring margins before setParentSize:** The ScaleManager's resize pipeline overwrites margin values. Restoring them first and then calling `setParentSize()` wastes the restoration. Always restore margins last.
- **Calling setParentSize() inside ResizeObserver without a guard:** `setParentSize()` can trigger layout recalculation which fires the ResizeObserver again. Without a change guard, this creates an infinite loop in environments with sub-pixel rounding (e.g., DPR 1.25).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Panel width management | Dynamic width calculation, resize logic | Fixed px CSS grid columns | Browser's grid engine handles all geometry; no JS needed |
| Canvas size tracking | Manual polling / setInterval | ResizeObserver (already in use) | Designed exactly for this; handles DPR correctly |
| Preventing ResizeObserver loops | Debounce timers | Simple prev-size comparison | Timers introduce delays and may miss genuine resizes; comparison is immediate and correct |

**Key insight:** This phase requires zero new abstractions. All three changes are modifications to existing code — a CSS string change, a 4-line guard addition, and a method reorder.

---

## Common Pitfalls

### Pitfall 1: Matching column widths to inner wrapper widths

**What goes wrong:** The grid column is set to 220px but the inner hierarchy wrapper div also has `width: 220px`. If the column is set to a different value (e.g., 240px), the wrapper content still declares 220px and the remaining 20px becomes dead space. Conversely, if the wrapper is wider than the column, overflow occurs.

**Why it happens:** The grid column controls the cell's available space; the inner element's declared width is independent.

**How to avoid:** Keep the three values in sync — the column width in `EditorFrame.ts` grid string, the wrapper width in `HierarchyPanel.createWrapper()` (currently `width: 220px`), and the inspector wrapper width in `InspectorPanel.bind()` (currently `width: 260px`). Since the user has locked the values (220px hierarchy, 260px inspector), set the column to exactly those values.

**Warning signs:** Visible gap between panel content and the border between panel and canvas.

### Pitfall 2: ResizeObserver fires once immediately on observe()

**What goes wrong:** `this.resizeObserver.observe(this.canvasCell)` fires the callback synchronously (or on the next microtask) with the current dimensions. If the change guard initializes `lastObservedWidth/Height` to 0, the first observation always passes the guard and calls `setParentSize()` — which is correct behavior and matches the existing "Force an immediate refresh" logic at lines 114-117.

**Why it happens:** ResizeObserver fires once per observed element when first attached.

**How to avoid:** Initialize `lastObservedWidth = 0; lastObservedHeight = 0` so the first observation always passes the guard. Remove the manual `getBoundingClientRect()` + `setParentSize()` block at lines 114-117 if the guard is initialized to 0 — the observer's first callback serves the same purpose. Alternatively, keep the manual refresh as a belt-and-suspenders approach.

**Warning signs:** Canvas not sizing correctly on editor open.

### Pitfall 3: autoCenter margin restoration order

**What goes wrong:** If margins are restored before `setParentSize()`, the ScaleManager's resize pipeline will recalculate and overwrite the margins with its own centering values. The saved margins are silently discarded.

**Why it happens:** `setParentSize()` calls `scale.refresh()` internally, which applies autoCenter margin calculations if `autoCenter !== NO_CENTER`.

**How to avoid:** Always call `setParentSize()` before restoring saved margins in `destroy()`. See Pattern 3 above.

**Warning signs:** After deactivating the editor, the game canvas is off-center or positioned incorrectly even though the editor "restored" the state.

### Pitfall 4: The `auto` keyword in CSS grid

**What goes wrong:** A common misconception is that `auto` means "fill remaining space" in grid columns. It does not — `1fr` means fill remaining space. `auto` means "size to the element's content." Using `auto` for panels ensures content-driven width.

**Why it happens:** CSS `width: auto` behaves differently from `grid-template-columns: auto`. In a block context, `width: auto` fills the container. In a grid context, `auto` is `min-content` to `max-content`.

**How to avoid:** Use explicit `220px` and `260px` for fixed panels. Reserve `1fr` for the canvas cell.

**Warning signs:** After the fix, selecting still causes shift — means `auto` is still present somewhere (check for `!important` overrides or inline styles on the grid element).

---

## Code Examples

### Complete updated EditorFrame constructor grid line

```typescript
// Source: src/ui/EditorFrame.ts line 50 (current)
// grid-template-columns: auto 1fr auto;

// Replacement:
grid-template-columns: 220px 1fr 260px;
```

### Complete ResizeObserver with change guard

```typescript
// Source: modified from src/ui/EditorFrame.ts lines 103-111

// In the class body, add:
private lastObservedWidth = 0;
private lastObservedHeight = 0;

// In the constructor, replace the ResizeObserver block:
this.resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
            if (
                Math.abs(width - this.lastObservedWidth) >= 1 ||
                Math.abs(height - this.lastObservedHeight) >= 1
            ) {
                this.lastObservedWidth = width;
                this.lastObservedHeight = height;
                scale.setParentSize(width, height);
            }
        }
    }
});
this.resizeObserver.observe(this.canvasCell);

// The manual refresh block below can be removed since the first
// ResizeObserver callback handles it (lastObservedWidth/Height start at 0,
// so the first fire always passes the guard).
// Keeping it is also safe (belt-and-suspenders).
```

### Correct destroy() method structure

```typescript
// Source: modified from src/ui/EditorFrame.ts lines 124-158

destroy(): void {
    this.resizeObserver.disconnect();

    const canvas = this.game.canvas;
    const scale = this.game.scale as any;

    // Step 1: Remove the editor frame from DOM
    this.frameEl.remove();

    // Step 2: Return canvas to its original DOM position
    if (this.originalNextSibling && this.originalNextSibling.parentNode === this.originalParent) {
        this.originalParent.insertBefore(canvas, this.originalNextSibling);
    } else {
        this.originalParent.appendChild(canvas);
    }

    // Step 3: Restore ScaleManager parent and centering mode
    scale.parent = this.savedParent;
    scale.parentIsWindow = this.savedParentIsWindow;
    scale.autoCenter = this.savedAutoCenter;

    // Step 4: Trigger Phaser resize with the original parent's dimensions.
    // This runs the ScaleManager pipeline (including autoCenter margin computation).
    const parentW = this.savedParentIsWindow
        ? window.innerWidth
        : this.savedParent.getBoundingClientRect().width;
    const parentH = this.savedParentIsWindow
        ? window.innerHeight
        : this.savedParent.getBoundingClientRect().height;
    scale.setParentSize(parentW, parentH);

    // Step 5: Override margins AFTER the pipeline runs.
    // Restores the exact pre-editor margin state regardless of what autoCenter computed.
    canvas.style.marginLeft = this.savedMarginLeft;
    canvas.style.marginTop = this.savedMarginTop;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `auto 1fr auto` CSS grid | `220px 1fr 260px` | This phase | Eliminates root cause of selection-triggered shift |
| No ResizeObserver guard | 1px change guard | This phase | Prevents oscillation in sub-pixel DPR environments |
| Margins restored before setParentSize | Margins restored after setParentSize | This phase | Ensures zero-footprint deactivation |

**Deprecated/outdated:**
- `grid-template-columns: auto 1fr auto`: Replaced with fixed pixel values. The `auto` keyword must not return.

---

## Open Questions

1. **Should the manual getBoundingClientRect refresh block be removed or kept after adding the change guard?**
   - What we know: The ResizeObserver fires once on attach with current dimensions, and the guard initialized to 0 ensures this first call always passes through. The manual block at lines 114-117 does the same thing.
   - What's unclear: Whether removing the manual block could create a race condition in some browsers where the observer fires asynchronously and the canvas sits at wrong size briefly.
   - Recommendation: Keep the manual refresh as belt-and-suspenders. The redundant `setParentSize()` call is harmless — it will fire once on editor open, the observer fires once, and the guard catches any subsequent spurious fires.

2. **Does fixing the CSS grid alone make the ResizeObserver guard unnecessary?**
   - What we know: Fixed columns mean inspector content changes no longer resize the canvas cell. The only remaining trigger for ResizeObserver would be browser window resize (declared rare and acceptable per user decisions).
   - What's unclear: Whether Phaser's `setParentSize()` internally triggers a layout recalculation that changes `contentRect` by a sub-pixel amount, which would cause one oscillation cycle.
   - Recommendation: Include the guard regardless. It is 4 lines, has zero downside, and closes the feedback loop permanently. Per "Claude's Discretion," implementing the guard is the correct choice.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase analysis — `src/ui/EditorFrame.ts` (all 168 lines): Root cause identified, all three fix locations confirmed with line numbers.
- Direct codebase analysis — `src/ui/InspectorPanel.ts`: Confirmed inspector wrapper declares `width: 260px` inline, matching the column width to use.
- Direct codebase analysis — `src/ui/HierarchyPanel.ts`: Confirmed hierarchy wrapper declares `width: 220px`, matching the column width to use.
- `.planning/REQUIREMENTS.md`: VIEW-01 through VIEW-04, ROBUST-03, ROBUST-04 requirements confirmed and understood.
- `.planning/codebase/CONCERNS.md`: "ResizeObserver Infinite Loop Risk" section confirms the loop mechanism and suggests the change guard approach.

### Secondary (MEDIUM confidence)

- MDN CSS Grid: `auto` in `grid-template-columns` sizes to content (`min-content` → `max-content`), not to available space. This is standard browser behavior, not version-specific.

### Tertiary (LOW confidence)

- None. All claims in this research are verifiable directly from the codebase.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all changes are vanilla CSS and JS within existing code
- Architecture: HIGH — changes are precisely located (line numbers cited), patterns verified against actual code
- Pitfalls: HIGH — pitfalls derived from direct code reading and the existing CONCERNS.md audit

**Research date:** 2026-02-18
**Valid until:** Indefinitely — this is a CSS string change and a guard addition; neither depends on external library versions or browser compatibility changes.
