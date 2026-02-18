import Phaser from 'phaser';
import { CoordinateSystem } from '../core/CoordinateSystem';
import type { SelectionManager } from '../core/SelectionManager';
import type { ViewportState } from '../core/ViewportState';

export enum HitAreaHandle {
    None = 'none',
    Center = 'center',
    TopLeft = 'top-left',
    TopRight = 'top-right',
    BottomLeft = 'bottom-left',
    BottomRight = 'bottom-right',
    Top = 'top',
    Bottom = 'bottom',
    Left = 'left',
    Right = 'right',
}

// ── Visual constants ──────────────────────────────────────────────
const HA_COLOR = 0xffaa00;
const HA_CENTER_COLOR = 0xffcc00;
const HA_STROKE = 0x664400;
const HA_FILL_COLOR = 0xffff00;
const HA_FILL_ALPHA = 0.15;
const HA_STROKE_COLOR = 0xffff00;
const HA_STROKE_ALPHA = 0.8;
const HA_LINE_WIDTH = 2;

const CENTER_RADIUS = 7;
const CORNER_SIZE = 7;
const EDGE_SIZE_LONG = 10;
const EDGE_SIZE_SHORT = 5;
const HIT_PADDING = 5;

// ── Hit area geometry snapshot ────────────────────────────────────
interface HitAreaSnapshot {
    type: 'rect' | 'circle' | 'polygon';
    rx?: number; ry?: number; rw?: number; rh?: number;
    cx?: number; cy?: number; cr?: number;
    points?: Array<{ x: number; y: number }>;
}

/**
 * Combined move + scale gizmo for hit areas.
 *
 * Shows:
 * - Center handle (yellow circle): drag to translate the hit area
 * - Corner handles (orange squares): drag to scale
 * - Edge handles (orange rects, Rectangle only): drag to resize one axis
 *
 * Works for Rectangle, Circle, and Polygon hit areas.
 *
 * Uses CoordinateSystem.getHitAreaToScreen() and getHitAreaScreenDeltaToLocal()
 * for all coordinate transforms (eliminates the local getTransformHelpers() duplicate).
 */
export class HitAreaGizmo {
    private coords: CoordinateSystem;

    /** Screen-space handle positions, computed each draw(). */
    private handlePositions = new Map<HitAreaHandle, { x: number; y: number }>();

    /** Drag state. */
    private activeHandle: HitAreaHandle = HitAreaHandle.None;
    private dragStartScreenX = 0;
    private dragStartScreenY = 0;
    private target: Phaser.GameObjects.GameObject | null = null;
    /** ViewportState frozen at drag start (per COORD-03). */
    private vp: ViewportState | null = null;
    private startSnapshot: HitAreaSnapshot | null = null;
    private lastPointerX = 0;
    private lastPointerY = 0;

    constructor(coords: CoordinateSystem) {
        this.coords = coords;
    }

    get isDragging(): boolean {
        return this.activeHandle !== HitAreaHandle.None;
    }

    get dragTarget(): Phaser.GameObjects.GameObject | null {
        return this.target;
    }

    // ── Draw ──────────────────────────────────────────────────────

    draw(
        gfx: Phaser.GameObjects.Graphics,
        obj: Phaser.GameObjects.GameObject,
        _selectionMgr: SelectionManager,
        vp?: ViewportState | null,
    ): void {
        const input = (obj as any).input;
        if (!input?.hitArea) return;

        const hitArea = input.hitArea;
        const toScreen = this.coords.getHitAreaToScreen(obj, vp ?? undefined);

        // Draw the hit area shape outline (same as EditorScene.drawHitArea)
        this.drawHitAreaShape(gfx, obj, hitArea, toScreen);

        // Compute & draw handles per shape type
        this.handlePositions.clear();

        if (hitArea instanceof Phaser.Geom.Rectangle) {
            this.drawRectHandles(gfx, hitArea, toScreen);
        } else if (hitArea instanceof Phaser.Geom.Circle) {
            this.drawCircleHandles(gfx, hitArea, toScreen, obj);
        } else if (hitArea instanceof Phaser.Geom.Polygon) {
            this.drawPolygonHandles(gfx, hitArea, toScreen);
        }
    }

