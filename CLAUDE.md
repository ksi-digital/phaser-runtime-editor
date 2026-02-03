# CLAUDE.md — phaser-runtime-editor

## Project Overview

A Phaser Scene Plugin (`phaser-runtime-editor`) that injects a runtime visual editor into any Phaser 3/4 game. Press F2 to pause the game, drag objects to reposition them, inspect/edit properties, and export coordinates as JSON. Ships as a separate npm package.

**Current status:** Phase 4 complete (inspector panel with Tweakpane). Phase 5 (hierarchy panel) is next.

## Build & Dev Commands

```bash
npx.cmd vite build                      # Build the library (outputs to dist/)
npm.cmd run dev                          # Watch mode (vite build --watch)
npm.cmd run demo                         # Run demo game at http://localhost:5199/
npx.cmd tsc --noEmit                     # Type-check without emitting
```

> **Windows note:** Always use `npm.cmd` / `npx.cmd` (not `npm` / `npx`) on Windows.

## Testing Workflow

### Demo game (primary)

A self-contained demo lives in `demo/` with procedurally generated textures (no asset files). Run with `npm run demo` → opens `http://localhost:5199/`.

Demo scene objects (16 total, design space 720x1280):

| Object | Type | Depth | Notes |
|--------|------|-------|-------|
| `sky_background` | Image | 0 | Full-screen gradient |
| `ground` | Image | 1 | Bottom platform |
| `cloud_1`, `cloud_2` | Image | 2 | Tweened horizontally (tests pause/resume) |
| `platform_left/right/center` | Image | 3 | Static platforms |
| `coin_1/2/3` | Image | 4 | Tweened bob (tests pause/resume) |
| `player` | Container | 5 | 4 children: `player_body`, `player_head`, `player_eye_left`, `player_eye_right` |
| `hud_score` | Text | 10 | "Score: 1234" |
| `hud_level` | Text | 10 | "Level 5" |
| `health_bar` | Container | 10 | 2 children: `hp_background`, `hp_fill` |
| `settings_button` | Container | 10 | 2 children: `settings_bg`, `settings_icon` |
| `dialog_welcome` | Container | 20 | 5 children: background, title, body, button bg, button text. OK dismisses. |

### Mahjong game (secondary)

```
e:\Code\phaser-runtime-editor\    ← this package (npm linked)
e:\Code\mahjong_phaser\           ← test game (npm link phaser-runtime-editor)
```

1. Build this package with `npx.cmd vite build`
2. In the mahjong project, Vite HMR picks up rebuilt dist
3. Open `http://localhost:5173/` and press F2 to toggle editor

## Package Structure

```
phaser-runtime-editor/
├── package.json              ✅ npm package config, `files` excludes demo from publish
├── tsconfig.json             ✅ ES2020 target, strict, bundler resolution
├── vite.config.ts            ✅ Library mode, externalizes phaser, ES+CJS, dts rollup
├── vite.demo.config.ts       ✅ Demo dev server on port 5199
│
├── src/
│   ├── index.ts              ✅ Public API exports (9 classes/enums + 2 types)
│   ├── PhaserEditorPlugin.ts ✅ Scene Plugin — toggle/activate/deactivate + property snapshot/restore
│   ├── EditorScene.ts        ✅ Overlay scene — selection, coord bar, gizmo rendering, UI lifecycle
│   │
│   ├── core/
│   │   ├── EditorState.ts    ✅ Selection state, active tool, snapping config, events
│   │   ├── CoordinateSystem.ts ✅ Design↔screen conversion, Container-aware positioning
│   │   ├── SelectionManager.ts ✅ Hit-test (skips invisible), bounding box, Container union bounds
│   │   ├── SnappingEngine.ts 📋 Phase 6
│   │   └── UndoManager.ts    📋 Phase 9
│   │
│   ├── gizmos/
│   │   ├── GizmoManager.ts   ✅ Coordinates active gizmo, delegates pointer events
│   │   ├── MoveGizmo.ts      ✅ Center (free) + X-axis (red) + Y-axis (green) handles
│   │   ├── RotateGizmo.ts    📋 Phase 7
│   │   └── ScaleGizmo.ts     📋 Phase 7
│   │
│   ├── ui/
│   │   ├── EditorUI.ts       ✅ Manages panel lifecycle, wires selection events
│   │   ├── InspectorPanel.ts ✅ Tweakpane 4.x property editor (Transform, Origin, Display, Info)
│   │   ├── CoordinateBar.ts  📋 Phase 5 (currently inline in EditorScene, will extract)
│   │   ├── HierarchyPanel.ts 📋 Phase 5
│   │   └── ToolbarPanel.ts   📋 Phase 6
│   │
│   └── serialization/
│       ├── LayoutSchema.ts   📋 Phase 8
│       ├── LayoutExporter.ts 📋 Phase 8
│       └── LayoutImporter.ts 📋 Phase 8
│
├── demo/
│   ├── index.html            ✅ HTML entry
│   ├── main.ts               ✅ Phaser config + plugin registration
│   └── DemoScene.ts          ✅ Procedural textures, 16 varied objects
│
└── dist/                     ✅ Built output
    ├── index.js              (~216 kB ES module, includes bundled Tweakpane)
    ├── index.cjs             (~171 kB CommonJS)
    ├── index.d.ts            (rolled-up declarations)
    └── *.map                 (source maps)
```

