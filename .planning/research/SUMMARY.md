# Research Summary

**Project:** @gamotions/phaser-runtime-editor — Viewport & Quality Refactor
**Synthesized:** 2026-02-18
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Key Findings

### 1. The Viewport Shift Bug Is a CSS Grid Issue (HIGH confidence)

**Root cause:** `grid-template-columns: auto 1fr auto` in EditorFrame. When InspectorPanel populates on selection, the `auto` column grows from 0px to ~260px, shrinking the canvas cell. ResizeObserver fires → `setParentSize()` → Scale.FIT recalculates → objects shift.

**Fix:** Replace `auto` with fixed pixel widths: `220px 1fr 260px`. One-line CSS change eliminates the entire feedback loop. Add a 1px guard on the ResizeObserver to prevent sub-pixel oscillation loops.

### 2. CoordinateSystem Assumptions Break Under DPR (MEDIUM confidence)

`getScaleFactor()` reads `scene.cameras.main.width` which equals game pixel dimensions (e.g., 1440 at DPR=2), not CSS display size. For design-resolution games (DPR=1), the scale factor is always 1.0 — works by coincidence. For DPR configs (`zoom: 1/dpr`), coordinate math is wrong by the DPR factor.

**Fix:** Introduce a `ViewportState` snapshot captured once per frame. All coordinate methods accept this snapshot instead of reading live camera values. This also eliminates mid-drag jitter when resize events fire.

### 3. Hit Area Transforms Are Duplicated in 3 Files (HIGH confidence)

The same world-matrix + displayOrigin transform logic exists in:
- `EditorScene.drawHitArea()` (rendering)
- `SelectionManager.getPolygonShapeBounds()` (hit testing)
- `HitAreaGizmo.getTransformHelpers()` (editing)

**Fix:** Extract to `CoordinateSystem.getHitAreaToScreen()` and `getHitAreaScreenDeltaToLocal()`.

### 4. Name-Based Object Identity Causes Silent Data Loss (HIGH confidence)

`getChanges()` keys the diff by display name. Two unnamed TileSprites both key as `"TileSprite"` — second overwrites first. Also causes hierarchy confusion.

**Fix:** Symbol-keyed unique IDs assigned at editor activation via WeakMap. Use IDs as diff keys; show in inspector Info folder.

### 5. Module-Level Singletons Block Multi-Game Scenarios (HIGH confidence)

`activePluginInstance` and `editorSceneRegistered` at module scope mean a second Phaser.Game instance overwrites the first's editor toggle.

**Fix:** `WeakMap<Phaser.Game, PluginRegistry>` for per-game isolation.

---

## Feature Prioritization

### Must Build (Table Stakes)

| Feature | Complexity | Why |
|---------|-----------|-----|
| Fixed-width CSS grid columns | Trivial | Fixes the reported viewport shift bug |
| ResizeObserver guard (1px threshold) | Trivial | Prevents feedback loops |
| ViewportState snapshot pattern | Medium | Foundation for stable coordinate math |
| Unique object IDs (Symbol + WeakMap) | Low | Fixes duplicate name confusion + diff key collisions |
| Centralized hit-area transforms | Low | Eliminates 3-file duplication |
| Origin crosshair at actual origin | Low | Current crosshair is at AABB center, not transform origin |
| UID display in inspector Info folder | Trivial | Complements unique IDs |

### Should Build (High-Value)

| Feature | Complexity | Why |
|---------|-----------|-----|
| Type badges in hierarchy (`[Img]`, `[Spr]`) | Low | Distinguishes same-name objects at a glance |
| Dimension readout in inspector | Low | Devs need computed width/height |
| Per-game plugin registry | Low | Robustness for multi-game environments |
| ScaleManager patch isolation | Low | Single place to update if Phaser internals change |
| `F` key to focus in hierarchy | Trivial | Standard editor shortcut |

### Defer

- Coordinate space toggle (status bar already shows both)
- Color-coded hierarchy rows (visual polish)
- Overlay opacity slider (no reported need)
- All anti-features: undo/redo, multi-select, scene serialization, custom overlay API

---

## Architecture Recommendation

### Refactoring Order (dependency-constrained)

1. **EditorFrame CSS fix** — no dependencies, fixes the reported bug immediately
2. **ViewportState type** — new file, additive only
3. **CoordinateSystem refactor** — accept ViewportState instead of Scene; all call sites updated
4. **Gizmo drag-start snapshot** — uses ViewportState from step 2-3
5. **Hit-area transform centralization** — extract from 3 files into CoordinateSystem
6. **Unique object IDs** — WeakMap registry, update getChanges() + hierarchy
7. **Per-game plugin registry** — self-contained in PhaserEditorPlugin
8. **Debugging/UX improvements** — origin crosshair, type badges, dimension readout

Steps 1-5 are the coordinate system refactor. Steps 6-7 are structural improvements. Step 8 is feature polish.

---

## Critical Pitfalls

| Risk | Severity | Prevention |
|------|----------|------------|
| CSS `auto` column reflow | CRITICAL | Fixed-width columns — must be first fix |
| ResizeObserver infinite loop | HIGH | 1px change guard before `setParentSize()` |
| Camera dimensions ≠ CSS display size | HIGH | Use `game.scale.displaySize`, not `cameras.main` |
| DPR zoom applied twice | HIGH | All pointer coords stay in CSS pixels; test at DPR=2 |
| Name collisions in diff export | MEDIUM | WeakMap UUID registry before touching `getChanges()` |
| EditorFrame destroy leaves canvas detached | MEDIUM | `document.contains()` check + body fallback |
| autoCenter margin restoration order | MEDIUM | Restore autoCenter AFTER `setParentSize()` |
| Matrix inversion per-frame during drag | LOW | Cache inverted matrix at drag start |

---

## Consensus Across Research

All four research dimensions agree on:
- **Fixed columns first** — every dimension identifies CSS `auto` as the root cause
- **ViewportState snapshot** — architecture and stack both recommend decoupling from live camera reads
- **Centralized transforms** — architecture and pitfalls both flag the 3-file duplication
- **Symbol-keyed IDs** — features and pitfalls both identify name collisions as data loss risk
- **Test at DPR=2** — stack and pitfalls both warn that DPR bugs are invisible on 1x displays

---

*Synthesized: 2026-02-18*
