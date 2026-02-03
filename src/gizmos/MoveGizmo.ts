import Phaser from 'phaser';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { SnappingEngine, SnapGuide } from '../core/SnappingEngine';
import type { SnappingConfig } from '../core/EditorState';

export enum DragHandle {
    None = 'none',
    Center = 'center',
    AxisX = 'axis-x',
    AxisY = 'axis-y',
}

const CENTER_RADIUS = 8;
const ARROW_LENGTH = 40;
const ARROW_HEAD_SIZE = 10;
const HANDLE_HIT_RADIUS = 12;

const COLOR_X = 0xff4444;    // red
const COLOR_Y = 0x44cc44;    // green
const COLOR_CENTER = 0x44cc44; // green

/**
 * Move gizmo with three handles:
 *  - Center circle (free move)
 *  - X-axis arrow (constrained horizontal)
 *  - Y-axis arrow (constrained vertical)
 *
 * All rendering is done via a shared Graphics object.
 * Drag logic converts screen-space deltas to design-space movement.
 */
export class MoveGizmo {
    private coords: CoordinateSystem;
    private snappingEngine: SnappingEngine | null = null;
    private snappingConfig: SnappingConfig | null = null;
    private selectableObjects: (() => Phaser.GameObjects.GameObject[]) | null = null;

    /** Screen-space position of the gizmo center (updated each frame). */
    private cx = 0;
    private cy = 0;

    /** Which handle is currently being dragged. */
    private activeHandle: DragHandle = DragHandle.None;

    /** Screen-space pointer position at drag start. */
    private dragStartX = 0;
    private dragStartY = 0;

    /** Object's design-space position at drag start. */
    private objStartDesignX = 0;
    private objStartDesignY = 0;

    /** The object currently being manipulated. */
    private target: Phaser.GameObjects.GameObject | null = null;

    /** The host scene (game scene) for coordinate conversions. */
    private hostScene: Phaser.Scene | null = null;

    /** Snap guides produced during the last drag update. */
    private _snapGuides: SnapGuide[] = [];

    constructor(coords: CoordinateSystem) {
        this.coords = coords;
    }

    /**
     * Configure snapping support. Called once during setup.
     */
    setSnapping(
        engine: SnappingEngine,
        config: SnappingConfig,
        getSelectableObjects: () => Phaser.GameObjects.GameObject[],
    ): void {
        this.snappingEngine = engine;
        this.snappingConfig = config;
        this.selectableObjects = getSelectableObjects;
    }

    get snapGuides(): SnapGuide[] {
        return this._snapGuides;
    }

    get isDragging(): boolean {
        return this.activeHandle !== DragHandle.None;
    }

    get dragTarget(): Phaser.GameObjects.GameObject | null {
        return this.target;
    }

    /**
     * Draw the move gizmo handles at the given object's screen position.
     */
    draw(gfx: Phaser.GameObjects.Graphics, obj: Phaser.GameObjects.GameObject): void {
        const world = this.coords.getWorldPosition(obj);
        this.cx = world.x;
        this.cy = world.y;

        // --- X axis arrow (red, pointing right) ---
        gfx.lineStyle(2, COLOR_X, 0.9);
        gfx.beginPath();
        gfx.moveTo(this.cx, this.cy);
        gfx.lineTo(this.cx + ARROW_LENGTH, this.cy);
        gfx.strokePath();
        // Arrowhead
        gfx.fillStyle(COLOR_X, 0.9);
        gfx.fillTriangle(
            this.cx + ARROW_LENGTH + ARROW_HEAD_SIZE, this.cy,
            this.cx + ARROW_LENGTH, this.cy - ARROW_HEAD_SIZE / 2,
            this.cx + ARROW_LENGTH, this.cy + ARROW_HEAD_SIZE / 2,
        );

        // --- Y axis arrow (green, pointing down) ---
        gfx.lineStyle(2, COLOR_Y, 0.9);
        gfx.beginPath();
        gfx.moveTo(this.cx, this.cy);
        gfx.lineTo(this.cx, this.cy + ARROW_LENGTH);
        gfx.strokePath();
        // Arrowhead
        gfx.fillStyle(COLOR_Y, 0.9);
        gfx.fillTriangle(
            this.cx, this.cy + ARROW_LENGTH + ARROW_HEAD_SIZE,
            this.cx - ARROW_HEAD_SIZE / 2, this.cy + ARROW_LENGTH,
            this.cx + ARROW_HEAD_SIZE / 2, this.cy + ARROW_LENGTH,
        );

        // --- Center handle (green circle, drawn last so it's on top) ---
        gfx.fillStyle(COLOR_CENTER, 0.9);
        gfx.fillCircle(this.cx, this.cy, CENTER_RADIUS);
        gfx.lineStyle(1, 0xffffff, 0.8);
        gfx.strokeCircle(this.cx, this.cy, CENTER_RADIUS);
    }

