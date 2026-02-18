# Architecture

**Analysis Date:** 2026-02-18

## Pattern Overview

**Overall:** Plugin-based overlay architecture with dedicated editor scene and hierarchical state management.

**Key Characteristics:**
- Single-responsibility modules: each class manages one concern (state, gizmos, UI, coordinates, selection)
- Event-driven state propagation via EditorState event emitter
- Stateless utility engines for calculations (CoordinateSystem, SnappingEngine)
- Bidirectional sync between gizmos and inspector via per-frame refresh
- Design-space coordinate system decoupled from screen rendering
- HTML DOM-based UI panels alongside Phaser Graphics-based gizmos

## Layers

**Plugin Layer (Entry Point):**
- Purpose: Integrate editor into any Phaser game; manage plugin lifecycle
- Location: `src/PhaserEditorPlugin.ts`
- Contains: Scene plugin that owns toggle, activate/deactivate, property snapshots
- Depends on: EditorScene, SelectionManager (for change diff)
- Used by: Game scenes via Phaser plugin registration
- Responsibilities: toggle via F2 hotkey, pause/resume game scenes, snapshot/restore all object properties, track active plugin instance

**Overlay Scene Layer:**
- Purpose: Manage editor visuals and input in isolation from game logic
- Location: `src/EditorScene.ts`
- Contains: Core systems orchestration, gizmo/selection rendering, input handling, frame management
- Depends on: EditorState, CoordinateSystem, SelectionManager, SnappingEngine, GizmoManager, EditorUI, EditorFrame
- Responsibilities: create/destroy systems, update loop rendering, input event delegation, scene lifecycle
- Visual elements: overlay rectangle (99999 depth), graphics layer (100000), text labels (100001)

**Core Systems Layer:**
- Purpose: State management and coordinate/selection utilities
- Location: `src/core/`
- Components:
  - **EditorState** (`EditorState.ts`): Central event-driven state (selected object, active tool, snapping config, hit area edit mode)
  - **CoordinateSystem** (`CoordinateSystem.ts`): Design ↔ screen coordinate conversions, world position calculations for Containers
  - **SelectionManager** (`SelectionManager.ts`): Hit-testing, object collection, bounding box drawing, smart naming
  - **SnappingEngine** (`SnappingEngine.ts`): Grid and object snapping calculations (stateless), guide rendering

**Gizmo System Layer:**
- Purpose: Interactive manipulation of object properties
- Location: `src/gizmos/`
- Components:
  - **GizmoManager** (`GizmoManager.ts`): Coordinates which gizmo is active based on tool, delegates pointer events, manages drag label
  - **MoveGizmo** (`MoveGizmo.ts`): Free + axis-constrained handles for position, integrates snapping
  - **RotateGizmo** (`RotateGizmo.ts`): Dashed circle handle, 15-degree snap increment
  - **ScaleGizmo** (`ScaleGizmo.ts`): 8 handles (4 corner proportional, 4 edge axis-constrained)
  - **HitAreaGizmo** (`HitAreaGizmo.ts`): Visual editing of Rectangle/Circle/Polygon hit areas with vertex handles
- Responsibilities: hit-test pointer, render handles, perform drag calculations, apply snapping, update display label

**UI Panel Layer:**
- Purpose: HTML-based property inspection and navigation
- Location: `src/ui/`
- Components:
  - **EditorUI** (`EditorUI.ts`): Panel lifecycle management, selection event wiring
  - **InspectorPanel** (`InspectorPanel.ts`): Tweakpane 4.x property editor (Transform, Origin, Display, Info, Hit Area folders) with bidirectional sync
  - **HierarchyPanel** (`HierarchyPanel.ts`): Plain HTML tree of scene objects with expand/collapse, visibility toggle, selection sync
  - **ToolbarPanel** (`ToolbarPanel.ts`): Tool buttons (Select/Move/Rotate/Scale) and snapping controls
  - **EditorFrame** (`EditorFrame.ts`): CSS grid layout positioning canvas and panels, canvas rescale handling
