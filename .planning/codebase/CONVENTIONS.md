# Coding Conventions

**Analysis Date:** 2026-02-18

## Naming Patterns

**Files:**
- `PascalCase.ts` for classes and main exports: `EditorScene.ts`, `SelectionManager.ts`, `InspectorPanel.ts`
- Index files as barrel exports: `src/index.ts` re-exports all public types and classes
- Lowercase with directories for logical grouping: `src/core/`, `src/gizmos/`, `src/ui/`

**Functions:**
- `camelCase` for all function names and methods
- Prefix with `on` for event handlers: `onSelectionChanged()`, `onSceneShutdown()`, `onCopyChanges()`
- Prefix with `get`/`set` for property accessors: `getSelectableObjects()`, `setDesignPosition()`
- Private methods prefixed with underscore: `_snapGuides`, `_pluginKey`
- Callback naming explicit: `getSelectableObjects`, `getChanges`

**Variables:**
- `camelCase` for all variables: `editorActive`, `dragStartX`, `snappingEngine`
- Constants in UPPERCASE_SNAKE_CASE: `DESIGN_WIDTH`, `EDITOR_DEPTH`, `SELECTION_COLOR`
- Private fields use leading underscore: `_selected`, `_snapping`, `_pluginKey`
- Descriptive prefixes for state tracking: `activeHandle`, `isDragging`, `applying`

**Types:**
- `PascalCase` for all type and interface names: `EditorPluginConfig`, `SnappingConfig`, `SnapGuide`
- Enums in `PascalCase` with `UPPERCASE_SNAKE_CASE` values: `enum EditorTool { Select = 'select', Move = 'move' }`
- Generic type params in `PascalCase`: not used extensively in this codebase

## Code Style

**Formatting:**
- No explicit formatter configured (no `.prettierrc`, no ESLint)
- Consistent 4-space indentation throughout
- Line lengths typically 80–120 characters
- Consistent spacing: `{ }` around object literals, no extra space before `:`
- Constructor parameters on multiple lines when there are 4+ params (see `SelectionManager` constructor)

**Linting:**
- No ESLint or Prettier config present
- TypeScript strict mode enforced via `tsconfig.json`
- Code follows implicit patterns observed across files

## Import Organization

**Order:**
1. Phaser import: `import Phaser from 'phaser'`
2. Internal absolute imports (from `src/`): `import { EditorState } from './core/EditorState'`
3. Type-only imports: `import type { SnapGuide } from './core/SnappingEngine'`

**Example from `src/gizmos/MoveGizmo.ts`:**
```typescript
import Phaser from 'phaser';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { SelectionManager } from '../core/SelectionManager';
import { SnappingEngine, SnapGuide } from '../core/SnappingEngine';
import type { SnappingConfig } from '../core/EditorState';
```

**Path Aliases:**
- No path aliases configured (`tsconfig.json` has `baseUrl: "."` but no `paths` mapping for `@/` or similar)
- Relative imports only: `../core/`, `./EditorState`

## Error Handling

**Patterns:**
- Try-catch for risky operations: `getBounds()` calls wrapped in try-catch (see `SelectionManager.getScreenBounds`)
- Null-coalescing with defaults: `const depth = (obj as any).depth ?? 0`
- Explicit null checks: `if (!scene) continue;`, `if (!bounds) return;`
- Guard clauses early-exit: `if (!selected) return;`
- No custom error classes; relies on TypeScript strict null checks

**Example from `src/core/SelectionManager.ts` (lines 113–118):**
```typescript
if ('getBounds' in obj && typeof (obj as any).getBounds === 'function') {
    try {
        return (obj as any).getBounds() as Phaser.Geom.Rectangle;
    } catch {
        return null;
    }
}
```

## Logging

**Framework:** `console` API only — no logging library

**Patterns:**
- `console.log()` for informational messages: `console.log('[PhaserEditor] Copied ...')`
- Prefixed with `[PhaserEditor]` for clarity (see `ToolbarPanel.onCopyChanges`)
- No structured logging or log levels
- Error logging rare (most errors are silent nil checks)

**Example from `src/ui/ToolbarPanel.ts` (line 246):**
```typescript
console.log(`[PhaserEditor] Copied ${count} changed object(s) to clipboard`);
```

## Comments

**When to Comment:**
- Explain design decisions, not obvious code
- Constant definitions: `const SELECTION_COLOR = 0x4488ff; // blue`
- Complex math: coordinate system transformations documented extensively
- Workarounds: `// Polygon Shape: getBounds() is known to return wrong results for negative vertices`
- Module overview: JSDoc comment at top of each class

