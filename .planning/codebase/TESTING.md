# Testing

**Analysis Date:** 2026-02-18

## Test Framework

**No formal test framework configured.** The project does not use Jest, Vitest, Mocha, or any other test runner. There are no test scripts defined in `package.json`.

## Current Testing Strategy

### Manual Testing via Demo Game

The primary testing approach is **manual visual testing** through the demo game:

- **Location:** `demo/` directory
- **Command:** `npm.cmd run demo` → serves at `http://localhost:5199/`
- **Demo scene:** `demo/DemoScene.ts` — a playable mini-platformer with procedurally generated textures
- **Test flow:** Run demo → press F2 to toggle editor → visually verify features

The demo game exercises the editor with diverse object types:
- Images with various hit areas (Rectangle, Circle, Polygon)
- Containers with nested children (player, health bar, settings button)
- Text objects (HUD score/level)
- Objects with tweens (clouds)
- Objects at various depths (background through HUD)

### Secondary Testing via Mahjong Game

A separate mahjong game (`e:\Code\mahjong_phaser\`) is used as a real-world integration test:
- This package is npm-linked into the mahjong project
- Build this package → Vite HMR picks up changes in mahjong project
- Tests the editor against a full production game with complex depth hierarchies (tiles at depth 10000-30000)

## Test Coverage

No automated test coverage. All verification is manual:

| Feature | How Tested |
|---------|-----------|
| Plugin toggle (F2) | Manual: press F2, verify pause/resume |
| Object selection | Manual: click objects in canvas or hierarchy |
| Move gizmo | Manual: drag handles, verify coordinate changes |
| Inspector panel | Manual: edit values, verify bidirectional sync |
| Hierarchy panel | Manual: expand containers, toggle visibility |
| Snapping | Manual: enable grid/object snap, drag objects |
| Property restore | Manual: move objects in editor, exit editor, verify positions restored |
| Coordinate system | Manual: resize browser, verify design-space coords stay consistent |

## Recommendations

1. **Unit tests for pure functions:** `CoordinateSystem` and `SnappingEngine` have stateless, pure functions ideal for unit testing
2. **Vitest** would be the natural choice given the Vite-based build system
3. **No Phaser mocking needed** for coordinate math and snapping logic — they operate on numbers only
