import Phaser from 'phaser';
import { EditorState } from '../core/EditorState';
import { SelectionManager } from '../core/SelectionManager';

/**
 * Left-sidebar hierarchy panel showing a tree of all scene objects.
 * Uses plain HTML <ul>/<li> with CSS indentation.
 *
 * Features:
 * - Traverses scene.children.list for all paused scenes
 * - Recurses into Containers to show children as nested tree items
 * - Click item → selects on canvas (syncs with EditorState)
 * - Selected item highlighted
 * - Visibility toggle eye icon per object
 * - Depth value display
 * - Collapsible Containers
 * - Scrollable panel
 */
export class HierarchyPanel {
    private state: EditorState;
    private game: Phaser.Game;
    private pausedSceneKeys: string[];
    private container: HTMLElement;

    private wrapper: HTMLDivElement | null = null;
    private listEl: HTMLUListElement | null = null;

    /** Track expanded containers by object reference (WeakSet survives across rebuilds). */
    private expanded = new WeakSet<Phaser.GameObjects.GameObject>();

    /** Maps DOM row elements to game objects for click handling. */
    private rowMap = new Map<HTMLElement, Phaser.GameObjects.GameObject>();

    /** Tracks which rows are hit area sub-entries (subset of rowMap keys). */
    private hitAreaRows = new Set<HTMLElement>();

    /** Tracks the currently highlighted row element. */
    private selectedRow: HTMLElement | null = null;

    constructor(
        state: EditorState,
        game: Phaser.Game,
        pausedSceneKeys: string[],
        container: HTMLElement,
    ) {
        this.state = state;
        this.game = game;
        this.pausedSceneKeys = pausedSceneKeys;
        this.container = container;

        this.createWrapper();
        this.buildTree();

        // Listen for selection / hit-area-edit changes to highlight the correct row
        this.state.on(EditorState.EVENT_SELECTION_CHANGED, this.onSelectionChanged, this);
        this.state.on(EditorState.EVENT_HIT_AREA_EDIT_CHANGED, this.onSelectionChanged, this);
    }

    /**
     * Rebuild the tree from scratch. Call when visibility or structure changes.
     */
    rebuild(): void {
        this.buildTree();
    }

    /**
     * Update highlight without rebuilding. Called each frame.
     */
    refresh(): void {
        this.updateHighlight();
    }

    dispose(): void {
        this.state.off(EditorState.EVENT_SELECTION_CHANGED, this.onSelectionChanged, this);
        this.state.off(EditorState.EVENT_HIT_AREA_EDIT_CHANGED, this.onSelectionChanged, this);
        this.rowMap.clear();
        this.hitAreaRows.clear();
        this.selectedRow = null;
        if (this.wrapper) {
            this.wrapper.remove();
            this.wrapper = null;
        }
        this.listEl = null;
    }

    // ---- Private ----

    private createWrapper(): void {
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'phaser-editor-hierarchy';
        this.wrapper.style.cssText = `
            width: 220px;
            height: 100%;
            overflow-y: auto;
            overflow-x: hidden;
            background: rgba(30, 30, 30, 0.95);
            color: #ccc;
            font-family: monospace;
            font-size: 12px;
            user-select: none;
        `;
        this.container.appendChild(this.wrapper);

        // Inject styles for the hierarchy panel
        this.injectStyles();
    }

