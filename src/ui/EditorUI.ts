import Phaser from 'phaser';
import { EditorState } from '../core/EditorState';
import { CoordinateSystem } from '../core/CoordinateSystem';
import { InspectorPanel } from './InspectorPanel';
import { HierarchyPanel } from './HierarchyPanel';
import { ToolbarPanel } from './ToolbarPanel';

/**
 * Manages the HTML-based editor UI panels.
 * Lives inside the HTML overlay container created by EditorScene.
 * Listens to EditorState events and creates/destroys panels accordingly.
 */
export class EditorUI {
    private state: EditorState;
    private coords: CoordinateSystem;
    private container: HTMLElement;
    private hostScene: Phaser.Scene;

    private inspector: InspectorPanel;
    private hierarchy: HierarchyPanel;
    private toolbar: ToolbarPanel;

    constructor(
        state: EditorState,
        coords: CoordinateSystem,
        container: HTMLElement,
        hostScene: Phaser.Scene,
        game: Phaser.Game,
        pausedSceneKeys: string[],
    ) {
        this.state = state;
        this.coords = coords;
        this.container = container;
        this.hostScene = hostScene;

        this.inspector = new InspectorPanel(container, coords);
        this.hierarchy = new HierarchyPanel(state, game, pausedSceneKeys, container);
        this.toolbar = new ToolbarPanel(state, container);

        // Wire up selection changes
        this.state.on(EditorState.EVENT_SELECTION_CHANGED, this.onSelectionChanged, this);

        // If something is already selected, bind immediately
        if (this.state.selected) {
            this.inspector.bind(this.state.selected, this.hostScene);
        }
    }

    /**
     * Called each frame. Syncs panel values from game objects (for gizmo-driven changes).
     */
    refresh(): void {
        this.inspector.refresh();
        this.hierarchy.refresh();
    }

    private onSelectionChanged(obj: Phaser.GameObjects.GameObject | null): void {
        if (obj) {
            this.inspector.bind(obj, this.hostScene);
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