    /**
     * Test if a screen-space point hits one of the gizmo handles.
     * Returns the handle type, or DragHandle.None if no hit.
     * Priority: center > X axis > Y axis (center is smallest, test first).
     */
    hitTest(screenX: number, screenY: number): DragHandle {
        const dx = screenX - this.cx;
        const dy = screenY - this.cy;

        // Center handle — circle test
        if (dx * dx + dy * dy <= HANDLE_HIT_RADIUS * HANDLE_HIT_RADIUS) {
            return DragHandle.Center;
        }

        // X axis handle — rectangle along the arrow
        if (
            dx >= 0 && dx <= ARROW_LENGTH + ARROW_HEAD_SIZE &&
            Math.abs(dy) <= HANDLE_HIT_RADIUS
        ) {
            return DragHandle.AxisX;
        }

        // Y axis handle — rectangle along the arrow
        if (
            dy >= 0 && dy <= ARROW_LENGTH + ARROW_HEAD_SIZE &&
            Math.abs(dx) <= HANDLE_HIT_RADIUS
        ) {
            return DragHandle.AxisY;
        }

        return DragHandle.None;
    }

    /**
     * Begin a drag operation on a specific handle.
     */
    startDrag(
        handle: DragHandle,
        screenX: number,
        screenY: number,
        target: Phaser.GameObjects.GameObject,
        hostScene: Phaser.Scene,
    ): void {
        this.activeHandle = handle;
        this.dragStartX = screenX;
        this.dragStartY = screenY;
        this.target = target;
        this.hostScene = hostScene;

        // Record the object's current design-space position
        const designPos = this.coords.getDesignPosition(target, hostScene);
        this.objStartDesignX = designPos.x;
        this.objStartDesignY = designPos.y;
    }

    /**
     * Process pointer move during a drag.
     * Converts screen delta to design-space delta and applies the active constraint.
     */
    updateDrag(screenX: number, screenY: number): void {
        if (this.activeHandle === DragHandle.None || !this.target || !this.hostScene) return;

        const sf = this.coords.getScaleFactor(this.hostScene);

        // Screen-space delta → design-space delta
        const deltaScreenX = screenX - this.dragStartX;
        const deltaScreenY = screenY - this.dragStartY;
        let deltaDesignX = deltaScreenX / sf;
        let deltaDesignY = deltaScreenY / sf;

        // Apply axis constraint
        if (this.activeHandle === DragHandle.AxisX) {
            deltaDesignY = 0;
        } else if (this.activeHandle === DragHandle.AxisY) {
            deltaDesignX = 0;
        }

        let newDesignX = this.objStartDesignX + deltaDesignX;
        let newDesignY = this.objStartDesignY + deltaDesignY;

        // Apply snapping
        this._snapGuides = [];
        if (this.snappingEngine && this.snappingConfig) {
            const allObjects = this.selectableObjects ? this.selectableObjects() : [];
            const result = this.snappingEngine.applySnapping(
                { x: newDesignX, y: newDesignY },
                this.snappingConfig,
                allObjects,
                this.coords,
                this.hostScene,
                this.target,
            );
            newDesignX = result.point.x;
            newDesignY = result.point.y;
            this._snapGuides = result.guides;
        }

        this.coords.setDesignPosition(this.target, newDesignX, newDesignY, this.hostScene);
    }

    /**
     * End the current drag operation.
     */
    endDrag(): void {
        this.activeHandle = DragHandle.None;
        this.target = null;
        this.hostScene = null;
        this._snapGuides = [];
    }

    destroy(): void {
        this.endDrag();
    }
}
