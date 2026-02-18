# Phase 2: Coordinate System Refactor - Context

**Gathered:** 2026-02-18
**Status:** Ready for planning

<domain>
## Phase Boundary

All coordinate math uses a stable per-frame snapshot (ViewportState). Hit area transforms consolidated to a single source. The core problem: bounding boxes and click-hit detection are offset from actual objects in non-default game setups — this phase must fix that.

</domain>

<decisions>
## Implementation Decisions

### Bounding box offset (primary concern)
- Bounding boxes are consistently offset left and drifting down from actual objects in user's game (pet_merge_phaser)
- Click/selection follows the offset box position, not the actual visible object — so the coordinate transform error affects both rendering AND hit detection
- The demo scene works correctly — offset only appears with non-default game configurations
- Root cause is likely in how coordinate transforms handle camera position, scroll, zoom, or ScaleManager canvas offset
- Researcher must investigate the user's game config (camera setup, scale mode) to identify the transform gap

### Drag-during-resize behavior
- Current behavior is acceptable — if a resize happens during drag, abort the drag
- No special handling needed for viewport changes mid-drag

### Snapshot scope
- Everything is frozen while the editor is showing (game is paused)
- ViewportState snapshot is about capturing stable camera/viewport state, not dealing with a moving game world
- All gizmos and overlays use the same per-frame snapshot — no distinction between frozen vs. live needed

### Claude's Discretion
- ViewportState interface design (which fields to include)
- How to consolidate the 3 duplicate hit-area transform implementations
- Caching strategy for inverted parent matrix
- Whether to re-capture snapshot on specific events (like manual zoom in editor)

</decisions>

<specifics>
## Specific Ideas

- The offset manifests as "always left, drifting down" — suggests a missing camera scroll or canvas offset in the world-to-screen transform
- Must work correctly with games that use non-default camera setups (scroll, zoom, bounds) and Phaser ScaleManager modes
- The demo scene is the baseline for "correct" — whatever it does right, the fix must preserve

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-coordinate-system-refactor*
*Context gathered: 2026-02-18*
