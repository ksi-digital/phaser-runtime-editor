# @gamotions/phaser-runtime-editor

A Phaser 4 scene plugin that injects a runtime visual editor into any game. Press a hotkey to pause the game, drag objects to reposition them, inspect and edit properties, snap to grids, and read back design-space coordinates for your code.

![Phaser 4.x](https://img.shields.io/badge/phaser-4.x-blue)
![MIT License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Move, rotate, and scale gizmos** — axis-constrained or free transform
- **Inspector panel** — edit transform, origin, display properties in real-time
- **Hierarchy panel** — scene tree with expand/collapse for Containers, visibility toggle
- **Snapping** — grid snap and object-center snap with visual guide lines
- **Hit area visualization** — see Rectangle, Circle, and Polygon hit areas on selected objects
- **Design-space coordinates** — all values shown in your authored coordinate space, independent of screen size
- **Non-destructive** — all changes reset when you exit the editor; use it to measure and copy coordinates

## Install

```bash
npm install @gamotions/phaser-runtime-editor
```

## Setup

Register the plugin in your Phaser game config:

```js
import { PhaserEditorPlugin } from '@gamotions/phaser-runtime-editor';

const config = {
    // ... your game config
    width: 720,
    height: 1280,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    plugins: {
        scene: [
            {
                key: 'PhaserEditor',
                plugin: PhaserEditorPlugin,
                mapping: 'editor',
                start: true,
                data: {
                    designWidth: 720,   // your design width
                    designHeight: 1280, // your design height
                    hotkey: 'F2',       // key to toggle editor (default: 'F2')
                },
            },
        ],
    },
};

new Phaser.Game(config);
```

## Usage

1. Run your game
2. Press **F2** (or your configured hotkey) to open the editor
3. Click objects on the canvas to select them
4. Use the toolbar to switch tools: **Select**, **Move**, **Rotate**, **Scale**
5. Edit properties in the inspector panel on the right
6. Browse the scene tree in the hierarchy panel on the left
7. Read design-space coordinates from the coordinate bar or inspector
8. Press **F2** again to close the editor — all objects return to their original state

### Plugin options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `designWidth` | `number` | `720` | Logical width your game is designed for |
| `designHeight` | `number` | `1280` | Logical height your game is designed for |
| `hotkey` | `string` | `'F2'` | Keyboard key to toggle the editor (uses `KeyboardEvent.key` values) |

### Snapping

Enable snapping from the toolbar:

- **Grid snap** — snaps to a configurable grid size (in design-space units)
- **Object snap** — snaps to the center of nearby objects, with magenta guide lines

### Dev-only usage

To include the editor only in development builds:

```js
{
    key: 'PhaserEditor',
    plugin: PhaserEditorPlugin,
    mapping: 'editor',
    start: import.meta.env.DEV,  // Vite
    // start: process.env.NODE_ENV !== 'production',  // Webpack
    data: { designWidth: 720, designHeight: 1280 },
}
```

When `start` is `false`, the plugin is registered but never boots, so no editor code runs in production.

## How it works

The editor launches a dedicated Phaser Scene (`__PhaserEditorScene__`) on top of your game. Your game scenes are paused while the editor is open. A CSS grid layout wraps the canvas with HTML panels (hierarchy, inspector, toolbar) while gizmos are drawn via Phaser's Graphics API for pixel-precise alignment.

All coordinates are computed in **design-space** — the logical coordinate system your game is authored in. This means the values you read in the editor work at any screen size, since the editor accounts for `Scale.FIT` scaling and letterboxing offsets.

When you exit the editor, every object's position, rotation, scale, origin, alpha, and visibility are restored to their pre-editor values.

## Compatibility

- **Phaser 4.x** (developed and tested against 4.0.0-rc.6+)
- Phaser 3 is **not currently supported** — the plugin uses Phaser 4 internals for config reading
- Works with `Scale.FIT` and `CENTER_BOTH` (other scale modes untested)
- ES module and CommonJS builds included

## License

[MIT](LICENSE)