## Architecture

### Plugin Architecture

```
PhaserEditorPlugin (Phaser.Plugins.ScenePlugin)
├── Module-level state:
│   ├── editorSceneRegistered: boolean  — prevents duplicate scene registration
│   ├── activePluginInstance: ref       — the plugin instance that handles toggle
│   ├── domListenerRegistered: boolean  — single DOM keydown listener
│   └── onDomKeyDown()                  — matches e.key against hotkey, calls toggle()
│
├── Instance state:
│   ├── _pluginKey: string              — key from plugin registration (e.g. 'PhaserEditor')
│   ├── config: { designWidth, designHeight, hotkey }
│   ├── editorActive: boolean
│   ├── pausedScenes: Set<string>
│   └── propertySnapshot: Map<GameObject, { x, y, rotation, scaleX, scaleY, originX, originY, alpha, visible }>
│
├── boot()         — read config, early-return for editor scene, register scene, set active, register DOM listener
├── toggle()       — activate/deactivate based on current state
├── activate()     — snapshot scenes → start EditorScene → pause game scenes → snapshotProperties()
├── deactivate()   — stop EditorScene → restoreProperties() → resume tweens/time → resume scenes
├── snapshotProperties() — saves x, y, rotation, scale, origin, alpha, visible for all objects
└── restoreProperties()  — restores all saved properties on editor exit
```

### EditorScene Architecture

```
EditorScene (Phaser.Scene, key: '__PhaserEditorScene__')
├── Core systems (created in create()):
│   ├── editorState: EditorState          — selection, tool, events
│   ├── coordSystem: CoordinateSystem     — design↔screen math
│   ├── selectionMgr: SelectionManager    — hit-test, bounds, drawing
│   ├── gizmoMgr: GizmoManager           — move gizmo, pointer delegation
│   └── editorUI: EditorUI               — Tweakpane inspector panel
│
├── Visual layers:
│   ├── overlay: Rectangle                — depth 99999, captures clicks
│   ├── gfx: Graphics                     — depth 100000, gizmos + selection box
│   ├── statusText: Text                  — depth 100001, "EDITOR MODE — Press F2 to exit"
│   └── coordText: Text                   — depth 100001, mouse + selection coordinates
│
├── HTML layer:
│   └── htmlContainer: div#phaser-editor-ui — fixed, pointer-events:none, z-index:1000
│       └── .phaser-editor-inspector        — Tweakpane pane (right sidebar, pointer-events:auto)
│
├── init(data)     — receives designWidth, designHeight, hostSceneKey, pausedScenes
├── create()       — instantiate systems, create visuals, wire input, register shutdown listener
├── update()       — clear gfx, redraw design bounds + selection + gizmos, refresh UI, update coord bar
├── onShutdown()   — destroy UI → destroy gizmo/state/selection → remove HTML → remove listeners
│
├── Input flow:
│   ├── pointerdown → gizmoMgr.handlePointerDown() first (returns true if handle hit)
│   │                 else → selectionMgr.hitTest() → editorState.selected = hit
│   ├── pointermove → gizmoMgr.handlePointerMove()
│   └── pointerup  → gizmoMgr.handlePointerUp()
│
├── drawDesignBounds()      — cyan rectangle + corner markers at design area edges
├── updateCoordBar()        — "Mouse: design(x,y) screen(x,y) | name: design(x,y) screen(x,y)"
├── getHostScene()          — returns game.scene.getScene(hostSceneKey)
├── createHtmlContainer()   — creates div#phaser-editor-ui
├── destroyHtmlContainer()  — removes the div
└── onResize()              — repositions overlay + coord bar
```

