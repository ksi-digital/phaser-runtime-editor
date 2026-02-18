import Phaser from 'phaser';
import { EditorScene } from './EditorScene';
import { SelectionManager } from './core/SelectionManager';

export type ChangeDiff = Record<string, Record<string, { from: number | boolean; to: number | boolean }>>;

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
        // If already active, toggle on the current instance (deactivate).
        // Otherwise, find the topmost active game scene and toggle on its plugin.
        if (activePluginInstance.isActive) {
            activePluginInstance.toggle();
        } else {
            const best = activePluginInstance.findTopmostPluginInstance();
            if (best) {
                best.toggle();
            } else {
                activePluginInstance.toggle();
            }
        }
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
    /** Snapshot of object properties taken on activate, restored on deactivate. */
    private propertySnapshot: Map<Phaser.GameObjects.GameObject, {
        x: number; y: number;
        rotation: number;
        scaleX: number; scaleY: number;
        originX: number; originY: number;
        alpha: number; visible: boolean;
        hitArea?: {
            type: 'rect' | 'circle' | 'polygon';
            rx?: number; ry?: number; rw?: number; rh?: number;
            cx?: number; cy?: number; cr?: number;
            points?: Array<{ x: number; y: number }>;
        };
    }> = new Map();

    private _pluginKey: string;

    constructor(
        scene: Phaser.Scene,
        pluginManager: Phaser.Plugins.PluginManager,
        pluginKey: string
    ) {
        super(scene, pluginManager, pluginKey);

        this._pluginKey = pluginKey;
        this.config = {
            designWidth: 720,
            designHeight: 1280,
            hotkey: 'F2'
        };
    }

    /** Expose hotkey for the DOM listener */
    get hotkey(): string {
        return this.config.hotkey;
    }

    boot(): void {
        // Read plugin config from the game config's plugin registration entry.
        // The `data` field in `plugins.scene[{...data}]` is NOT placed on
        // `systems.settings.data` — it stays on the raw config object.
        //
        // NOTE: Phaser passes the `mapping` value (not `key`) as the pluginKey
        // constructor argument. We must match against both `entry.key` and
        // `entry.mapping` to find the correct config entry.
        const pluginConfigs = (this.game.config as any)?.installScenePlugins;
        if (Array.isArray(pluginConfigs)) {
            for (const entry of pluginConfigs) {
                if ((entry.key === this._pluginKey || entry.mapping === this._pluginKey) && entry.data) {
                    const d = entry.data as EditorPluginConfig;
                    if (d.designWidth != null) this.config.designWidth = d.designWidth;
                    if (d.designHeight != null) this.config.designHeight = d.designHeight;
                    if (d.hotkey != null) this.config.hotkey = d.hotkey;
                    break;
                }
            }
        }

        // Don't let the editor scene's own plugin instance take over
        if (this.scene!.scene.key === EDITOR_SCENE_KEY) return;

        this.registerEditorScene();

        // Track the active plugin instance (the most recently booted game scene)
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
            pausedScenes: Array.from(this.pausedScenes),
            hotkey: this.config.hotkey,
            getChanges: () => this.getChanges(),
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

        // Snapshot all object properties so we can restore on deactivate
        this.snapshotProperties();

        console.log('[PhaserEditor] Activated — game scenes paused');
    }

    deactivate(): void {
        if (!this.editorActive) return;
        this.editorActive = false;

        const game = this.systems!.game;

        game.scene.stop(EDITOR_SCENE_KEY);

        // Restore all object properties to pre-editor state
        this.restoreProperties();

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

    /**
     * Find the plugin instance attached to the topmost active game scene.
     * Used by the F2 handler to ensure the editor uses the correct host scene
     * (not just whichever scene happened to boot last).
     */
    findTopmostPluginInstance(): PhaserEditorPlugin | null {
        const game = this.systems?.game;
        if (!game) return null;

        // getScenes(true) returns active scenes ordered by scene list position
        const activeScenes = game.scene.getScenes(true);
        for (let i = activeScenes.length - 1; i >= 0; i--) {
            const scene = activeScenes[i];
            if (scene.scene.key === EDITOR_SCENE_KEY) continue;
            // Access the plugin instance via the mapping on scene.sys
            const plugin = (scene as any)[this._pluginKey] as PhaserEditorPlugin | undefined;
            if (plugin instanceof PhaserEditorPlugin) {
                return plugin;
            }
        }
        return null;
    }

    private snapshotProperties(): void {
        this.propertySnapshot.clear();
        const game = this.systems!.game;

        for (const key of this.pausedScenes) {
            const scene = game.scene.getScene(key);
            if (!scene) continue;

            for (const obj of scene.children.list) {
                this.snapshotObject(obj);
            }
        }
    }

    private snapshotObject(obj: Phaser.GameObjects.GameObject): void {
        if (!('x' in obj)) return;
        const o = obj as any;

        // Snapshot hit area geometry if present
        let hitAreaSnap: {
            type: 'rect' | 'circle' | 'polygon';
            rx?: number; ry?: number; rw?: number; rh?: number;
            cx?: number; cy?: number; cr?: number;
            points?: Array<{ x: number; y: number }>;
        } | undefined;
        const input = o.input;
        if (input?.hitArea) {
            const ha = input.hitArea;
            if (ha instanceof Phaser.Geom.Rectangle) {
                hitAreaSnap = { type: 'rect', rx: ha.x, ry: ha.y, rw: ha.width, rh: ha.height };
            } else if (ha instanceof Phaser.Geom.Circle) {
                hitAreaSnap = { type: 'circle', cx: ha.x, cy: ha.y, cr: ha.radius };
            } else if (ha instanceof Phaser.Geom.Polygon) {
                hitAreaSnap = { type: 'polygon', points: ha.points.map((p: any) => ({ x: p.x, y: p.y })) };
            }
        }

        this.propertySnapshot.set(obj, {
            x: o.x, y: o.y,
            rotation: o.rotation ?? 0,
            scaleX: o.scaleX ?? 1, scaleY: o.scaleY ?? 1,
            originX: o.originX ?? 0.5, originY: o.originY ?? 0.5,
            alpha: o.alpha ?? 1, visible: o.visible ?? true,
            hitArea: hitAreaSnap,
        });

        // Recurse into Container children
        if (o instanceof Phaser.GameObjects.Container && o.list) {
            for (const child of o.list) {
                this.snapshotObject(child);
            }
        }
    }

    private restoreProperties(): void {
        for (const [obj, snap] of this.propertySnapshot) {
            if (!('x' in obj)) continue;
            const o = obj as any;
            o.x = snap.x;
            o.y = snap.y;
            if ('rotation' in o) o.rotation = snap.rotation;
            if ('scaleX' in o) o.scaleX = snap.scaleX;
            if ('scaleY' in o) o.scaleY = snap.scaleY;
            if ('setOrigin' in o && typeof o.setOrigin === 'function') {
                o.setOrigin(snap.originX, snap.originY);
            }
            if ('alpha' in o) o.alpha = snap.alpha;
            if ('visible' in o) o.visible = snap.visible;

            // Restore hit area geometry
            if (snap.hitArea && o.input?.hitArea) {
                const ha = o.input.hitArea;
                if (snap.hitArea.type === 'rect' && ha instanceof Phaser.Geom.Rectangle) {
                    ha.x = snap.hitArea.rx!;
                    ha.y = snap.hitArea.ry!;
                    ha.width = snap.hitArea.rw!;
                    ha.height = snap.hitArea.rh!;
                } else if (snap.hitArea.type === 'circle' && ha instanceof Phaser.Geom.Circle) {
                    ha.x = snap.hitArea.cx!;
                    ha.y = snap.hitArea.cy!;
                    ha.radius = snap.hitArea.cr!;
                } else if (snap.hitArea.type === 'polygon' && ha instanceof Phaser.Geom.Polygon) {
                    const pts = snap.hitArea.points!;
                    for (let i = 0; i < ha.points.length && i < pts.length; i++) {
                        ha.points[i].x = pts[i].x;
                        ha.points[i].y = pts[i].y;
                    }
                }
            }
        }
        this.propertySnapshot.clear();
    }

    /**
     * Compare current object properties against the snapshot taken on activate.
     * Returns a diff of only the properties that changed.
     */
    getChanges(): ChangeDiff {
        const diff: ChangeDiff = {};
        const round = (v: number) => Math.round(v * 100) / 100;
        const PROPS: Array<{ key: string; isBool?: boolean }> = [
            { key: 'x' }, { key: 'y' },
            { key: 'rotation' },
            { key: 'scaleX' }, { key: 'scaleY' },
            { key: 'originX' }, { key: 'originY' },
            { key: 'alpha' },
            { key: 'visible', isBool: true },
        ];

        for (const [obj, snap] of this.propertySnapshot) {
            if (!('x' in obj)) continue;
            const o = obj as any;
            const name = SelectionManager.getObjectName(obj);
            const changes: Record<string, { from: number | boolean; to: number | boolean }> = {};

            for (const prop of PROPS) {
                const snapVal = (snap as any)[prop.key];
                const curVal = o[prop.key];
                if (prop.isBool) {
                    if (snapVal !== curVal) {
                        changes[prop.key] = { from: snapVal, to: curVal };
                    }
                } else {
                    if (round(snapVal) !== round(curVal)) {
                        changes[prop.key] = { from: round(snapVal), to: round(curVal) };
                    }
                }
            }

            if (Object.keys(changes).length > 0) {
                diff[name] = changes;
            }
        }
        return diff;
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
