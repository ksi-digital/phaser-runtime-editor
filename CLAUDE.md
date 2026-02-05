# CLAUDE.md — phaser-runtime-editor

## Project Overview

A Phaser Scene Plugin (`phaser-runtime-editor`) that injects a runtime visual editor into any Phaser 3/4 game. Press F2 to pause the game, drag objects to reposition them, inspect/edit properties, and export coordinates as JSON. Ships as a separate npm package.

**Current status:** Phase 6 complete (snapping engine and toolbar panel). Phase 7 (rotate + scale gizmos) and Phase 7b (hit area visualization) are next.

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

A playable mini-platformer lives in `demo/` with procedurally generated textures (no asset files). Run with `npm run demo` → opens `http://localhost:5199/`.

**Controls:** Arrow keys to move, Space to jump. Collect coins for score. Press F2 to toggle editor.

**Physics:** Manual design-space physics (no Arcade Physics). Gravity, one-way platform collision (land from above, jump through from below), AABB coin collection. All physics runs in `update()` with delta-time.

Demo scene objects (design space 720x1280):

| Object | Type | Depth | Hit Area | Notes |
|--------|------|-------|----------|-------|
| `sky_background` | Image | 0 | — | Full-screen gradient |
| `ground` | Image | 1 | Rectangle | Bottom platform, `Geom.Rectangle(0,0,64,16)` |
| `cloud_1` | Image | 2 | Polygon | 9-vertex cloud silhouette, tweened horizontally |
| `cloud_2` | Image | 2 | — | Tweened horizontally (no hit area, tests "no mask" case) |
| `platform_left/right/center` | Image | 3 | Rectangle | `Geom.Rectangle(4,0,56,16)`, one-way platforms |
| `coin_1/2/3` | Image | 4 | Circle | `Geom.Circle(16,16,14)`, manual sine bob, collectible |
| `player` | Container | 5 | Polygon | 9-vertex silhouette; keyboard-controlled |
| `player_body` | Image | — | — | Child of `player` |
| `player_head` | Container | — | — | Child of `player`, contains head sprite + eyes |
| `player_head_sprite` | Image | — | — | Child of `player_head` |
| `player_eye_left/right` | Image | — | — | Children of `player_head` (nested container) |
| `hud_score` | Text | 10 | — | "Score: 0", updates on coin collection |
| `hud_level` | Text | 10 | — | "Level 1" |
| `health_bar` | Container | 10 | — | 2 children: `hp_background`, `hp_fill` |
| `settings_button` | Container | 10 | Circle | `Geom.Circle(0,0,28*sf)` |
| `dialog_welcome` | Container | 20 | — | OK button has default rect interactive. Dismisses on click. |

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
│   ├── index.ts              ✅ Public API exports (13 classes/enums + 4 types)
│   ├── PhaserEditorPlugin.ts ✅ Scene Plugin — toggle/activate/deactivate + property snapshot/restore
│   ├── EditorScene.ts        ✅ Overlay scene — selection, coord bar, gizmo rendering, UI lifecycle
│   │
│   ├── core/
│   │   ├── EditorState.ts    ✅ Selection state, active tool, snapping config, events
│   │   ├── CoordinateSystem.ts ✅ Design↔screen conversion, Container-aware positioning
│   │   ├── SelectionManager.ts ✅ Hit-test (skips invisible), bounding box, Container union bounds
│   │   ├── SnappingEngine.ts ✅ Grid/object snapping in design-space, guide line rendering
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
│   │   ├── HierarchyPanel.ts ✅ Left sidebar tree view, expand/collapse, visibility toggle
│   │   ├── ToolbarPanel.ts   ✅ Top bar with tool buttons and snapping controls
│   │   └── EditorFrame.ts    ✅ CSS grid layout, canvas wrapper, panel slots
│   │
│   └── serialization/
│       ├── LayoutSchema.ts   📋 Phase 8
│       ├── LayoutExporter.ts 📋 Phase 8
│       └── LayoutImporter.ts 📋 Phase 8
│
├── demo/
│   ├── index.html            ✅ HTML entry
│   ├── main.ts               ✅ Phaser config + plugin registration
│   └── DemoScene.ts          ✅ Playable platformer, procedural textures, hit areas on objects
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
│   ├── gizmoMgr: GizmoManager           — move gizmo, pointer delegation, snapping
│   ├── snappingEngine: SnappingEngine   — grid/object snapping, guide rendering
│   ├── editorFrame: EditorFrame         — CSS grid layout, canvas wrapper
│   └── editorUI: EditorUI               — inspector, hierarchy, toolbar panels
│
├── Visual layers:
│   ├── overlay: Rectangle                — depth 99999, captures clicks
│   ├── gfx: Graphics                     — depth 100000, gizmos + selection box + snap guides
│   ├── statusText: Text                  — depth 100001, "EDITOR MODE — Press F2 to exit"
│   └── coordText: Text                   — depth 100001, mouse + selection coordinates
│
├── HTML layer (via EditorFrame):
│   └── #phaser-editor-frame              — CSS grid container (z-index:999)
│       ├── toolbarSlot                   — top row, spans all columns
│       ├── hierarchySlot                 — left column
│       ├── canvasCell                    — center, contains game canvas
│       ├── inspectorSlot                 — right column
│       └── statusSlot                    — bottom row, spans all columns
│
├── init(data)     — receives designWidth, designHeight, hostSceneKey, pausedScenes
├── create()       — instantiate systems, create visuals, wire input, register shutdown listener
├── update()       — clear gfx, redraw design bounds + selection + gizmos + snap guides, refresh UI
├── onShutdown()   — destroy UI → destroy frame → destroy gizmo/state/selection → remove listeners
│
├── Input flow:
│   ├── pointerdown → gizmoMgr.handlePointerDown() first (returns true if handle hit)
│   │                 else → selectionMgr.hitTest() → editorState.selected = hit
│   ├── pointermove → gizmoMgr.handlePointerMove()
│   └── pointerup  → gizmoMgr.handlePointerUp()
│
├── drawDesignBounds()      — cyan rectangle + corner markers at design area edges
├── updateCoordBar()        — "Mouse: design(x,y) screen(x,y) | name: design(x,y) screen(x,y)"
└── getHostScene()          — returns game.scene.getScene(hostSceneKey)
```

### EditorFrame Architecture

```
EditorFrame (manages CSS grid layout around canvas)
├── Constructor(game):
│   ├── Saves original canvas parent, position, ScaleManager config
│   ├── Creates #phaser-editor-frame div (fixed, full viewport, z-index:999)
│   ├── Creates CSS grid: 3 columns (220px | 1fr | 260px), 3 rows (40px | 1fr | 24px)
│   ├── Moves canvas into center cell (canvasCell)
│   ├── Patches ScaleManager: parent = canvasCell, autoCenter = NO_CENTER
│   └── Sets up ResizeObserver to track canvasCell size changes
│
├── Grid layout:
│   ┌─────────────────────────────────────────┐
│   │  toolbarSlot (grid-column: 1/-1)        │  40px
│   ├────────────┬───────────────┬────────────┤
│   │ hierarchy  │    canvas     │  inspector │  1fr
│   │ (220px)    │    (1fr)      │  (260px)   │
│   ├────────────┴───────────────┴────────────┤
│   │  statusSlot (grid-column: 1/-1)         │  24px
│   └─────────────────────────────────────────┘
│
├── Slots (HTMLDivElements):
│   ├── toolbarSlot    — ToolbarPanel attaches here
│   ├── hierarchySlot  — HierarchyPanel attaches here
│   ├── inspectorSlot  — InspectorPanel attaches here
│   └── statusSlot     — status text attaches here
│
├── ResizeObserver:
│   └── On canvasCell resize → scale.setParentSize(width, height)
│
├── setStatusText(text)  — updates status bar content
│
└── destroy():
    ├── Disconnects ResizeObserver
    ├── Moves canvas back to original parent
    ├── Restores original ScaleManager config
    ├── Removes #phaser-editor-frame
    └── Calls scale.refresh()
