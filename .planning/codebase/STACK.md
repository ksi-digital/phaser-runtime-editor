# Technology Stack

**Analysis Date:** 2026-02-18

## Languages

**Primary:**
- TypeScript 5.7.0 - Entire codebase (src/)
- JavaScript - Demo and build tooling

**DOM/Client:**
- HTML5 - Demo entry point
- CSS3 - Editor panels and EditorFrame layout

## Runtime

**Environment:**
- Node.js (ES2020+ target support required)

**Package Manager:**
- npm (modern version supporting workspaces)
- Lockfile: Yes (package-lock.json present)

## Frameworks

**Core:**
- Phaser 4.0.0-rc.6 - Game engine (peerDependencies: ^4.0.0, compatible with ^3.60.0)
  - Scene Plugin architecture for editor integration
  - Graphics API for gizmo rendering
  - Input system for pointer/keyboard handling
  - Scale manager for viewport management
  - EventEmitter for state propagation

**UI/Inspector:**
- Tweakpane 4.0.0 - Property editor panel (InspectorPanel)
  - Bidirectional data binding for Transform, Origin, Display, Info folders
  - Dynamic folder creation and destruction
  - FolderApi from @tweakpane/core for type inheritance

**Build/Dev:**
- Vite 7.3.1 - Module bundler and dev server
  - Library mode for npm package (ESM + CJS)
  - vite-plugin-dts for TypeScript declaration rollup
  - HMR for demo development

## Key Dependencies

**Production:**
- tweakpane 4.0.0 - Property panel UI with data binding
  - Bundled into dist output (~87 kB added to bundle)
  - Required for InspectorPanel widget rendering
  - Used in `src/ui/InspectorPanel.ts` for Transform, Origin, Display, Info folder management

- @tweakpane/core 2.0.5 - Tweakpane core types
  - Provides FolderApi type for Pane inheritance
  - Required for TypeScript type resolution in strict mode

**Development:**
- phaser 4.0.0-rc.6 - Game engine (devDependency)
  - Phaser.Plugins.ScenePlugin base class for PhaserEditorPlugin
  - Phaser game objects and Graphics for rendering

- vite-plugin-dts 4.5.0 - TypeScript declaration generation
  - rollupTypes: true consolidates all .d.ts into single index.d.ts
  - Generates source maps for declarations

## Configuration

**Environment:**
- No .env file required - plugin data passed via game config
- Plugin receives configuration at registration time:
  - `designWidth` - Design-space width (default: 720)
  - `designHeight` - Design-space height (default: 1280)
  - `hotkey` - Toggle hotkey (default: 'F2')

**Build:**
- `tsconfig.json` - ES2020 target, strict mode, bundler resolution
  - Rollup-compatible moduleResolution
  - Generates sourcemaps and declarations
  - Includes DOM, DOM.Iterable libs for HTMLElement types

- `vite.config.ts` - Library build configuration
  - Externalizes Phaser (consumers provide their own)
  - Bundles Tweakpane into dist (dev tool, not externalized)
  - Outputs: index.js (ESM), index.cjs (CommonJS), index.d.ts (types)
  - Source maps enabled

- `vite.demo.config.ts` - Demo dev server
  - Port 5199
  - Root: demo/
  - Auto-open on serve

## Platform Requirements

**Development:**
- Node.js with npm
- TypeScript 5.7.0+ (strict mode)
- ES2020 feature support

**Production:**
- Phaser game built with Phaser 3.60.0+ or Phaser 4.0.0+
- Modern browser supporting ES2020 (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+)
- Canvas support (already required by Phaser)

## Build Output

```
dist/
├── index.js         (~216 kB, ES module, bundled Tweakpane)
├── index.cjs        (~171 kB, CommonJS, bundled Tweakpane)
├── index.d.ts       (Rolled-up TypeScript declarations)
└── *.map            (Source maps for JS files)
```

**Bundle composition:**
- Editor code: ~25 kB
- Tweakpane (bundled): ~87 kB
- Other deps: ~30 kB

## Package Publishing

**NPM:**
- Package: @gamotions/phaser-runtime-editor
- Registry: npmjs.com (default)
- Entry points:
  - ESM: `dist/index.js`
  - CJS: `dist/index.cjs`
  - Types: `dist/index.d.ts`
- Export field ordering: types, import, require (esbuild compatible)
- Files field: Only `dist/`, `src/`, `LICENSE`, `README.md` published
  - Excludes demo/ and dev configs from npm package

---

*Stack analysis: 2026-02-18*
