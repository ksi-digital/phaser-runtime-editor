import Phaser from 'phaser';
import { EditorState } from './EditorState';
import { CoordinateSystem } from './CoordinateSystem';

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
     */
    hitTest(screenX: number, screenY: number): Phaser.GameObjects.GameObject | null {
        const objects = this.getSelectableObjects();
        let best: Phaser.GameObjects.GameObject | null = null;
        let bestDepth = -Infinity;

        for (const obj of objects) {
            if ('visible' in obj && !(obj as any).visible) continue;

            const bounds = this.getScreenBounds(obj);
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
     */
    getScreenBounds(obj: Phaser.GameObjects.GameObject): Phaser.Geom.Rectangle | null {
        // Container: compute union of children bounds
        if (obj instanceof Phaser.GameObjects.Container) {
            return this.getContainerBounds(obj);
        }

        // Regular object: use getBounds if available
        if ('getBounds' in obj && typeof (obj as any).getBounds === 'function') {
            try {
                return (obj as any).getBounds() as Phaser.Geom.Rectangle;
            } catch {
                return null;
            }
        }

        return null;
    }

    /**
     * Compute the union bounding box of a Container's children in screen-space.
     */
    private getContainerBounds(container: Phaser.GameObjects.Container): Phaser.Geom.Rectangle | null {
        if (container.list.length === 0) {
            // Empty container — use its own position with a minimum size
            const t = container as Phaser.GameObjects.Components.Transform;
            return new Phaser.Geom.Rectangle(t.x - 16, t.y - 16, 32, 32);
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const child of container.list) {
            const childBounds = this.getChildWorldBounds(child as Phaser.GameObjects.GameObject, container);
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
     * Get the world-space bounds of a child within a Container.
     */
    private getChildWorldBounds(
        child: Phaser.GameObjects.GameObject,
        _container: Phaser.GameObjects.Container,
    ): Phaser.Geom.Rectangle | null {
        if ('getBounds' in child && typeof (child as any).getBounds === 'function') {
            try {
                return (child as any).getBounds() as Phaser.Geom.Rectangle;
            } catch {
                return null;
            }
        }

        // Fallback: use world position + small default size
        const world = this.coords.getWorldPosition(child);
        return new Phaser.Geom.Rectangle(world.x - 8, world.y - 8, 16, 16);
    }

    /**
     * Draw the selection bounding box onto a Graphics object.
     * Call this every frame from EditorScene.update().
     */
    drawSelection(gfx: Phaser.GameObjects.Graphics): void {
        const selected = this.state.selected;
        if (!selected) return;

        const bounds = this.getScreenBounds(selected);
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
