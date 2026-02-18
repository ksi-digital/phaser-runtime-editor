import Phaser from 'phaser';
import { CoordinateSystem } from '../core/CoordinateSystem';
import type { SelectionManager } from '../core/SelectionManager';
import type { ViewportState } from '../core/ViewportState';

export enum ScaleHandle {
    None = 'none',
    TopLeft = 'top-left',
    TopRight = 'top-right',
    BottomLeft = 'bottom-left',
    BottomRight = 'bottom-right',
    Top = 'top',
    Bottom = 'bottom',
    Left = 'left',
    Right = 'right',
}

const CORNER_SIZE = 8;           // px, square handle side
const EDGE_SIZE_LONG = 12;      // px along the edge
const EDGE_SIZE_SHORT = 6;      // px perpendicular to edge
const HIT_PADDING = 4;          // extra hit area around handles
const HANDLE_FILL = 0xffffff;   // white
const HANDLE_STROKE = 0x666666; // dark gray
const SCALE_MIN = 0.01;
const SCALE_MAX = 10;

/**
 * Scale gizmo — 8 handles on the selection bounding box.
 * Corner handles scale proportionally. Edge handles constrain to one axis.
 */
export class ScaleGizmo {
    private coords: CoordinateSystem;

    /** Bounding box and center in screen-space (updated each frame unless dragging). */
    private bounds: Phaser.Geom.Rectangle | null = null;
    private cx = 0;
    private cy = 0;

    /** Drag state. */
    private activeHandle: ScaleHandle = ScaleHandle.None;
    private dragStartX = 0;
    private dragStartY = 0;
    private objStartScaleX = 1;
    private objStartScaleY = 1;
    private target: Phaser.GameObjects.GameObject | null = null;
    /** ViewportState frozen at drag start (per COORD-03). */
    private vp: ViewportState | null = null;
    private currentScaleX = 1;
    private currentScaleY = 1;
    private lastPointerX = 0;
    private lastPointerY = 0;

    constructor(coords: CoordinateSystem) {
        this.coords = coords;
    }

    get isDragging(): boolean {
        return this.activeHandle !== ScaleHandle.None;
    }

    get dragTarget(): Phaser.GameObjects.GameObject | null {
        return this.target;
    }

    /**
     * Draw the scale gizmo handles for the given object.
     */
    draw(
        gfx: Phaser.GameObjects.Graphics,
        obj: Phaser.GameObjects.GameObject,
        selectionMgr: SelectionManager,
    ): void {
        // Only update geometry when NOT dragging (freeze during drag)
        if (!this.isDragging) {
            this.bounds = selectionMgr.getScreenBounds(obj);
            if (this.bounds) {
                this.cx = this.bounds.x + this.bounds.width / 2;
                this.cy = this.bounds.y + this.bounds.height / 2;
            }
        }

        if (!this.bounds) return;

        const b = this.bounds;

        // Corner positions
        const corners = [
            { handle: ScaleHandle.TopLeft, x: b.x, y: b.y },
            { handle: ScaleHandle.TopRight, x: b.x + b.width, y: b.y },
            { handle: ScaleHandle.BottomLeft, x: b.x, y: b.y + b.height },
            { handle: ScaleHandle.BottomRight, x: b.x + b.width, y: b.y + b.height },
        ];

        // Edge midpoint positions
        const edges = [
            { handle: ScaleHandle.Top, x: b.x + b.width / 2, y: b.y },
            { handle: ScaleHandle.Bottom, x: b.x + b.width / 2, y: b.y + b.height },
            { handle: ScaleHandle.Left, x: b.x, y: b.y + b.height / 2 },
            { handle: ScaleHandle.Right, x: b.x + b.width, y: b.y + b.height / 2 },
        ];

        // Draw edge handles (behind corners)
        for (const e of edges) {
            const isHorizontal = e.handle === ScaleHandle.Top || e.handle === ScaleHandle.Bottom;
            const w = isHorizontal ? EDGE_SIZE_LONG : EDGE_SIZE_SHORT;
            const h = isHorizontal ? EDGE_SIZE_SHORT : EDGE_SIZE_LONG;
            gfx.fillStyle(HANDLE_FILL, 0.9);
            gfx.fillRect(e.x - w / 2, e.y - h / 2, w, h);
            gfx.lineStyle(1, HANDLE_STROKE, 0.8);
            gfx.strokeRect(e.x - w / 2, e.y - h / 2, w, h);
        }

        // Draw corner handles (on top)
        const hs = CORNER_SIZE / 2;
        for (const c of corners) {
            gfx.fillStyle(HANDLE_FILL, 0.9);
            gfx.fillRect(c.x - hs, c.y - hs, CORNER_SIZE, CORNER_SIZE);
            gfx.lineStyle(1, HANDLE_STROKE, 0.8);
            gfx.strokeRect(c.x - hs, c.y - hs, CORNER_SIZE, CORNER_SIZE);
        }
    }

