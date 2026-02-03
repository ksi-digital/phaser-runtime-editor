import Phaser from 'phaser';
import { PhaserEditorPlugin } from '../src/index';
import { DemoScene } from './DemoScene';

const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1280;

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    parent: document.body,
    backgroundColor: '#1a1a2e',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [DemoScene],
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