    private injectStyles(): void {
        if (document.getElementById('phaser-editor-hierarchy-styles')) return;

        const style = document.createElement('style');
        style.id = 'phaser-editor-hierarchy-styles';
        style.textContent = `
            .phaser-editor-hierarchy .pe-title {
                padding: 6px 8px;
                font-weight: bold;
                font-size: 13px;
                color: #eee;
                border-bottom: 1px solid #444;
                background: rgba(50, 50, 50, 0.8);
            }
            .pe-tree {
                list-style: none;
                margin: 0;
                padding: 4px 0;
            }
            .pe-tree ul {
                list-style: none;
            }
            .pe-row {
                display: flex;
                align-items: center;
                padding: 2px 6px;
                cursor: pointer;
                white-space: nowrap;
                min-height: 22px;
            }
            .pe-row:hover {
                background: rgba(80, 120, 200, 0.2);
            }
            .pe-row.pe-selected {
                background: rgba(68, 136, 255, 0.35);
                color: #fff;
            }
            .pe-row.pe-ha-selected {
                background: rgba(255, 170, 0, 0.35);
                color: #ffcc00;
            }
            .pe-toggle {
                width: 16px;
                flex-shrink: 0;
                text-align: center;
                color: #888;
                cursor: pointer;
                font-size: 10px;
            }
            .pe-toggle:hover {
                color: #fff;
            }
            .pe-eye {
                width: 20px;
                flex-shrink: 0;
                text-align: center;
                cursor: pointer;
                opacity: 0.6;
                font-size: 11px;
            }
            .pe-eye:hover {
                opacity: 1;
            }
            .pe-eye.pe-hidden {
                opacity: 0.3;
            }
            .pe-name {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                padding: 0 4px;
            }
            .pe-depth {
                flex-shrink: 0;
                color: #666;
                font-size: 10px;
                padding-right: 4px;
            }
            .pe-children {
                padding-left: 8px;
                margin-left: 8px;
                border-left: 2px solid #68f;
            }
            .pe-children.pe-collapsed {
                display: none;
            }
        `;
        document.head.appendChild(style);
    }

    private buildTree(): void {
        if (!this.wrapper) return;

        // Clear existing content
        this.rowMap.clear();
        this.hitAreaRows.clear();
        this.selectedRow = null;
        this.wrapper.innerHTML = '';

        // Title
        const title = document.createElement('div');
        title.className = 'pe-title';
        title.textContent = 'Hierarchy';
        this.wrapper.appendChild(title);

        // Tree root
        this.listEl = document.createElement('ul');
        this.listEl.className = 'pe-tree';
        this.wrapper.appendChild(this.listEl);

        // Walk all paused scenes
        for (const key of this.pausedSceneKeys) {
            const scene = this.game.scene.getScene(key);
            if (!scene) continue;

            // Scene header
            const sceneLi = document.createElement('li');
            const sceneRow = document.createElement('div');
            sceneRow.className = 'pe-row';
            sceneRow.style.fontWeight = 'bold';
            sceneRow.style.color = '#8cf';
            sceneRow.innerHTML = `<span class="pe-toggle"></span><span class="pe-name">${key}</span>`;
            sceneLi.appendChild(sceneRow);

            const childList = document.createElement('ul');
            childList.className = 'pe-children';

            for (const obj of scene.children.list) {
                if (!('x' in obj)) continue;
                this.buildNode(obj, childList);
            }

            sceneLi.appendChild(childList);
            this.listEl.appendChild(sceneLi);
        }

        this.updateHighlight();
        this.scrollToSelected();
    }