- Responsibilities: render/update panels, handle user input, sync with game objects, restore on destroy

## Data Flow

**Selection Flow:**

```
User click on canvas
  ↓
EditorScene.overlay.pointerdown
  ↓
GizmoManager.handlePointerDown() → hit-test gizmo handles
  ├─ YES: Start gizmo drag (don't select)
  └─ NO: Continue to selection
  ↓
SelectionManager.hitTest(screenX, screenY)
  ↓
EditorState.selected = hit (if any)
  ↓
EditorState.emit('selection-changed')
  ↓
EditorUI.onSelectionChanged()
  └─ InspectorPanel.bind(obj) → create Tweakpane panel
  └─ HierarchyPanel.updateHighlight()
```

**Gizmo Drag Flow:**

```
User drag on gizmo handle
  ↓
EditorScene.overlay.pointermove
  ↓
GizmoManager.handlePointerMove(screenX, screenY)
  ↓
Active Gizmo (Move/Rotate/Scale).updateDrag()
  ├─ Convert screen delta to design delta
  ├─ Apply snapping (grid + object snap)
  ├─ Set object's design position/rotation/scale
  └─ Generate SnapGuide[] for rendering
  ↓
EditorScene.update()
  ├─ EditorUI.refresh() → InspectorPanel.refresh() reads updated values
  └─ SnappingEngine.drawGuides() renders magenta snap lines
```

**Property Change Flow (from Inspector):**

```
User modifies value in Tweakpane panel
  ↓
InspectorPanel binding.onChange callback
  ├─ Sets applying = true (prevent feedback)
  ├─ Applies value to game object (setDesignPosition, setRotation, etc.)
  └─ Sets applying = false
  ↓
EditorScene.update()
  ↓
EditorUI.refresh()
  └─ InspectorPanel.refresh() → skipped if applying=true
      (next frame: reads object values, refreshes pane)
```

**State Management:**

EditorState is the single source of truth. All state changes go through properties that emit events:
- `editorState.selected = obj` → `EVENT_SELECTION_CHANGED` → UI reacts
- `editorState.activeTool = EditorTool.Move` → `EVENT_TOOL_CHANGED` → gizmo changes
- `editorState.snapping.gridSize = 20` → `ToolbarPanel` syncs, `MoveGizmo` uses it
- `editorState.editingHitArea = true` → `EVENT_HIT_AREA_EDIT_CHANGED` → `HierarchyPanel` shows sub-items

## Key Abstractions

**EditorState (Event Bus):**
- Purpose: Central state with reactive properties
- Examples: `src/core/EditorState.ts`
- Pattern: EventEmitter with property getters/setters that emit on change
- Properties: `selected`, `activeTool`, `snapping` (SnappingConfig), `editingHitArea`

**CoordinateSystem (Math Utility):**
- Purpose: Encapsulate design ↔ screen conversion math
- Examples: `src/core/CoordinateSystem.ts`
- Pattern: Stateless utility with pure functions
- Methods: `getScaleFactor()`, `getOffset()`, `designToScreen()`, `screenToDesign()`, `getWorldPosition()`, `setDesignPosition()`
- Key insight: Handles Container children by inverting parent world matrix

**Gizmo (Interactive Handle):**
- Purpose: Provide visual + interactive interface for property editing
- Examples: `src/gizmos/MoveGizmo.ts`, `RotateGizmo.ts`, `ScaleGizmo.ts`
- Pattern: Each gizmo manages its own hit-test, drag state, and rendering
- Responsibilities: draw() called each frame, handlePointerDown/Move/Up for input, isDragging property
- Integration: GizmoManager orchestrates which gizmo is active based on activeTool

**InspectorPanel (Binding):**
- Purpose: Bind game object properties to a visual form (Tweakpane)
- Examples: `src/ui/InspectorPanel.ts`
- Pattern: Maintains params object, syncs to/from game object with refresh()
- Challenge: Bidirectional sync — prevents feedback loops with `applying` flag
- Integration: EditorState.EVENT_SELECTION_CHANGED → bind(obj); per-frame refresh() from EditorScene.update()