**JSDoc/TSDoc:**
- Class-level JSDoc: `/** ... */` block describing responsibility
- Method-level JSDoc: Brief descriptions of parameters, return types, side effects
- Minimal use; TypeScript types provide much of the documentation

**Example from `src/core/CoordinateSystem.ts` (lines 3–14):**
```typescript
/**
 * Handles coordinate conversions between design-space and screen-space.
 *
 * Design-space: the logical coordinate system the game is authored in (e.g. 720x1280).
 * Screen-space: the actual pixel coordinates on the canvas after scale-to-fit.
 *
 * The conversion uses the same math as a typical Phaser Scale.FIT setup:
 *   scaleFactor = min(screenW / designW, screenH / designH)
 *   offsetX = (screenW - designW * sf) / 2
 *   offsetY = (screenH - designH * sf) / 2
 *   screenX = offsetX + designX * sf
 */
```

## Function Design

**Size:**
- Typically 20–80 lines per function
- Single responsibility: `getSelectableObjects()`, `hitTest()`, `drawSelection()`
- Long methods broken into private helpers: `getScreenBounds()` delegates to `getContainerBounds()`, `getPolygonShapeBounds()`

**Parameters:**
- Max 4–5 positional parameters before using a config object or destructuring
- Scene, game, state, coordinates passed through constructor, not as function params
- Callback functions as params: `getSelectableObjects: () => Phaser.GameObjects.GameObject[]`

**Return Values:**
- Explicit types: all functions have return type annotations
- Return objects instead of tuples: `{ point: {...}, guides: [...] }` (see `SnapResult`)
- Null-safe returns: return `null` instead of throwing for "not found" cases

## Module Design

**Exports:**
- Barrel file `src/index.ts` re-exports all public types/classes
- Classes exported by default: `export class EditorScene extends Phaser.Scene { }`
- Interfaces exported by name: `export interface EditorPluginConfig { }`
- Enums exported by name: `export enum EditorTool { }`
- Type aliases exported: `export type ChangeDiff = Record<...>`

**Barrel Files:**
- `src/index.ts` is the only barrel file
- Single entry point for consumers: `import { EditorScene, PhaserEditorPlugin } from 'phaser-runtime-editor'`

**Class Patterns:**
- Constructor injection of dependencies: `constructor(state: EditorState, coords: CoordinateSystem, ...)`
- Public getters for internal state: `get isDragging(): boolean { return this.activeHandle !== DragHandle.None; }`
- Private `_` prefix for mutable fields, public getters for access
- Lifecycle methods: `boot()`, `create()`, `activate()`, `deactivate()`, `destroy()`

**Example from `src/gizmos/MoveGizmo.ts` (constructor lines 62–77):**
```typescript
constructor(coords: CoordinateSystem) {
    this.coords = coords;
}

setSnapping(
    engine: SnappingEngine,
    config: SnappingConfig,
    getSelectableObjects: () => Phaser.GameObjects.GameObject[],
): void {
    this.snappingEngine = engine;
    this.snappingConfig = config;
    this.selectableObjects = getSelectableObjects;
}

get snapGuides(): SnapGuide[] {
    return this._snapGuides;
}
```

## Type Casting

**Strategy:**
- Minimal casting; relies on Phaser's class hierarchy
- Double-cast through `unknown` to satisfy strict mode: `obj as unknown as Transform`
- Type narrowing via `instanceof` preferred over casting

**Example from `src/core/CoordinateSystem.ts` (line 63):**
```typescript
const t = obj as unknown as Phaser.GameObjects.Components.Transform;
```

**Reasoning:** Direct cast `obj as Transform` violates strict mode when `obj` is a generic `GameObject`. The `unknown` intermediate satisfies the type system.

## Async/Await

**Pattern:**
- No async/await in editor code; all operations synchronous
- Promise-based API for clipboard: `navigator.clipboard.writeText(json).then(...).catch(...)`
- No async state management

## Event Patterns

**Phaser EventEmitter:**
- Classes extend `Phaser.Events.EventEmitter` for state changes
- Event names as static string constants: `EditorState.EVENT_SELECTION_CHANGED`
- Listeners: `state.on(EditorState.EVENT_SELECTION_CHANGED, callback, this)`
- Cleanup: `state.off(EditorState.EVENT_SELECTION_CHANGED, callback, this)` in dispose

**Example from `src/core/EditorState.ts` (lines 23–24):**
```typescript
static readonly EVENT_SELECTION_CHANGED = 'selection-changed';
static readonly EVENT_TOOL_CHANGED = 'tool-changed';
```

---

*Convention analysis: 2026-02-18*
