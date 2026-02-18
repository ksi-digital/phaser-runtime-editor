# External Integrations

**Analysis Date:** 2026-02-18

## APIs & External Services

**None detected.** The editor is a self-contained plugin with no external API calls.

## Data Storage

**Databases:**
- Not applicable - editor is a runtime plugin with no persistent storage

**File Storage:**
- Local filesystem only
- Demo and export functionality uses browser File API (future Phase 8)
- No cloud storage integration

**Caching:**
- Not implemented - all state held in memory during editor session

## Authentication & Identity

**Auth Provider:**
- Not applicable - plugin requires no authentication
- Game host handles all authentication concerns

## Monitoring & Observability

**Error Tracking:**
- None - plugin has no external error reporting
- Errors propagate to host game's error handling

**Logs:**
- Console only
- Debug via browser DevTools

## CI/CD & Deployment

**Hosting:**
- npm package registry (npmjs.com)
- GitHub repository for source (github.com/ksi-digital/phaser-runtime-editor)

**CI Pipeline:**
- Not detected in codebase
- GitHub Actions likely used (common for npm packages) but not configured in repo

**Package Publishing:**
- npm prepublishOnly script: `npm run build` (required before publish)
- Manual publish via `npm publish`
- GitHub releases (likely, but not configured)

## Environment Configuration

**Required env vars:**
- None - plugin is configured via JavaScript object in game config

**Runtime configuration (passed via plugin data):**
```javascript
{
    designWidth: 720,      // Design-space width in pixels
    designHeight: 1280,    // Design-space height in pixels
    hotkey: 'F2'          // Toggle hotkey (keyboard event key)
}
```

**Secrets location:**
- Not applicable - plugin has no secrets
- Host game manages all credentials outside this plugin

## Webhooks & Callbacks

**Incoming:**
- None - plugin receives no webhooks

**Outgoing:**
- None - plugin makes no webhook calls
- Host game can listen to Phaser events for editor state changes

## Integration with Host Game

**Plugin Registration:**
```javascript
// In host game's Phaser config
{
    plugins: {
        scene: [
            {
                key: 'PhaserEditor',
                plugin: PhaserEditorPlugin,
                mapping: 'editor',
                start: import.meta.env.DEV,  // Optional: start only in dev
                data: {
                    designWidth: 720,
                    designHeight: 1280,
                    hotkey: 'F2'
                }
            }
        ]
    }
}
```

**Accessing editor in game code:**
```typescript
// In any scene
const editor = this.editor;  // Mapped as 'editor' per mapping field
editor.toggle();             // Toggle editor on/off
editor.activate();           // Show editor (pause game)
editor.deactivate();         // Hide editor (resume game)
```

**Events:**
- EditorState emits: `'selection-changed'`, `'tool-changed'`
- Phaser Scene events: `'shutdown'`, `'destroy'`
- No custom webhooks or callbacks

## Demo Game Integration

**Test setup:**
```
e:/Code/phaser-runtime-editor/      ← editor plugin (npm link)
e:/Code/mahjong_phaser/             ← test game (npm link phaser-runtime-editor)
```

**Build flow:**
1. `npx vite build` in editor package → generates `dist/`
2. Mahjong game imports: `import { PhaserEditorPlugin } from 'phaser-runtime-editor'`
3. Vite HMR picks up changes in linked package

**Demo scene configuration:**
- Design dimensions: 720x1280 (matches plugin config)
- Demo objects in `demo/DemoScene.ts` with:
  - Image sprites with hit areas (Rectangle, Circle, Polygon)
  - Containers with nested children
  - Text objects with properties
  - Procedurally generated textures (no external asset files)

## Type System & Exports

**Public API (`src/index.ts`):**
- Exports 13 classes and 2 enums for host games to use
- Types exported: `EditorPluginConfig`, `ChangeDiff`, `EditorUISlots`, `SnappingConfig`, `SnapGuide`
- All types available for strict TypeScript compilation in host game

## No External Dependencies For:

- HTTP/REST APIs - Editor is local only
- WebSocket connections - No real-time sync
- State management (Redux, Zustand, etc.) - Uses Phaser EventEmitter
- Router/navigation - Not applicable to game editor
- Form validation - Only numeric and boolean Tweakpane inputs
- Testing frameworks - No tests in published package
- Linting/formatting tools - Development only

---

*Integration audit: 2026-02-18*
