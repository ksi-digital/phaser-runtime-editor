import Phaser from 'phaser';

export enum EditorTool {
    Select = 'select',
    Move = 'move',
    Rotate = 'rotate',
    Scale = 'scale',
}

export interface SnappingConfig {
    gridEnabled: boolean;
    gridSize: number;
    objectSnapEnabled: boolean;
    objectSnapThreshold: number;
}

/**
 * Central state for the editor.
 * Holds the current selection, active tool, and configuration.
 * Emits events when state changes so UI/gizmos can react.
 */
export class EditorState extends Phaser.Events.EventEmitter {
    static readonly EVENT_SELECTION_CHANGED = 'selection-changed';
    static readonly EVENT_TOOL_CHANGED = 'tool-changed';
    static readonly EVENT_HIT_AREA_EDIT_CHANGED = 'hitarea-edit-changed';

    private _selected: Phaser.GameObjects.GameObject | null = null;
    private _activeTool: EditorTool = EditorTool.Select;
    private _snapping: SnappingConfig;
    private _editingHitArea: boolean = false;

    constructor() {
        super();
        this._snapping = {
            gridEnabled: false,
            gridSize: 10,
            objectSnapEnabled: false,
            objectSnapThreshold: 8,
        };
    }

    get selected(): Phaser.GameObjects.GameObject | null {
        return this._selected;
    }

    set selected(obj: Phaser.GameObjects.GameObject | null) {
        if (this._selected === obj) return;
        const prev = this._selected;
        this._selected = obj;
        this._editingHitArea = false;
        this.emit(EditorState.EVENT_SELECTION_CHANGED, obj, prev);
    }

    get activeTool(): EditorTool {
        return this._activeTool;
    }

    set activeTool(tool: EditorTool) {
        if (this._activeTool === tool) return;
        this._activeTool = tool;
        this.emit(EditorState.EVENT_TOOL_CHANGED, tool);
    }

    get snapping(): SnappingConfig {
        return this._snapping;
    }

    get editingHitArea(): boolean {
        return this._editingHitArea;
    }

    set editingHitArea(value: boolean) {
        if (this._editingHitArea === value) return;
        this._editingHitArea = value;
        this.emit(EditorState.EVENT_HIT_AREA_EDIT_CHANGED, value);
    }

    deselect(): void {
        this.selected = null;
    }

    destroy(): void {
        this.removeAllListeners();
        this._selected = null;
        this._editingHitArea = false;
    }
}