### Gizmo System

```
GizmoManager
├── Owns MoveGizmo instance
├── draw(gfx)                    — draws active gizmo when tool is Move or Select
├── handlePointerDown(x, y)      — hit-tests gizmo handles, starts drag if hit, returns true
├── handlePointerMove(x, y)      — delegates to MoveGizmo.updateDrag()
└── handlePointerUp()            — ends drag

MoveGizmo
├── Rendering (via Graphics API):
│   ├── Center: green filled circle (radius 8) + white stroke
│   ├── X-axis: red line (40px) + red triangle arrowhead pointing right
│   └── Y-axis: green line (40px) + green triangle arrowhead pointing down
│
├── Hit-testing (priority: center > X > Y):
│   ├── Center: circle test (radius 12)
│   ├── X-axis: rectangle along arrow (12px wide band)
│   └── Y-axis: rectangle along arrow (12px wide band)
│
└── Drag logic:
    ├── startDrag() — records screen start pos + object's design-space start pos
    ├── updateDrag() — screen delta / scaleFactor → design delta, applies axis constraint
    │                  calls CoordinateSystem.setDesignPosition()
    └── endDrag() — clears drag state
```

### UI System

```
EditorUI
├── Listens to EditorState.EVENT_SELECTION_CHANGED
├── On select → InspectorPanel.bind(obj, hostScene)
├── On deselect → InspectorPanel.dispose()
├── refresh() — called each frame, syncs panel from game object (for gizmo changes)
└── destroy() — unsubscribes events, disposes inspector

InspectorPanel (Tweakpane 4.x)
├── bind(obj, hostScene):
│   ├── Creates wrapper div (.phaser-editor-inspector, right sidebar, 260px wide)
│   ├── Creates Pane with title = getObjectName(obj)
│   ├── Transform folder: x, y (step 1), rotation (-360..360), scaleX, scaleY (0.01..10)
│   ├── Origin folder (if obj has originX): originX, originY (0..1, step 0.05)
│   ├── Display folder: alpha (0..1), visible (checkbox), depth (read-only)
│   └── Info folder: name, type, texture, parent (all read-only)
│
├── Bidirectional sync:
│   ├── Panel → Object: on('change') callbacks call applyTransform/Rotation/Scale/Origin/Display
│   ├── Object → Panel: refresh() reads from game object, calls pane.refresh()
│   └── applying flag prevents feedback loop
│
├── dispose() — pane.dispose(), remove wrapper div, clear references
└── refresh() — syncFromObject() + pane.refresh() (skipped if applying)
```

### Core Systems

**EditorState** (`src/core/EditorState.ts`):
- Extends `Phaser.Events.EventEmitter`
- Properties: `selected` (GameObject | null), `activeTool` (EditorTool enum), `snapping` (SnappingConfig)
- Events: `selection-changed`, `tool-changed`
- EditorTool enum: `Select`, `Move`, `Rotate`, `Scale`

**CoordinateSystem** (`src/core/CoordinateSystem.ts`):
- Constructor takes `designWidth`, `designHeight`
- `getScaleFactor(scene)` — `Math.min(screenW/designW, screenH/designH)`
- `getOffset(scene)` — `{ x: (screenW - designW*sf)/2, y: (screenH - designH*sf)/2 }`
- `designToScreen(dx, dy, scene)` → `{ x: offset.x + dx*sf, y: offset.y + dy*sf }`
- `screenToDesign(sx, sy, scene)` → `{ x: (sx - offset.x)/sf, y: (sy - offset.y)/sf }`
- `getWorldPosition(obj)` — uses `getWorldTransformMatrix().tx/ty` for Container children
- `getDesignPosition(obj, scene)` — world position → screenToDesign
- `setDesignPosition(obj, dx, dy, scene)` — for Container children, inverts parent matrix

