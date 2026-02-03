import Phaser from 'phaser';

/**
 * Handles coordinate conversions between design-space and screen-space.
 *
 * Design-space: the logical coordinate system the game is authored in (e.g. 720x1280).
 * Screen-space: the actual pixel coordinates on the canvas after scale-to-fit.
 *
 * The conversion uses the same math as a typical Phaser Scale.FIT setup:
 *   scaleFactor = min(screenW / designW, screenH / designH)
 *   offsetX = (screenW - designW * sf) / 2
 *   offsetY = (screenH - designH * sf) / 2
 *   screenX = offsetX + designX * sf
 */
export class CoordinateSystem {
    constructor(
        public designWidth: number,
        public designHeight: number,
    ) {}

    /** Current scale factor derived from camera dimensions. */
    getScaleFactor(scene: Phaser.Scene): number {
        const { width, height } = scene.cameras.main;
        return Math.min(width / this.designWidth, height / this.designHeight);
    }

    /** Offset from canvas edge to design area origin. */
    getOffset(scene: Phaser.Scene): { x: number; y: number } {
        const { width, height } = scene.cameras.main;
        const sf = this.getScaleFactor(scene);
        return {
            x: (width - this.designWidth * sf) / 2,
            y: (height - this.designHeight * sf) / 2,
        };
    }

    /** Convert a design-space point to screen-space. */
    designToScreen(dx: number, dy: number, scene: Phaser.Scene): { x: number; y: number } {
        const sf = this.getScaleFactor(scene);
        const offset = this.getOffset(scene);
        return {
            x: offset.x + dx * sf,
            y: offset.y + dy * sf,
        };
    }

    /** Convert a screen-space point to design-space. */
    screenToDesign(sx: number, sy: number, scene: Phaser.Scene): { x: number; y: number } {
        const sf = this.getScaleFactor(scene);
        const offset = this.getOffset(scene);
        return {
            x: (sx - offset.x) / sf,
            y: (sy - offset.y) / sf,
        };
    }

    /**
     * Get the world (screen-space) position of a game object,
     * accounting for parent Container transforms.
     */
    getWorldPosition(obj: Phaser.GameObjects.GameObject): { x: number; y: number } {
        if (!('x' in obj)) return { x: 0, y: 0 };
        const t = obj as unknown as Phaser.GameObjects.Components.Transform;

        // If the object is inside a Container, use the transform matrix
        if ('parentContainer' in obj && (obj as any).parentContainer) {
            const matrix = (t as any).getWorldTransformMatrix() as Phaser.GameObjects.Components.TransformMatrix;
            return { x: matrix.tx, y: matrix.ty };
        }

        return { x: t.x, y: t.y };
    }

    /**
     * Get the design-space position of a game object.
     * Converts from its world (screen) position back to design coordinates.
     */
    getDesignPosition(obj: Phaser.GameObjects.GameObject, scene: Phaser.Scene): { x: number; y: number } {
        const world = this.getWorldPosition(obj);
        return this.screenToDesign(world.x, world.y, scene);
    }

    /**
     * Set a game object's position using design-space coordinates.
     * Handles objects inside Containers by converting to local space.
     */
    setDesignPosition(
        obj: Phaser.GameObjects.GameObject,
        dx: number,
        dy: number,
        scene: Phaser.Scene,
    ): void {
        if (!('x' in obj)) return;
        const t = obj as unknown as Phaser.GameObjects.Components.Transform;

        const screen = this.designToScreen(dx, dy, scene);

        // If inside a Container, convert screen coords to parent-local coords
        if ('parentContainer' in obj && (obj as any).parentContainer) {
            const parent = (obj as any).parentContainer as Phaser.GameObjects.Container;
            const parentMatrix = parent.getWorldTransformMatrix();
            const inv = parentMatrix.invert();
            const local = inv.transformPoint(screen.x, screen.y);
            t.x = local.x;
            t.y = local.y;
        } else {
            t.x = screen.x;
            t.y = screen.y;
        }
    }
}
