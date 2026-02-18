import Phaser from 'phaser';
import { ViewportState } from './ViewportState';

/**
 * Handles coordinate conversions between design-space, world-space, and screen-space.
 *
 * All public methods accept a ViewportState snapshot instead of a live Phaser.Scene.
 * This ensures consistent coordinate math throughout a frame (no mid-frame camera drift).
 *
 * Design-space: the logical coordinate system the game is authored in (e.g. 720x1280).
 * World-space:  Phaser world coordinates (what game scripts use as obj.x / obj.y).
 * Screen-space: actual pixel coordinates on the canvas after scale-to-fit + camera projection.
 *
 * The correct Phaser camera world→screen formula (derived from Phaser's preRender matrix):
 *   screenX = (worldX - scrollX - centerX) * zoom + centerX
 *   screenY = (worldY - scrollY - centerY) * zoom + centerY
 *
 * For the default camera (zoom=1, scroll=0, centerX=canvasW/2):
 *   screenX = (worldX - 0 - canvasW/2) * 1 + canvasW/2 = worldX  (identity — correct!)
 *
 * The old (buggy) formula `(worldX - scrollX) * zoom + centerX` was missing `- centerX`
 * inside the parentheses, which added half the canvas width to every world position.
 */
export class CoordinateSystem {
    constructor(
        public designWidth: number,
        public designHeight: number,
    ) {}

    /** Convert a design-space point to screen-space. */
    designToScreen(dx: number, dy: number, vp: ViewportState): { x: number; y: number } {
        return {
            x: vp.offsetX + dx * vp.scaleFactor,
            y: vp.offsetY + dy * vp.scaleFactor,
        };
    }

    /** Convert a screen-space point to design-space. */
    screenToDesign(sx: number, sy: number, vp: ViewportState): { x: number; y: number } {
        return {
            x: (sx - vp.offsetX) / vp.scaleFactor,
            y: (sy - vp.offsetY) / vp.scaleFactor,
        };
    }

    /**
     * Convert a world-space point to screen-space using the correct Phaser camera projection.
     *
     * Formula: screenX = (worldX - scrollX - centerX) * zoom + centerX
     *
     * This is derived from Phaser's camera preRender matrix:
     *   matrix.applyITRS(originX, originY, 0, zoom, zoom)
     *   matrix.translate(-scrollX - originX, -scrollY - originY)
     * where originX = cam.centerX (= cam.x + cam.width/2).
     *
     * For default camera (zoom=1, scroll=0, centerX=canvasW/2): returns identity (worldX = screenX).
     */
    worldToScreen(worldX: number, worldY: number, vp: ViewportState): { x: number; y: number } {
        return {
            x: (worldX - vp.cameraScrollX - vp.cameraCenterX) * vp.cameraZoom + vp.cameraCenterX,
            y: (worldY - vp.cameraScrollY - vp.cameraCenterY) * vp.cameraZoom + vp.cameraCenterY,
        };
    }

    /**
     * Convert a screen-space point to world-space (inverse of worldToScreen).
     *
     * Formula: worldX = (screenX - centerX) / zoom + scrollX + centerX
     *
     * For default camera (zoom=1, scroll=0, centerX=canvasW/2): returns identity (screenX = worldX).
     */
    screenToWorld(screenX: number, screenY: number, vp: ViewportState): { x: number; y: number } {
        return {
            x: (screenX - vp.cameraCenterX) / vp.cameraZoom + vp.cameraScrollX + vp.cameraCenterX,
            y: (screenY - vp.cameraCenterY) / vp.cameraZoom + vp.cameraScrollY + vp.cameraCenterY,
        };
    }

    /**
     * Get the screen-space pixel position of a game object.
     *
     * For Container children: uses getWorldTransformMatrix().tx/ty as the world-space
     * position (already composites all parent transforms), then applies camera projection
     * via worldToScreen().
     *
     * For regular objects: uses obj.x/obj.y directly as world-space position, then
     * applies camera projection via worldToScreen().
     */
    getScreenPosition(
        obj: Phaser.GameObjects.GameObject,
        vp: ViewportState,
    ): { x: number; y: number } {
        if (!('x' in obj)) return { x: 0, y: 0 };

        let worldX: number;
        let worldY: number;

        if ('parentContainer' in obj && (obj as any).parentContainer) {
            // Container children: world matrix composes all parent transforms
            const matrix = (obj as any).getWorldTransformMatrix() as Phaser.GameObjects.Components.TransformMatrix;
            worldX = matrix.tx;
            worldY = matrix.ty;
        } else {
            worldX = (obj as any).x as number;
            worldY = (obj as any).y as number;
        }

        // World → screen via correct Phaser camera projection
        return this.worldToScreen(worldX, worldY, vp);
    }

    /**
     * Get the design-space position of a game object.
     * Converts from its world position to screen-space, then to design-space.
     */
    getDesignPosition(
        obj: Phaser.GameObjects.GameObject,
        vp: ViewportState,
    ): { x: number; y: number } {
        const screen = this.getScreenPosition(obj, vp);
        return this.screenToDesign(screen.x, screen.y, vp);
    }