**SelectionManager** (`src/core/SelectionManager.ts`):
- Constructor takes `EditorState`, `CoordinateSystem`, `Game`, `pausedSceneKeys[]`
- `getSelectableObjects()` — walks `scene.children.list` for all paused scenes, flat list
- `hitTest(screenX, screenY)` — tests bounds of all **visible** objects, returns highest-depth hit
- `getScreenBounds(obj)` — `getBounds()` for regular objects, `getContainerBounds()` for Containers
- `getContainerBounds(container)` — union of all children's `getBounds()` results
- `drawSelection(gfx)` — blue rect (2px) + 4 corner squares (6px) + center crosshair
- `static getObjectName(obj)` — smart naming: uses `.name`, falls back to `Text: "..."`, `Image: key`, `Container (N children)`, or `.type`

### Coordinate System Math

```
Design-space: logical coordinates the game is authored in (e.g. 720x1280)
Screen-space: actual pixel coordinates on the canvas after Scale.FIT

scaleFactor = Math.min(screenW / designW, screenH / designH)
offsetX = (screenW - designW * sf) / 2
offsetY = (screenH - designH * sf) / 2

screen = offset + design * sf
design = (screen - offset) / sf
```

Container children: `getWorldTransformMatrix()` gives world position. Setting position requires inverting parent's world transform matrix to get local coordinates.

### Depth Layers

```
Game depths:
  -2 to -1       Background
  0-100          Content layers
  1000           HUD
  2000-4000      Popups/overlays
  10000-30000    Tiles (in mahjong: layer * 10000 + index * 100)
  40000-50000    Menus

Editor depths:
  99999          Dim overlay (captures clicks)
  100000         Graphics — gizmos, bounding boxes, design bounds
  100001         Status text + coordinate bar

Editor HTML:
  z-index:1000   HTML overlay div (Tweakpane panels, hierarchy, toolbar)
```

## Important Patterns & Decisions

