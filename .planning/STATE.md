# Project State

**Project:** Phaser Runtime Editor — Viewport & Quality Refactor
**Milestone:** v0.2.0
**Started:** 2026-02-18

## Current Phase

**Phase 2: Coordinate Refactor** — In Progress (Plan 1/2 complete)

## Phase Status

| Phase | Status | Started | Completed |
|-------|--------|---------|-----------|
| 1. Viewport Stability | Complete | 2026-02-18 | 2026-02-18 |
| 2. Coordinate Refactor | In Progress | 2026-02-18 | — |
| 3. Object Identification | Pending | — | — |
| 4. Debugging & UX | Pending | — | — |
| 5. Robustness | Pending | — | — |

## Quick Tasks Completed

| # | Task | Date | Commit |
|---|------|------|--------|
| 1 | Fix hierarchy panel scrollbar erratic bounce-back | 2026-02-18 | 9f2b7e9 |

## Key Decisions

| Decision | Date | Context |
|----------|------|---------|
| Fixed-width CSS grid columns | 2026-02-18 | Prevents reflow when inspector content changes |
| ViewportState snapshot pattern | 2026-02-18 | Decouples coordinate math from live camera reads |
| Symbol-keyed unique IDs | 2026-02-18 | WeakMap-based; survives name collisions |
| Quick depth (5 phases) | 2026-02-18 | Ship fast; focused on bug fix + quality |
| ResizeObserver 1px change guard | 2026-02-18 | Initializes at 0 so first fire always passes; suppresses sub-pixel jitter |
| Margin restore after setParentSize | 2026-02-18 | autoCenter recalculates margins during pipeline; restoring before was silently overwritten |
| No document.contains() checks in destroy() | 2026-02-18 | Assume DOM container always exists when deactivate is called (user decision) |
| scrollIntoView separated from highlight | 2026-02-18 | Update highlight every frame is fine; scroll only on selection change event |
| Single DOM scroll container via wrapper height: 100% | 2026-02-18 | Wrapper fills slot exactly so slot's overflow never triggers; prevents nested scroll conflict |
| cameraCenterX/Y included in ViewportState | 2026-02-18 | Full Phaser camera projection formula requires screen-space center point |
| editorScene for canvas dims in captureViewport() | 2026-02-18 | Host scene camera may be scrolled/zoomed; editor overlay always has canvas pixel dims |
| Hit-area helpers use world matrix only (no ViewportState) | 2026-02-18 | Phaser shared GL context makes matrix.tx/ty screen-correct for rendering |

## Blockers

None.

---
*Last updated: 2026-02-18 after completing Phase 2 Plan 01 (ViewportState interface + CoordinateSystem refactor)*
