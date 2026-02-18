import { Pane, FolderApi } from 'tweakpane';
import Phaser from 'phaser';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { SelectionManager } from '../core/SelectionManager';
import type { ViewportState } from '../core/ViewportState';

/**
 * Property inspector panel using Tweakpane v4.
 * Shows transform, origin, display, and info properties for the selected object.
 * Changes in the panel update the game object in real-time (bidirectional sync
 * happens via refresh() called from EditorScene.update).
 */
export class InspectorPanel {
    private pane: Pane | null = null;
    private container: HTMLElement;
    private coords: CoordinateSystem;

    /** Proxy object that Tweakpane binds to. We sync it with the game object each frame. */
    private params = {
        // Transform (design-space)
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        // Origin
        originX: 0.5,
        originY: 0.5,
        // Display
        alpha: 1,
        visible: true,
        depth: 0,
        // Info (read-only)
        name: '',
        type: '',
        texture: '',
        parent: '',
        // Hit area
        hitAreaShape: '',
        hitAreaX: 0,
        hitAreaY: 0,
        hitAreaW: 0,
        hitAreaH: 0,
        hitAreaRadius: 0,
    };

    /** The currently bound game object. */
    private target: Phaser.GameObjects.GameObject | null = null;

    /** The viewport state for coordinate conversions. */
    private vp: ViewportState | null = null;

    /** Whether we're currently applying a pane change to the game object (prevents feedback loop). */
    private applying = false;

    constructor(container: HTMLElement, coords: CoordinateSystem) {
        this.container = container;
        this.coords = coords;
    }

