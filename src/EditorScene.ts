import Phaser from 'phaser';
import { EditorState } from './core/EditorState';
import { CoordinateSystem } from './core/CoordinateSystem';
import { SelectionManager } from './core/SelectionManager';
import { SnappingEngine } from './core/SnappingEngine';
import { GizmoManager } from './gizmos/GizmoManager';
import { EditorUI } from './ui/EditorUI';
import { EditorFrame } from './ui/EditorFrame';
import { captureViewport, type ViewportState } from './core/ViewportState';

const EDITOR_DEPTH = 100000;

interface EditorSceneData {
    designWidth: number;
    designHeight: number;
    hostSceneKey: string;
    pausedScenes: string[];
    hotkey: string;
    getChanges: () => Record<string, Record<string, { from: number | boolean; to: number | boolean }>>;
}

/**
 * Dedicated overlay scene for the editor.
 * Runs in parallel with (paused) game scenes.
 * Owns gizmo rendering, input handling, and the HTML UI layer.
 */
export class EditorScene extends Phaser.Scene {
    private designWidth = 720;
    private designHeight = 1552;
    private hostSceneKey = '';
    private pausedScenes: string[] = [];
    private hotkey = 'F2';
    private getChanges: (() => Record<string, Record<string, { from: number | boolean; to: number | boolean }>>) | null = null;

    /** Graphics object for drawing gizmos, bounding boxes, grid, etc. */
    private gfx!: Phaser.GameObjects.Graphics;

    /** Semi-transparent overlay indicating editor mode */
    private overlay!: Phaser.GameObjects.Rectangle;

    /** Editor frame layout (panels beside canvas) */
    private editorFrame!: EditorFrame;

    /** Core systems */
    editorState!: EditorState;
    coordSystem!: CoordinateSystem;
    selectionMgr!: SelectionManager;
    snappingEngine!: SnappingEngine;
    gizmoMgr!: GizmoManager;
    editorUI!: EditorUI;

    constructor() {
        super({ key: '__PhaserEditorScene__' });
    }

    init(data: EditorSceneData): void {
        this.designWidth = data.designWidth ?? 720;
        this.designHeight = data.designHeight ?? 1552;
        this.hostSceneKey = data.hostSceneKey ?? '';
        this.pausedScenes = data.pausedScenes ?? [];
        this.hotkey = data.hotkey ?? 'F2';
        this.getChanges = data.getChanges ?? null;
    }

    create(): void {
        const { width, height } = this.cameras.main;

        // --- Core systems ---
        this.editorState = new EditorState();
        this.coordSystem = new CoordinateSystem(this.designWidth, this.designHeight);
        this.selectionMgr = new SelectionManager(
            this.editorState,
            this.coordSystem,
            this.game,
            this.pausedScenes,
        );
        this.snappingEngine = new SnappingEngine();
        this.gizmoMgr = new GizmoManager(
            this.editorState,
            this.coordSystem,
            this.game,
            this.hostSceneKey,
            this.selectionMgr,
            this,
            this.snappingEngine,
            () => this.selectionMgr.getSelectableObjects(),
        );

        // --- Visual layers ---

        // Subtle overlay to indicate editor mode (very light dim)
        this.overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.15);
        this.overlay.setDepth(EDITOR_DEPTH - 1);
        this.overlay.setInteractive(); // Captures clicks so they don't reach paused scenes

        // Graphics for gizmos + selection
        this.gfx = this.add.graphics();
        this.gfx.setDepth(EDITOR_DEPTH);

        // Draw the design-space boundary
        this.drawDesignBounds();

        // Create editor frame (moves canvas into grid, panels beside it)
        this.editorFrame = new EditorFrame(this.game);
        this.editorFrame.setStatusText(`EDITOR MODE — Press ${this.hotkey} to exit`);

        this.editorUI = new EditorUI(
            this.editorState,
            this.coordSystem,
            {
                toolbar: this.editorFrame.toolbarSlot,
                hierarchy: this.editorFrame.hierarchySlot,
                inspector: this.editorFrame.inspectorSlot,
            },
            this.getHostScene()!,
            this.game,
            this.pausedScenes,
            this.getChanges,
        );

