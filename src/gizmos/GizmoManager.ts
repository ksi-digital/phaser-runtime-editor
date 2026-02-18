import Phaser from 'phaser';
import { EditorState, EditorTool } from '../core/EditorState';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { SnappingEngine, type SnapGuide } from '../core/SnappingEngine';
import type { SelectionManager } from '../core/SelectionManager';
import { MoveGizmo, DragHandle } from './MoveGizmo';
import { RotateGizmo, RotateHandle } from './RotateGizmo';
import { ScaleGizmo, ScaleHandle } from './ScaleGizmo';
import { HitAreaGizmo, HitAreaHandle } from './HitAreaGizmo';
import { captureViewport, type ViewportState } from '../core/ViewportState';

/**
 * Coordinates which gizmo is active based on the current tool and selection.
 * Receives pointer events from EditorScene and delegates to the active gizmo.
 */
export class GizmoManager {
    private state: EditorState;
    private coords: CoordinateSystem;
    private moveGizmo: MoveGizmo;
    private rotateGizmo: RotateGizmo;
    private scaleGizmo: ScaleGizmo;
    private hitAreaGizmo: HitAreaGizmo;
    private selectionMgr: SelectionManager;
    private hostSceneKey: string;
    private game: Phaser.Game;
    /** Editor overlay scene — used for canvas pixel dimensions in captureViewport(). */
    private editorScene: Phaser.Scene;

    /** Shared text label for displaying angle/scale during drag. */
    private dragLabel: Phaser.GameObjects.Text;

    constructor(
        state: EditorState,
        coords: CoordinateSystem,
        game: Phaser.Game,
        hostSceneKey: string,
        selectionMgr: SelectionManager,
        editorScene: Phaser.Scene,
        snappingEngine?: SnappingEngine,
        getSelectableObjects?: () => Phaser.GameObjects.GameObject[],
    ) {
        this.state = state;
        this.coords = coords;
        this.game = game;
        this.hostSceneKey = hostSceneKey;
        this.selectionMgr = selectionMgr;
        this.editorScene = editorScene;

        this.moveGizmo = new MoveGizmo(coords);
        this.rotateGizmo = new RotateGizmo(coords);
        this.scaleGizmo = new ScaleGizmo(coords);
        this.hitAreaGizmo = new HitAreaGizmo(coords);

        // Shared drag info label
        this.dragLabel = editorScene.add.text(0, 0, '', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#ffaa00',
            backgroundColor: 'rgba(0,0,0,0.7)',
            padding: { x: 4, y: 2 },
        });
        this.dragLabel.setDepth(100001);
        this.dragLabel.setVisible(false);