    /**
     * Build the panel for a newly selected object.
     */
    bind(obj: Phaser.GameObjects.GameObject, vp: ViewportState): void {
        this.dispose();
        this.target = obj;
        this.vp = vp;

        // Read initial values from the object
        this.syncFromObject();

        // Create the pane inside our container
        const wrapper = document.createElement('div');
        wrapper.className = 'phaser-editor-inspector';
        wrapper.style.cssText = `
            width: 260px;
            overflow-y: auto;
        `;
        this.container.appendChild(wrapper);

        // Title bar
        const titleBar = document.createElement('div');
        titleBar.textContent = SelectionManager.getObjectName(obj);
        titleBar.style.cssText = `
            padding: 6px 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 11px;
            font-weight: bold;
            color: #c8ccd0;
            background: #1f1f1f;
            border-bottom: 1px solid #333;
            user-select: none;
        `;
        wrapper.appendChild(titleBar);

        this.pane = new Pane({ container: wrapper });

        // --- Transform folder ---
        // No min/max on x, y, scale — prevents values getting stuck at slider limits.
        // Tweakpane renders these as draggable number inputs (click-drag or type to edit).
        const transform = this.pane.addFolder({ title: 'Transform', expanded: true });
        transform.addBinding(this.params, 'x', { step: 1, label: 'x' })
            .on('change', () => this.applyTransform());
        transform.addBinding(this.params, 'y', { step: 1, label: 'y' })
            .on('change', () => this.applyTransform());
        transform.addBinding(this.params, 'rotation', { step: 1, label: 'rotation' })
            .on('change', () => this.applyRotation());
        transform.addBinding(this.params, 'scaleX', { step: 0.01, label: 'scaleX' })
            .on('change', () => this.applyScale());
        transform.addBinding(this.params, 'scaleY', { step: 0.01, label: 'scaleY' })
            .on('change', () => this.applyScale());

        // --- Origin folder ---
        if ('originX' in obj) {
            const origin = this.pane.addFolder({ title: 'Origin', expanded: true });
            origin.addBinding(this.params, 'originX', { min: 0, max: 1, step: 0.05, label: 'originX' })
                .on('change', () => this.applyOrigin());
            origin.addBinding(this.params, 'originY', { min: 0, max: 1, step: 0.05, label: 'originY' })
                .on('change', () => this.applyOrigin());
        }

        // --- Display folder ---
        const display = this.pane.addFolder({ title: 'Display', expanded: true });
        display.addBinding(this.params, 'alpha', { min: 0, max: 1, step: 0.05, label: 'alpha' })
            .on('change', () => this.applyDisplay());
        display.addBinding(this.params, 'visible', { label: 'visible' })
            .on('change', () => this.applyDisplay());
        display.addBinding(this.params, 'depth', { step: 1, label: 'depth' })
            .on('change', () => this.applyDisplay());

        // --- Info folder ---
        const info = this.pane.addFolder({ title: 'Info', expanded: true });
        info.addBinding(this.params, 'name', { readonly: true, label: 'name' });
        info.addBinding(this.params, 'type', { readonly: true, label: 'type' });
        if (this.params.texture) {
            info.addBinding(this.params, 'texture', { readonly: true, label: 'texture' });
        }
        if (this.params.parent) {
            info.addBinding(this.params, 'parent', { readonly: true, label: 'parent' });
        }

        // --- Hit Area folder ---
        const hitArea = (obj as any).input?.hitArea;
        if (hitArea) {
            const hitAreaFolder = this.pane.addFolder({ title: 'Hit Area', expanded: true });
            hitAreaFolder.addBinding(this.params, 'hitAreaShape', { readonly: true, label: 'shape' });

            if (hitArea instanceof Phaser.Geom.Rectangle) {
                hitAreaFolder.addBinding(this.params, 'hitAreaX', { step: 1, label: 'x' })
                    .on('change', () => this.applyHitArea());
                hitAreaFolder.addBinding(this.params, 'hitAreaY', { step: 1, label: 'y' })
                    .on('change', () => this.applyHitArea());
                hitAreaFolder.addBinding(this.params, 'hitAreaW', { min: 1, step: 1, label: 'width' })
                    .on('change', () => this.applyHitArea());
                hitAreaFolder.addBinding(this.params, 'hitAreaH', { min: 1, step: 1, label: 'height' })
                    .on('change', () => this.applyHitArea());
            } else if (hitArea instanceof Phaser.Geom.Circle) {
                hitAreaFolder.addBinding(this.params, 'hitAreaX', { step: 1, label: 'x' })
                    .on('change', () => this.applyHitArea());
                hitAreaFolder.addBinding(this.params, 'hitAreaY', { step: 1, label: 'y' })
                    .on('change', () => this.applyHitArea());
                hitAreaFolder.addBinding(this.params, 'hitAreaRadius', { min: 1, step: 1, label: 'radius' })
                    .on('change', () => this.applyHitArea());
            }
            // Polygon: shape label only (read-only), vertex editing too complex for simple fields
        }
    }

    /**
     * Unbind and destroy the panel.
     */
    dispose(): void {
        if (this.pane) {
            this.pane.dispose();
            this.pane = null;
        }
        // Remove the wrapper div
        const wrapper = this.container.querySelector('.phaser-editor-inspector');
        if (wrapper) wrapper.remove();

        this.target = null;
        this.vp = null;
    }

    /**
     * Sync panel values from the game object. Called each frame from EditorScene.update()
     * to reflect gizmo-driven changes in the panel.
     * If vp is provided, updates the stored ViewportState for coordinate conversions.
     */
    refresh(vp?: ViewportState): void {
        if (vp) {
            this.vp = vp;
        }
        if (!this.target || !this.pane || this.applying) return;
        this.syncFromObject();
        this.pane.refresh();
    }

    // ---- Sync: object → params ----