    // ── Hit test ──────────────────────────────────────────────────

    hitTest(screenX: number, screenY: number): HitAreaHandle {
        // Test center first (highest priority, smallest)
        const center = this.handlePositions.get(HitAreaHandle.Center);
        if (center) {
            const d = Math.hypot(screenX - center.x, screenY - center.y);
            if (d <= CENTER_RADIUS + HIT_PADDING) return HitAreaHandle.Center;
        }

        // Test corners
        const corners = [
            HitAreaHandle.TopLeft, HitAreaHandle.TopRight,
            HitAreaHandle.BottomLeft, HitAreaHandle.BottomRight,
        ];
        const cornerHalf = CORNER_SIZE / 2 + HIT_PADDING;
        for (const handle of corners) {
            const pos = this.handlePositions.get(handle);
            if (!pos) continue;
            if (Math.abs(screenX - pos.x) <= cornerHalf &&
                Math.abs(screenY - pos.y) <= cornerHalf) {
                return handle;
            }
        }

        // Test edges (Rectangle only)
        const edges = [
            HitAreaHandle.Top, HitAreaHandle.Bottom,
            HitAreaHandle.Left, HitAreaHandle.Right,
        ];
        for (const handle of edges) {
            const pos = this.handlePositions.get(handle);
            if (!pos) continue;
            const isHoriz = handle === HitAreaHandle.Top || handle === HitAreaHandle.Bottom;
            const hw = (isHoriz ? EDGE_SIZE_LONG : EDGE_SIZE_SHORT) / 2 + HIT_PADDING;
            const hh = (isHoriz ? EDGE_SIZE_SHORT : EDGE_SIZE_LONG) / 2 + HIT_PADDING;
            if (Math.abs(screenX - pos.x) <= hw &&
                Math.abs(screenY - pos.y) <= hh) {
                return handle;
            }
        }

        return HitAreaHandle.None;
    }

    // ── Drag lifecycle ────────────────────────────────────────────

    startDrag(
        handle: HitAreaHandle,
        screenX: number,
        screenY: number,
        target: Phaser.GameObjects.GameObject,
        vp: ViewportState,
    ): void {
        this.activeHandle = handle;
        this.dragStartScreenX = screenX;
        this.dragStartScreenY = screenY;
        this.target = target;
        this.vp = vp;
        this.lastPointerX = screenX;
        this.lastPointerY = screenY;

        // Snapshot hit area geometry
        const hitArea = (target as any).input?.hitArea;
        if (hitArea instanceof Phaser.Geom.Rectangle) {
            this.startSnapshot = {
                type: 'rect',
                rx: hitArea.x, ry: hitArea.y,
                rw: hitArea.width, rh: hitArea.height,
            };
        } else if (hitArea instanceof Phaser.Geom.Circle) {
            this.startSnapshot = {
                type: 'circle',
                cx: hitArea.x, cy: hitArea.y, cr: hitArea.radius,
            };
        } else if (hitArea instanceof Phaser.Geom.Polygon) {
            this.startSnapshot = {
                type: 'polygon',
                points: hitArea.points.map((p: { x: number; y: number }) => ({
                    x: p.x, y: p.y,
                })),
            };
        }
    }

    updateDrag(screenX: number, screenY: number): void {
        if (this.activeHandle === HitAreaHandle.None || !this.target) return;

        this.lastPointerX = screenX;
        this.lastPointerY = screenY;

        const hitArea = (this.target as any).input?.hitArea;
        if (!hitArea || !this.startSnapshot) return;

        const dsx = screenX - this.dragStartScreenX;
        const dsy = screenY - this.dragStartScreenY;

        if (this.activeHandle === HitAreaHandle.Center) {
            // Move
            if (hitArea instanceof Phaser.Geom.Rectangle) {
                this.updateMoveRect(dsx, dsy);
            } else if (hitArea instanceof Phaser.Geom.Circle) {
                this.updateMoveCircle(dsx, dsy);
            } else if (hitArea instanceof Phaser.Geom.Polygon) {
                this.updateMovePolygon(dsx, dsy);
            }
        } else {
            // Scale
            if (hitArea instanceof Phaser.Geom.Rectangle) {
                this.updateScaleRect(this.activeHandle, dsx, dsy);
            } else if (hitArea instanceof Phaser.Geom.Circle) {
                this.updateScaleCircle(screenX, screenY);
            } else if (hitArea instanceof Phaser.Geom.Polygon) {
                this.updateScalePolygon(screenX, screenY);
            }
        }
    }

