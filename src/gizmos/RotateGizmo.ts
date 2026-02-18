import Phaser from 'phaser';
import { CoordinateSystem } from '../core/CoordinateSystem';
import type { SnappingConfig } from '../core/EditorState';
import type { SelectionManager } from '../core/SelectionManager';
import type { ViewportState } from '../core/ViewportState';

export enum RotateHandle {
    None = 'none',
    Ring = 'ring',
}

const RING_OFFSET = 25;          // px beyond bounding radius
const RING_LINE_WIDTH = 2;
const RING_COLOR = 0xffaa00;     // orange
const RING_HIT_TOLERANCE = 12;   // px from ring for hit detection
const DASH_LEN = 8;
const DASH_GAP = 5;
const ANGLE_SNAP_INCREMENT = 15; // degrees
const INDICATOR_COLOR = 0xffaa00;

/**
 * Rotate gizmo — dashed circle around the object.
 * Drag along the circle to rotate. With grid snap, snaps to 15-degree increments.
 */
export class RotateGizmo {
    private coords: CoordinateSystem;
    private snappingConfig: SnappingConfig | null = null;

    /** Screen-space gizmo center and ring radius (updated each frame unless dragging). */
    private cx = 0;
    private cy = 0;
    private ringRadius = 40;

    /** Drag state. */
    private activeHandle: RotateHandle = RotateHandle.None;
    private dragStartAngle = 0;   // pointer angle at drag start (degrees)
    private objStartAngle = 0;    // object's angle at drag start (degrees)
    private target: Phaser.GameObjects.GameObject | null = null;
    /** ViewportState frozen at drag start (per COORD-03). */
    private vp: ViewportState | null = null;
    private currentAngle = 0;     // current angle during drag (for label)
    private lastPointerX = 0;
    private lastPointerY = 0;

    constructor(coords: CoordinateSystem) {
        this.coords = coords;
    }

    setSnapping(config: SnappingConfig): void {
        this.snappingConfig = config;
    }

    get isDragging(): boolean {
        return this.activeHandle !== RotateHandle.None;
    }

    get dragTarget(): Phaser.GameObjects.GameObject | null {
        return this.target;
    }

    /**
     * Draw the rotate gizmo for the given object.
     * vp is required to compute the screen-space position via getScreenPosition().
     */
    draw(
        gfx: Phaser.GameObjects.Graphics,
        obj: Phaser.GameObjects.GameObject,
        selectionMgr: SelectionManager,
        vp: ViewportState,
    ): void {
        const screen = this.coords.getScreenPosition(obj, vp);

        // Only update geometry when NOT dragging (freeze during drag to prevent wobble)
        if (!this.isDragging) {
            this.cx = screen.x;
            this.cy = screen.y;
            this.ringRadius = this.computeRingRadius(obj, selectionMgr, vp);
        }

        // Draw dashed circle
        this.drawDashedCircle(gfx, this.cx, this.cy, this.ringRadius);

        // During drag, draw indicator line from center to pointer
        if (this.isDragging) {
            gfx.lineStyle(1, INDICATOR_COLOR, 0.6);
            gfx.beginPath();
            gfx.moveTo(this.cx, this.cy);
            gfx.lineTo(this.lastPointerX, this.lastPointerY);
            gfx.strokePath();

            // Small dot at center
            gfx.fillStyle(INDICATOR_COLOR, 0.8);
            gfx.fillCircle(this.cx, this.cy, 3);
        }
    }

    /**
     * Test if a screen-space point hits the rotation ring.
     */
    hitTest(screenX: number, screenY: number): RotateHandle {
        const dx = screenX - this.cx;
        const dy = screenY - this.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (Math.abs(dist - this.ringRadius) <= RING_HIT_TOLERANCE) {
            return RotateHandle.Ring;
        }

        return RotateHandle.None;
    }

    /**
     * Begin a rotation drag.
     * Freezes a ViewportState snapshot at drag start (per COORD-03).
     */
    startDrag(
        handle: RotateHandle,
        screenX: number,
        screenY: number,
        target: Phaser.GameObjects.GameObject,
        vp: ViewportState,
    ): void {
        this.activeHandle = handle;
        this.target = target;
        this.vp = vp;
        this.lastPointerX = screenX;
        this.lastPointerY = screenY;

        // Pointer angle from center (degrees)
        this.dragStartAngle = Phaser.Math.RadToDeg(
            Math.atan2(screenY - this.cy, screenX - this.cx),
        );

        // Object's current angle
        this.objStartAngle = 'angle' in target ? (target as any).angle : 0;
        this.currentAngle = this.objStartAngle;
    }