    private syncFromObject(): void {
        const obj = this.target;
        if (!obj || !this.vp) return;

        const t = obj as unknown as Phaser.GameObjects.Components.Transform;
        const designPos = this.coords.getDesignPosition(obj, this.vp);

        this.params.x = Math.round(designPos.x);
        this.params.y = Math.round(designPos.y);
        const rawAngle = 'angle' in obj ? (obj as any).angle : 0;
        this.params.rotation = ((rawAngle % 360) + 540) % 360 - 180;
        this.params.scaleX = 'scaleX' in obj ? (obj as any).scaleX : 1;
        this.params.scaleY = 'scaleY' in obj ? (obj as any).scaleY : 1;

        this.params.originX = 'originX' in obj ? (obj as any).originX : 0.5;
        this.params.originY = 'originY' in obj ? (obj as any).originY : 0.5;

        this.params.alpha = 'alpha' in obj ? (obj as any).alpha : 1;
        this.params.visible = 'visible' in obj ? (obj as any).visible : true;
        this.params.depth = 'depth' in obj ? (obj as any).depth : 0;

        this.params.name = SelectionManager.getObjectName(obj);
        this.params.type = obj.type ?? 'GameObject';
        this.params.texture = 'texture' in obj ? ((obj as any).texture?.key ?? '') : '';
        this.params.parent = ('parentContainer' in obj && (obj as any).parentContainer)
            ? SelectionManager.getObjectName((obj as any).parentContainer)
            : '';

        // Hit area geometry
        const input = (obj as any).input;
        if (input?.hitArea) {
            const ha = input.hitArea;
            if (ha instanceof Phaser.Geom.Rectangle) {
                this.params.hitAreaShape = 'Rectangle';
                this.params.hitAreaX = ha.x;
                this.params.hitAreaY = ha.y;
                this.params.hitAreaW = ha.width;
                this.params.hitAreaH = ha.height;
            } else if (ha instanceof Phaser.Geom.Circle) {
                this.params.hitAreaShape = 'Circle';
                this.params.hitAreaX = ha.x;
                this.params.hitAreaY = ha.y;
                this.params.hitAreaRadius = ha.radius;
            } else if (ha instanceof Phaser.Geom.Polygon) {
                this.params.hitAreaShape = `Polygon (${ha.points.length} vertices)`;
            } else {
                this.params.hitAreaShape = 'Custom';
            }
        } else {
            this.params.hitAreaShape = '';
        }
    }

    // ---- Apply: params → object ----

    private applyTransform(): void {
        if (!this.target || !this.vp) return;
        this.applying = true;
        this.coords.setDesignPosition(this.target, this.params.x, this.params.y, this.vp);
        this.applying = false;
    }

    private applyRotation(): void {
        if (!this.target) return;
        this.applying = true;
        if ('angle' in this.target) {
            (this.target as any).angle = this.params.rotation;
        }
        this.applying = false;
    }

    private applyScale(): void {
        if (!this.target) return;
        this.applying = true;
        if ('scaleX' in this.target) (this.target as any).scaleX = this.params.scaleX;
        if ('scaleY' in this.target) (this.target as any).scaleY = this.params.scaleY;
        this.applying = false;
    }

    private applyOrigin(): void {
        if (!this.target) return;
        this.applying = true;
        if ('setOrigin' in this.target && typeof (this.target as any).setOrigin === 'function') {
            (this.target as any).setOrigin(this.params.originX, this.params.originY);
        }
        this.applying = false;
    }

    private applyDisplay(): void {
        if (!this.target) return;
        this.applying = true;
        if ('alpha' in this.target) (this.target as any).alpha = this.params.alpha;
        if ('visible' in this.target) (this.target as any).visible = this.params.visible;
        if ('depth' in this.target) (this.target as any).depth = this.params.depth;
        this.applying = false;
    }

    private applyHitArea(): void {
        const input = (this.target as any)?.input;
        if (!input?.hitArea) return;
        this.applying = true;
        const ha = input.hitArea;
        if (ha instanceof Phaser.Geom.Rectangle) {
            ha.x = this.params.hitAreaX;
            ha.y = this.params.hitAreaY;
            ha.width = this.params.hitAreaW;
            ha.height = this.params.hitAreaH;
        } else if (ha instanceof Phaser.Geom.Circle) {
            ha.x = this.params.hitAreaX;
            ha.y = this.params.hitAreaY;
            ha.radius = this.params.hitAreaRadius;
        }
        this.applying = false;
    }

}
