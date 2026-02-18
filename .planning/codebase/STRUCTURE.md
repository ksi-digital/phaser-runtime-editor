# Codebase Structure

**Analysis Date:** 2026-02-18

## Directory Layout

```
phaser-runtime-editor/
├── package.json              ✅ npm package config (exports, dependencies, build scripts)
├── tsconfig.json             ✅ TypeScript config (ES2020, strict, bundler resolution)
├── vite.config.ts            ✅ Library build config (ES + CJS, externalizes phaser)
├── vite.demo.config.ts       ✅ Demo server config (port 5199, hot reload)
│
├── src/                      ← Main library source
│   ├── index.ts              ✅ Public API exports (13 classes/enums + 4 type exports)
│   │
│   ├── PhaserEditorPlugin.ts ✅ Scene plugin — toggle/activate/deactivate, property snapshots
│   ├── EditorScene.ts        ✅ Overlay scene — systems orchestration, rendering, input handling
│   │
│   ├── core/                 ← Stateless utilities and state management
│   │   ├── EditorState.ts    ✅ Event-driven state (selection, tool, snapping)
│   │   ├── CoordinateSystem.ts ✅ Design↔screen conversion, Container-aware positioning
│   │   ├── SelectionManager.ts ✅ Hit-test, object collection, bounds, bounding box drawing
│   │   └── SnappingEngine.ts ✅ Grid/object snapping (stateless), guide rendering
│   │
│   ├── gizmos/               ← Interactive manipulation handles
│   │   ├── GizmoManager.ts   ✅ Coordinates active gizmo, delegates pointer events
│   │   ├── MoveGizmo.ts      ✅ Position manipulation (center + axis-constrained)
│   │   ├── RotateGizmo.ts    ✅ Rotation via dashed circle, 15° snap increment
│   │   ├── ScaleGizmo.ts     ✅ Scale via 8 handles (corner proportional, edge axis-constrained)
│   │   └── HitAreaGizmo.ts   ✅ Hit area visual editing (Rectangle/Circle/Polygon)
│   │
│   └── ui/                   ← HTML-based panels and layout
│       ├── EditorUI.ts       ✅ Panel lifecycle management, event wiring
│       ├── InspectorPanel.ts ✅ Tweakpane 4.x property editor (Transform, Origin, Display, Info, HitArea)
│       ├── HierarchyPanel.ts ✅ HTML tree view (expand/collapse, visibility, selection sync)
│       ├── ToolbarPanel.ts   ✅ Tool buttons + snapping controls
│       └── EditorFrame.ts    ✅ CSS grid layout, canvas wrapper, ResizeObserver
│
├── demo/                     ← Demo game for testing
│   ├── index.html            ✅ HTML entry point
│   ├── main.ts               ✅ Phaser config, plugin registration, scene creation
│   ├── DemoScene.ts          ✅ Playable platformer (arrow keys, space to jump, F2 for editor)
│   └── MenuScene.ts          ✅ Start menu with settings
│
└── dist/                     ← Built output (generated)
    ├── index.js              (~216 kB ES module, includes bundled Tweakpane)
    ├── index.cjs             (~171 kB CommonJS)
    ├── index.d.ts            (rolled-up TypeScript declarations)
    └── *.map                 (source maps)
```

## Directory Purposes

