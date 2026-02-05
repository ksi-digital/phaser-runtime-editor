import Phaser from 'phaser';

const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 1280;

// Physics constants (design-space units)
const GRAVITY = 1800;
const JUMP_VEL = -1200;
const MOVE_SPEED = 300;
const PLAYER_HALF_W = 24;
const PLAYER_HALF_H = 55;
const GROUND_TOP = 1120; // ground center at 1200, half-height 80

interface CoinData {
    obj: Phaser.GameObjects.Image;
    designX: number;
    designY: number;
    baseDesignY: number;
    collected: boolean;
    bobOffset: number;
}

interface PlatformData {
    designX: number;
    designY: number;
    designW: number;
}

/**
 * A playable demo scene — arrow keys to move, space to jump.
 * Collect coins by touching them, land on platforms.
 * Press F2 to open the editor.
 */
export class DemoScene extends Phaser.Scene {
    // Scale factor & offset (design → screen)
    private sf = 1;
    private ox = 0;
    private oy = 0;

    // Player state (design-space)
    private playerContainer!: Phaser.GameObjects.Container;
    private playerDesignX = 360;
    private playerDesignY = 1060;
    private velY = 0;
    private grounded = false;
    private facingRight = true;

    // Game objects we need in update()
    private scoreText!: Phaser.GameObjects.Text;
    private score = 0;
    private coins: CoinData[] = [];
    private platforms: PlatformData[] = [];

    // Input
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private spaceKey!: Phaser.Input.Keyboard.Key;

    constructor() {
        super({ key: 'DemoScene' });
    }

