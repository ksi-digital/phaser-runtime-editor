import Phaser from 'phaser';

const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1280;

/**
 * A simple demo scene with a variety of game objects for testing the editor.
 *
 * Objects created (all positioned in design-space coordinates):
 * - Sky background gradient
 * - Ground platform
 * - Score + Level text (HUD)
 * - Settings button (top-right)
 * - Player Container (body + head + eyes)
 * - 3 floating platforms
 * - 3 coins with bob tweens (tests pause/resume)
 * - Health bar Container (background + fill)
 * - A dialog box (higher depth, like a popup)
 */
export class DemoScene extends Phaser.Scene {
    constructor() {
        super({ key: 'DemoScene' });
    }

    create(): void {
        this.generateTextures();

        const { width, height } = this.cameras.main;
        const sf = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
        const ox = (width - DESIGN_WIDTH * sf) / 2;
        const oy = (height - DESIGN_HEIGHT * sf) / 2;

        const toScreen = (dx: number, dy: number) => ({
            x: ox + dx * sf,
            y: oy + dy * sf,
        });

        // --- Background (depth 0) ---
        const sky = this.add.image(width / 2, height / 2, 'sky');
        sky.setDisplaySize(width, height);
        sky.setDepth(0);
        sky.setName('sky_background');

        // --- Ground (depth 1) ---
        const groundPos = toScreen(DESIGN_WIDTH / 2, 1200);
        const ground = this.add.image(groundPos.x, groundPos.y, 'ground');
        ground.setDisplaySize(DESIGN_WIDTH * sf, 160 * sf);
        ground.setDepth(1);
        ground.setName('ground');

        // --- Platforms (depth 3) ---
        const platformData = [
            { x: 180, y: 900, w: 200, name: 'platform_left' },
            { x: 540, y: 750, w: 200, name: 'platform_right' },
            { x: 360, y: 600, w: 250, name: 'platform_center' },
        ];
        for (const p of platformData) {
            const pos = toScreen(p.x, p.y);
            const plat = this.add.image(pos.x, pos.y, 'platform');
            plat.setDisplaySize(p.w * sf, 32 * sf);
            plat.setDepth(3);
            plat.setName(p.name);
        }

        // --- Coins with tween (depth 4) ---
        const coinPositions = [
            { x: 180, y: 860, name: 'coin_1' },
            { x: 540, y: 710, name: 'coin_2' },
            { x: 360, y: 560, name: 'coin_3' },
        ];
        for (const c of coinPositions) {
            const pos = toScreen(c.x, c.y);
            const coin = this.add.image(pos.x, pos.y, 'coin');
            coin.setDisplaySize(36 * sf, 36 * sf);
            coin.setDepth(4);
            coin.setName(c.name);

            this.tweens.add({
                targets: coin,
                y: pos.y - 12 * sf,
                duration: 800,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
        }

        // --- Player Container (depth 5) ---
        const playerPos = toScreen(360, 1060);
        const body = this.add.image(0, 0, 'player_body');
        body.setDisplaySize(60 * sf, 80 * sf);
        body.setName('player_body');

        const head = this.add.image(0, -55 * sf, 'player_head');
        head.setDisplaySize(48 * sf, 48 * sf);
        head.setName('player_head');

        const eyeL = this.add.image(-10 * sf, -58 * sf, 'eye');
        eyeL.setDisplaySize(8 * sf, 10 * sf);
        eyeL.setName('player_eye_left');

        const eyeR = this.add.image(10 * sf, -58 * sf, 'eye');
        eyeR.setDisplaySize(8 * sf, 10 * sf);
        eyeR.setName('player_eye_right');

        const player = this.add.container(playerPos.x, playerPos.y, [body, head, eyeL, eyeR]);
        player.setDepth(5);
        player.setName('player');
        player.setSize(60 * sf, 130 * sf);

        // Idle bob for the player
        this.tweens.add({
            targets: player,
            y: playerPos.y - 6 * sf,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // --- HUD: Score text (depth 10) ---
        const scorePos = toScreen(20, 20);
        const scoreText = this.add.text(scorePos.x, scorePos.y, 'Score: 1234', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.round(28 * sf)}px`,
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: Math.round(4 * sf),
        });
        scoreText.setDepth(10);
        scoreText.setName('hud_score');

        // --- HUD: Level text (depth 10) ---
        const levelPos = toScreen(DESIGN_WIDTH / 2, 20);
        const levelText = this.add.text(levelPos.x, levelPos.y, 'Level 5', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.round(24 * sf)}px`,
            color: '#ffdd44',
            stroke: '#000000',
            strokeThickness: Math.round(3 * sf),
        });
        levelText.setOrigin(0.5, 0);
        levelText.setDepth(10);
        levelText.setName('hud_level');

        // --- HUD: Settings button (depth 10) ---
        const settingsPos = toScreen(670, 30);
        const settingsBg = this.add.image(0, 0, 'btn_settings');
        settingsBg.setDisplaySize(56 * sf, 56 * sf);
        settingsBg.setName('settings_bg');

        const settingsIcon = this.add.text(0, 0, '\u2699', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.round(32 * sf)}px`,
            color: '#ffffff',
        });
        settingsIcon.setOrigin(0.5, 0.5);
        settingsIcon.setName('settings_icon');

        const settingsBtn = this.add.container(settingsPos.x, settingsPos.y, [settingsBg, settingsIcon]);
        settingsBtn.setDepth(10);
        settingsBtn.setName('settings_button');
        settingsBtn.setSize(56 * sf, 56 * sf);

        // --- Health bar Container (depth 10) ---
        const hpPos = toScreen(20, 60);
        const hpBg = this.add.image(0, 0, 'hp_bg');
        hpBg.setDisplaySize(200 * sf, 20 * sf);
        hpBg.setOrigin(0, 0.5);
        hpBg.setName('hp_background');

        const hpFill = this.add.image(2 * sf, 0, 'hp_fill');
        hpFill.setDisplaySize(140 * sf, 16 * sf);
        hpFill.setOrigin(0, 0.5);
        hpFill.setName('hp_fill');

        const hpBar = this.add.container(hpPos.x, hpPos.y, [hpBg, hpFill]);
        hpBar.setDepth(10);
        hpBar.setName('health_bar');
        hpBar.setSize(200 * sf, 20 * sf);

        // --- Dialog box (depth 20) — a popup-like element ---
        const dlgPos = toScreen(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2);
        const dlgBg = this.add.image(0, 0, 'dialog_bg');
        dlgBg.setDisplaySize(500 * sf, 300 * sf);
        dlgBg.setName('dialog_background');

        const dlgTitle = this.add.text(0, -100 * sf, 'Welcome!', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.round(36 * sf)}px`,
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: Math.round(2 * sf),
        });
        dlgTitle.setOrigin(0.5, 0.5);
        dlgTitle.setName('dialog_title');

        const dlgBody = this.add.text(0, -20 * sf, 'Press F2 to open the editor.\nDrag objects to reposition them.', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.round(22 * sf)}px`,
            color: '#cccccc',
            align: 'center',
            lineSpacing: 8 * sf,
        });
        dlgBody.setOrigin(0.5, 0.5);
        dlgBody.setName('dialog_body');

        const dlgBtnBg = this.add.image(0, 80 * sf, 'btn_ok');
        dlgBtnBg.setDisplaySize(160 * sf, 50 * sf);
        dlgBtnBg.setName('dialog_btn_bg');

        const dlgBtnText = this.add.text(0, 80 * sf, 'OK', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.round(26 * sf)}px`,
            color: '#ffffff',
        });
        dlgBtnText.setOrigin(0.5, 0.5);
        dlgBtnText.setName('dialog_btn_text');

        const dialog = this.add.container(dlgPos.x, dlgPos.y, [dlgBg, dlgTitle, dlgBody, dlgBtnBg, dlgBtnText]);
        dialog.setDepth(20);
        dialog.setName('dialog_welcome');
        dialog.setSize(500 * sf, 300 * sf);

        // Make OK button dismiss dialog
        dlgBtnBg.setInteractive();
        dlgBtnBg.on('pointerdown', () => {
            dialog.setVisible(false);
        });

        // --- A decorative cloud with tween (depth 2) ---
        const cloudPos = toScreen(150, 200);
        const cloud = this.add.image(cloudPos.x, cloudPos.y, 'cloud');
        cloud.setDisplaySize(120 * sf, 60 * sf);
        cloud.setAlpha(0.8);
        cloud.setDepth(2);
        cloud.setName('cloud_1');

        this.tweens.add({
            targets: cloud,
            x: cloudPos.x + 400 * sf,
            duration: 12000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        const cloud2Pos = toScreen(500, 320);
        const cloud2 = this.add.image(cloud2Pos.x, cloud2Pos.y, 'cloud');
        cloud2.setDisplaySize(160 * sf, 80 * sf);
        cloud2.setAlpha(0.6);
        cloud2.setDepth(2);
        cloud2.setName('cloud_2');

        this.tweens.add({
            targets: cloud2,
            x: cloud2Pos.x - 350 * sf,
            duration: 15000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        console.log('[DemoScene] Created — objects:', this.children.list.length);
    }

    /**
     * Generate all textures procedurally so the demo needs zero asset files.
     */
    private generateTextures(): void {
        const g = this.make.graphics({ x: 0, y: 0, add: false });

        // Sky gradient
        g.clear();
        for (let i = 0; i < 256; i++) {
            const t = i / 255;
            const r = Math.round(30 + t * 40);
            const gb = Math.round(100 + (1 - t) * 120);
            const b = Math.round(180 + (1 - t) * 75);
            g.fillStyle(Phaser.Display.Color.GetColor(r, gb, b), 1);
            g.fillRect(0, i * 2, 64, 2);
        }
        g.generateTexture('sky', 64, 512);

        // Ground
        g.clear();
        g.fillStyle(0x5b8c3e, 1);
        g.fillRect(0, 0, 64, 16);
        g.fillStyle(0x6b4226, 1);
        g.fillRect(0, 16, 64, 48);
        g.generateTexture('ground', 64, 64);

        // Platform
        g.clear();
        g.fillStyle(0x8b7355, 1);
        g.fillRect(0, 0, 64, 16);
        g.fillStyle(0x6b5335, 1);
        g.fillRect(2, 4, 60, 12);
        g.generateTexture('platform', 64, 16);

        // Coin
        g.clear();
        g.fillStyle(0xffd700, 1);
        g.fillCircle(16, 16, 14);
        g.fillStyle(0xffaa00, 1);
        g.fillCircle(16, 16, 10);
        g.fillStyle(0xffd700, 1);
        g.fillCircle(14, 14, 6);
        g.generateTexture('coin', 32, 32);

        // Player body
        g.clear();
        g.fillStyle(0x4488ff, 1);
        g.fillRoundedRect(4, 4, 56, 72, 8);
        g.fillStyle(0x3366cc, 1);
        g.fillRoundedRect(8, 40, 48, 32, 4);
        g.generateTexture('player_body', 64, 80);

        // Player head
        g.clear();
        g.fillStyle(0xffcc88, 1);
        g.fillCircle(24, 24, 22);
        g.generateTexture('player_head', 48, 48);

        // Eye
        g.clear();
        g.fillStyle(0x000000, 1);
        g.fillCircle(4, 5, 4);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(3, 4, 2);
        g.generateTexture('eye', 8, 10);

        // Settings button background
        g.clear();
        g.fillStyle(0x444466, 1);
        g.fillRoundedRect(0, 0, 56, 56, 12);
        g.lineStyle(2, 0x666688, 1);
        g.strokeRoundedRect(0, 0, 56, 56, 12);
        g.generateTexture('btn_settings', 56, 56);

        // Health bar background
        g.clear();
        g.fillStyle(0x333333, 1);
        g.fillRoundedRect(0, 0, 200, 20, 4);
        g.lineStyle(1, 0x555555, 1);
        g.strokeRoundedRect(0, 0, 200, 20, 4);
        g.generateTexture('hp_bg', 200, 20);

        // Health bar fill
        g.clear();
        g.fillStyle(0x44cc44, 1);
        g.fillRoundedRect(0, 0, 196, 16, 3);
        g.generateTexture('hp_fill', 196, 16);

        // Dialog background
        g.clear();
        g.fillStyle(0x222244, 0.95);
        g.fillRoundedRect(0, 0, 500, 300, 16);
        g.lineStyle(2, 0x5555aa, 1);
        g.strokeRoundedRect(0, 0, 500, 300, 16);
        g.generateTexture('dialog_bg', 500, 300);

        // OK button
        g.clear();
        g.fillStyle(0x2277dd, 1);
        g.fillRoundedRect(0, 0, 160, 50, 10);
        g.lineStyle(2, 0x44aaff, 1);
        g.strokeRoundedRect(0, 0, 160, 50, 10);
        g.generateTexture('btn_ok', 160, 50);

        // Cloud
        g.clear();
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(30, 35, 25);
        g.fillCircle(60, 30, 30);
        g.fillCircle(90, 35, 25);
        g.fillCircle(50, 20, 20);
        g.fillCircle(75, 18, 22);
        g.generateTexture('cloud', 120, 60);

        g.destroy();
    }
}