### Phaser 4 Compatibility
- peerDependencies accept `^3.60.0 || ^4.0.0`; devDependency is `phaser@^4.0.0-rc.6`
- Phaser 4 is backward-compatible with Phaser 3 APIs
- `Phaser.GAMES` global is NOT available in Phaser 4 (can't enumerate game instances from console)

### Plugin Config Reading
- In Phaser 4, `this.systems.settings.data` is NOT populated with plugin registration data
- The `data` field from `plugins.scene[{...data}]` lives on `(game.config as any).installScenePlugins[].data`
- Matched by `entry.key === this._pluginKey`

### Editor Scene Plugin Bypass
- Scene plugins boot for EVERY scene, including `EditorScene`
- `boot()` early-returns when `this.scene.scene.key === EDITOR_SCENE_KEY` to prevent the editor scene's own plugin instance from overwriting `activePluginInstance`
- Without this, `hostSceneKey` would point to `__PhaserEditorScene__` instead of the actual game scene

### Scene Lifecycle in Phaser 4
- **Do NOT override `shutdown()` as a method** — Phaser 4 does not call method overrides for scene lifecycle
- Instead, listen for the `'shutdown'` event on `this.events` in `create()`: `this.events.on('shutdown', this.onShutdown, this)`
- Same applies for `destroy`, `pause`, `resume` lifecycle events

### Scene Management
- **SceneManager.start()** not ScenePlugin.launch() — ScenePlugin methods are unavailable on SceneManager and unreliable when the host scene is being paused
- **Capture hostKey before** calling `game.scene.start()` — starting a scene can change context
- **Module-level flags** prevent duplicate scene registration and duplicate DOM listeners across per-scene plugin instances

### Input Handling
- **DOM `keydown` listener** (single, module-level) instead of Phaser's keyboard system — avoids double-fire on pause/resume
- **F2 hotkey** (not F1, which opens Chrome help) — configurable via plugin data
- `e.preventDefault()` on hotkey to suppress browser defaults
- **Gizmo handles intercept before selection** — `pointerdown` checks `gizmoMgr.handlePointerDown()` first; if a handle is hit, selection is not changed

### Editor State Reset on Exit
- **All object properties reset when editor exits** — editor is a layout measurement tool, not a permanent state modifier
- `snapshotProperties()` on activate saves: x, y, rotation, scaleX, scaleY, originX, originY, alpha, visible
- `restoreProperties()` on deactivate restores all saved values
- Tweens resume with original targets — no conflict with editor changes
- Design-space coordinates shown in the coord bar / inspector are what you copy into your code

### Invisible Objects
- `hitTest()` skips objects with `visible === false`
- This prevents clicking through to hidden objects and makes "hide to get out of the way" possible (future Phase 9 Delete key)

### Build & Publishing
- **`exports` field ordering** in package.json: `types` first, then `import`, then `require` (fixes esbuild warnings)
- **`files` field** — only `dist` and `src` are published to npm; `demo/`, `vite.demo.config.ts` excluded
- **Tweakpane bundled** — included in dist output (not externalized) since it's a dev tool; consumers don't need to install it separately
- **`@tweakpane/core`** — required as a dependency for type resolution (Tweakpane 4's `Pane` extends `FolderApi` from `@tweakpane/core`)

### TypeScript
- **Casting for GameObject:** Use `as unknown as Phaser.GameObjects.Components.Transform` (not direct cast) to satisfy strict mode when accessing .x/.y on GameObject
- **`_pluginKey` naming:** Phaser's `ScenePlugin` already has a public `pluginKey` property, so our private field uses `_pluginKey` to avoid conflict
- **Tweakpane types:** `Pane` inherits `addFolder`, `addBinding`, `refresh` from `FolderApi` via `RootApi`. Requires `@tweakpane/core` installed for TypeScript to resolve the inheritance chain.

### Design Philosophy
- **HTML panels + Phaser gizmos** — panels in DOM (don't fight depth system), gizmos via Phaser Graphics (pixel-precise alignment)
- **Design-space export** — exported coordinates work at any screen size
- **Dedicated EditorScene** — clean separation, no pollution of game scenes
- **Bidirectional sync** — gizmo ↔ inspector panel updates in both directions via per-frame `refresh()`
- **Reset on exit** — editor changes are temporary; the value is the coordinates you read, not persistent state changes

## Build Output

```
dist/index.js    — ES module (~216 kB, includes bundled Tweakpane)
dist/index.cjs   — CommonJS (~171 kB)
dist/index.d.ts  — Rolled-up type declarations
dist/*.map       — Source maps
```

## Integration Example

```javascript
import { PhaserEditorPlugin } from 'phaser-runtime-editor';

const config = {
    plugins: {
        scene: [{
            key: 'PhaserEditor',
            plugin: PhaserEditorPlugin,
            mapping: 'editor',
            start: import.meta.env.DEV,
            data: { designWidth: 720, designHeight: 1280, hotkey: 'F2' }
        }]
    }
};
```

## Completed Phases

### Phase 1: Skeleton + Pause/Resume ✅

Created the npm package structure, PhaserEditorPlugin (scene plugin with toggle/activate/deactivate), EditorScene (overlay with design bounds), and integrated into the mahjong game for testing.

**Lessons learned:**
- F1 opens Chrome help → changed default to F2
- Phaser keyboard double-fires on resume → switched to DOM keydown listener
- `ScenePlugin.launch()` unavailable on SceneManager → use `game.scene.start()`
- Scene plugin boots per-scene → module-level flags for singleton behavior
- `hostSceneKey` captured wrong scene → capture before `game.scene.start()`

### Phase 2: Selection + Bounding Box ✅

Created EditorState (central state with events), CoordinateSystem (design↔screen conversion), SelectionManager (hit-testing, Container bounds, bounding box drawing). Integrated all into EditorScene with click-to-select, coordinate bar, and per-frame selection rendering.

**Lessons learned:**
- `this.systems.settings.data` is empty in Phaser 4 → read from `game.config.installScenePlugins[].data`
- Editor scene boots its own plugin instance → early-return in `boot()` when scene key matches
- `ScenePlugin.pluginKey` conflicts with our field → renamed to `_pluginKey`
- `GameObject` can't be directly cast to `Transform` → cast through `unknown` first

### Phase 3: Move Gizmo ✅

Created GizmoManager (coordinates gizmo lifecycle, delegates pointer events) and MoveGizmo (center handle for free move, X-axis for horizontal-only, Y-axis for vertical-only). Integrated into EditorScene with gizmo handles intercepting before selection logic.

**Lessons learned:**
- Tweens reset object positions on resume → implemented full property snapshot/restore on editor activate/deactivate
- Editor is a layout measurement tool, not a persistent state editor → all changes reset on exit
- Gizmo handles must intercept `pointerdown` before selection hit-test → `handlePointerDown()` returns true if a handle was hit
- Invisible objects should not be selectable → added `visible` check in `hitTest()`

### Phase 4: Inspector Panel ✅

Added Tweakpane 4.x as a dependency. Created InspectorPanel (right sidebar with Transform, Origin, Display, Info folders) and EditorUI (manages panel lifecycle, listens to selection events). Bidirectional sync: panel changes update game objects in real-time, gizmo drags update panel values via per-frame `refresh()`.

**Lessons learned:**
- Phaser 4 does NOT call overridden `shutdown()` method → must listen to `this.events.on('shutdown', ...)` instead
- Tweakpane `Pane` inherits methods from `FolderApi` via `@tweakpane/core` → must install `@tweakpane/core` for TypeScript to resolve types
- Property snapshot must include all editable properties (rotation, scale, origin, alpha, visible), not just x/y
- Tweakpane bundled into dist (not externalized) since it's a dev tool — increases bundle from ~21kB to ~216kB but simplifies consumer setup
- `applying` flag in InspectorPanel prevents feedback loop during bidirectional sync

## Upcoming Phases

### Phase 5: Hierarchy Panel

**Files to create:**
- `src/ui/HierarchyPanel.ts` — Left sidebar, scene object tree

**Implementation:**
- Traverse `scene.children.list` for each paused scene
- Recurse into Containers to show children as nested tree items
- Smart naming using `SelectionManager.getObjectName()`
- Click item → selects on canvas (syncs with SelectionManager)
- Selected item highlighted in tree
- Visibility toggle eye icon per object
- Shows depth value

**Tree rendering:**
- Plain HTML `<ul>/<li>` with CSS indentation (not Tweakpane — it's not suited for trees)
- Collapsible Containers (click arrow to expand/collapse children)
- Scrollable panel with max-height
- Lives in HTML overlay div, left side, `pointer-events: auto`

**Verify:** Panel shows tree of all objects. Click item → selects on canvas. Click Container → expand to see children.

### Phase 6: Snapping + Toolbar

**Files to create:**
- `src/core/SnappingEngine.ts` — Grid/object/edge snapping + guide line data
- `src/ui/ToolbarPanel.ts` — Top bar with tool buttons and snap controls

**SnappingEngine:**
- `gridSnap(point, gridSize)` → snapped point
- `objectSnap(point, allObjects, threshold)` → `{ point, guides: Line[] }` (center/edge alignment)
- `edgeSnap(point, allObjects, threshold)` → `{ point, guides: Line[] }`
- `drawGuides(graphics, guides)` — magenta dashed lines
- All snapping operates in **design-space** coordinates

**ToolbarPanel (top bar, HTML):**
- Tool buttons: Select | Move | Rotate | Scale (highlight active)
- Grid snap toggle + grid size input (10, 20, 50 px)
- Object snap toggle
- Export button | Import button
- Grid overlay toggle

**Verify:** Enable grid snap (10px) → dragging jumps to increments. Drag near another object → magenta guide line. Toggle snap on/off from toolbar.

### Phase 7: Rotate + Scale Gizmos

**Files to create:**
- `src/gizmos/RotateGizmo.ts` — Circle handle around object
- `src/gizmos/ScaleGizmo.ts` — Corner + edge handles

**RotateGizmo:**
- Dashed circle at object's bounding radius + 20px
- Drag along circle → rotate (atan2 delta from center)
- With snap → 15-degree increments
- Shows rotation angle near cursor during drag

**ScaleGizmo:**
- 4 corner handles (white squares): proportional scale (scaleX = scaleY)
- 4 edge handles (white rectangles): axis-constrained scale
- Drag corner → proportional, drag horizontal edge → scaleX only, drag vertical edge → scaleY only

**Verify:** Switch to rotate tool → circle appears. Drag → rotates. With snap → 15-degree increments. Switch to scale → corner handles. Drag corner → proportional scale.

### Phase 8: Export/Import

**Files to create:**
- `src/serialization/LayoutSchema.ts` — TypeScript interfaces
- `src/serialization/LayoutExporter.ts` — Scene export, selection export, clipboard
- `src/serialization/LayoutImporter.ts` — Apply positions from JSON

**Export format:**
```json
{
    "version": "1.0",
    "metadata": {
        "sceneName": "GameplayScene",
        "designWidth": 720,
        "designHeight": 1280,
        "exportedAt": "2026-02-03T12:00:00Z"
    },
    "objects": [
        {
            "name": "gameplay_panel_time",
            "type": "Image",
            "transform": {
                "x": 380, "y": 151,
                "scaleX": 0.896, "scaleY": 0.712,
                "rotation": 0,
                "originX": 0.5, "originY": 0.5
            },
            "display": { "depth": 1000, "alpha": 1, "visible": true },
            "parent": "GameplayHUD",
            "texture": "gameplay_panel_time"
        }
    ]
}
```

**Export actions:**
- Export all → downloads JSON file
- Export selected → downloads JSON with only selected objects
- Copy to clipboard → design-space coords as `{ x: 380, y: 151, scaleX: 0.896, scaleY: 0.712 }`

**Import:**
- File input or paste JSON
- Match objects by `name` property
- Apply transform values, converting design coords → screen coords via CoordinateSystem

**Verify:** Click Export → JSON with design-space positions. Copy to clipboard → paste into code. Click Import → objects move to saved positions.

### Phase 9: Undo + Keyboard Shortcuts

**Files to create:**
- `src/core/UndoManager.ts` — Single-level undo stack

**Undo:**
- Before any transform change, snapshot `{ x, y, rotation, scaleX, scaleY, originX, originY }`
- Ctrl+Z restores previous snapshot
- Any new drag overwrites the snapshot (single level, not full undo stack)

**Keyboard shortcuts (all via DOM listeners):**
- `Ctrl+Z` — Undo last transform change
- `Delete` — Hide selected object (`visible = false`, non-destructive)
- `Arrow keys` — Nudge 1 design-pixel
- `Shift+Arrow` — Nudge 10 design-pixels
- `Escape` — Deselect
- `1/2/3/4` — Switch tool (Select/Move/Rotate/Scale)

**Verify:** Move an object → Ctrl+Z → returns to previous position. Arrow keys → nudge. Delete → hides.

### Phase 10: Polish + Documentation

- Grid overlay toggle (draw design-space grid lines at configurable interval)
- Multi-select (Shift+click adds to selection, drag bounding box)
- Status text shows config hotkey dynamically instead of hardcoded "F2"
- README with integration instructions
- Example project in `examples/basic/`

## Relationship to phaser-plugin-inspector

**Strategy: Cherry-pick patterns, don't depend on it.**

[phaser-plugin-inspector](https://github.com/samme/phaser-plugin-inspector) (ISC license, v2.6.0) is the closest existing tool.

### Patterns to cherry-pick

| Pattern | Where in inspector | How we use it |
|---------|-------------------|---------------|
| Safe property extraction | `copyToSafeObj()` | Safely read game object properties |
| Display list traversal | `AddDisplayList()` | Walk `scene.children.list`, recurse Containers |
| Smart object naming | Various `Add*()` helpers | `Text→"Text: HINT"`, `Image→"Image: tile_upper"` |
| Property binding patterns | `AddGameObject()`, `AddTransform()` | Bind x/y/rotation/scale to Tweakpane inputs |
| Destroy cleanup | `obj.once(DESTROY, ...)` | Auto-dispose Tweakpane folders on object destroy |

### How we differ

| Aspect | phaser-plugin-inspector | Our editor |
|--------|------------------------|------------|
| UI library | Tweakpane 3.1.x | Tweakpane 4.x |
| Canvas interaction | None — panel only | Gizmos via Phaser Graphics |
| Coordinate awareness | Shows raw x/y | Design-space, screen, and local coords |
| Change events | None (one-way) | Bidirectional gizmo ↔ panel sync |
| Snapping | None | Grid, object, edge with smart guides |
| Export/Import | `console.info()` only | JSON layout files with design-space coords |
| Selection | Click in hierarchy | Click on canvas or in hierarchy (synced) |
| Purpose | Debug/inspect | Position and layout editing |

## Critical Reference Files (in mahjong_phaser)

| File | What to learn from it |
|------|----------------------|
| `src/ui/UIManager.js:35-64` | Design↔Screen coordinate math: `scaleX()`, `scaleY()`, `scaleFactor` |
| `src/ui/GameplayHUD.js:249-258` | `toScreenX`/`toScreenY` helper pattern |
| `src/scenes/GameplayScene.js:68-82` | `calculateGameScale()` — `gameScale`, `gameOffsetX`, `gameOffsetY` |
| `src/scenes/GameplayScene.js:344-543` | Pause/resume pattern, depth layers |
| `src/objects/Tile.js` | Container with 4 children, depth formula (line 41) |
| `src/objects/Board.js:572-584` | Tile pixel positioning, `repositionTiles` |
| `src/main.js` | Plugin registration, design dimensions (720x1552) |
