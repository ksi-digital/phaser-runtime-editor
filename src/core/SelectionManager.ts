import Phaser from 'phaser';
import { EditorState } from './EditorState';
import { CoordinateSystem } from './CoordinateSystem';
import type { ViewportState } from './ViewportState';

const SELECTION_COLOR = 0x4488ff;
const SELECTION_ALPHA = 0.9;
const SELECTION_LINE_WIDTH = 2;

/**
 * Manages object selection in the editor.
 *
 * Responsibilities:
 * - Collect all selectable game objects from paused scenes
 * - Hit-test pointer clicks against object bounds
 * - Draw selection bounding box via a Graphics object
 * - Handle Container selection (click Container → select whole Container)
 */
export class SelectionManager {
    private state: EditorState;
    private coords: CoordinateSystem;
    private game: Phaser.Game;
    private pausedSceneKeys: string[];

    constructor(
        state: EditorState,
        coords: CoordinateSystem,
        game: Phaser.Game,
        pausedSceneKeys: string[],
    ) {
        this.state = state;
        this.coords = coords;
        this.game = game;
        this.pausedSceneKeys = pausedSceneKeys;
    }

    /**
     * Collect all selectable game objects from all paused game scenes.
     * Returns a flat list — Containers appear as single entries (not expanded).
     */
    getSelectableObjects(): Phaser.GameObjects.GameObject[] {
        const result: Phaser.GameObjects.GameObject[] = [];

        for (const key of this.pausedSceneKeys) {
            const scene = this.game.scene.getScene(key);
            if (!scene) continue;

            for (const obj of scene.children.list) {
                // Skip objects without transform (shouldn't happen, but be safe)
                if (!('x' in obj)) continue;
                result.push(obj);
            }
        }

        return result;
    }

    /**
     * Hit-test a screen-space point against all selectable objects.
     * Returns the top-most (highest depth) object whose bounds contain the point,
     * or null if nothing was hit.
     *
     * For Containers: tests the union bounds of the Container (not individual children).
     *
     * @param vp ViewportState snapshot for correct world→screen projection.
     */
    hitTest(screenX: number, screenY: number, vp: ViewportState): Phaser.GameObjects.GameObject | null {
        const objects = this.getSelectableObjects();
        let best: Phaser.GameObjects.GameObject | null = null;
        let bestDepth = -Infinity;

        for (const obj of objects) {
            if ('visible' in obj && !(obj as any).visible) continue;

            const bounds = this.getScreenBounds(obj, vp);
            if (!bounds) continue;

            if (
                screenX >= bounds.x &&
                screenX <= bounds.x + bounds.width &&
                screenY >= bounds.y &&
                screenY <= bounds.y + bounds.height
            ) {
                const depth = (obj as any).depth ?? 0;
                if (depth >= bestDepth) {
                    best = obj;
                    bestDepth = depth;
                }
            }
        }

        return best;
    }

    /**
     * Get the screen-space bounding rectangle of a game object.
     * For Containers, computes the union bounds of all children.
     * For Polygon Shapes, computes bounds from geometry vertices (Phaser's
     * getBounds() is incorrect when polygon vertices have negative coordinates).
     *
     * @param vp ViewportState snapshot used to project world-space bounds to screen-space.
     */
    getScreenBounds(obj: Phaser.GameObjects.GameObject, vp: ViewportState): Phaser.Geom.Rectangle | null {
        // Container: compute union of children bounds
        if (obj instanceof Phaser.GameObjects.Container) {
            return this.getContainerBounds(obj, vp);
        }

        // Polygon Shape: getBounds() is known to return wrong results for
        // negative vertices. Compute AABB by transforming geometry through
        // the world matrix with displayOrigin offset (same math as hit area overlay).
        if (obj instanceof Phaser.GameObjects.Polygon) {
            return this.getPolygonShapeBounds(obj);
        }

        // Regular object: use getBounds if available, then project to screen-space
        if ('getBounds' in obj && typeof (obj as any).getBounds === 'function') {
            try {
                const worldBounds = (obj as any).getBounds() as Phaser.Geom.Rectangle;
                // Project all 4 corners from world to screen and compute AABB
                const tl = this.coords.worldToScreen(worldBounds.x, worldBounds.y, vp);
                const tr = this.coords.worldToScreen(worldBounds.x + worldBounds.width, worldBounds.y, vp);
                const bl = this.coords.worldToScreen(worldBounds.x, worldBounds.y + worldBounds.height, vp);
                const br = this.coords.worldToScreen(worldBounds.x + worldBounds.width, worldBounds.y + worldBounds.height, vp);
                const minX = Math.min(tl.x, tr.x, bl.x, br.x);
                const minY = Math.min(tl.y, tr.y, bl.y, br.y);
                const maxX = Math.max(tl.x, tr.x, bl.x, br.x);
                const maxY = Math.max(tl.y, tr.y, bl.y, br.y);
                return new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY);
            } catch {
                return null;
            }
        }

