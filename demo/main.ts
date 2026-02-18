import Phaser from 'phaser';
import { PhaserEditorPlugin } from '../src/index';
import { DemoScene } from './DemoScene';
import { MenuScene } from './MenuScene';

const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1280;

// Phaser 4 High-DPI fix
// Without this, canvas renders at CSS pixels (blurry on retina/mobile).
// pixelArt:false is REQUIRED — Phaser auto-enables it when zoom!=1,
// which kills antialiasing and forces nearest-neighbor scaling.
const dpr = window.devicePixelRatio || 1;

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    pixelArt: false,
    antialias: true,
    antialiasGL: true,
    roundPixels: false,
    width: Math.round(window.innerWidth * dpr),
    height: Math.round(window.innerHeight * dpr),
    parent: document.body,
    backgroundColor: '#1a1a2e',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        zoom: 1 / dpr,
    },
    scene: [MenuScene, DemoScene],
    plugins: {
        scene: [
            {
                key: 'PhaserEditor',
                plugin: PhaserEditorPlugin,
                mapping: 'editor',
                start: true,
                data: {
                    designWidth: DESIGN_WIDTH,
                    designHeight: DESIGN_HEIGHT,
                    hotkey: 'F2',
                },
            },
        ],
    },
};

new Phaser.Game(config);