**src/**
- Purpose: Main library source code
- Contains: Plugin, overlay scene, core systems, gizmos, UI panels
- Key files: `PhaserEditorPlugin.ts` (entry), `EditorScene.ts` (orchestration), `core/*` (math/state), `gizmos/*` (interactive), `ui/*` (panels)

**src/core/**
- Purpose: Stateless utilities and central state management
- Contains: State machine, coordinate math, selection utilities, snapping calculations
- Key files:
  - `EditorState.ts` — Single source of truth for selection, tool, snapping config
  - `CoordinateSystem.ts` — Design↔screen coordinate conversions, Container support
  - `SelectionManager.ts` — Hit-testing all scene objects, drawing selection box
  - `SnappingEngine.ts` — Grid and object snap calculations, guide rendering

**src/gizmos/**
- Purpose: Interactive handles for property manipulation
- Contains: Gizmo managers and implementations (move, rotate, scale, hit area)
- Key files:
  - `GizmoManager.ts` — Chooses active gizmo based on EditorTool, routes input
  - `MoveGizmo.ts` — Free position (center handle) + axis-constrained (X/Y arrows)
  - `RotateGizmo.ts` — Circular handle, atan2 delta for rotation, 15° snaps
  - `ScaleGizmo.ts` — 8 handles (4 corners, 4 edges) with proportional/axis modes
  - `HitAreaGizmo.ts` — Visual vertex editing for Rectangle/Circle/Polygon hit areas

**src/ui/**
- Purpose: HTML-based user interface panels and layout management
- Contains: Panel implementations (inspector, hierarchy, toolbar) and frame layout
- Key files:
  - `EditorUI.ts` — Manages panel lifecycle, listens to EditorState events
  - `InspectorPanel.ts` — Tweakpane property editor with bidirectional sync
  - `HierarchyPanel.ts` — Plain HTML tree (no Tweakpane) with expand/visibility/selection
  - `ToolbarPanel.ts` — Tool button group, snapping toggles
  - `EditorFrame.ts` — CSS grid layout: toolbar/hierarchy/canvas/inspector/status

**demo/**
- Purpose: Test harness with playable game
- Contains: Phaser config, demo scene with physics, menu
- Key files:
  - `main.ts` — Phaser config with plugin registration, scene list
  - `DemoScene.ts` — Playable platformer (720x1280 design-space)
  - `MenuScene.ts` — Start menu with settings

**dist/** (Generated)
- Purpose: Built library output
- Contains: ES module, CommonJS, TypeScript declarations, source maps
- Note: Not committed; built via `npm run build`

## Key File Locations

**Entry Points:**

| File | Purpose |
|------|---------|
| `src/index.ts` | Public API exports (classes, enums, types) |
| `src/PhaserEditorPlugin.ts` | Scene plugin entry; register with Phaser |
| `demo/main.ts` | Demo game entry; Phaser config + plugin setup |

**Configuration:**

| File | Purpose |
|------|---------|
| `package.json` | npm metadata, dependencies (tweakpane, phaser), build scripts |
| `tsconfig.json` | TypeScript target (ES2020), strict mode, source maps |
| `vite.config.ts` | Library build (ES + CJS), external phaser, dts rollup |
| `vite.demo.config.ts` | Dev server (port 5199), demo build |

**Core Logic:**

| File | Purpose |
|------|---------|
| `src/core/EditorState.ts` | Central state machine (selected, tool, snapping) |
| `src/core/CoordinateSystem.ts` | Design↔screen math, world position calculations |
| `src/core/SelectionManager.ts` | Hit-testing, object collection, bounds |
| `src/core/SnappingEngine.ts` | Grid/object snap calculations, guide rendering |

**Gizmos:**

| File | Purpose |
|------|---------|
| `src/gizmos/GizmoManager.ts` | Coordinates active gizmo, pointer delegation |
| `src/gizmos/MoveGizmo.ts` | Position handles (center, X-axis, Y-axis) |
| `src/gizmos/RotateGizmo.ts` | Rotation circle handle, angle snapping |
| `src/gizmos/ScaleGizmo.ts` | Scale handles (8 corners/edges) |
| `src/gizmos/HitAreaGizmo.ts` | Hit area vertex editing |

**UI Panels:**

| File | Purpose |
|------|---------|
| `src/ui/EditorUI.ts` | Panel lifecycle, event coordination |
| `src/ui/InspectorPanel.ts` | Tweakpane property editor |
| `src/ui/HierarchyPanel.ts` | HTML tree view |
| `src/ui/ToolbarPanel.ts` | Tool buttons + snapping controls |
| `src/ui/EditorFrame.ts` | CSS grid layout + canvas repositioning |

## Naming Conventions

**Files:**
- `PascalCase.ts` for classes (`EditorScene.ts`, `MoveGizmo.ts`, `InspectorPanel.ts`)
- `PascalCase.ts` for types/enums (`EditorState.ts` exports EditorState class + EditorTool enum)
- `camelCase.ts` for demo files (`main.ts`, `MenuScene.ts`)

**Directories:**
- `core/` — Stateless utilities and state management
- `gizmos/` — Interactive handles
- `ui/` — HTML panels and layout
- `demo/` — Test harness

**Classes:**
- `*Plugin` for Phaser plugins (`PhaserEditorPlugin`)
- `*Scene` for Phaser scenes (`EditorScene`, `DemoScene`)
- `*Manager` for coordinators (`GizmoManager`, `SelectionManager`)
- `*Panel` for UI panels (`InspectorPanel`, `HierarchyPanel`, `ToolbarPanel`)
- `*Gizmo` for interactive handles (`MoveGizmo`, `RotateGizmo`, `ScaleGizmo`, `HitAreaGizmo`)
- `*Engine` for utilities (`SnappingEngine`, `CoordinateSystem`)

**Enums:**
- `EditorTool` (Select, Move, Rotate, Scale)
- `DragHandle` (None, Center, AxisX, AxisY)
- `RotateHandle` (None, Ring)
- `ScaleHandle` (None, TopLeft, TopRight, BottomLeft, BottomRight, Top, Bottom, Left, Right)

**Interfaces:**
- `EditorPluginConfig` — Plugin setup options
- `EditorUISlots` — Panel container references
- `SnappingConfig` — Snap settings (gridEnabled, gridSize, objectSnapEnabled, objectSnapThreshold)
- `SnapGuide` — Rendered alignment guide data
- `EditorSceneData` — Scene init data

## Where to Add New Code

**New Feature (e.g., Undo System):**
- Primary code: `src/core/UndoManager.ts` (new file, implements snapshot/restore)
- Integration: `src/EditorScene.ts` (instantiate in create, call on property change)
- Hotkey: `src/PhaserEditorPlugin.ts` (add to DOM listener)
- Test: `demo/DemoScene.ts` (verify with demo game)

**New Gizmo (e.g., Skew Handle):**
- Implementation: `src/gizmos/SkewGizmo.ts` (new file)
- Integration: `src/gizmos/GizmoManager.ts` (add to constructor, route in draw/handlePointerDown)
- Tool: `src/core/EditorState.ts` (add EditorTool.Skew)
- UI: `src/ui/ToolbarPanel.ts` (add button for new tool)
- Test: Toggle tool in demo, drag handles

**New UI Control (e.g., Grid Overlay Toggle):**
- Panel: Add to `src/ui/ToolbarPanel.ts` (new checkbox, updates EditorState.gridVisibility)
- Rendering: `src/EditorScene.ts` (add drawGridOverlay() in update())
- Test: Click toggle in demo, see grid appear/disappear

**New Property Inspector Folder (e.g., Advanced Rotation):**
- Modification: `src/ui/InspectorPanel.ts` (add folder in bind(), update syncFromObject/applyRotation)
- Binding: Use Tweakpane folder API (addBinding, onChange callbacks)
- Test: Select object, tweak new property, verify game object updates

**New Snap Type (e.g., Edge Snap):**
- Implementation: `src/core/SnappingEngine.ts` (add edgeSnap() method)
- Integration: `src/gizmos/MoveGizmo.ts` (call in updateDrag() if config.edgeSnapEnabled)
- Config: `src/core/EditorState.ts` (extend SnappingConfig interface)
- UI: `src/ui/ToolbarPanel.ts` (add checkbox)
- Test: Enable edge snap in toolbar, drag object, see alignment to object edges

## Special Directories

**dist/** (Build Output)
- Purpose: Generated library distribution
- Generated: `npm run build` → `vite build` → transpiles, bundles, generates declarations
- Committed: No (in `.gitignore`; rebuilt on publish)
- Size: ~216 kB (ES module), ~171 kB (CommonJS) — includes bundled Tweakpane

**.planning/codebase/** (Documentation)
- Purpose: Reference documents for future development
- Generated: Via `/gsd:map-codebase` commands
- Committed: Yes (codebase map)

---

*Structure analysis: 2026-02-18*
