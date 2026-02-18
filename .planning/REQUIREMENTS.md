# Requirements: Phaser Runtime Editor — Viewport & Quality Refactor

**Defined:** 2026-02-18
**Core Value:** Editor overlays must accurately reflect game object positions — no drift, no shift, no ambiguity.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Viewport Stability

- [x] **VIEW-01**: Selecting an object must not cause any visual shift of game objects or editor overlays
- [x] **VIEW-02**: ResizeObserver must not trigger feedback loops (guard against sub-pixel oscillation)
- [x] **VIEW-03**: CSS grid columns must use fixed pixel widths for hierarchy and inspector panels
- [x] **VIEW-04**: Canvas cell must maintain stable dimensions regardless of panel content changes

### Coordinate System

- [ ] **COORD-01**: Coordinate transforms must use a per-frame snapshot (ViewportState), not live camera reads
- [ ] **COORD-02**: All CoordinateSystem methods must accept ViewportState instead of Phaser.Scene
- [ ] **COORD-03**: Gizmo drags must use a viewport snapshot captured at drag start (no mid-drag jitter)
- [ ] **COORD-04**: Hit area transform logic must be centralized in CoordinateSystem (remove 3-file duplication)
- [ ] **COORD-05**: Matrix inversion for Container children must be cached at drag start, not per-frame

### Object Identification

- [ ] **OBJ-01**: Each game object must receive a unique editor ID (Symbol-keyed) at editor activation
- [ ] **OBJ-02**: getChanges() diff must use unique IDs as keys, not display names
- [ ] **OBJ-03**: Hierarchy panel must disambiguate objects with duplicate names (show ID suffix)
- [ ] **OBJ-04**: Inspector Info folder must display the object's unique editor ID

### Debugging & UX

- [ ] **DEBUG-01**: Origin crosshair must render at the object's actual transform origin, not AABB center
- [ ] **DEBUG-02**: Object type badges must appear in hierarchy rows (e.g., [Img], [Spr], [Txt], [Ctr])
- [ ] **DEBUG-03**: Hierarchy must show all containers including invisible ones
- [ ] **DEBUG-04**: Inspector must show computed display width/height from getBounds()

### Robustness

- [ ] **ROBUST-01**: Per-game plugin registry (WeakMap) must replace module-level singletons
- [ ] **ROBUST-02**: ScaleManager patch/revert must be isolated in named methods
- [ ] **ROBUST-03**: EditorFrame destroy must verify original parent is still in DOM before restoration
- [ ] **ROBUST-04**: autoCenter margin restoration must happen AFTER setParentSize() completes

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Future Features

- **FUTURE-01**: Undo/redo system with command pattern
- **FUTURE-02**: Multi-object selection with group gizmos
- **FUTURE-03**: Coordinate space toggle in toolbar (Design/Screen)
- **FUTURE-04**: Color-coded hierarchy rows by object type
- **FUTURE-05**: Overlay opacity slider in toolbar
- **FUTURE-06**: Keyboard `F` to focus selected object in hierarchy

## Out of Scope

| Feature | Reason |
|---------|--------|
| Scene serialization/import | Complex domain; Copy Changes is sufficient for v1 |
| Custom debug overlay API | Premature while rendering loop is being stabilized |
| Pixel ruler/measurement tool | Status bar coordinate readout serves the same purpose |
| In-editor object creation/deletion | Fragile without knowing constructor args and asset loading state |
| Tweakpane plugin extensions | Adds bundle size before core inspector is stable |
| Phaser 3 backward compat testing | Focus on Phaser 4; Phaser 3 compat is best-effort |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| VIEW-01 | Phase 1 | Complete |
| VIEW-02 | Phase 1 | Complete |
| VIEW-03 | Phase 1 | Complete |
| VIEW-04 | Phase 1 | Complete |
| COORD-01 | Phase 2 | Pending |
| COORD-02 | Phase 2 | Pending |
| COORD-03 | Phase 2 | Pending |
| COORD-04 | Phase 2 | Pending |
| COORD-05 | Phase 2 | Pending |
| OBJ-01 | Phase 3 | Pending |
| OBJ-02 | Phase 3 | Pending |
| OBJ-03 | Phase 3 | Pending |
| OBJ-04 | Phase 3 | Pending |
| DEBUG-01 | Phase 4 | Pending |
| DEBUG-02 | Phase 4 | Pending |
| DEBUG-03 | Phase 4 | Pending |
| DEBUG-04 | Phase 4 | Pending |
| ROBUST-01 | Phase 5 | Pending |
| ROBUST-02 | Phase 5 | Pending |
| ROBUST-03 | Phase 5 | Pending |
| ROBUST-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-02-18*
*Last updated: 2026-02-18 after initial definition*
