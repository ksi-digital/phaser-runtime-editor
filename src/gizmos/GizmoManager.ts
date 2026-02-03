import Phaser from 'phaser';
import { EditorState, EditorTool } from '../core/EditorState';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { MoveGizmo, DragHandle } from './MoveGizmo';

/**
 * Coordinates which gizmo is active based on the current tool and selection.
 * Receives pointer events from EditorScene and delegates to the active gizmo.
 */
export class GizmoManager {
    private state: EditorState;
    private moveGizmo: MoveGizmo;
    private hostSceneKey: string;
    private game: Phaser.Game;

    constructor(
        state: EditorState,
        coords: CoordinateSystem,
        game: Phaser.Game,
        hostSceneKey: string,
    ) {
        this.state = state;
        this.game = game;
        this.hostSceneKey = hostSceneKey;
        this.moveGizmo = new MoveGizmo(coords);
    }

    get isDragging(): boolean {
        return this.moveGizmo.isDragging;
    }

    /**
     * Draw the active gizmo for the current selection.
     * Called every frame from EditorScene.update().
     */
    draw(gfx: Phaser.GameObjects.Graphics): void {
        const selected = this.state.selected;
        if (!selected) return;

        const tool = this.state.activeTool;
        if (tool === EditorTool.Move || tool === EditorTool.Select) {
            this.moveGizmo.draw(gfx, selected);
        }
    }

    /**
     * Handle pointer-down. Returns true if a gizmo handle was hit
     * (meaning the event should NOT propagate to selection logic).
     */
    handlePointerDown(screenX: number, screenY: number): boolean {
        const selected = this.state.selected;
        if (!selected) return false;

        const tool = this.state.activeTool;
        if (tool !== EditorTool.Move && tool !== EditorTool.Select) return false;

        const handle = this.moveGizmo.hitTest(screenX, screenY);
        if (handle === DragHandle.None) return false;

        const hostScene = this.game.scene.getScene(this.hostSceneKey);
        if (!hostScene) return false;

        this.moveGizmo.startDrag(handle, screenX, screenY, selected, hostScene);
        return true;
    }

    /**
     * Handle pointer-move during drag.
     */
    handlePointerMove(screenX: number, screenY: number): void {
        if (!this.moveGizmo.isDragging) return;
        this.moveGizmo.updateDrag(screenX, screenY);
    }

    /**
     * Handle pointer-up to end drag.
     */
    handlePointerUp(): void {
        if (!this.moveGizmo.isDragging) return;
        this.moveGizmo.endDrag();
    }

    destroy(): void {
        this.moveGizmo.destroy();
    }
}