        // Wire up snapping
        if (snappingEngine && getSelectableObjects) {
            this.moveGizmo.setSnapping(snappingEngine, state.snapping, getSelectableObjects);
        }
        this.rotateGizmo.setSnapping(state.snapping);
    }

    get isDragging(): boolean {
        return this.moveGizmo.isDragging || this.rotateGizmo.isDragging
            || this.scaleGizmo.isDragging || this.hitAreaGizmo.isDragging;
    }

    get snapGuides(): SnapGuide[] {
        return this.moveGizmo.snapGuides;
    }

    /**
     * Draw the active gizmo for the current selection.
     * Called every frame from EditorScene.update().
     * vp is the per-frame ViewportState snapshot (null if no host scene available).
     */
    draw(gfx: Phaser.GameObjects.Graphics, vp: ViewportState | null): void {
        const selected = this.state.selected;
        if (!selected) {
            this.dragLabel.setVisible(false);
            return;
        }

        // Hit area edit mode takes priority over tool gizmos
        if (this.state.editingHitArea && (selected as any).input?.hitArea) {
            this.hitAreaGizmo.draw(gfx, selected, this.selectionMgr, vp);
            this.updateDragLabel();
            return;
        }

        const tool = this.state.activeTool;

        if (vp) {
            if (tool === EditorTool.Move) {
                this.moveGizmo.draw(gfx, selected, this.selectionMgr, vp);
            } else if (tool === EditorTool.Rotate) {
                this.rotateGizmo.draw(gfx, selected, this.selectionMgr, vp);
            } else if (tool === EditorTool.Scale) {
                this.scaleGizmo.draw(gfx, selected, this.selectionMgr, vp);
            }
        }

        this.updateDragLabel();
    }

    /**
     * Handle pointer-down. Returns true if a gizmo handle was hit
     * (meaning the event should NOT propagate to selection logic).
     */
    handlePointerDown(screenX: number, screenY: number): boolean {
        const selected = this.state.selected;
        if (!selected) return false;

        const hostScene = this.game.scene.getScene(this.hostSceneKey);
        if (!hostScene) return false;

        // Capture a stable ViewportState snapshot for this drag operation
        const vp = captureViewport(
            this.coords.designWidth,
            this.coords.designHeight,
            hostScene,
            this.editorScene,
        );

        // Hit area edit mode — test hit area gizmo first
        if (this.state.editingHitArea && (selected as any).input?.hitArea) {
            const handle = this.hitAreaGizmo.hitTest(screenX, screenY);
            if (handle !== HitAreaHandle.None) {
                this.hitAreaGizmo.startDrag(handle, screenX, screenY, selected, vp);
                return true;
            }
            // Click outside hit area handles → exit hit area edit mode
            this.state.editingHitArea = false;
            return false;
        }

        const tool = this.state.activeTool;

        if (tool === EditorTool.Move) {
            const handle = this.moveGizmo.hitTest(screenX, screenY);
            if (handle !== DragHandle.None) {
                this.moveGizmo.startDrag(handle, screenX, screenY, selected, vp);
                return true;
            }
        } else if (tool === EditorTool.Rotate) {
            const handle = this.rotateGizmo.hitTest(screenX, screenY);
            if (handle !== RotateHandle.None) {
                this.rotateGizmo.startDrag(handle, screenX, screenY, selected, vp);
                return true;
            }
        } else if (tool === EditorTool.Scale) {
            const handle = this.scaleGizmo.hitTest(screenX, screenY);
            if (handle !== ScaleHandle.None) {
                this.scaleGizmo.startDrag(handle, screenX, screenY, selected, vp);
                return true;
            }
        }

        return false;
    }

    /**
     * Handle pointer-move during drag.
     */
    handlePointerMove(screenX: number, screenY: number): void {
        if (this.hitAreaGizmo.isDragging) {
            this.hitAreaGizmo.updateDrag(screenX, screenY);
        } else if (this.moveGizmo.isDragging) {
            this.moveGizmo.updateDrag(screenX, screenY);
        } else if (this.rotateGizmo.isDragging) {
            this.rotateGizmo.updateDrag(screenX, screenY);
        } else if (this.scaleGizmo.isDragging) {
            this.scaleGizmo.updateDrag(screenX, screenY);
        }
    }

    /**
     * Handle pointer-up to end drag.
     */
    handlePointerUp(): void {
        if (this.hitAreaGizmo.isDragging) this.hitAreaGizmo.endDrag();
        if (this.moveGizmo.isDragging) this.moveGizmo.endDrag();
        if (this.rotateGizmo.isDragging) this.rotateGizmo.endDrag();
        if (this.scaleGizmo.isDragging) this.scaleGizmo.endDrag();
        this.dragLabel.setVisible(false);
    }

    destroy(): void {
        this.moveGizmo.destroy();
        this.rotateGizmo.destroy();
        this.scaleGizmo.destroy();
        this.hitAreaGizmo.destroy();
        if (this.dragLabel) this.dragLabel.destroy();
    }

    // ── Private helpers ──────────────────────────────────────────────

    private updateDragLabel(): void {
        let info: { text: string; x: number; y: number } | null = null;

        if (this.hitAreaGizmo.isDragging) {
            info = this.hitAreaGizmo.getLabel();
        } else if (this.rotateGizmo.isDragging) {
            info = this.rotateGizmo.getLabel();
        } else if (this.scaleGizmo.isDragging) {
            info = this.scaleGizmo.getLabel();
        }

        if (info) {
            this.dragLabel.setText(info.text);
            this.dragLabel.setPosition(info.x, info.y);
            this.dragLabel.setVisible(true);
        } else {
            this.dragLabel.setVisible(false);
        }
    }
}
