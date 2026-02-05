import Phaser from 'phaser';

/**
 * Creates a CSS grid layout that places panels beside the canvas, not on top.
 * On destroy, restores the canvas to its original state.
 */
export class EditorFrame {
    private game: Phaser.Game;
    private frameEl: HTMLDivElement;
    private canvasCell: HTMLDivElement;
    private resizeObserver: ResizeObserver;

    // Saved state for restoration
    private originalParent: HTMLElement;
    private originalNextSibling: Node | null;
    private savedAutoCenter: number;
    private savedParent: any;
    private savedParentIsWindow: boolean;
    private savedMarginLeft: string;
    private savedMarginTop: string;

    readonly toolbarSlot: HTMLDivElement;
    readonly hierarchySlot: HTMLDivElement;
    readonly inspectorSlot: HTMLDivElement;
    readonly statusSlot: HTMLDivElement;

    constructor(game: Phaser.Game) {
        this.game = game;
        const canvas = game.canvas;

        // Save original DOM position
        this.originalParent = canvas.parentElement!;
        this.originalNextSibling = canvas.nextSibling;

        // Save ScaleManager state
        const scale = game.scale as any;
        this.savedAutoCenter = scale.autoCenter;
        this.savedParent = scale.parent;
        this.savedParentIsWindow = scale.parentIsWindow;
        this.savedMarginLeft = canvas.style.marginLeft;
        this.savedMarginTop = canvas.style.marginTop;

        // Build frame
        this.frameEl = document.createElement('div');
        this.frameEl.id = 'phaser-editor-frame';
        this.frameEl.style.cssText = `
            position: fixed; top: 0; left: 0;
            width: 100vw; height: 100vh;
            display: grid;
            grid-template-columns: auto 1fr auto;
            grid-template-rows: auto 1fr auto;
            background: #1a1a1a;
            z-index: 999;
            overflow: hidden;
        `;

        this.toolbarSlot = this.createSlot('pe-slot-toolbar', `
            grid-column: 1 / -1; grid-row: 1;
            background: rgba(30,30,30,0.95);
            border-bottom: 1px solid #444;
        `);

        this.hierarchySlot = this.createSlot('pe-slot-hierarchy', `
            grid-column: 1; grid-row: 2;
            overflow-y: auto;
            border-right: 1px solid #444;
        `);

        this.canvasCell = this.createSlot('pe-slot-canvas', `
            grid-column: 2; grid-row: 2;
            overflow: hidden;
            display: flex; align-items: center; justify-content: center;
            min-width: 0; min-height: 0;
        `);

        this.inspectorSlot = this.createSlot('pe-slot-inspector', `
            grid-column: 3; grid-row: 2;
            overflow-y: auto;
            border-left: 1px solid #444;
        `);

        this.statusSlot = this.createSlot('pe-slot-status', `
            grid-column: 1 / -1; grid-row: 3;
            padding: 4px 10px;
            font-family: monospace; font-size: 12px; color: #aaccff;
            background: rgba(0,0,0,0.7);
            border-top: 1px solid #444;
            white-space: nowrap; overflow: hidden;
        `);

        // Move canvas into center cell
        this.canvasCell.appendChild(canvas);
        document.body.appendChild(this.frameEl);

        // Patch ScaleManager to use the canvas cell as parent
        scale.parent = this.canvasCell;
        scale.parentIsWindow = false;
        scale.autoCenter = Phaser.Scale.NO_CENTER;
        canvas.style.marginLeft = '0';
        canvas.style.marginTop = '0';

        // Observe canvas cell size and tell Phaser
        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    scale.setParentSize(width, height);
                }
            }
        });
        this.resizeObserver.observe(this.canvasCell);

        // Force an immediate refresh
        const rect = this.canvasCell.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            scale.setParentSize(rect.width, rect.height);
        }
    }

    setStatusText(text: string): void {
        this.statusSlot.textContent = text;
    }

    destroy(): void {
        this.resizeObserver.disconnect();

        const canvas = this.game.canvas;
        const scale = this.game.scale as any;

        // Remove frame first so it stops covering the viewport
        this.frameEl.remove();

        // Move canvas back to its original DOM position
        if (this.originalNextSibling && this.originalNextSibling.parentNode === this.originalParent) {
            this.originalParent.insertBefore(canvas, this.originalNextSibling);
        } else {
            this.originalParent.appendChild(canvas);
        }

        // Restore ScaleManager state
        scale.parent = this.savedParent;
        scale.parentIsWindow = this.savedParentIsWindow;
        scale.autoCenter = this.savedAutoCenter;
        canvas.style.marginLeft = this.savedMarginLeft;
        canvas.style.marginTop = this.savedMarginTop;

        // Explicitly provide the correct parent dimensions.
        // We can't rely on scale.refresh() alone because when parent is
        // document.body (parentIsWindow), the body's height is content-
        // dependent and the canvas still has its editor-reduced size,
        // creating a circular dependency.
        const parentW = this.savedParentIsWindow
            ? window.innerWidth
            : this.savedParent.getBoundingClientRect().width;
        const parentH = this.savedParentIsWindow
            ? window.innerHeight
            : this.savedParent.getBoundingClientRect().height;
        scale.setParentSize(parentW, parentH);
    }

    private createSlot(className: string, css: string): HTMLDivElement {
        const div = document.createElement('div');
        div.className = className;
        div.style.cssText = css;
        this.frameEl.appendChild(div);
        return div;
    }
}