```

### Gizmo System

```
GizmoManager
├── Owns MoveGizmo instance
├── Receives SnappingEngine + getSelectableObjects callback
├── snapGuides: SnapGuide[]      — current snap guides (set by MoveGizmo during drag)
├── draw(gfx)                    — draws active gizmo when tool is Move or Select
├── handlePointerDown(x, y)      — hit-tests gizmo handles, starts drag if hit, returns true
├── handlePointerMove(x, y)      — delegates to MoveGizmo.updateDrag()
└── handlePointerUp()            — ends drag, clears snap guides

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
├── Snapping integration:
│   ├── setSnapping(engine, config, getSelectableObjects)
│   └── updateDrag() applies snapping via SnappingEngine.applySnapping()
│
└── Drag logic:
    ├── startDrag() — records screen start pos + object's design-space start pos
    ├── updateDrag() — calculates new design position, applies snapping, sets position
    │                  stores snap guides in _snapGuides for rendering
    └── endDrag() — clears drag state and snap guides
```

### UI System

```
EditorUI
├── Constructor(state, coords, slots, hostScene, game, pausedSceneKeys):
│   ├── inspector = new InspectorPanel(slots.inspector, coords)
│   ├── hierarchy = new HierarchyPanel(state, game, pausedSceneKeys, slots.hierarchy)
│   └── toolbar = new ToolbarPanel(state, slots.toolbar)
│
├── Listens to EditorState.EVENT_SELECTION_CHANGED
├── On select → InspectorPanel.bind(obj, hostScene)
├── On deselect → InspectorPanel.dispose()
├── refresh() — inspector.refresh() + hierarchy.refresh()
└── destroy() — unsubscribes events, disposes all panels