    private buildNode(obj: Phaser.GameObjects.GameObject, parentUl: HTMLElement): void {
        const li = document.createElement('li');
        const row = document.createElement('div');
        row.className = 'pe-row';

        const isContainer = obj instanceof Phaser.GameObjects.Container;
        const children = isContainer ? (obj as Phaser.GameObjects.Container).list : [];
        const hasChildren = children.length > 0;
        const isCollapsed = !this.expanded.has(obj);

        // Toggle arrow (only for containers with children)
        const toggle = document.createElement('span');
        toggle.className = 'pe-toggle';
        if (hasChildren) {
            toggle.textContent = isCollapsed ? '\u25B6' : '\u25BC'; // ▶ or ▼
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.expanded.has(obj)) {
                    this.expanded.delete(obj);
                } else {
                    this.expanded.add(obj);
                }
                this.buildTree();
            });
        }
        row.appendChild(toggle);

        // Visibility eye
        const eye = document.createElement('span');
        eye.className = 'pe-eye';
        const isVisible = 'visible' in obj ? (obj as any).visible : true;
        eye.textContent = isVisible ? '\u{1F441}' : '\u2013'; // 👁 or –
        if (!isVisible) eye.classList.add('pe-hidden');
        eye.addEventListener('click', (e) => {
            e.stopPropagation();
            if ('visible' in obj) {
                (obj as any).visible = !(obj as any).visible;
                this.buildTree();
            }
        });
        row.appendChild(eye);

        // Object name
        const name = document.createElement('span');
        name.className = 'pe-name';
        name.textContent = SelectionManager.getObjectName(obj);
        row.appendChild(name);

        // Depth
        const depth = document.createElement('span');
        depth.className = 'pe-depth';
        depth.textContent = String((obj as any).depth ?? 0);
        row.appendChild(depth);

        // Click to select
        row.addEventListener('click', () => {
            this.state.selected = obj;
        });

        this.rowMap.set(row, obj);
        li.appendChild(row);

        // Children (for containers)
        if (hasChildren) {
            const childUl = document.createElement('ul');
            childUl.className = 'pe-children';
            if (isCollapsed) childUl.classList.add('pe-collapsed');

            for (const child of children) {
                this.buildNode(child as Phaser.GameObjects.GameObject, childUl);
            }
            li.appendChild(childUl);
        }

        parentUl.appendChild(li);

        // Virtual hit area sub-entry (if object has a hit area)
        const objInput = (obj as any).input;
        if (objInput?.hitArea) {
            const shapeName = objInput.hitArea instanceof Phaser.Geom.Rectangle ? 'Rect'
                : objInput.hitArea instanceof Phaser.Geom.Circle ? 'Circle'
                : objInput.hitArea instanceof Phaser.Geom.Polygon ? 'Polygon' : 'Hit Area';

            const haLi = document.createElement('li');
            const haRow = document.createElement('div');
            haRow.className = 'pe-row';
            haRow.style.paddingLeft = '30px';
            haRow.style.color = '#dd4';
            haRow.style.fontStyle = 'italic';
            haRow.innerHTML = `<span class="pe-toggle"></span><span class="pe-name">\u2B21 ${shapeName}</span>`;
            haRow.addEventListener('click', () => {
                if (this.state.selected !== obj) {
                    this.state.selected = obj;
                }
                this.state.editingHitArea = true;
            });
            this.rowMap.set(haRow, obj);
            this.hitAreaRows.add(haRow);
            haLi.appendChild(haRow);
            parentUl.appendChild(haLi);
        }
    }

    private updateHighlight(): void {
        // Remove previous highlight
        if (this.selectedRow) {
            this.selectedRow.classList.remove('pe-selected');
            this.selectedRow.classList.remove('pe-ha-selected');
            this.selectedRow = null;
        }

        if (!this.state.selected) return;

        const wantHitArea = this.state.editingHitArea;
        let fallback: HTMLElement | null = null;

        // Find the row matching the selected object and edit mode
        for (const [row, obj] of this.rowMap) {
            if (obj !== this.state.selected) continue;
            const isHaRow = this.hitAreaRows.has(row);

            if (wantHitArea && isHaRow) {
                // Exact match: editing hit area and this is the hit area row
                this.selectedRow = row;
                row.classList.add('pe-ha-selected');
                return;
            }
            if (!wantHitArea && !isHaRow) {
                // Exact match: not editing hit area and this is the object row
                this.selectedRow = row;
                row.classList.add('pe-selected');
                return;
            }
            // Keep as fallback in case we don't find an exact match
            if (!fallback) fallback = row;
        }

        // Fallback: highlight whatever row we found for this object
        if (fallback) {
            this.selectedRow = fallback;
            fallback.classList.add(wantHitArea ? 'pe-ha-selected' : 'pe-selected');
        }
    }

    /**
     * Scroll the currently selected row into view once.
     * Uses 'instant' behavior to avoid lingering scroll animations that
     * could interfere with manual user scrolling.
     */
    private scrollToSelected(): void {
        if (this.selectedRow) {
            this.selectedRow.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        }
    }

    private onSelectionChanged(): void {
        this.updateHighlight();
        this.scrollToSelected();
    }

}
