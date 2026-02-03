import Phaser from 'phaser';

const EDITOR_DEPTH = 100000;

interface EditorSceneData {
    designWidth: number;
    designHeight: number;
    hostSceneKey: string;
    pausedScenes: string[];
}

/**
 * Dedicated overlay scene for the editor.
 * Runs in parallel with (paused) game scenes.
 * Owns gizmo rendering, input handling, and the HTML UI layer.
 */
export class EditorScene extends Phaser.Scene {
    private designWidth = 720;
    private designHeight = 1552;
    private hostSceneKey = '';
    private pausedScenes: string[] = [];

    /** Graphics object for drawing gizmos, bounding boxes, grid, etc. */
    private gfx!: Phaser.GameObjects.Graphics;

    /** Semi-transparent overlay indicating editor mode */
    private overlay!: Phaser.GameObjects.Rectangle;

    /** HTML container for Tweakpane panels */
    private htmlContainer: HTMLDivElement | null = null;

    /** Status bar showing editor mode indicator */
    private statusText!: Phaser.GameObjects.Text;

    constructor() {
        super({ key: '__PhaserEditorScene__' });
    }

    init(data: EditorSceneData): void {
        this.designWidth = data.designWidth ?? 720;
        this.designHeight = data.designHeight ?? 1552;
        this.hostSceneKey = data.hostSceneKey ?? '';
        this.pausedScenes = data.pausedScenes ?? [];
    }

    create(): void {
        const { width, height } = this.cameras.main;

        // Subtle overlay to indicate editor mode (very light dim)
        this.overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.15);
        this.overlay.setDepth(EDITOR_DEPTH - 1);
        this.overlay.setInteractive(); // Captures clicks so they don't reach paused scenes

        // Graphics for gizmos
        this.gfx = this.add.graphics();
        this.gfx.setDepth(EDITOR_DEPTH);

        // Status indicator
        this.statusText = this.add.text(10, 10, 'EDITOR MODE — Press F2 to exit', {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#00ff88',
            backgroundColor: '#000000aa',
            padding: { x: 8, y: 4 }
        });
        this.statusText.setDepth(EDITOR_DEPTH + 1);
        this.statusText.setScrollFactor(0); // Fixed to camera

        // Draw the design-space boundary
        this.drawDesignBounds();

        // Create HTML overlay container for future Tweakpane panels
        this.createHtmlContainer();

        // Handle resize
        this.scale.on('resize', this.onResize, this);

        console.log(`[EditorScene] Created — design: ${this.designWidth}x${this.designHeight}, host: ${this.hostSceneKey}`);
    }

    /**
     * Draws the design-space boundary rectangle over the game canvas
     * so you can see the safe area.
     */
    private drawDesignBounds(): void {
        const { width: screenW, height: screenH } = this.cameras.main;
        const sf = Math.min(screenW / this.designWidth, screenH / this.designHeight);
        const offsetX = (screenW - this.designWidth * sf) / 2;
        const offsetY = (screenH - this.designHeight * sf) / 2;

        this.gfx.clear();

        // Design area boundary — cyan dashed outline
        this.gfx.lineStyle(2, 0x00ffff, 0.6);
        this.gfx.strokeRect(
            offsetX, offsetY,
            this.designWidth * sf, this.designHeight * sf
        );

        // Corner markers
        const markerSize = 12;
        this.gfx.lineStyle(2, 0x00ffff, 0.8);
        const corners = [
            { x: offsetX, y: offsetY },
            { x: offsetX + this.designWidth * sf, y: offsetY },
            { x: offsetX, y: offsetY + this.designHeight * sf },
            { x: offsetX + this.designWidth * sf, y: offsetY + this.designHeight * sf }
        ];
        for (const c of corners) {
            // Horizontal mark
            this.gfx.beginPath();
            this.gfx.moveTo(c.x - markerSize, c.y);
            this.gfx.lineTo(c.x + markerSize, c.y);
            this.gfx.strokePath();
            // Vertical mark
            this.gfx.beginPath();
            this.gfx.moveTo(c.x, c.y - markerSize);
            this.gfx.lineTo(c.x, c.y + markerSize);
            this.gfx.strokePath();
        }
    }

    /**
     * Create the HTML overlay container for future Tweakpane panels (Phase 4+).
     */
    private createHtmlContainer(): void {
        if (this.htmlContainer) return;

        this.htmlContainer = document.createElement('div');
        this.htmlContainer.id = 'phaser-editor-ui';
        this.htmlContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1000;
            font-family: monospace;
        `;
        document.body.appendChild(this.htmlContainer);
    }

    /**
     * Remove the HTML overlay container.
     */
    private destroyHtmlContainer(): void {
        if (this.htmlContainer) {
            this.htmlContainer.remove();
            this.htmlContainer = null;
        }
    }

    private onResize(): void {
        const { width, height } = this.cameras.main;

        // Update overlay
        if (this.overlay) {
            this.overlay.setPosition(width / 2, height / 2);
            this.overlay.setSize(width, height);
        }

        // Redraw design bounds at new size
        this.drawDesignBounds();
    }

    update(): void {
        // Future: redraw gizmos, update coordinate display, etc.
    }

    /**
     * Called when this scene is stopped (editor deactivated).
     */
    shutdown(): void {
        this.destroyHtmlContainer();
        this.scale.off('resize', this.onResize, this);
    }
}
