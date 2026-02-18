import Phaser from 'phaser';
import { EditorState } from '../core/EditorState';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { InspectorPanel } from './InspectorPanel';
import { HierarchyPanel } from './HierarchyPanel';
import { ToolbarPanel } from './ToolbarPanel';
import type { ViewportState } from '../core/ViewportState';

export interface EditorUISlots {
    toolbar: HTMLElement;
    hierarchy: HTMLElement;
    inspector: HTMLElement;
}

/**
 * Manages the HTML-based editor UI panels.
 * Each panel is mounted into its own slot provided by EditorFrame.
 * Listens to EditorState events and creates/destroys panels accordingly.
 */
export class EditorUI {
    private state: EditorState;
    private coords: CoordinateSystem;

    /** Latest ViewportState passed from EditorScene.update(). */
    private currentVp: ViewportState | null = null;

    private inspector: InspectorPanel;
    private hierarchy: HierarchyPanel;
    private toolbar: ToolbarPanel;

    constructor(
        state: EditorState,
        coords: CoordinateSystem,
        slots: EditorUISlots,
        hostScene: Phaser.Scene,
        game: Phaser.Game,
        pausedSceneKeys: string[],
        getChanges: (() => Record<string, Record<string, { from: number | boolean; to: number | boolean }>>) | null,
    ) {
        this.state = state;
        this.coords = coords;

        this.inspector = new InspectorPanel(slots.inspector, coords);
        this.hierarchy = new HierarchyPanel(state, game, pausedSceneKeys, slots.hierarchy);
        this.toolbar = new ToolbarPanel(state, slots.toolbar, getChanges);

        // Wire up selection changes
        this.state.on(EditorState.EVENT_SELECTION_CHANGED, this.onSelectionChanged, this);
    }

    /**
     * Called each frame. Syncs panel values from game objects (for gizmo-driven changes).
     * Pass the current ViewportState so the inspector can refresh coordinate math.
     */
    refresh(vp?: ViewportState): void {
        if (vp) {
            this.currentVp = vp;
        }
        this.inspector.refresh(this.currentVp ?? undefined);
        this.hierarchy.refresh();
    }

    private onSelectionChanged(obj: Phaser.GameObjects.GameObject | null): void {
        if (obj && this.currentVp) {
            this.inspector.bind(obj, this.currentVp);
        } else {
            this.inspector.dispose();
        }
    }

    destroy(): void {
        this.state.off(EditorState.EVENT_SELECTION_CHANGED, this.onSelectionChanged, this);
        this.inspector.dispose();
        this.hierarchy.dispose();
        this.toolbar.dispose();
    }
}