    /**
     * Process pointer move during rotation drag.
     */
    updateDrag(screenX: number, screenY: number): void {
        if (this.activeHandle === RotateHandle.None || !this.target) return;

        this.lastPointerX = screenX;
        this.lastPointerY = screenY;

        // Current pointer angle from center (degrees)
        const currentPointerAngle = Phaser.Math.RadToDeg(
            Math.atan2(screenY - this.cy, screenX - this.cx),
        );

        // Delta angle (handle wrap-around)
        let deltaAngle = currentPointerAngle - this.dragStartAngle;
        if (deltaAngle > 180) deltaAngle -= 360;
        if (deltaAngle < -180) deltaAngle += 360;

        let newAngle = this.objStartAngle + deltaAngle;

        // Angle snapping when grid is enabled
        if (this.snappingConfig?.gridEnabled) {
            newAngle = Math.round(newAngle / ANGLE_SNAP_INCREMENT) * ANGLE_SNAP_INCREMENT;
        }

        // Apply rotation
        if ('angle' in this.target) {
            (this.target as any).angle = newAngle;
        }

        this.currentAngle = newAngle;
    }

    /**
     * End the rotation drag.
     */
    endDrag(): void {
        this.activeHandle = RotateHandle.None;
        this.target = null;
        this.vp = null;
    }

    /**
     * Returns label info for the drag label display, or null if not dragging.
     */
    getLabel(): { text: string; x: number; y: number } | null {
        if (!this.isDragging) return null;

        // Normalize to -180..180 for display
        let display = ((this.currentAngle % 360) + 540) % 360 - 180;
        display = Math.round(display * 10) / 10;

        return {
            text: `${display}\u00B0`,
            x: this.lastPointerX + 16,
            y: this.lastPointerY - 20,
        };
    }

    destroy(): void {
        this.endDrag();
    }

    // ── Private helpers ──────────────────────────────────────────────

    private computeRingRadius(
        obj: Phaser.GameObjects.GameObject,
        selectionMgr: SelectionManager,
        vp: ViewportState,
    ): number {
        const bounds = selectionMgr.getScreenBounds(obj);
        if (!bounds) return 40;

        // Distance from object origin to farthest corner of bounding rect
        const screen = this.coords.getScreenPosition(obj, vp);
        const corners = [
            { x: bounds.x, y: bounds.y },
            { x: bounds.x + bounds.width, y: bounds.y },
            { x: bounds.x, y: bounds.y + bounds.height },
            { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        ];

        let maxDist = 0;
        for (const c of corners) {
            const dx = c.x - screen.x;
            const dy = c.y - screen.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > maxDist) maxDist = dist;
        }

        return Math.max(maxDist + RING_OFFSET, 30);
    }

    /**
     * Draw a dashed circle using line segments (Phaser Graphics has no dashed arc).
     */
    private drawDashedCircle(
        gfx: Phaser.GameObjects.Graphics,
        cx: number,
        cy: number,
        radius: number,
    ): void {
        gfx.lineStyle(RING_LINE_WIDTH, RING_COLOR, 0.8);

        const totalAngle = 2 * Math.PI;
        const step = Math.min(2 / radius, 0.05); // ~2px per step, capped
        let arcLen = 0;
        let drawing = true;
        let pathStarted = false;

        for (let a = 0; a < totalAngle; a += step) {
            const px = cx + Math.cos(a) * radius;
            const py = cy + Math.sin(a) * radius;
            const segLen = step * radius;

            if (drawing) {
                if (!pathStarted) {
                    gfx.beginPath();
                    gfx.moveTo(px, py);
                    pathStarted = true;
                } else {
                    gfx.lineTo(px, py);
                }
                arcLen += segLen;
                if (arcLen >= DASH_LEN) {
                    gfx.strokePath();
                    pathStarted = false;
                    arcLen = 0;
                    drawing = false;
                }
            } else {
                arcLen += segLen;
                if (arcLen >= DASH_GAP) {
                    arcLen = 0;
                    drawing = true;
                }
            }
        }
        if (pathStarted) gfx.strokePath();
    }
}