InspectorPanel (Tweakpane 4.x)
├── bind(obj, hostScene):
│   ├── Creates wrapper div (.phaser-editor-inspector, 260px wide)
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

HierarchyPanel (Plain HTML tree)
├── Constructor(state, game, pausedSceneKeys, container):
│   ├── Injects CSS styles (one-time)
│   ├── Creates wrapper div (.phaser-editor-hierarchy, 220px wide)
│   └── Builds initial tree
│
├── Tree structure:
│   ├── Traverses scene.children.list for all paused scenes
│   ├── Recurses into Containers to show children as nested items
│   └── rowMap: Map<HTMLElement, GameObject> tracks DOM → object mapping
│
├── Features:
│   ├── Expand/collapse: WeakSet<Container> tracks expanded state, click ▶/▼ to toggle
│   ├── Visibility toggle: eye icon (👁/–) per object, click to toggle visible
│   ├── Selection sync: click row → editorState.selected = obj, highlights row
│   ├── Depth display: numeric depth value per row (right-aligned, dimmed)
│   └── Smart naming: uses SelectionManager.getObjectName()
│
├── buildTree() — rebuilds entire tree (called on expand/collapse/visibility changes)
├── buildNode(obj) — creates <li> row with toggle, eye, name, depth, nested children
├── refresh() — rebuilds tree to sync with external changes
└── destroy() — removes DOM, clears references

ToolbarPanel (Plain HTML)
├── Constructor(state, container):
│   ├── Injects CSS styles (one-time)
│   └── Creates toolbar div with flexbox layout
│
├── Tool buttons:
│   ├── Select | Move | Rotate | Scale
│   ├── Click → state.activeTool = tool
│   └── Active button highlighted (blue background)
│
├── Snapping controls:
│   ├── Grid checkbox → state.snapping.gridEnabled
│   ├── Grid size input (1-200) → state.snapping.gridSize
│   └── Object snap checkbox → state.snapping.objectSnapEnabled
│
├── Listens to EVENT_TOOL_CHANGED to update button highlights
└── destroy() — removes DOM, clears references
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

**SnappingEngine** (`src/core/SnappingEngine.ts`):
- Stateless utility class — all methods are pure functions
- All snapping operates in **design-space** coordinates
- `gridSnap(point, gridSize)` → snapped point (rounds to nearest grid increment)
- `objectSnap(point, allObjects, threshold, coords, hostScene, excludeObj?)` → `{ point, guides: SnapGuide[] }`
  - Snaps to nearby object centers (not edges)
  - Tests X and Y alignment separately
  - Skips invisible objects