**EditorFrame (Layout):**
- Purpose: Position canvas and panels without fighting Phaser's DOM
- Examples: `src/ui/EditorFrame.ts`
- Pattern: Saves original state, creates CSS grid, moves canvas into center cell, restores on destroy
- Responsibility: Notify Phaser via ResizeObserver when grid cell size changes
- Integration: EditorFrame.setStatusText() updates bottom status bar

## Entry Points

**PhaserEditorPlugin (Boot):**
- Location: `src/PhaserEditorPlugin.ts` (lines 80-128)
- Triggers: Scene plugin boot event (fired for every scene)
- Responsibilities:
  - Read plugin config from `game.config.installScenePlugins`
  - Register EditorScene once (module-level flag prevents duplicates)
  - Set up single DOM keydown listener (module-level, not per-scene)
  - Capture active plugin instance (the most recently booted game scene)
  - Listen for scene shutdown/destroy to clean up
- Returns: Plugin instance with hotkey, toggle(), activate(), deactivate() methods

**EditorScene (Create):**
- Location: `src/EditorScene.ts` (lines 64-152)
- Triggers: `game.scene.start('__PhaserEditorScene__')` from plugin.activate()
- Responsibilities:
  - Instantiate all core systems (EditorState, CoordinateSystem, SelectionManager, GizmoManager, EditorUI)
  - Create visual layers (overlay, graphics, text)
  - Create EditorFrame (CSS grid layout)
  - Wire up input handlers (pointerdown/move/up on overlay)
  - Listen for scene shutdown
- Outputs: Running editor with panels visible, ready for user interaction

**EditorScene.update (Each Frame):**
- Location: `src/EditorScene.ts` (lines 157-179)
- Triggers: Phaser main loop every frame
- Responsibilities:
  - Clear graphics layer
  - Draw design bounds, selection box, hit area overlay, gizmos, snap guides
  - Refresh all UI panels (sync inspector/hierarchy with game state)
  - Update coordinate bar

**Input Handlers:**
- Location: `src/EditorScene.ts` (lines 121-143)
- Triggers: Pointer events on overlay rectangle
- Flow:
  1. `pointerdown` → `GizmoManager.handlePointerDown()` (returns true if handle hit) → `SelectionManager.hitTest()` → select
  2. `pointermove` → `GizmoManager.handlePointerMove()`
  3. `pointerup` → `GizmoManager.handlePointerUp()`

## Error Handling

**Strategy:** Defensive coding with early returns and null checks.

**Patterns:**
- Check `!('x' in obj)` before casting to Transform (safer than `instanceof`)
- Return `{ x: 0, y: 0 }` if no parent container instead of throwing
- Skip invisible objects in hit-test: `if ('visible' in obj && !(obj as any).visible) continue;`
- Null-check scene references: `const hostScene = this.getHostScene(); if (!hostScene) return;`
- Try/catch not used; failures cascade gracefully (UI panels stay open, editor remains responsive)

## Cross-Cutting Concerns

**Logging:**
- Approach: `console.log()` for editor lifecycle events (activated, deactivated, selection, errors)
- Notable: Logged on selection: `[Editor] Selected: {name} at design({x}, {y})`
- No external logging framework; output goes to browser console

**Validation:**
- Approach: Implicit validation via type system (TypeScript strict mode)
- No explicit validate() methods; type casting happens with caution (`as unknown as ...` for strict)
- Grid size validated in ToolbarPanel input (1-200 range)
- Object snapping threshold defaults to 8, configurable via SnappingConfig

**Authentication:**
- Not applicable (editor is client-only, no external APIs)

**Design-Space Awareness:**
- All gizmo/snapping math operates in design-space (e.g., 720x1280)
- Only converted to screen-space for rendering and input hit-test conversion
- Plugin restores design-space coordinates on exit (editor changes are temporary)

---

*Architecture analysis: 2026-02-18*
