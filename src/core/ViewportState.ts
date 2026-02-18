import Phaser from 'phaser';

/**
 * A frozen plain-object snapshot of all values needed for coordinate math.
 *
 * Captured once per frame in EditorScene.update(), passed into every subsystem
 * that needs coordinate math. Eliminates live camera reads mid-frame and
 * ensures consistent coordinate transforms throughout the frame.
 *
 * Design-space: the logical coordinate system the game is authored in (e.g. 720x1280).
 * Screen-space: actual pixel coordinates on the canvas after scale-to-fit + camera projection.
 */
export interface ViewportState {
    /** Design-space dimensions (from EditorScene init data). */
    designWidth: number;
    designHeight: number;

    /**
     * Scale factor: design units → canvas pixels for the FIT scale mode.
     * Computed as: Math.min(canvasW / designWidth, canvasH / designHeight)
     */
    scaleFactor: number;

    /**
     * Canvas-space offset of the design area origin (top-left of design rect on screen).
     * Computed as: (canvasW - designW * sf) / 2
     */
    offsetX: number;
    offsetY: number;

    /**
     * Camera scroll in world units. When camera scrollX/scrollY != 0,
     * a world-space position must be adjusted before screen conversion.
     * For games using the default camera (no scroll), these are 0.
     */
    cameraScrollX: number;
    cameraScrollY: number;

    /**
     * Camera zoom. For the editor overlay scene and default host cameras, this is 1.
     * A zoomed camera changes how world units map to screen pixels.
     */
    cameraZoom: number;

    /**
     * Camera center in screen pixels — the screen-space point that corresponds
     * to (scrollX, scrollY) in world space.
     * For a default camera filling the canvas: cameraCenterX = canvasW/2.
     */
    cameraCenterX: number;
    cameraCenterY: number;
}

/**
 * Capture a stable viewport snapshot from the host and editor scenes.
 * Call once per EditorScene.update() frame; pass the result to all subsystems
 * that need coordinate math.
 *
 * Uses editorScene.cameras.main for canvas pixel dimensions (not the host camera,
 * which may have been scrolled/zoomed). Uses hostScene.cameras.main for
 * camera scroll, zoom, and center values.
 *
 * @param designWidth  Design canvas width (from EditorScene init data)
 * @param designHeight Design canvas height (from EditorScene init data)
 * @param hostScene    The paused game scene (camera to read scroll/zoom from)
 * @param editorScene  The editor overlay scene (for canvas pixel dimensions)
 */
export function captureViewport(
    designWidth: number,
    designHeight: number,
    hostScene: Phaser.Scene,
    editorScene: Phaser.Scene,
): ViewportState {
    const cam = hostScene.cameras.main;
    const { width: canvasW, height: canvasH } = editorScene.cameras.main;

    const sf = Math.min(canvasW / designWidth, canvasH / designHeight);
    const offsetX = (canvasW - designWidth * sf) / 2;
    const offsetY = (canvasH - designHeight * sf) / 2;

    return Object.freeze({
        designWidth,
        designHeight,
        scaleFactor: sf,
        offsetX,
        offsetY,
        cameraScrollX: cam.scrollX,
        cameraScrollY: cam.scrollY,
        cameraZoom: cam.zoom,
        cameraCenterX: cam.centerX,
        cameraCenterY: cam.centerY,
    });
}
