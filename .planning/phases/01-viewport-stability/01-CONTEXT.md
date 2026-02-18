# Phase 1: Viewport Stability - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the visual shift that occurs when selecting objects in the editor. Replace CSS `auto`-width grid columns with fixed pixel widths, add a ResizeObserver change guard, and harden the editor's destroy/restore lifecycle. Scoped to `EditorFrame.ts`.

</domain>

<decisions>
## Implementation Decisions

### Panel dimensions
- Fixed widths: 220px left (hierarchy), 260px right (inspector) — confirmed
- Panels are NOT resizable — no drag handles, no user-adjustable widths
- Always show both panels regardless of screen size — no responsive breakpoints or auto-collapse
- Content that exceeds panel width should truncate with ellipsis (no horizontal scrollbar)

### Resize behavior
- Browser resize is a rare/unexpected scenario — optimize for simplicity, not robustness
- Game canvas maintains its current position on resize (no re-fit/re-center)
- If a resize causes visual glitches, user can toggle editor off/on to fix — acceptable recovery path
- No special overlay sync logic needed — simplest implementation wins

### Editor toggle lifecycle
- Editor deactivation must be zero-footprint: fully revert to original game state with no residual changes
- Selection is cleared on deactivation — reactivating starts fresh with nothing selected
- Panel removal is instant (no CSS transitions or animations)
- Assume DOM container always exists when deactivate is called — no defensive existence checks needed

### Claude's Discretion
- ResizeObserver guard scope: whether to suppress resize events during selection changes or rely solely on the CSS fix
- Exact autoCenter margin restoration approach (as long as the game returns to its original state)
- ResizeObserver debounce/throttle timing if needed

</decisions>

<specifics>
## Specific Ideas

- "When stopping editor it should always revert to original state and never change anything" — zero-footprint principle is the guiding design constraint
- Simplicity over resilience: this is a development tool, not a production UI

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-viewport-stability*
*Context gathered: 2026-02-18*
