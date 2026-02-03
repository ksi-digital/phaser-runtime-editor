import Phaser from 'phaser';
import { CoordinateSystem } from './CoordinateSystem';
import type { SnappingConfig } from './EditorState';

export interface SnapGuide {
    type: 'vertical' | 'horizontal';
    /** Design-space position: x for vertical, y for horizontal. */
    designPos: number;
    /** Design-space extent start: y for vertical, x for horizontal. */
    designStart: number;
    /** Design-space extent end: y for vertical, x for horizontal. */
    designEnd: number;
}

interface SnapResult {
    point: { x: number; y: number };
    guides: SnapGuide[];
}

/**
 * Stateless snapping utility.
 * All math operates in design-space coordinates.
 * Guide rendering converts to screen-space via CoordinateSystem.
 */
export class SnappingEngine {
    /**
     * Snap a design-space point to the nearest grid increment.
     */
    gridSnap(point: { x: number; y: number }, gridSize: number): { x: number; y: number } {
        return {
            x: Math.round(point.x / gridSize) * gridSize,
            y: Math.round(point.y / gridSize) * gridSize,
        };
    }

    /**
     * Snap a design-space point to nearby object centers/edges.
     * Returns the snapped point and alignment guides.
     */
    objectSnap(
        point: { x: number; y: number },
        allObjects: Phaser.GameObjects.GameObject[],
        threshold: number,
        coords: CoordinateSystem,
        hostScene: Phaser.Scene,
        excludeObj?: Phaser.GameObjects.GameObject | null,
    ): SnapResult {
        const guides: SnapGuide[] = [];
        let snappedX = point.x;
        let snappedY = point.y;
        let bestDx = threshold + 1;
        let bestDy = threshold + 1;

        for (const obj of allObjects) {
            if (obj === excludeObj) continue;
            if ('visible' in obj && !(obj as any).visible) continue;

            const objDesign = coords.getDesignPosition(obj, hostScene);

            // Center X alignment
            const dx = Math.abs(point.x - objDesign.x);
            if (dx < threshold && dx < bestDx) {
                bestDx = dx;
                snappedX = objDesign.x;
            }

            // Center Y alignment
            const dy = Math.abs(point.y - objDesign.y);
            if (dy < threshold && dy < bestDy) {
                bestDy = dy;
                snappedY = objDesign.y;
            }
        }

        // Build guides for the snapped axes
        if (bestDx <= threshold) {
            guides.push({
                type: 'vertical',
                designPos: snappedX,
                designStart: 0,
                designEnd: coords.designHeight,
            });
        }
        if (bestDy <= threshold) {
            guides.push({
                type: 'horizontal',
                designPos: snappedY,
                designStart: 0,
                designEnd: coords.designWidth,
            });
        }

        return { point: { x: snappedX, y: snappedY }, guides };
    }

    /**
     * Apply all enabled snapping in order: grid first, then object alignment.
     */
    applySnapping(
        point: { x: number; y: number },
        config: SnappingConfig,
        allObjects: Phaser.GameObjects.GameObject[],
        coords: CoordinateSystem,
        hostScene: Phaser.Scene,
        excludeObj?: Phaser.GameObjects.GameObject | null,
    ): SnapResult {
        let result: SnapResult = { point: { ...point }, guides: [] };

        if (config.gridEnabled && config.gridSize > 0) {
            result.point = this.gridSnap(result.point, config.gridSize);
        }

        if (config.objectSnapEnabled) {
            const objResult = this.objectSnap(
                result.point,
                allObjects,
                config.objectSnapThreshold,
                coords,
                hostScene,
                excludeObj,
            );
            result = objResult;
        }

        return result;
    }

    /**
     * Render snap guides onto a Graphics object.
     * Converts from design-space to screen-space for rendering.
     */
    drawGuides(
        gfx: Phaser.GameObjects.Graphics,
        guides: SnapGuide[],
        coords: CoordinateSystem,
        hostScene: Phaser.Scene,
    ): void {
        if (guides.length === 0) return;

        gfx.lineStyle(1, 0xff00ff, 0.7); // magenta

        for (const guide of guides) {
            if (guide.type === 'vertical') {
                const start = coords.designToScreen(guide.designPos, guide.designStart, hostScene);
                const end = coords.designToScreen(guide.designPos, guide.designEnd, hostScene);
                this.drawDashedLine(gfx, start.x, start.y, end.x, end.y);
            } else {
                const start = coords.designToScreen(guide.designStart, guide.designPos, hostScene);
                const end = coords.designToScreen(guide.designEnd, guide.designPos, hostScene);
                this.drawDashedLine(gfx, start.x, start.y, end.x, end.y);
            }
        }
    }

    private drawDashedLine(
        gfx: Phaser.GameObjects.Graphics,
        x1: number, y1: number,
        x2: number, y2: number,
        dashLen = 6,
        gapLen = 4,
    ): void {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;

        const ux = dx / len;
        const uy = dy / len;
        let drawn = 0;

        while (drawn < len) {
            const segEnd = Math.min(drawn + dashLen, len);
            gfx.beginPath();
            gfx.moveTo(x1 + ux * drawn, y1 + uy * drawn);
            gfx.lineTo(x1 + ux * segEnd, y1 + uy * segEnd);
            gfx.strokePath();
            drawn = segEnd + gapLen;
        }
    }
}