- `applySnapping(point, config, allObjects, coords, hostScene, excludeObj?)` → `{ point, guides: SnapGuide[] }`
  - Orchestrator: applies grid first, then object snapping
  - Respects `config.gridEnabled` and `config.objectSnapEnabled`
- `drawGuides(gfx, guides, coords, hostScene)` — renders magenta dashed lines
- `drawDashedLine(gfx, x1, y1, x2, y2, dashLen, gapLen)` — helper for dashed rendering

**SnappingConfig** (stored in `EditorState.snapping`):
```typescript
interface SnappingConfig {
    gridEnabled: boolean;           // default: false
    gridSize: number;               // default: 10 design-units
    objectSnapEnabled: boolean;     // default: false
    objectSnapThreshold: number;    // default: 8 design-units
}
```

**SnapGuide** (for rendering snap alignment lines):
```typescript
interface SnapGuide {
    type: 'vertical' | 'horizontal';
    designPos: number;      // x for vertical, y for horizontal
    designStart: number;    // start of line (y for vertical, x for horizontal)
    designEnd: number;      // end of line
}
```

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

### EditorFrame Layout
- **CSS grid with slots** — panels live in dedicated grid cells, not floating overlays
- **Canvas in center cell** — Phaser canvas moved into grid, resizes with cell
- **ResizeObserver** — tracks canvasCell size, calls `scale.setParentSize()` to notify Phaser
- **ScaleManager patching** — saves original state, patches parent/autoCenter, fully restores on destroy
- **Slot-based architecture** — toolbarSlot, hierarchySlot, inspectorSlot, statusSlot for clean separation

### Snapping System
- **Design-space math** — all snapping calculations in design-space, only convert to screen-space for rendering
- **Stateless engine** — SnappingEngine methods are pure functions, no internal state
- **Config in EditorState** — SnappingConfig stored centrally, reactive to toolbar changes
- **Guides as data** — MoveGizmo produces SnapGuide[], EditorScene renders them (separation of concerns)
- **Exclude dragged object** — object snapping skips the currently dragged object from snap targets