        // --- Input: gizmo drag + click to select ---
        this.overlay.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // Gizmo handles intercept first — if hit, start drag instead of selecting
            if (this.gizmoMgr.handlePointerDown(pointer.x, pointer.y)) {
                return;
            }

            // Capture a ViewportState for hit-testing with correct screen-space bounds
            const hostScene = this.getHostScene();
            const vp = hostScene
                ? captureViewport(this.designWidth, this.designHeight, hostScene, this)
                : null;

            const hit = vp
                ? this.selectionMgr.hitTest(pointer.x, pointer.y, vp)
                : null;
            this.editorState.selected = hit;

            if (hit && vp) {
                const name = SelectionManager.getObjectName(hit);
                const design = this.coordSystem.getDesignPosition(hit, vp);
                console.log(`[Editor] Selected: ${name} at design(${Math.round(design.x)}, ${Math.round(design.y)})`);
            }
        });

        this.overlay.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            this.gizmoMgr.handlePointerMove(pointer.x, pointer.y);
        });

        this.overlay.on('pointerup', () => {
            this.gizmoMgr.handlePointerUp();
        });

        // Handle resize
        this.scale.on('resize', this.onResize, this);

        // Listen for scene shutdown (when game.scene.stop is called)
        this.events.on('shutdown', this.onShutdown, this);

        // --- DEBUG: Dump viewport + camera state on creation ---
        const hostScene = this.getHostScene();
        if (hostScene) {
            const hostCam = hostScene.cameras.main;
            const edCam = this.cameras.main;
            console.log(`[EditorScene] Created — design: ${this.designWidth}x${this.designHeight}, host: ${this.hostSceneKey}, objects: ${this.selectionMgr.getSelectableObjects().length}`);
            console.log('[EditorScene] HOST camera:', JSON.stringify({
                x: hostCam.x, y: hostCam.y,
                width: hostCam.width, height: hostCam.height,
                scrollX: hostCam.scrollX, scrollY: hostCam.scrollY,
                zoom: hostCam.zoom, zoomX: hostCam.zoomX, zoomY: hostCam.zoomY,
                centerX: hostCam.centerX, centerY: hostCam.centerY,
                originX: (hostCam as any).originX, originY: (hostCam as any).originY,
            }));
            console.log('[EditorScene] EDITOR camera:', JSON.stringify({
                x: edCam.x, y: edCam.y,
                width: edCam.width, height: edCam.height,
                scrollX: edCam.scrollX, scrollY: edCam.scrollY,
                zoom: edCam.zoom,
                centerX: edCam.centerX, centerY: edCam.centerY,
            }));
            const vp = captureViewport(this.designWidth, this.designHeight, hostScene, this);
            console.log('[EditorScene] ViewportState:', JSON.stringify(vp));

            // Test: pick first object and show getBounds + worldToScreen
            const objs = this.selectionMgr.getSelectableObjects();
            for (const obj of objs.slice(0, 3)) {
                const name = SelectionManager.getObjectName(obj);
                const worldPos = { x: (obj as any).x, y: (obj as any).y };
                const screenPos = this.coordSystem.worldToScreen(worldPos.x, worldPos.y, vp);
                let boundsInfo = 'N/A';
                if ('getBounds' in obj && typeof (obj as any).getBounds === 'function') {
                    try {
                        const b = (obj as any).getBounds();
                        const bScreen = this.coordSystem.worldToScreen(b.x, b.y, vp);
                        boundsInfo = `world(${b.x.toFixed(1)},${b.y.toFixed(1)},${b.width.toFixed(1)},${b.height.toFixed(1)}) -> screen(${bScreen.x.toFixed(1)},${bScreen.y.toFixed(1)})`;
                    } catch { boundsInfo = 'ERROR'; }
                }
                console.log(`[EditorScene] Object "${name}": world(${worldPos.x.toFixed(1)},${worldPos.y.toFixed(1)}) -> screen(${screenPos.x.toFixed(1)},${screenPos.y.toFixed(1)}), bounds: ${boundsInfo}`);
            }
        } else {
            console.log(`[EditorScene] Created — design: ${this.designWidth}x${this.designHeight}, host: ${this.hostSceneKey}, objects: ${this.selectionMgr.getSelectableObjects().length}`);
        }
    }

    /**
     * Called every frame. Captures a ViewportState snapshot once and distributes
     * it to all subsystems that need coordinate math.
     */
    update(): void {
        this.gfx.clear();
        this.drawDesignBounds();

        const hostScene = this.getHostScene();

        // Capture one stable ViewportState for the whole frame
        const vp: ViewportState | null = hostScene
            ? captureViewport(this.designWidth, this.designHeight, hostScene, this)
            : null;

        if (vp) {
            this.selectionMgr.drawSelection(this.gfx, vp);
        }

        // Draw hit area overlay on selected object (not in hit area edit mode,
        // since HitAreaGizmo draws its own enhanced version with handles)
        const sel = this.editorState.selected;
        if (sel && (sel as any).input?.hitArea && !this.editorState.editingHitArea) {
            this.drawHitArea(this.gfx, sel, vp ?? undefined);
        }

        this.gizmoMgr.draw(this.gfx, vp);

        // Render snap guides during drag
        if (hostScene && vp) {
            this.snappingEngine.drawGuides(this.gfx, this.gizmoMgr.snapGuides, this.coordSystem, vp);
        }

        this.editorUI.refresh(vp ?? undefined);
        if (vp) {
            this.updateCoordBar(vp);
        }
    }

    /**
     * Update the coordinate bar with current mouse + selection info.
     */
    private updateCoordBar(vp: ViewportState): void {
        const pointer = this.input.activePointer;

        const mouseDesign = this.coordSystem.screenToDesign(pointer.x, pointer.y, vp);
        let text = `Mouse: design(${Math.round(mouseDesign.x)}, ${Math.round(mouseDesign.y)})  screen(${Math.round(pointer.x)}, ${Math.round(pointer.y)})`;

        const sel = this.editorState.selected;
        if (sel) {
            const design = this.coordSystem.getDesignPosition(sel, vp);
            const screen = this.coordSystem.getScreenPosition(sel, vp);
            const name = SelectionManager.getObjectName(sel);
            text += `    |    ${name}: design(${Math.round(design.x)}, ${Math.round(design.y)})  screen(${Math.round(screen.x)}, ${Math.round(screen.y)})`;
        }

        this.editorFrame.setStatusText(text);
    }

    /**
     * Get the host (game) scene reference.
     */
    private getHostScene(): Phaser.Scene | null {
        return this.game.scene.getScene(this.hostSceneKey) ?? null;
    }

    /**
     * Draws the design-space boundary rectangle over the game canvas
     * so you can see the safe area.
     */
    private drawDesignBounds(): void {
        const { width: screenW, height: screenH } = this.cameras.main;
        const sf = Math.min(screenW / this.designWidth, screenH / this.designHeight);
        const offsetX = (screenW - this.designWidth * sf) / 2;
        const offsetY = (screenH - this.designHeight * sf) / 2;

        // Design area boundary — cyan dashed outline
        this.gfx.lineStyle(2, 0x00ffff, 0.6);
        this.gfx.strokeRect(
            offsetX, offsetY,
            this.designWidth * sf, this.designHeight * sf
        );

        // Corner markers
        const markerSize = 12;
        this.gfx.lineStyle(2, 0x00ffff, 0.8);
        const corners = [
            { x: offsetX, y: offsetY },
            { x: offsetX + this.designWidth * sf, y: offsetY },
            { x: offsetX, y: offsetY + this.designHeight * sf },
            { x: offsetX + this.designWidth * sf, y: offsetY + this.designHeight * sf }
        ];
        for (const c of corners) {
            this.gfx.beginPath();
            this.gfx.moveTo(c.x - markerSize, c.y);
            this.gfx.lineTo(c.x + markerSize, c.y);
            this.gfx.strokePath();
            this.gfx.beginPath();
            this.gfx.moveTo(c.x, c.y - markerSize);
            this.gfx.lineTo(c.x, c.y + markerSize);
            this.gfx.strokePath();
        }
    }

    /**
     * Draw the hit area shape for the given object as a yellow overlay.
     *
     * Uses CoordinateSystem.getHitAreaToScreen() which handles displayOrigin
     * offset and world transform matrix correctly for all object types.
     *
     * Exception: Containers define hit area vertices in local/origin-relative
     * space (0,0 = container position), and their displayOriginX is hardcoded
     * to width*0.5 regardless of actual hit area layout. So for Containers we
     * skip the displayOrigin subtraction — handled automatically by getHitAreaToScreen().
     */
    private drawHitArea(gfx: Phaser.GameObjects.Graphics, obj: Phaser.GameObjects.GameObject, vp?: ViewportState): void {
        const input = (obj as any).input;
        if (!input?.hitArea) return;

        const hitArea = input.hitArea;
        const toScreen = this.coordSystem.getHitAreaToScreen(obj, vp);

        const HIT_FILL_COLOR = 0xffff00;
        const HIT_FILL_ALPHA = 0.15;
        const HIT_STROKE_COLOR = 0xffff00;
        const HIT_STROKE_ALPHA = 0.8;
        const HIT_LINE_WIDTH = 2;

        if (hitArea instanceof Phaser.Geom.Rectangle) {
            const r = hitArea as Phaser.Geom.Rectangle;
            const corners = [
                toScreen(r.x, r.y),
                toScreen(r.x + r.width, r.y),
                toScreen(r.x + r.width, r.y + r.height),
                toScreen(r.x, r.y + r.height),
            ];

            gfx.fillStyle(HIT_FILL_COLOR, HIT_FILL_ALPHA);
            gfx.fillPoints(corners as any, true);
            gfx.lineStyle(HIT_LINE_WIDTH, HIT_STROKE_COLOR, HIT_STROKE_ALPHA);
            gfx.strokePoints(corners as any, true);

        } else if (hitArea instanceof Phaser.Geom.Circle) {
            const c = hitArea as Phaser.Geom.Circle;
            const center = toScreen(c.x, c.y);
            const matrix: Phaser.GameObjects.Components.TransformMatrix =
                (obj as any).getWorldTransformMatrix();
            const scaleX = Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b);
            const scaleY = Math.sqrt(matrix.c * matrix.c + matrix.d * matrix.d);
            const screenRadius = c.radius * (scaleX + scaleY) / 2;

            gfx.fillStyle(HIT_FILL_COLOR, HIT_FILL_ALPHA);
            gfx.fillCircle(center.x, center.y, screenRadius);
            gfx.lineStyle(HIT_LINE_WIDTH, HIT_STROKE_COLOR, HIT_STROKE_ALPHA);
            gfx.strokeCircle(center.x, center.y, screenRadius);

        } else if (hitArea instanceof Phaser.Geom.Polygon) {
            const poly = hitArea as Phaser.Geom.Polygon;
            const screenPoints = poly.points.map((p: { x: number; y: number }) =>
                toScreen(p.x, p.y),
            );

            if (screenPoints.length >= 3) {
                gfx.fillStyle(HIT_FILL_COLOR, HIT_FILL_ALPHA);
                gfx.fillPoints(screenPoints as any, true);
                gfx.lineStyle(HIT_LINE_WIDTH, HIT_STROKE_COLOR, HIT_STROKE_ALPHA);
                gfx.strokePoints(screenPoints as any, true);
            }
        }
    }

    private onResize(): void {
        const { width, height } = this.cameras.main;

        if (this.overlay) {
            this.overlay.setPosition(width / 2, height / 2);
            this.overlay.setSize(width, height);
        }
    }

    /**
     * Called when this scene is stopped (editor deactivated).
     * Each cleanup step is guarded so a failure in one doesn't
     * prevent the rest (especially editorFrame) from running.
     */
    private onShutdown(): void {
        const safeDestroy = (fn: () => void) => {
            try { fn(); } catch (e) { console.error('[EditorScene] cleanup error:', e); }
        };

        safeDestroy(() => this.editorUI?.destroy());
        safeDestroy(() => this.gizmoMgr?.destroy());
        safeDestroy(() => this.editorState?.destroy());
        safeDestroy(() => this.selectionMgr?.destroy());
        safeDestroy(() => this.editorFrame?.destroy());
        this.scale.off('resize', this.onResize, this);
    }
}
