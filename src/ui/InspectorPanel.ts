import { Pane, FolderApi } from 'tweakpane';
import Phaser from 'phaser';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { SelectionManager } from '../core/SelectionManager';

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
    };

    /** The currently bound game object. */
    private target: Phaser.GameObjects.GameObject | null = null;

    /** The host scene for coordinate conversions. */
    private hostScene: Phaser.Scene | null = null;

    /** Whether we're currently applying a pane change to the game object (prevents feedback loop). */
    private applying = false;

    constructor(container: HTMLElement, coords: CoordinateSystem) {
        this.container = container;
        this.coords = coords;
    }

    /**
     * Build the panel for a newly selected object.
     */
    bind(obj: Phaser.GameObjects.GameObject, hostScene: Phaser.Scene): void {
        this.dispose();
        this.target = obj;
        this.hostScene = hostScene;

        // Read initial values from the object
        this.syncFromObject();

        // Create the pane inside our container
        const wrapper = document.createElement('div');
        wrapper.className = 'phaser-editor-inspector';
        wrapper.style.cssText = `
            position: absolute;
            top: 40px;
            right: 8px;
            width: 260px;
            pointer-events: auto;
            max-height: calc(100vh - 80px);
            overflow-y: auto;
        `;
        this.container.appendChild(wrapper);

        this.pane = new Pane({
            container: wrapper,
            title: SelectionManager.getObjectName(obj),
        });

        // --- Transform folder ---
        const transform = this.pane.addFolder({ title: 'Transform', expanded: true });
        transform.addBinding(this.params, 'x', { step: 1, label: 'x' })
            .on('change', () => this.applyTransform());
        transform.addBinding(this.params, 'y', { step: 1, label: 'y' })
            .on('change', () => this.applyTransform());
        transform.addBinding(this.params, 'rotation', { step: 1, label: 'rotation' })
            .on('change', () => this.applyRotation());
        transform.addBinding(this.params, 'scaleX', { min: 0.01, step: 0.01, label: 'scaleX' })
            .on('change', () => this.applyScale());
        transform.addBinding(this.params, 'scaleY', { min: 0.01, step: 0.01, label: 'scaleY' })
            .on('change', () => this.applyScale());

        // --- Origin folder ---
        if ('originX' in obj) {
            const origin = this.pane.addFolder({ title: 'Origin', expanded: false });
            origin.addBinding(this.params, 'originX', { min: 0, max: 1, step: 0.05, label: 'originX' })
                .on('change', () => this.applyOrigin());
            origin.addBinding(this.params, 'originY', { min: 0, max: 1, step: 0.05, label: 'originY' })
                .on('change', () => this.applyOrigin());
        }

        // --- Display folder ---
        const display = this.pane.addFolder({ title: 'Display', expanded: false });
        display.addBinding(this.params, 'alpha', { min: 0, max: 1, step: 0.05, label: 'alpha' })
            .on('change', () => this.applyDisplay());
        display.addBinding(this.params, 'visible', { label: 'visible' })
            .on('change', () => this.applyDisplay());
        display.addBinding(this.params, 'depth', { readonly: true, label: 'depth' });

        // --- Info folder ---
        const info = this.pane.addFolder({ title: 'Info', expanded: false });
        info.addBinding(this.params, 'name', { readonly: true, label: 'name' });
        info.addBinding(this.params, 'type', { readonly: true, label: 'type' });
        if (this.params.texture) {
            info.addBinding(this.params, 'texture', { readonly: true, label: 'texture' });
        }
        if (this.params.parent) {
            info.addBinding(this.params, 'parent', { readonly: true, label: 'parent' });
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
        this.hostScene = null;
    }

    /**
     * Sync panel values from the game object. Called each frame from EditorScene.update()
     * to reflect gizmo-driven changes in the panel.
     */
    refresh(): void {
        if (!this.target || !this.pane || this.applying) return;
        this.syncFromObject();
        this.pane.refresh();
    }

    // ---- Sync: object → params ----

    private syncFromObject(): void {
        const obj = this.target;
        if (!obj || !this.hostScene) return;

        const t = obj as unknown as Phaser.GameObjects.Components.Transform;
        const designPos = this.coords.getDesignPosition(obj, this.hostScene);

        this.params.x = Math.round(designPos.x);
        this.params.y = Math.round(designPos.y);
        this.params.rotation = 'angle' in obj ? (obj as any).angle : 0;
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
    }

    // ---- Apply: params → object ----

    private applyTransform(): void {
        if (!this.target || !this.hostScene) return;
        this.applying = true;
        this.coords.setDesignPosition(this.target, this.params.x, this.params.y, this.hostScene);
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
        this.applying = false;
    }
}