    endDrag(): void {
        this.activeHandle = HitAreaHandle.None;
        this.target = null;
        this.vp = null;
        this.startSnapshot = null;
    }

    getLabel(): { text: string; x: number; y: number } | null {
        if (!this.isDragging || !this.target) return null;

        const ha = (this.target as any).input?.hitArea;
        let text = '';

        if (ha instanceof Phaser.Geom.Rectangle) {
            text = `${Math.round(ha.x)},${Math.round(ha.y)} ${Math.round(ha.width)}\u00D7${Math.round(ha.height)}`;
        } else if (ha instanceof Phaser.Geom.Circle) {
            text = `(${Math.round(ha.x)},${Math.round(ha.y)}) r=${Math.round(ha.radius)}`;
        } else if (ha instanceof Phaser.Geom.Polygon) {
            text = `Polygon (${ha.points.length}v)`;
        }

        return {
            text,
            x: this.lastPointerX + 16,
            y: this.lastPointerY - 20,
        };
    }

    destroy(): void {
        this.endDrag();
        this.handlePositions.clear();
    }

    // ── Draw helpers ──────────────────────────────────────────────

    private drawHitAreaShape(
        gfx: Phaser.GameObjects.Graphics,
        obj: Phaser.GameObjects.GameObject,
        hitArea: Phaser.Geom.Rectangle | Phaser.Geom.Circle | Phaser.Geom.Polygon,
        toScreen: (lx: number, ly: number) => { x: number; y: number },
    ): void {
        if (hitArea instanceof Phaser.Geom.Rectangle) {
            const r = hitArea;
            const corners = [
                toScreen(r.x, r.y),
                toScreen(r.x + r.width, r.y),
                toScreen(r.x + r.width, r.y + r.height),
                toScreen(r.x, r.y + r.height),
            ];
            gfx.fillStyle(HA_FILL_COLOR, HA_FILL_ALPHA);
            gfx.fillPoints(corners as any, true);
            gfx.lineStyle(HA_LINE_WIDTH, HA_STROKE_COLOR, HA_STROKE_ALPHA);
            gfx.strokePoints(corners as any, true);
        } else if (hitArea instanceof Phaser.Geom.Circle) {
            const c = hitArea;
            const center = toScreen(c.x, c.y);
            const matrix: Phaser.GameObjects.Components.TransformMatrix =
                (obj as any).getWorldTransformMatrix();
            const scaleX = Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b);
            const scaleY = Math.sqrt(matrix.c * matrix.c + matrix.d * matrix.d);
            const screenRadius = c.radius * (scaleX + scaleY) / 2;

            gfx.fillStyle(HA_FILL_COLOR, HA_FILL_ALPHA);
            gfx.fillCircle(center.x, center.y, screenRadius);
            gfx.lineStyle(HA_LINE_WIDTH, HA_STROKE_COLOR, HA_STROKE_ALPHA);
            gfx.strokeCircle(center.x, center.y, screenRadius);
        } else if (hitArea instanceof Phaser.Geom.Polygon) {
            const pts = hitArea.points.map((p: { x: number; y: number }) =>
                toScreen(p.x, p.y),
            );
            if (pts.length >= 3) {
                gfx.fillStyle(HA_FILL_COLOR, HA_FILL_ALPHA);
                gfx.fillPoints(pts as any, true);
                gfx.lineStyle(HA_LINE_WIDTH, HA_STROKE_COLOR, HA_STROKE_ALPHA);
                gfx.strokePoints(pts as any, true);
            }
        }
    }

    private drawHandle(
        gfx: Phaser.GameObjects.Graphics,
        x: number, y: number,
        isCenter: boolean,
    ): void {
        if (isCenter) {
            gfx.fillStyle(HA_CENTER_COLOR, 0.9);
            gfx.fillCircle(x, y, CENTER_RADIUS);
            gfx.lineStyle(1, HA_STROKE, 0.8);
            gfx.strokeCircle(x, y, CENTER_RADIUS);
        } else {
            const hs = CORNER_SIZE / 2;
            gfx.fillStyle(HA_COLOR, 0.9);
            gfx.fillRect(x - hs, y - hs, CORNER_SIZE, CORNER_SIZE);
            gfx.lineStyle(1, HA_STROKE, 0.8);
            gfx.strokeRect(x - hs, y - hs, CORNER_SIZE, CORNER_SIZE);
        }
    }

    private drawEdgeHandle(
        gfx: Phaser.GameObjects.Graphics,
        x: number, y: number,
        horizontal: boolean,
    ): void {
        const w = horizontal ? EDGE_SIZE_LONG : EDGE_SIZE_SHORT;
        const h = horizontal ? EDGE_SIZE_SHORT : EDGE_SIZE_LONG;
        gfx.fillStyle(HA_COLOR, 0.9);
        gfx.fillRect(x - w / 2, y - h / 2, w, h);
        gfx.lineStyle(1, HA_STROKE, 0.8);
        gfx.strokeRect(x - w / 2, y - h / 2, w, h);
    }

    private storeHandle(handle: HitAreaHandle, x: number, y: number): void {
        this.handlePositions.set(handle, { x, y });
    }

    // ── Per-type handle drawing ───────────────────────────────────

    private drawRectHandles(
        gfx: Phaser.GameObjects.Graphics,
        rect: Phaser.Geom.Rectangle,
        toScreen: (lx: number, ly: number) => { x: number; y: number },
    ): void {
        const tl = toScreen(rect.x, rect.y);
        const tr = toScreen(rect.x + rect.width, rect.y);
        const bl = toScreen(rect.x, rect.y + rect.height);
        const br = toScreen(rect.x + rect.width, rect.y + rect.height);

        const center = {
            x: (tl.x + tr.x + bl.x + br.x) / 4,
            y: (tl.y + tr.y + bl.y + br.y) / 4,
        };

        // Edge midpoints
        const top = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
        const bottom = { x: (bl.x + br.x) / 2, y: (bl.y + br.y) / 2 };
        const left = { x: (tl.x + bl.x) / 2, y: (tl.y + bl.y) / 2 };
        const right = { x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2 };

        // Draw edge handles (behind corners)
        this.drawEdgeHandle(gfx, top.x, top.y, true);
        this.drawEdgeHandle(gfx, bottom.x, bottom.y, true);
        this.drawEdgeHandle(gfx, left.x, left.y, false);
        this.drawEdgeHandle(gfx, right.x, right.y, false);

        // Draw corner handles
        this.drawHandle(gfx, tl.x, tl.y, false);
        this.drawHandle(gfx, tr.x, tr.y, false);
        this.drawHandle(gfx, bl.x, bl.y, false);
        this.drawHandle(gfx, br.x, br.y, false);

        // Draw center handle (on top)
        this.drawHandle(gfx, center.x, center.y, true);

        // Store positions
        this.storeHandle(HitAreaHandle.Center, center.x, center.y);
        this.storeHandle(HitAreaHandle.TopLeft, tl.x, tl.y);
        this.storeHandle(HitAreaHandle.TopRight, tr.x, tr.y);
        this.storeHandle(HitAreaHandle.BottomLeft, bl.x, bl.y);
        this.storeHandle(HitAreaHandle.BottomRight, br.x, br.y);
        this.storeHandle(HitAreaHandle.Top, top.x, top.y);
        this.storeHandle(HitAreaHandle.Bottom, bottom.x, bottom.y);
        this.storeHandle(HitAreaHandle.Left, left.x, left.y);
        this.storeHandle(HitAreaHandle.Right, right.x, right.y);
    }

    private drawCircleHandles(
        gfx: Phaser.GameObjects.Graphics,
        circle: Phaser.Geom.Circle,
        toScreen: (lx: number, ly: number) => { x: number; y: number },
        obj: Phaser.GameObjects.GameObject,
    ): void {
        const center = toScreen(circle.x, circle.y);

        const matrix: Phaser.GameObjects.Components.TransformMatrix =
            (obj as any).getWorldTransformMatrix();
        const scaleX = Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b);
        const scaleY = Math.sqrt(matrix.c * matrix.c + matrix.d * matrix.d);
        const screenRadius = circle.radius * (scaleX + scaleY) / 2;

        // Cardinal handles at circle perimeter
        const top = { x: center.x, y: center.y - screenRadius };
        const bottom = { x: center.x, y: center.y + screenRadius };
        const left = { x: center.x - screenRadius, y: center.y };
        const right = { x: center.x + screenRadius, y: center.y };

        this.drawHandle(gfx, top.x, top.y, false);
        this.drawHandle(gfx, bottom.x, bottom.y, false);
        this.drawHandle(gfx, left.x, left.y, false);
        this.drawHandle(gfx, right.x, right.y, false);
        this.drawHandle(gfx, center.x, center.y, true);

        this.storeHandle(HitAreaHandle.Center, center.x, center.y);
        this.storeHandle(HitAreaHandle.Top, top.x, top.y);
        this.storeHandle(HitAreaHandle.Bottom, bottom.x, bottom.y);
        this.storeHandle(HitAreaHandle.Left, left.x, left.y);
        this.storeHandle(HitAreaHandle.Right, right.x, right.y);
    }

    private drawPolygonHandles(
        gfx: Phaser.GameObjects.Graphics,
        polygon: Phaser.Geom.Polygon,
        toScreen: (lx: number, ly: number) => { x: number; y: number },
    ): void {
        const pts = polygon.points as Array<{ x: number; y: number }>;
        if (pts.length < 2) return;

        // Compute screen-space bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let sumX = 0, sumY = 0;

        for (const p of pts) {
            const s = toScreen(p.x, p.y);
            minX = Math.min(minX, s.x);
            minY = Math.min(minY, s.y);
            maxX = Math.max(maxX, s.x);
            maxY = Math.max(maxY, s.y);
            sumX += s.x;
            sumY += s.y;
        }

        const center = { x: sumX / pts.length, y: sumY / pts.length };

        // Corner handles on bounding box
        this.drawHandle(gfx, minX, minY, false);
        this.drawHandle(gfx, maxX, minY, false);
        this.drawHandle(gfx, minX, maxY, false);
        this.drawHandle(gfx, maxX, maxY, false);
        this.drawHandle(gfx, center.x, center.y, true);

        this.storeHandle(HitAreaHandle.Center, center.x, center.y);
        this.storeHandle(HitAreaHandle.TopLeft, minX, minY);
        this.storeHandle(HitAreaHandle.TopRight, maxX, minY);
        this.storeHandle(HitAreaHandle.BottomLeft, minX, maxY);
        this.storeHandle(HitAreaHandle.BottomRight, maxX, maxY);
    }

    // ── Move operations ───────────────────────────────────────────

    private updateMoveRect(dsx: number, dsy: number): void {
        const screenDeltaToLocal = this.coords.getHitAreaScreenDeltaToLocal(this.target!, this.vp ?? undefined);
        const local = screenDeltaToLocal(dsx, dsy);
        const ha = (this.target as any).input.hitArea as Phaser.Geom.Rectangle;
        ha.x = this.startSnapshot!.rx! + local.dx;
        ha.y = this.startSnapshot!.ry! + local.dy;
    }

    private updateMoveCircle(dsx: number, dsy: number): void {
        const screenDeltaToLocal = this.coords.getHitAreaScreenDeltaToLocal(this.target!, this.vp ?? undefined);
        const local = screenDeltaToLocal(dsx, dsy);
        const ha = (this.target as any).input.hitArea as Phaser.Geom.Circle;
        ha.x = this.startSnapshot!.cx! + local.dx;
        ha.y = this.startSnapshot!.cy! + local.dy;
    }

    private updateMovePolygon(dsx: number, dsy: number): void {
        const screenDeltaToLocal = this.coords.getHitAreaScreenDeltaToLocal(this.target!, this.vp ?? undefined);
        const local = screenDeltaToLocal(dsx, dsy);
        const ha = (this.target as any).input.hitArea as Phaser.Geom.Polygon;
        const startPts = this.startSnapshot!.points!;
        for (let i = 0; i < ha.points.length && i < startPts.length; i++) {
            ha.points[i].x = startPts[i].x + local.dx;
            ha.points[i].y = startPts[i].y + local.dy;
        }
    }

    // ── Scale operations ──────────────────────────────────────────

    private updateScaleRect(handle: HitAreaHandle, dsx: number, dsy: number): void {
        const screenDeltaToLocal = this.coords.getHitAreaScreenDeltaToLocal(this.target!, this.vp ?? undefined);
        const local = screenDeltaToLocal(dsx, dsy);
        const ha = (this.target as any).input.hitArea as Phaser.Geom.Rectangle;
        const s = this.startSnapshot!;

        const isLeft = handle === HitAreaHandle.TopLeft || handle === HitAreaHandle.BottomLeft || handle === HitAreaHandle.Left;
        const isRight = handle === HitAreaHandle.TopRight || handle === HitAreaHandle.BottomRight || handle === HitAreaHandle.Right;
        const isTop = handle === HitAreaHandle.TopLeft || handle === HitAreaHandle.TopRight || handle === HitAreaHandle.Top;
        const isBottom = handle === HitAreaHandle.BottomLeft || handle === HitAreaHandle.BottomRight || handle === HitAreaHandle.Bottom;

        let newX = s.rx!;
        let newY = s.ry!;
        let newW = s.rw!;
        let newH = s.rh!;

        if (isLeft) {
            newX = s.rx! + local.dx;
            newW = s.rw! - local.dx;
        } else if (isRight) {
            newW = s.rw! + local.dx;
        }

        if (isTop) {
            newY = s.ry! + local.dy;
            newH = s.rh! - local.dy;
        } else if (isBottom) {
            newH = s.rh! + local.dy;
        }

        // Enforce minimum size
        if (newW < 1) { newW = 1; newX = s.rx! + s.rw! - 1; }
        if (newH < 1) { newH = 1; newY = s.ry! + s.rh! - 1; }

        ha.x = newX;
        ha.y = newY;
        ha.width = newW;
        ha.height = newH;
    }

    private updateScaleCircle(screenX: number, screenY: number): void {
        const toScreen = this.coords.getHitAreaToScreen(this.target!, this.vp ?? undefined);
        const centerScreen = toScreen(this.startSnapshot!.cx!, this.startSnapshot!.cy!);

        const startDist = Math.hypot(
            this.dragStartScreenX - centerScreen.x,
            this.dragStartScreenY - centerScreen.y,
        );
        const currentDist = Math.hypot(
            screenX - centerScreen.x,
            screenY - centerScreen.y,
        );

        if (startDist > 1) {
            const factor = currentDist / startDist;
            const ha = (this.target as any).input.hitArea as Phaser.Geom.Circle;
            ha.radius = Math.max(1, this.startSnapshot!.cr! * factor);
        }
    }

    private updateScalePolygon(screenX: number, screenY: number): void {
        const toScreen = this.coords.getHitAreaToScreen(this.target!, this.vp ?? undefined);
        const startPts = this.startSnapshot!.points!;

        // Compute centroid of start points
        let cx = 0, cy = 0;
        for (const p of startPts) { cx += p.x; cy += p.y; }
        cx /= startPts.length;
        cy /= startPts.length;

        // Screen-space centroid
        const centroidScreen = toScreen(cx, cy);

        const startDist = Math.hypot(
            this.dragStartScreenX - centroidScreen.x,
            this.dragStartScreenY - centroidScreen.y,
        );
        const currentDist = Math.hypot(
            screenX - centroidScreen.x,
            screenY - centroidScreen.y,
        );

        if (startDist > 1) {
            const factor = currentDist / startDist;
            const ha = (this.target as any).input.hitArea as Phaser.Geom.Polygon;
            for (let i = 0; i < ha.points.length && i < startPts.length; i++) {
                ha.points[i].x = cx + (startPts[i].x - cx) * factor;
                ha.points[i].y = cy + (startPts[i].y - cy) * factor;
            }
        }
    }
}