    /**
     * Test if a screen-space point hits one of the scale handles.
     * Corners are tested first (higher priority since they overlap edge midpoints at small sizes).
     */
    hitTest(screenX: number, screenY: number): ScaleHandle {
        if (!this.bounds) return ScaleHandle.None;

        const b = this.bounds;

        // Test corners first
        const corners: Array<{ handle: ScaleHandle; x: number; y: number }> = [
            { handle: ScaleHandle.TopLeft, x: b.x, y: b.y },
            { handle: ScaleHandle.TopRight, x: b.x + b.width, y: b.y },
            { handle: ScaleHandle.BottomLeft, x: b.x, y: b.y + b.height },
            { handle: ScaleHandle.BottomRight, x: b.x + b.width, y: b.y + b.height },
        ];

        const cornerHalf = CORNER_SIZE / 2 + HIT_PADDING;
        for (const c of corners) {
            if (
                Math.abs(screenX - c.x) <= cornerHalf &&
                Math.abs(screenY - c.y) <= cornerHalf
            ) {
                return c.handle;
            }
        }

        // Test edge midpoints
        const edges: Array<{ handle: ScaleHandle; x: number; y: number; horizontal: boolean }> = [
            { handle: ScaleHandle.Top, x: b.x + b.width / 2, y: b.y, horizontal: true },
            { handle: ScaleHandle.Bottom, x: b.x + b.width / 2, y: b.y + b.height, horizontal: true },
            { handle: ScaleHandle.Left, x: b.x, y: b.y + b.height / 2, horizontal: false },
            { handle: ScaleHandle.Right, x: b.x + b.width, y: b.y + b.height / 2, horizontal: false },
        ];

        for (const e of edges) {
            const hw = (e.horizontal ? EDGE_SIZE_LONG : EDGE_SIZE_SHORT) / 2 + HIT_PADDING;
            const hh = (e.horizontal ? EDGE_SIZE_SHORT : EDGE_SIZE_LONG) / 2 + HIT_PADDING;
            if (
                Math.abs(screenX - e.x) <= hw &&
                Math.abs(screenY - e.y) <= hh
            ) {
                return e.handle;
            }
        }

        return ScaleHandle.None;
    }

    /**
     * Begin a scale drag.
     * Freezes a ViewportState snapshot at drag start (per COORD-03).
     */
    startDrag(
        handle: ScaleHandle,
        screenX: number,
        screenY: number,
        target: Phaser.GameObjects.GameObject,
        vp: ViewportState,
    ): void {
        this.activeHandle = handle;
        this.dragStartX = screenX;
        this.dragStartY = screenY;
        this.target = target;
        this.vp = vp;
        this.lastPointerX = screenX;
        this.lastPointerY = screenY;

        this.objStartScaleX = 'scaleX' in target ? (target as any).scaleX : 1;
        this.objStartScaleY = 'scaleY' in target ? (target as any).scaleY : 1;
        this.currentScaleX = this.objStartScaleX;
        this.currentScaleY = this.objStartScaleY;
    }

    /**
     * Process pointer move during a scale drag.
     */
    updateDrag(screenX: number, screenY: number): void {
        if (this.activeHandle === ScaleHandle.None || !this.target) return;

        this.lastPointerX = screenX;
        this.lastPointerY = screenY;

        const handle = this.activeHandle;
        let newScaleX = this.objStartScaleX;
        let newScaleY = this.objStartScaleY;

        const isCorner =
            handle === ScaleHandle.TopLeft ||
            handle === ScaleHandle.TopRight ||
            handle === ScaleHandle.BottomLeft ||
            handle === ScaleHandle.BottomRight;

        const isHorizontalEdge = handle === ScaleHandle.Left || handle === ScaleHandle.Right;
        const isVerticalEdge = handle === ScaleHandle.Top || handle === ScaleHandle.Bottom;

        if (isCorner) {
            // Proportional scaling based on distance from center
            const startDist = Math.sqrt(
                (this.dragStartX - this.cx) ** 2 + (this.dragStartY - this.cy) ** 2,
            );
            const currentDist = Math.sqrt(
                (screenX - this.cx) ** 2 + (screenY - this.cy) ** 2,
            );
            if (startDist > 1) {
                const factor = currentDist / startDist;
                newScaleX = Phaser.Math.Clamp(this.objStartScaleX * factor, SCALE_MIN, SCALE_MAX);
                newScaleY = Phaser.Math.Clamp(this.objStartScaleY * factor, SCALE_MIN, SCALE_MAX);
            }
        } else if (isHorizontalEdge) {
            // Scale X only
            const startDistX = Math.abs(this.dragStartX - this.cx);
            const currentDistX = Math.abs(screenX - this.cx);
            if (startDistX > 1) {
                const factor = currentDistX / startDistX;
                newScaleX = Phaser.Math.Clamp(this.objStartScaleX * factor, SCALE_MIN, SCALE_MAX);
            }
        } else if (isVerticalEdge) {
            // Scale Y only
            const startDistY = Math.abs(this.dragStartY - this.cy);
            const currentDistY = Math.abs(screenY - this.cy);
            if (startDistY > 1) {
                const factor = currentDistY / startDistY;
                newScaleY = Phaser.Math.Clamp(this.objStartScaleY * factor, SCALE_MIN, SCALE_MAX);
            }
        }

        // Apply scale
        if ('scaleX' in this.target) (this.target as any).scaleX = newScaleX;
        if ('scaleY' in this.target) (this.target as any).scaleY = newScaleY;

        this.currentScaleX = newScaleX;
        this.currentScaleY = newScaleY;
    }

    /**
     * End the scale drag.
     */
    endDrag(): void {
        this.activeHandle = ScaleHandle.None;
        this.target = null;
        this.vp = null;
    }

    /**
     * Returns label info for the drag label display, or null if not dragging.
     */
    getLabel(): { text: string; x: number; y: number } | null {
        if (!this.isDragging) return null;

        const sx = Math.round(this.currentScaleX * 100) / 100;
        const sy = Math.round(this.currentScaleY * 100) / 100;

        return {
            text: `${sx} \u00D7 ${sy}`,
            x: this.lastPointerX + 16,
            y: this.lastPointerY - 20,
        };
    }

    destroy(): void {
        this.endDrag();
    }
}
