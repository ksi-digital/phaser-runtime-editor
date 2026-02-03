import Phaser from 'phaser';
import { EditorScene } from './EditorScene';

export interface EditorPluginConfig {
    /** Base design width (default: 720) */
    designWidth?: number;
    /** Base design height (default: 1552) */
    designHeight?: number;
    /** Hotkey to toggle editor (default: 'F1') */
    hotkey?: string;
}

const EDITOR_SCENE_KEY = '__PhaserEditorScene__';

/** Module-level flag so only the first plugin instance registers the editor scene */
let editorSceneRegistered = false;

/** The single active plugin instance that owns the toggle (last scene to boot) */
let activePluginInstance: PhaserEditorPlugin | null = null;

/** Single DOM keydown listener registered once */
let domListenerRegistered = false;

function onDomKeyDown(e: KeyboardEvent): void {
    if (!activePluginInstance) return;
    if (e.key === activePluginInstance.hotkey) {
        e.preventDefault();
        activePluginInstance.toggle();
    }
}

/**
 * Phaser Scene Plugin that provides a runtime visual editor.
 * Press hotkey (default F1) to toggle the editor overlay.
 */
export class PhaserEditorPlugin extends Phaser.Plugins.ScenePlugin {
    private config: Required<EditorPluginConfig>;
    private editorActive = false;
    private pausedScenes: Set<string> = new Set();

    constructor(
        scene: Phaser.Scene,
        pluginManager: Phaser.Plugins.PluginManager,
        pluginKey: string
    ) {
        super(scene, pluginManager, pluginKey);

        this.config = {
            designWidth: 720,
            designHeight: 1552,
            hotkey: 'F2'
        };
    }

    /** Expose hotkey for the DOM listener */
    get hotkey(): string {
        return this.config.hotkey;
    }

    boot(): void {
        const data = this.systems?.settings?.data as EditorPluginConfig | undefined;
        if (data) {
            if (data.designWidth != null) this.config.designWidth = data.designWidth;
            if (data.designHeight != null) this.config.designHeight = data.designHeight;
            if (data.hotkey != null) this.config.hotkey = data.hotkey;
        }

        this.registerEditorScene();

        // Track the active plugin instance (the most recently booted scene)
        activePluginInstance = this;

        // Register a single DOM keydown listener (once, module-level)
        if (!domListenerRegistered) {
            window.addEventListener('keydown', onDomKeyDown);
            domListenerRegistered = true;
        }

        const events = this.systems!.events;
        events.on('shutdown', this.onSceneShutdown, this);
        events.on('destroy', this.onSceneDestroy, this);
    }

    private registerEditorScene(): void {
        if (editorSceneRegistered) return;

        const game = this.systems!.game;
        if (!game.scene.getScene(EDITOR_SCENE_KEY)) {
            game.scene.add(EDITOR_SCENE_KEY, EditorScene, false, {
                designWidth: this.config.designWidth,
                designHeight: this.config.designHeight,
                hostSceneKey: this.scene!.scene.key
            });
        }
        editorSceneRegistered = true;
    }

    toggle(): void {
        if (this.editorActive) {
            this.deactivate();
        } else {
            this.activate();
        }
    }

    activate(): void {
        if (this.editorActive) return;
        this.editorActive = true;

        const game = this.systems!.game;
        const hostKey = this.scene!.scene.key;

        // Collect scenes to pause
        const activeScenes = game.scene.getScenes(true);
        this.pausedScenes.clear();
        for (const scene of activeScenes) {
            const key = scene.scene.key;
            if (key === EDITOR_SCENE_KEY) continue;
            this.pausedScenes.add(key);
        }

        // Start editor scene via SceneManager (not ScenePlugin.launch,
        // which is unreliable when the host scene is about to be paused)
        game.scene.start(EDITOR_SCENE_KEY, {
            designWidth: this.config.designWidth,
            designHeight: this.config.designHeight,
            hostSceneKey: hostKey,
            pausedScenes: Array.from(this.pausedScenes)
        });

        // Now pause all game scenes
        for (const key of this.pausedScenes) {
            const scene = game.scene.getScene(key);
            if (!scene) continue;

            scene.scene.pause();
            scene.tweens?.pauseAll();
            if (scene.time) {
                (scene.time as any).paused = true;
            }
        }

        game.scene.bringToTop(EDITOR_SCENE_KEY);

        console.log('[PhaserEditor] Activated — game scenes paused');
    }

    deactivate(): void {
        if (!this.editorActive) return;
        this.editorActive = false;

        const game = this.systems!.game;

        game.scene.stop(EDITOR_SCENE_KEY);

        for (const key of this.pausedScenes) {
            const scene = game.scene.getScene(key);
            if (!scene) continue;

            scene.tweens?.resumeAll();
            if (scene.time) {
                (scene.time as any).paused = false;
            }
            scene.scene.resume();
        }
        this.pausedScenes.clear();

        console.log('[PhaserEditor] Deactivated — game scenes resumed');
    }

    get isActive(): boolean {
        return this.editorActive;
    }

    private onSceneShutdown(): void {
        if (this.editorActive) {
            this.deactivate();
        }
    }

    private onSceneDestroy(): void {
        this.onSceneShutdown();
        if (activePluginInstance === this) {
            activePluginInstance = null;
        }
    }

    destroy(): void {
        this.onSceneDestroy();
        super.destroy();
    }
}