### Hierarchy Panel
- **Plain HTML tree** — `<ul>/<li>` with CSS indentation, not Tweakpane (which isn't suited for trees)
- **WeakSet for expand state** — prevents memory leaks, survives tree rebuilds
- **Row-to-object mapping** — `Map<HTMLElement, GameObject>` for efficient click handling
- **Visibility toggle** — eye icon directly modifies `obj.visible`, rebuilds tree to update display

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

### Phase 5: Hierarchy Panel + EditorFrame ✅

Created HierarchyPanel (left sidebar tree view) and EditorFrame (CSS grid layout that wraps the canvas). The hierarchy shows all scene objects with expand/collapse for Containers, visibility toggle, selection sync, and depth display. EditorFrame provides a proper layout where panels live in CSS grid slots around the canvas, not floating on top.

**Implementation:**
- HierarchyPanel traverses `scene.children.list` for all paused scenes, recurses into Containers
- WeakSet tracks expanded Containers (survives tree rebuilds)
- Click row → selects object on canvas (synced via EditorState events)
- Eye icon toggles `visible` property
- EditorFrame creates `#phaser-editor-frame` div with CSS grid layout
- Canvas moved into center cell, ResizeObserver tracks size changes
- ScaleManager patched to use canvasCell as parent, fully restored on destroy

**Lessons learned:**
- ResizeObserver is essential for tracking CSS grid cell size changes → notify Phaser via `scale.setParentSize()`
- ScaleManager state must be fully saved and restored (parent, autoCenter, width, height)
- Canvas must be moved back to original parent on editor exit, not just hidden
- Plain HTML tree (`<ul>/<li>`) is better than Tweakpane for hierarchical data
- WeakSet for expand state prevents memory leaks and survives tree rebuilds
- Slot-based UI architecture (toolbar/hierarchy/inspector/status slots) cleanly separates layout from content

### Phase 6: Snapping Engine + Toolbar Panel ✅

Created SnappingEngine (grid and object snapping in design-space) and ToolbarPanel (top bar with tool buttons and snap controls). Snapping is applied during MoveGizmo drag, with magenta guide lines showing alignment.

**Implementation:**
- SnappingEngine is stateless — all methods are pure functions operating on design-space coordinates
- Grid snap rounds to nearest grid increment
- Object snap finds nearby object centers within threshold, generates guide lines
- `applySnapping()` orchestrates grid then object snapping based on config
- Guide lines rendered via `drawDashedLine()` helper (magenta dashed)
- ToolbarPanel uses plain HTML with flexbox, not Tweakpane
- Tool buttons (Select/Move/Rotate/Scale) update `editorState.activeTool`
- Snap controls (grid checkbox, grid size input, object snap checkbox) update `editorState.snapping`

**Lessons learned:**
- All snapping math in design-space simplifies calculations — only convert to screen-space for rendering
- Dashed lines require manual implementation via Graphics API (no built-in support)
- Toolbar as plain HTML is faster and lighter than Tweakpane for simple controls
- SnappingConfig stored in EditorState makes it reactive to toolbar changes
- MoveGizmo stores snap guides for EditorScene to render (separation of concerns)
- Object snapping should exclude the dragged object from snap targets

## Upcoming Phases

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

### Phase 7b: Hit Area Visualization

Visualize and inspect Phaser's built-in `setInteractive()` hit areas directly in the editor. No custom data model — reads from `gameObject.input.hitArea` which is already a `Phaser.Geom.Rectangle`, `Circle`, or `Polygon`.

**Approach:** Read-only visualization first. The hit area shape is defined in game code, the editor just renders and exports it.

**Hit area detection:**
```typescript
// Check if object has a hit area
const input = obj.input; // Phaser.Types.Input.InteractiveObject | null
if (!input) → "No hit area"

// Determine shape type
const hitArea = input.hitArea;
if (hitArea instanceof Phaser.Geom.Rectangle) → render rect
if (hitArea instanceof Phaser.Geom.Circle) → render circle
if (hitArea instanceof Phaser.Geom.Polygon) → render polygon (hitArea.points)
```

**Rendering (in EditorScene, on the Graphics layer):**
- Draw hit area shape as a semi-transparent overlay (e.g., yellow with 0.25 alpha fill + solid yellow stroke)
- Shape coordinates are **local to the object** — must transform through object's world matrix to screen-space
- For Containers: hit area coords are relative to the container's local origin
- Only render when an object with a hit area is selected

**Inspector panel addition:**
- Add "Hit Area" folder to InspectorPanel (read-only)
- Shows: shape type (Rectangle/Circle/Polygon), dimensions, vertex count for polygons

**Files to modify:**
- `src/EditorScene.ts` — add `drawHitArea(gfx, obj)` method, called in `update()` when selected object has `input`
- `src/ui/InspectorPanel.ts` — add Hit Area folder in `bind()`

**Coordinate transform for rendering:**
- Rectangle: transform 4 corners through object's world matrix → draw polygon on screen
- Circle: transform center through world matrix, scale radius by object's scale → draw circle on screen
- Polygon: transform each vertex through world matrix → draw polygon on screen

**Verify:** Select an object with `setInteractive()` → see yellow hit area overlay. Select object without → no overlay. Select coin (circle) → circle overlay. Select player (polygon) → polygon outline. Select platform (rectangle) → rect overlay. Check inspector shows "Hit Area: Polygon (9 vertices)" etc.

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
            "texture": "gameplay_panel_time",
            "hitArea": {
                "type": "polygon",
                "vertices": [{ "x": 0, "y": -80 }, { "x": 24, "y": -50 }, { "x": 30, "y": 0 }]
            }
        }
    ]
}
```

**Hit area export shapes:**
```json
// Rectangle
{ "type": "rectangle", "x": 0, "y": 0, "width": 64, "height": 16 }

// Circle
{ "type": "circle", "x": 16, "y": 16, "radius": 14 }

// Polygon
{ "type": "polygon", "vertices": [{ "x": 10, "y": 40 }, { "x": 5, "y": 30 }, ...] }

// No hit area → field omitted from export
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
