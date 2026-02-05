import Phaser from 'phaser';
import { EditorState } from './core/EditorState';
import { CoordinateSystem } from './core/CoordinateSystem';
import { SelectionManager } from './core/SelectionManager';
import { SnappingEngine } from './core/SnappingEngine';
import { GizmoManager } from './gizmos/GizmoManager';
import { EditorUI } from './ui/EditorUI';
import { EditorFrame } from './ui/EditorFrame';

const EDITOR_DEPTH = 100000;

interface EditorSceneData {
    designWidth: number;
    designHeight: number;
    hostSceneKey: string;
    pausedScenes: string[];
    hotkey: string;
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
        );

        // --- Input: gizmo drag + click to select ---
        this.overlay.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            // Gizmo handles intercept first — if hit, start drag instead of selecting
            if (this.gizmoMgr.handlePointerDown(pointer.x, pointer.y)) {
                return;
            }

            const hit = this.selectionMgr.hitTest(pointer.x, pointer.y);
            this.editorState.selected = hit;

            if (hit) {
                const name = SelectionManager.getObjectName(hit);
                const design = this.coordSystem.getDesignPosition(hit, this.getHostScene()!);
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

        console.log(`[EditorScene] Created — design: ${this.designWidth}x${this.designHeight}, host: ${this.hostSceneKey}, objects: ${this.selectionMgr.getSelectableObjects().length}`);
    }

    /**
     * Called every frame. Redraws gizmos and updates coordinate display.
     */
    update(): void {
        this.gfx.clear();
        this.drawDesignBounds();
        this.selectionMgr.drawSelection(this.gfx);
        this.gizmoMgr.draw(this.gfx);

        // Render snap guides during drag
        const hostScene = this.getHostScene();
        if (hostScene) {
            this.snappingEngine.drawGuides(this.gfx, this.gizmoMgr.snapGuides, this.coordSystem, hostScene);
        }

        this.editorUI.refresh();
        this.updateCoordBar();
    }

    /**
     * Update the coordinate bar with current mouse + selection info.
     */
    private updateCoordBar(): void {
        const pointer = this.input.activePointer;
        const hostScene = this.getHostScene();
        if (!hostScene) return;

        const mouseDesign = this.coordSystem.screenToDesign(pointer.x, pointer.y, hostScene);
        let text = `Mouse: design(${Math.round(mouseDesign.x)}, ${Math.round(mouseDesign.y)})  screen(${Math.round(pointer.x)}, ${Math.round(pointer.y)})`;

        const sel = this.editorState.selected;
        if (sel) {
            const design = this.coordSystem.getDesignPosition(sel, hostScene);
            const world = this.coordSystem.getWorldPosition(sel);
            const name = SelectionManager.getObjectName(sel);
            text += `    |    ${name}: design(${Math.round(design.x)}, ${Math.round(design.y)})  screen(${Math.round(world.x)}, ${Math.round(world.y)})`;
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

    private onResize(): void {
        const { width, height } = this.cameras.main;

        if (this.overlay) {
            this.overlay.setPosition(width / 2, height / 2);
            this.overlay.setSize(width, height);
        }
    }

    /**
     * Called when this scene is stopped (editor deactivated).
     */
    private onShutdown(): void {
        this.editorUI?.destroy();
        this.gizmoMgr?.destroy();
        this.editorState?.destroy();
        this.selectionMgr?.destroy();
        this.editorFrame?.destroy();
        this.scale.off('resize', this.onResize, this);
    }
}