    /**
     * Set a game object's position using design-space coordinates.
     * Handles objects inside Containers by converting to parent-local space.
     *
     * Flow: design → screen → world → (optionally) parent-local
     *
     * @param cachedInvParentMatrix Optional pre-computed inverted parent matrix.
     *   Pass the cached value from MoveGizmo.startDrag() to avoid per-frame matrix
     *   inversion during drag operations. Pass null to compute on the fly (for
     *   one-shot calls from InspectorPanel).
     */
    setDesignPosition(
        obj: Phaser.GameObjects.GameObject,
        dx: number,
        dy: number,
        vp: ViewportState,
        cachedInvParentMatrix?: Phaser.GameObjects.Components.TransformMatrix | null,
    ): void {
        if (!('x' in obj)) return;
        const t = obj as unknown as Phaser.GameObjects.Components.Transform;

        // design → screen
        const screen = this.designToScreen(dx, dy, vp);
        // screen → world (inverse camera projection)
        const world = this.screenToWorld(screen.x, screen.y, vp);

        // If inside a Container, convert world coords to parent-local coords
        if ('parentContainer' in obj && (obj as any).parentContainer) {
            if (cachedInvParentMatrix != null) {
                // Use pre-computed inverse (e.g. cached at drag start)
                const local = cachedInvParentMatrix.transformPoint(world.x, world.y);
                t.x = local.x;
                t.y = local.y;
            } else {
                // Compute on the fly (one-shot from InspectorPanel etc.)
                const parent = (obj as any).parentContainer as Phaser.GameObjects.Container;
                const parentMatrix = parent.getWorldTransformMatrix();
                const inv = parentMatrix.invert();
                const local = inv.transformPoint(world.x, world.y);
                t.x = local.x;
                t.y = local.y;
            }
        } else {
            t.x = world.x;
            t.y = world.y;
        }
    }

    // ---------------------------------------------------------------------------
    // Hit-area transform helpers (centralized from 3-file duplication: COORD-04)
    // ---------------------------------------------------------------------------

    /**
     * Returns a closure that maps a hit-area local point to screen-space,
     * applying displayOrigin adjustment and the object's world transform matrix.
     *
     * Hit area coordinates are in frame-space (0,0 = texture top-left for sprites).
     * The world matrix origin is at the object's displayOrigin, so we subtract
     * displayOriginX/Y to shift from frame-space to local-space before applying.
     * Containers: displayOrigin does not apply to hit-area vertices, so it is skipped.
     *
     * When a ViewportState is provided, the world-space result is projected
     * through the camera via worldToScreen(). This is required when the host
     * scene has a non-default camera (zoom != 1 or scroll != 0), because
     * the editor overlay scene draws through its own default camera.
     *
     * Extracted from:
     * - EditorScene.ts drawHitArea() lines 283-290
     * - HitAreaGizmo.ts getTransformHelpers() lines 265-287
     * - SelectionManager.ts getPolygonShapeBounds() lines 140-148
     */
    getHitAreaToScreen(
        obj: Phaser.GameObjects.GameObject,
        vp?: ViewportState,
    ): (lx: number, ly: number) => { x: number; y: number } {
        const matrix = (obj as any).getWorldTransformMatrix() as Phaser.GameObjects.Components.TransformMatrix;
        const isContainer = obj instanceof Phaser.GameObjects.Container;
        const doX = isContainer ? 0 : ((obj as any).displayOriginX ?? 0);
        const doY = isContainer ? 0 : ((obj as any).displayOriginY ?? 0);

        return (lx: number, ly: number) => {
            const adjX = lx - doX;
            const adjY = ly - doY;
            // Matrix gives world-space coordinates
            const worldX = matrix.a * adjX + matrix.c * adjY + matrix.tx;
            const worldY = matrix.b * adjX + matrix.d * adjY + matrix.ty;
            // Apply camera projection if ViewportState is provided
            if (vp) {
                return this.worldToScreen(worldX, worldY, vp);
            }
            return { x: worldX, y: worldY };
        };
    }

    /**
     * Returns a closure that converts a screen-space delta to a hit-area
     * local-space delta, using the inverse of the object's world transform matrix.
     *
     * Used for hit-area drag operations where pointer movement (screen pixels)
     * must map to hit-area coordinate changes (local frame space).
     *
     * Extracted from:
     * - HitAreaGizmo.ts getTransformHelpers() lines 271-284
     */
    getHitAreaScreenDeltaToLocal(
        obj: Phaser.GameObjects.GameObject,
        vp?: ViewportState,
    ): (dsx: number, dsy: number) => { dx: number; dy: number } {
        const matrix = (obj as any).getWorldTransformMatrix() as Phaser.GameObjects.Components.TransformMatrix;
        const det = matrix.a * matrix.d - matrix.b * matrix.c;
        // When a camera zoom is active, screen-space deltas must be divided
        // by zoom to convert to world-space deltas before inverting through
        // the object's world matrix.
        const zoom = vp?.cameraZoom ?? 1;

        return (dsx: number, dsy: number) => {
            const wdx = dsx / zoom;
            const wdy = dsy / zoom;
            return {
                dx: (matrix.d * wdx - matrix.c * wdy) / det,
                dy: (-matrix.b * wdx + matrix.a * wdy) / det,
            };
        };
    }
}
