import { EditorState, EditorTool } from '../core/EditorState';

/**
 * Top toolbar panel with tool buttons and snapping controls.
 * Lives inside the HTML overlay container.
 */
export class ToolbarPanel {
    private state: EditorState;
    private container: HTMLElement;
    private wrapper: HTMLDivElement | null = null;
    private toolButtons = new Map<EditorTool, HTMLButtonElement>();

    constructor(state: EditorState, container: HTMLElement) {
        this.state = state;
        this.container = container;

        this.createWrapper();
        this.state.on(EditorState.EVENT_TOOL_CHANGED, this.onToolChanged, this);
    }

    dispose(): void {
        this.state.off(EditorState.EVENT_TOOL_CHANGED, this.onToolChanged, this);
        this.toolButtons.clear();
        if (this.wrapper) {
            this.wrapper.remove();
            this.wrapper = null;
        }
    }

    // ---- Private ----

    private createWrapper(): void {
        this.injectStyles();

        this.wrapper = document.createElement('div');
        this.wrapper.className = 'phaser-editor-toolbar';
        this.wrapper.style.cssText = `
            position: absolute;
            top: 8px;
            left: 50%;
            transform: translateX(-50%);
            pointer-events: auto;
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(30, 30, 30, 0.95);
            border: 1px solid #444;
            border-radius: 4px;
            padding: 4px 10px;
            font-family: monospace;
            font-size: 12px;
            color: #ccc;
            user-select: none;
            z-index: 10;
        `;
        this.container.appendChild(this.wrapper);

        // Tool buttons
        const toolGroup = this.createGroup();
        this.addToolButton(toolGroup, 'Select', EditorTool.Select);
        this.addToolButton(toolGroup, 'Move', EditorTool.Move);
        this.addToolButton(toolGroup, 'Rotate', EditorTool.Rotate);
        this.addToolButton(toolGroup, 'Scale', EditorTool.Scale);
        this.wrapper.appendChild(toolGroup);

        this.addSeparator();

        // Snap controls
        const snapGroup = this.createGroup();

        const gridCheck = this.createCheckbox('Grid', this.state.snapping.gridEnabled, (checked) => {
            this.state.snapping.gridEnabled = checked;
        });
        snapGroup.appendChild(gridCheck);

        const gridSizeInput = this.createNumberInput(this.state.snapping.gridSize, 1, 200, (val) => {
            this.state.snapping.gridSize = val;
        });
        snapGroup.appendChild(gridSizeInput);

        const objSnapCheck = this.createCheckbox('Obj Snap', this.state.snapping.objectSnapEnabled, (checked) => {
            this.state.snapping.objectSnapEnabled = checked;
        });
        snapGroup.appendChild(objSnapCheck);

        this.wrapper.appendChild(snapGroup);

        // Highlight current tool
        this.updateToolHighlight();
    }

    private injectStyles(): void {
        if (document.getElementById('phaser-editor-toolbar-styles')) return;

        const style = document.createElement('style');
        style.id = 'phaser-editor-toolbar-styles';
        style.textContent = `
            .pe-tool-btn {
                padding: 3px 8px;
                border: 1px solid #555;
                border-radius: 3px;
                background: #2a2a2a;
                color: #aaa;
                font-family: monospace;
                font-size: 11px;
                cursor: pointer;
                transition: background 0.1s, color 0.1s;
            }
            .pe-tool-btn:hover {
                background: #3a3a3a;
                color: #ddd;
            }
            .pe-tool-btn.pe-active {
                background: #4488ff;
                color: #fff;
                border-color: #5599ff;
            }
            .pe-snap-check {
                display: flex;
                align-items: center;
                gap: 3px;
                cursor: pointer;
                color: #aaa;
                font-size: 11px;
            }
            .pe-snap-check input {
                cursor: pointer;
            }
            .pe-snap-input {
                width: 40px;
                padding: 2px 4px;
                border: 1px solid #555;
                border-radius: 3px;
                background: #2a2a2a;
                color: #ccc;
                font-family: monospace;
                font-size: 11px;
                text-align: center;
            }
            .pe-toolbar-sep {
                width: 1px;
                height: 20px;
                background: #555;
                flex-shrink: 0;
            }
            .pe-toolbar-group {
                display: flex;
                align-items: center;
                gap: 4px;
            }
        `;
        document.head.appendChild(style);
    }

    private createGroup(): HTMLDivElement {
        const div = document.createElement('div');
        div.className = 'pe-toolbar-group';
        return div;
    }

    private addSeparator(): void {
        if (!this.wrapper) return;
        const sep = document.createElement('div');
        sep.className = 'pe-toolbar-sep';
        this.wrapper.appendChild(sep);
    }

    private addToolButton(parent: HTMLElement, label: string, tool: EditorTool): void {
        const btn = document.createElement('button');
        btn.className = 'pe-tool-btn';
        btn.textContent = label;
        btn.addEventListener('click', () => {
            this.state.activeTool = tool;
        });
        this.toolButtons.set(tool, btn);
        parent.appendChild(btn);
    }

    private createCheckbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
        const lbl = document.createElement('label');
        lbl.className = 'pe-snap-check';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.addEventListener('change', () => onChange(input.checked));
        lbl.appendChild(input);
        lbl.appendChild(document.createTextNode(label));
        return lbl;
    }

    private createNumberInput(value: number, min: number, max: number, onChange: (v: number) => void): HTMLInputElement {
        const input = document.createElement('input');
        input.className = 'pe-snap-input';
        input.type = 'number';
        input.value = String(value);
        input.min = String(min);
        input.max = String(max);
        input.addEventListener('change', () => {
            const val = parseInt(input.value, 10);
            if (!isNaN(val) && val >= min) onChange(val);
        });
        return input;
    }

    private updateToolHighlight(): void {
        for (const [tool, btn] of this.toolButtons) {
            btn.classList.toggle('pe-active', tool === this.state.activeTool);
        }
    }

    private onToolChanged(): void {
        this.updateToolHighlight();
    }
}