    create(): void {
        this.generateTextures();

        const { width, height } = this.cameras.main;
        this.sf = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
        this.ox = (width - DESIGN_WIDTH * this.sf) / 2;
        this.oy = (height - DESIGN_HEIGHT * this.sf) / 2;
        const sf = this.sf;

        const toScreen = (dx: number, dy: number) => ({
            x: this.ox + dx * sf,
            y: this.oy + dy * sf,
        });

        // --- Input ---
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

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
        ground.setInteractive(new Phaser.Geom.Rectangle(0, 0, 64, 16), Phaser.Geom.Rectangle.Contains);

        // --- Platforms (depth 3) ---
        const platformData = [
            { x: 180, y: 900, w: 200, name: 'platform_left' },
            { x: 540, y: 750, w: 200, name: 'platform_right' },
            { x: 360, y: 600, w: 250, name: 'platform_center' },
        ];
        this.platforms = platformData.map((p) => ({ designX: p.x, designY: p.y, designW: p.w }));

        for (const p of platformData) {
            const pos = toScreen(p.x, p.y);
            const plat = this.add.image(pos.x, pos.y, 'platform');
            plat.setDisplaySize(p.w * sf, 32 * sf);
            plat.setDepth(3);
            plat.setName(p.name);
            plat.setInteractive(new Phaser.Geom.Rectangle(4, 0, 56, 16), Phaser.Geom.Rectangle.Contains);
        }

        // --- Coins (depth 4) ---
        const coinPositions = [
            { x: 180, y: 860, name: 'coin_1' },
            { x: 540, y: 710, name: 'coin_2' },
            { x: 360, y: 560, name: 'coin_3' },
        ];
        this.coins = [];
        for (const c of coinPositions) {
            const pos = toScreen(c.x, c.y);
            const coin = this.add.image(pos.x, pos.y, 'coin');
            coin.setDisplaySize(36 * sf, 36 * sf);
            coin.setDepth(4);
            coin.setName(c.name);
            coin.setInteractive(new Phaser.Geom.Circle(16, 16, 14), Phaser.Geom.Circle.Contains);

            this.coins.push({
                obj: coin,
                designX: c.x,
                designY: c.y,
                baseDesignY: c.y,
                collected: false,
                bobOffset: Math.random() * Math.PI * 2,
            });
        }

        // --- Player Container (depth 5) ---
        this.playerDesignX = 360;
        this.playerDesignY = 1060;
        this.velY = 0;
        this.grounded = false;

        const playerPos = toScreen(this.playerDesignX, this.playerDesignY);
        const body = this.add.image(0, 0, 'player_body');
        body.setDisplaySize(60 * sf, 80 * sf);
        body.setName('player_body');

        const headImg = this.add.image(0, 0, 'player_head');
        headImg.setDisplaySize(48 * sf, 48 * sf);
        headImg.setName('player_head_sprite');

        const eyeL = this.add.image(-10 * sf, -3 * sf, 'eye');
        eyeL.setDisplaySize(8 * sf, 10 * sf);
        eyeL.setName('player_eye_left');

        const eyeR = this.add.image(10 * sf, -3 * sf, 'eye');
        eyeR.setDisplaySize(8 * sf, 10 * sf);
        eyeR.setName('player_eye_right');

        const head = this.add.container(0, -55 * sf, [headImg, eyeL, eyeR]);
        head.setSize(48 * sf, 48 * sf);
        head.setName('player_head');

        const player = this.add.container(playerPos.x, playerPos.y, [body, head]);
        player.setDepth(5);
        player.setName('player');
        player.setSize(60 * sf, 130 * sf);
        player.setInteractive(
            new Phaser.Geom.Polygon([
                0, -80 * sf,
                24 * sf, -50 * sf,
                30 * sf, 0,
                28 * sf, 40 * sf,
                12 * sf, 65 * sf,
                -12 * sf, 65 * sf,
                -28 * sf, 40 * sf,
                -30 * sf, 0,
                -24 * sf, -50 * sf,
            ]),
            Phaser.Geom.Polygon.Contains,
        );
        this.playerContainer = player;

        // --- HUD: Score text (depth 10) ---
        const scorePos = toScreen(20, 20);
        this.score = 0;
        this.scoreText = this.add.text(scorePos.x, scorePos.y, 'Score: 0', {
            fontFamily: 'Arial, sans-serif',
            fontSize: `${Math.round(28 * sf)}px`,
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: Math.round(4 * sf),
        });
        this.scoreText.setDepth(10);
        this.scoreText.setName('hud_score');

        // --- HUD: Level text (depth 10) ---
        const levelPos = toScreen(DESIGN_WIDTH / 2, 20);
        const levelText = this.add.text(levelPos.x, levelPos.y, 'Level 1', {
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
        settingsBtn.setInteractive(new Phaser.Geom.Circle(0, 0, 28 * sf), Phaser.Geom.Circle.Contains);

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

        // --- Dialog box (depth 20) ---
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

        const dlgBody = this.add.text(
            0,
            -20 * sf,
            'Arrow keys to move, Space to jump.\nCollect the coins!\nPress F2 to open the editor.',
            {
                fontFamily: 'Arial, sans-serif',
                fontSize: `${Math.round(22 * sf)}px`,
                color: '#cccccc',
                align: 'center',
                lineSpacing: 8 * sf,
            },
        );
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

        dlgBtnBg.setInteractive();
        dlgBtnBg.on('pointerdown', () => {
            dialog.setVisible(false);
        });

        // --- Clouds with tween (depth 2) ---
        const cloudPos = toScreen(150, 200);
        const cloud = this.add.image(cloudPos.x, cloudPos.y, 'cloud');
        cloud.setDisplaySize(120 * sf, 60 * sf);
        cloud.setAlpha(0.8);
        cloud.setDepth(2);
        cloud.setName('cloud_1');
        cloud.setInteractive(
            new Phaser.Geom.Polygon([
                10, 40, 5, 30, 15, 15, 40, 5, 60, 2, 80, 5, 105, 15, 115, 30, 110, 40,
            ]),
            Phaser.Geom.Polygon.Contains,
        );

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

    update(_time: number, delta: number): void {
        const dt = Math.min(delta / 1000, 0.05); // cap at 50ms to avoid tunneling
        const sf = this.sf;

        // --- Horizontal movement ---
        let moveX = 0;
        if (this.cursors.left.isDown) moveX = -1;
        else if (this.cursors.right.isDown) moveX = 1;

        this.playerDesignX += moveX * MOVE_SPEED * dt;

        // Clamp to design bounds
        this.playerDesignX = Phaser.Math.Clamp(
            this.playerDesignX,
            PLAYER_HALF_W,
            DESIGN_WIDTH - PLAYER_HALF_W,
        );

        // Flip sprite direction
        if (moveX !== 0) {
            const wantRight = moveX > 0;
            if (wantRight !== this.facingRight) {
                this.facingRight = wantRight;
                this.playerContainer.setScale(wantRight ? 1 : -1, 1);
            }
        }

        // --- Jump ---
        if (this.grounded && Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
            this.velY = JUMP_VEL;
            this.grounded = false;
        }

        // --- Gravity ---
        this.velY += GRAVITY * dt;
        this.playerDesignY += this.velY * dt;

        // --- Platform collision (one-way: only from above) ---
        const feetY = this.playerDesignY + PLAYER_HALF_H;
        const prevFeetY = feetY - this.velY * dt;

        this.grounded = false;

        for (const plat of this.platforms) {
            const platTop = plat.designY - 16; // platform half-height = 16
            const platLeft = plat.designX - plat.designW / 2;
            const platRight = plat.designX + plat.designW / 2;

            if (
                this.velY >= 0 &&
                prevFeetY <= platTop &&
                feetY >= platTop &&
                this.playerDesignX + PLAYER_HALF_W > platLeft &&
                this.playerDesignX - PLAYER_HALF_W < platRight
            ) {
                this.playerDesignY = platTop - PLAYER_HALF_H;
                this.velY = 0;
                this.grounded = true;
                break;
            }
        }

        // --- Ground collision ---
        if (this.playerDesignY + PLAYER_HALF_H >= GROUND_TOP) {
            this.playerDesignY = GROUND_TOP - PLAYER_HALF_H;
            this.velY = 0;
            this.grounded = true;
        }

        // --- Update player screen position ---
        this.playerContainer.x = this.ox + this.playerDesignX * sf;
        this.playerContainer.y = this.oy + this.playerDesignY * sf;

        // --- Coin collection ---
        for (const c of this.coins) {
            if (c.collected) continue;

            // Bob animation (manual sine wave)
            c.designY = c.baseDesignY + Math.sin(_time / 400 + c.bobOffset) * 6;
            c.obj.x = this.ox + c.designX * sf;
            c.obj.y = this.oy + c.designY * sf;

            // AABB overlap check in design-space
            const dx = Math.abs(this.playerDesignX - c.designX);
            const dy = Math.abs(this.playerDesignY - c.designY);
            if (dx < PLAYER_HALF_W + 18 && dy < PLAYER_HALF_H + 18) {
                c.collected = true;
                c.obj.setVisible(false);
                this.score += 100;
                this.scoreText.setText(`Score: ${this.score}`);
            }
        }
    }

    /**
     * Generate all textures procedurally so the demo needs zero asset files.
     */
    private generateTextures(): void {
        const g = this.make.graphics({ x: 0, y: 0 }, false);

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