        return null;
    }

    /**
     * Compute screen-space AABB for a Polygon Shape using the centralized
     * CoordinateSystem.getHitAreaToScreen() helper.
     * Phaser's built-in getBounds() returns wrong results when polygon
     * vertices have negative coordinates.
     *
     * NOTE: The polygon path uses getHitAreaToScreen() which applies the world
     * matrix directly (screen-correct for Phaser's shared GL render context).
     * This works correctly for the default camera. For non-default cameras,
     * this is a known limitation (separate from the two reported bugs).
     */
    private getPolygonShapeBounds(poly: Phaser.GameObjects.Polygon): Phaser.Geom.Rectangle | null {
        const geom = (poly as any).geom as Phaser.Geom.Polygon;
        if (!geom?.points || geom.points.length < 2) return null;

        const toScreen = this.coords.getHitAreaToScreen(poly);

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        for (const p of geom.points) {
            const s = toScreen(p.x, p.y);
            minX = Math.min(minX, s.x);
            minY = Math.min(minY, s.y);
            maxX = Math.max(maxX, s.x);
            maxY = Math.max(maxY, s.y);
        }

        if (!isFinite(minX)) return null;
        return new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY);
    }

    /**
     * Compute the union bounding box of a Container's children in screen-space.
     */
    private getContainerBounds(container: Phaser.GameObjects.Container, vp: ViewportState): Phaser.Geom.Rectangle | null {
        if (container.list.length === 0) {
            // Empty container — use its own position with a minimum size
            const t = container as Phaser.GameObjects.Components.Transform;
            const screen = this.coords.worldToScreen(t.x, t.y, vp);
            return new Phaser.Geom.Rectangle(screen.x - 16, screen.y - 16, 32, 32);
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const child of container.list) {
            const childBounds = this.getChildWorldBounds(child as Phaser.GameObjects.GameObject, container, vp);
            if (!childBounds) continue;

            minX = Math.min(minX, childBounds.x);
            minY = Math.min(minY, childBounds.y);
            maxX = Math.max(maxX, childBounds.x + childBounds.width);
            maxY = Math.max(maxY, childBounds.y + childBounds.height);
        }

        if (!isFinite(minX)) return null;
        return new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY);
    }

    /**
     * Get the screen-space bounds of a child within a Container.
     * Projects world-space child bounds through the camera via worldToScreen().
     */
    private getChildWorldBounds(
        child: Phaser.GameObjects.GameObject,
        _container: Phaser.GameObjects.Container,
        vp: ViewportState,
    ): Phaser.Geom.Rectangle | null {
        if ('getBounds' in child && typeof (child as any).getBounds === 'function') {
            try {
                const worldBounds = (child as any).getBounds() as Phaser.Geom.Rectangle;
                // Project all 4 corners from world to screen and compute AABB
                const tl = this.coords.worldToScreen(worldBounds.x, worldBounds.y, vp);
                const tr = this.coords.worldToScreen(worldBounds.x + worldBounds.width, worldBounds.y, vp);
                const bl = this.coords.worldToScreen(worldBounds.x, worldBounds.y + worldBounds.height, vp);
                const br = this.coords.worldToScreen(worldBounds.x + worldBounds.width, worldBounds.y + worldBounds.height, vp);
                const minX = Math.min(tl.x, tr.x, bl.x, br.x);
                const minY = Math.min(tl.y, tr.y, bl.y, br.y);
                const maxX = Math.max(tl.x, tr.x, bl.x, br.x);
                const maxY = Math.max(tl.y, tr.y, bl.y, br.y);
                return new Phaser.Geom.Rectangle(minX, minY, maxX - minX, maxY - minY);
            } catch {
                return null;
            }
        }

        // Fallback: use world transform matrix tx/ty + small default size,
        // projected through camera
        if ('getWorldTransformMatrix' in child && typeof (child as any).getWorldTransformMatrix === 'function') {
            try {
                const matrix = (child as any).getWorldTransformMatrix() as Phaser.GameObjects.Components.TransformMatrix;
                const screen = this.coords.worldToScreen(matrix.tx, matrix.ty, vp);
                return new Phaser.Geom.Rectangle(screen.x - 8, screen.y - 8, 16, 16);
            } catch {
                return null;
            }
        }

        return null;
    }

    /**
     * Draw the selection bounding box onto a Graphics object.
     * Call this every frame from EditorScene.update().
     *
     * @param vp ViewportState snapshot for correct world→screen projection.
     */
    drawSelection(gfx: Phaser.GameObjects.Graphics, vp: ViewportState): void {
        const selected = this.state.selected;
        if (!selected) return;

        const bounds = this.getScreenBounds(selected, vp);
        if (!bounds) return;

        // Selection rectangle
        gfx.lineStyle(SELECTION_LINE_WIDTH, SELECTION_COLOR, SELECTION_ALPHA);
        gfx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

        // Corner handles (small filled squares)
        const handleSize = 6;
        const hs = handleSize / 2;
        gfx.fillStyle(SELECTION_COLOR, SELECTION_ALPHA);
        const corners = [
            { x: bounds.x, y: bounds.y },
            { x: bounds.x + bounds.width, y: bounds.y },
            { x: bounds.x, y: bounds.y + bounds.height },
            { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        ];
        for (const c of corners) {
            gfx.fillRect(c.x - hs, c.y - hs, handleSize, handleSize);
        }

        // Center crosshair
        const cx = bounds.x + bounds.width / 2;
        const cy = bounds.y + bounds.height / 2;
        const crossSize = 8;
        gfx.lineStyle(1, SELECTION_COLOR, 0.6);
        gfx.beginPath();
        gfx.moveTo(cx - crossSize, cy);
        gfx.lineTo(cx + crossSize, cy);
        gfx.strokePath();
        gfx.beginPath();
        gfx.moveTo(cx, cy - crossSize);
        gfx.lineTo(cx, cy + crossSize);
        gfx.strokePath();
    }

    /**
     * Get a human-readable name for a game object.
     */
    static getObjectName(obj: Phaser.GameObjects.GameObject): string {
        const name = (obj as any).name;
        if (name) return name;

        if (obj instanceof Phaser.GameObjects.Text) {
            const preview = (obj as Phaser.GameObjects.Text).text.slice(0, 20);
            return `Text: "${preview}"`;
        }
        if (obj instanceof Phaser.GameObjects.Image) {
            return `Image: ${(obj as Phaser.GameObjects.Image).texture?.key ?? 'unknown'}`;
        }
        if (obj instanceof Phaser.GameObjects.Sprite) {
            return `Sprite: ${(obj as Phaser.GameObjects.Sprite).texture?.key ?? 'unknown'}`;
        }
        if (obj instanceof Phaser.GameObjects.Container) {
            return `Container (${(obj as Phaser.GameObjects.Container).list.length} children)`;
        }
        return obj.type ?? 'GameObject';
    }

    destroy(): void {
        this.pausedSceneKeys = [];
    }
}
