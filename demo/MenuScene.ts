import Phaser from 'phaser';

const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1280;

/**
 * Simple menu scene — shows a title and a Play button.
 * Press F2 to test the editor on this scene too.
 */
export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MenuScene' });
    }

    create(): void {
        const { width, height } = this.cameras.main;
        const sf = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
        const ox = (width - DESIGN_WIDTH * sf) / 2;
        const oy = (height - DESIGN_HEIGHT * sf) / 2;

        const toScreen = (dx: number, dy: number) => ({
            x: ox + dx * sf,
            y: oy + dy * sf,
        });

        // --- Generate menu-specific textures ---
        this.generateTextures(sf);

        // --- Background (depth 0) ---
        const bg = this.add.image(width / 2, height / 2, 'menu_bg');
        bg.setDisplaySize(width, height);
        bg.setDepth(0);
        bg.setName('menu_background');

        // --- Title (depth 5) ---
        const titlePos = toScreen(DESIGN_WIDTH / 2, 350);
        const title = this.add.text(titlePos.x, titlePos.y, 'Platformer', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.round(64 * sf)}px`,
            color: '#ffffff',
            stroke: '#222244',
            strokeThickness: Math.round(6 * sf),
        });
        title.setOrigin(0.5, 0.5);
        title.setDepth(5);
        title.setName('title_text');

        // --- Subtitle (depth 5) ---
        const subPos = toScreen(DESIGN_WIDTH / 2, 440);
        const subtitle = this.add.text(subPos.x, subPos.y, 'A tiny demo game', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.round(24 * sf)}px`,
            color: '#aaaacc',
        });
        subtitle.setOrigin(0.5, 0.5);
        subtitle.setDepth(5);
        subtitle.setName('subtitle_text');

        // --- Play button (depth 10) ---
        const btnPos = toScreen(DESIGN_WIDTH / 2, 650);
        const btnBg = this.add.image(0, 0, 'menu_btn');
        btnBg.setDisplaySize(280 * sf, 80 * sf);
        btnBg.setName('play_btn_bg');

        const btnLabel = this.add.text(0, 0, 'Play', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.round(36 * sf)}px`,
            color: '#ffffff',
        });
        btnLabel.setOrigin(0.5, 0.5);
        btnLabel.setName('play_btn_label');

        const playBtn = this.add.container(btnPos.x, btnPos.y, [btnBg, btnLabel]);
        playBtn.setDepth(10);
        playBtn.setName('play_button');
        playBtn.setSize(280 * sf, 80 * sf);

        btnBg.setInteractive();
        btnBg.on('pointerdown', () => {
            this.scene.start('DemoScene');
        });

        // --- Decorative stars (depth 2) ---
        const starPositions = [
            { x: 120, y: 200, s: 1.0 },
            { x: 600, y: 180, s: 0.7 },
            { x: 300, y: 120, s: 0.5 },
            { x: 500, y: 280, s: 0.8 },
            { x: 80, y: 400, s: 0.6 },
        ];
        for (let i = 0; i < starPositions.length; i++) {
            const sp = starPositions[i];
            const pos = toScreen(sp.x, sp.y);
            const star = this.add.image(pos.x, pos.y, 'menu_star');
            star.setDisplaySize(24 * sp.s * sf, 24 * sp.s * sf);
            star.setDepth(2);
            star.setName(`star_${i + 1}`);
            star.setAlpha(0.6 + sp.s * 0.4);

            this.tweens.add({
                targets: star,
                alpha: 0.2,
                duration: 1500 + i * 400,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
        }

        // --- Hint text (depth 5) ---
        const hintPos = toScreen(DESIGN_WIDTH / 2, 1100);
        const hint = this.add.text(hintPos.x, hintPos.y, 'Press F2 to open the editor', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.round(18 * sf)}px`,
            color: '#666688',
        });
        hint.setOrigin(0.5, 0.5);
        hint.setDepth(5);
        hint.setName('hint_text');

        console.log('[MenuScene] Created — objects:', this.children.list.length);
    }

    private generateTextures(sf: number): void {
        const g = this.make.graphics({ x: 0, y: 0 }, false);

        // Menu background — dark gradient
        if (!this.textures.exists('menu_bg')) {
            g.clear();
            for (let i = 0; i < 256; i++) {
                const t = i / 255;
                const r = Math.round(15 + t * 20);
                const gb = Math.round(15 + t * 25);
                const b = Math.round(40 + t * 50);
                g.fillStyle(Phaser.Display.Color.GetColor(r, gb, b), 1);
                g.fillRect(0, i * 2, 64, 2);
            }
            g.generateTexture('menu_bg', 64, 512);
        }

        // Play button
        if (!this.textures.exists('menu_btn')) {
            g.clear();
            g.fillStyle(0x2277dd, 1);
            g.fillRoundedRect(0, 0, 280, 80, 16);
            g.lineStyle(3, 0x44aaff, 1);
            g.strokeRoundedRect(0, 0, 280, 80, 16);
            g.generateTexture('menu_btn', 280, 80);
        }

        // Star
        if (!this.textures.exists('menu_star')) {
            g.clear();
            g.fillStyle(0xffffcc, 1);
            // Simple diamond shape as a star
            g.fillTriangle(12, 0, 24, 12, 12, 24);
            g.fillTriangle(12, 0, 0, 12, 12, 24);
            g.generateTexture('menu_star', 24, 24);
        }

        g.destroy();
    }
}
