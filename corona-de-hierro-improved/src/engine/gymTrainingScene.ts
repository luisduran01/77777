import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BoxerAppearance, PunchType, TrainingDrillType } from '../types/game';
import { BoxerRig, buildBoxerRig, poseBoxer } from './boxerMesh';
import { createGymFloorTexture, createLeatherNormalRoughnessMap } from './textures';
import { soundEngine } from '../audio/soundEngine';

export interface DrillHUDState {
  active: boolean;
  finished: boolean;
  timeLeft: number;
  score: number;
  combo: number;
  maxCombo: number;
  promptText: string;
  promptKey: string;
  promptType: 'punch' | 'dodge' | 'speed';
  feedbackText: string;
  grade: 'S' | 'A' | 'B' | 'C';
  gymPointsAwarded: number;
}

export class GymTrainingController {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private boxerRig: BoxerRig;
  private heavyBagPivot: THREE.Group;
  private speedBagPivot: THREE.Group;
  private reflexArmPivot: THREE.Group;
  private reflexPadMat: THREE.MeshStandardMaterial;

  private drillType: TrainingDrillType;
  private active = true;
  private finished = false;
  private timeLeft = 28;
  private elapsed = 0;

  // Bag spring physics
  private bagAngleX = 0;
  private bagAngleZ = 0;
  private bagVelX = 0;
  private bagVelZ = 0;
  private speedBagVel = 0;
  private speedBagAngle = 0;
  private reflexArmAngle = 0;
  private reflexIncoming = false;
  private reflexTimer = 0;

  // Boxer punch visual state
  private activePunch: PunchType | null = null;
  private punchPhase: 'none' | 'windup' | 'strike' | 'recover' = 'none';
  private punchTimer = 0;
  private punchDuration = 0.12;
  private slipX = 0;

  // Scoring & Prompt queue
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private promptKey = 'J';
  private promptText = 'JAB RÁPIDO';
  private promptType: 'punch' | 'dodge' | 'speed' = 'punch';
  private feedbackText = '¡Sigue las órdenes de Don Mateo!';
  private cameraShake = 0;
  private onStateUpdate: (state: DrillHUDState) => void;
  private disposables: { dispose: () => void }[] = [];

  constructor(
    renderer: THREE.WebGLRenderer,
    maxAnisotropy: number,
    appearance: BoxerAppearance,
    drillType: TrainingDrillType,
    onStateUpdate: (state: DrillHUDState) => void
  ) {
    this.renderer = renderer;
    this.drillType = drillType;
    this.onStateUpdate = onStateUpdate;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0e14);
    this.scene.fog = new THREE.FogExp2(0x0b0e14, 0.055);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env;
    this.disposables.push(env);
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 60);
    this.camera.position.set(1.95, 1.68, 2.35);
    this.camera.lookAt(0, 1.15, -0.3);

    // Warm industrial gym lights
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x292524, 0.72);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffedd5, 2.2);
    key.position.set(3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    // Gym Floor
    const floorTex = createGymFloorTexture(maxAnisotropy);
    this.disposables.push(floorTex);
    const floorGeo = new THREE.PlaneGeometry(24, 24);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.82,
      metalness: 0.05,
    });
    this.disposables.push(floorGeo, floorMat);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Gym Brick/Steel Back Wall & Rack
    const wallGeo = new THREE.BoxGeometry(14, 5, 0.3);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x161b24, roughness: 0.88 });
    this.disposables.push(wallGeo, wallMat);
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 2.5, -3.2);
    this.scene.add(wall);

    // Boxer Rig standing ready
    this.boxerRig = buildBoxerRig(appearance);
    this.boxerRig.root.position.set(0, 0, 0.72);
    this.boxerRig.root.rotation.y = Math.PI; // facing -Z toward equipment
    this.scene.add(this.boxerRig.root);

    const leatherMap = createLeatherNormalRoughnessMap();
    this.disposables.push(leatherMap);

    // 1. Heavy Bag Rig
    this.heavyBagPivot = new THREE.Group();
    this.heavyBagPivot.position.set(0, 3.2, -0.38);
    this.scene.add(this.heavyBagPivot);

    const chainMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.25, metalness: 0.85 });
    const bagMat = new THREE.MeshPhysicalMaterial({
      color: 0x7f1d1d,
      roughness: 0.42,
      metalness: 0.08,
      bumpMap: leatherMap,
      bumpScale: 0.005,
      clearcoat: 0.2,
    });
    const chainGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.95, 8);
    const bagGeo = new THREE.CapsuleGeometry(0.24, 0.98, 8, 20);
    const strapGeo = new THREE.CylinderGeometry(0.248, 0.248, 0.09, 20);
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.55 });
    this.disposables.push(chainMat, bagMat, chainGeo, bagGeo, strapGeo, strapMat);

    const chain = new THREE.Mesh(chainGeo, chainMat);
    chain.position.y = -0.48;
    const bag = new THREE.Mesh(bagGeo, bagMat);
    bag.position.y = -1.55;
    bag.castShadow = true;
    const strap = new THREE.Mesh(strapGeo, strapMat);
    strap.position.y = -1.2;
    this.heavyBagPivot.add(chain, bag, strap);
    this.heavyBagPivot.visible = drillType === 'heavy_bag';

    // 2. Speed Bag Rig
    this.speedBagPivot = new THREE.Group();
    this.speedBagPivot.position.set(0, 1.95, -0.35);
    this.scene.add(this.speedBagPivot);

    const boardGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 24);
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.5 });
    const sbPts = [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(0.04, -0.05),
      new THREE.Vector2(0.11, -0.18),
      new THREE.Vector2(0.095, -0.28),
      new THREE.Vector2(0.001, -0.33),
    ];
    const sbGeo = new THREE.LatheGeometry(sbPts, 16);
    const sbMat = new THREE.MeshPhysicalMaterial({ color: 0xd97706, roughness: 0.28, clearcoat: 0.6 });
    this.disposables.push(boardGeo, boardMat, sbGeo, sbMat);

    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.y = 0.06;
    const speedBag = new THREE.Mesh(sbGeo, sbMat);
    speedBag.castShadow = true;
    this.speedBagPivot.add(board, speedBag);
    this.speedBagPivot.visible = drillType === 'speed_reflex';

    // 3. Defense Sparring Arm Rig
    this.reflexArmPivot = new THREE.Group();
    this.reflexArmPivot.position.set(0, 1.48, -0.45);
    this.scene.add(this.reflexArmPivot);

    const poleGeo = new THREE.CylinderGeometry(0.04, 0.05, 1.5, 12);
    const armGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.85, 10);
    armGeo.rotateZ(Math.PI / 2);
    const padGeo = new THREE.SphereGeometry(0.14, 16, 14);
    this.reflexPadMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.4,
      emissive: 0x000000,
    });
    this.disposables.push(poleGeo, armGeo, padGeo, this.reflexPadMat);

    const pole = new THREE.Mesh(poleGeo, chainMat);
    pole.position.y = -0.75;
    const swingArm = new THREE.Mesh(armGeo, strapMat);
    swingArm.position.set(0.35, 0, 0.25);
    const pad = new THREE.Mesh(padGeo, this.reflexPadMat);
    pad.position.set(0.75, 0, 0.45);
    pad.castShadow = true;
    this.reflexArmPivot.add(pole, swingArm, pad);
    this.reflexArmPivot.visible = drillType === 'defense_sparring';

    this.pickNextPrompt();
    this.emitState();
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public handleKeyAction(code: string): void {
    if (!this.active || this.finished) return;

    const map: Record<string, { key: string; punch?: PunchType; dodge?: number }> = {
      KeyJ: { key: 'J', punch: 'jab' },
      KeyL: { key: 'L', punch: 'cross' },
      KeyI: { key: 'I', punch: 'hook_l' },
      KeyO: { key: 'O', punch: 'hook_r' },
      KeyK: { key: 'K', punch: 'uppercut' },
      KeyQ: { key: 'Q', dodge: -1 },
      KeyE: { key: 'E', dodge: 1 },
    };

    const action = map[code];
    if (!action) return;

    if (action.punch) {
      this.activePunch = action.punch;
      this.punchPhase = 'windup';
      this.punchTimer = 0;
      this.punchDuration = 0.045;
    }
    if (action.dodge) {
      this.slipX = action.dodge;
    }

    if (action.key === this.promptKey) {
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const pts = 100 + Math.min(200, this.combo * 20);
      this.score += pts;
      this.cameraShake = 0.08;
      this.feedbackText = this.combo >= 4 ? `¡RACHA x${this.combo}! +${pts}` : `¡IMPACTO LIMPIO! +${pts}`;

      if (this.drillType === 'heavy_bag') {
        this.bagVelX += (Math.random() - 0.5) * 4.2;
        this.bagVelZ -= 5.8;
        soundEngine.playGymHit('bag');
      } else if (this.drillType === 'speed_reflex') {
        this.speedBagVel = 16;
        soundEngine.playGymHit('speedbag');
      } else {
        this.reflexIncoming = false;
        this.reflexPadMat.emissive.setHex(0x000000);
        soundEngine.playGymHit('success');
      }

      this.pickNextPrompt();
    } else {
      this.combo = 0;
      this.feedbackText = `Tecla equivocada (se esperaba ${this.promptKey})`;
      soundEngine.playGymHit('miss');
    }
    this.emitState();
  }

  private pickNextPrompt(): void {
    if (this.drillType === 'heavy_bag') {
      const opts = [
        { key: 'J', text: 'JAB DE APERTURA' },
        { key: 'L', text: 'RECTO DE PODER' },
        { key: 'I', text: 'GANCHO IZQUIERDO' },
        { key: 'O', text: 'GANCHO DERECHO' },
        { key: 'K', text: 'UPPERCUT AL MENTÓN' },
      ];
      const pick = opts[Math.floor(Math.random() * opts.length)];
      this.promptKey = pick.key;
      this.promptText = pick.text;
      this.promptType = 'punch';
    } else if (this.drillType === 'speed_reflex') {
      const opts = [
        { key: 'J', text: 'TOQUE IZQUIERDO' },
        { key: 'L', text: 'TOQUE DERECHO' },
        { key: 'I', text: 'RITMO RÁPIDO' },
      ];
      const pick = opts[Math.floor(Math.random() * opts.length)];
      this.promptKey = pick.key;
      this.promptText = pick.text;
      this.promptType = 'speed';
    } else {
      if (!this.reflexIncoming && Math.random() < 0.6) {
        this.reflexIncoming = true;
        this.reflexTimer = 1.45;
        const left = Math.random() < 0.5;
        this.promptKey = left ? 'Q' : 'E';
        this.promptText = left ? '¡ESQUIVA IZQUIERDA (Q)!' : '¡ESQUIVA DERECHA (E)!';
        this.promptType = 'dodge';
        this.reflexPadMat.emissive.setHex(0xdc2626);
      } else {
        const opts = [
          { key: 'J', text: 'CONTRAGOLPE JAB' },
          { key: 'L', text: 'CONTRAGOLPE RECTO' },
        ];
        const pick = opts[Math.floor(Math.random() * opts.length)];
        this.promptKey = pick.key;
        this.promptText = pick.text;
        this.promptType = 'punch';
        this.reflexPadMat.emissive.setHex(0x000000);
      }
    }
  }

  public step(rawDt: number): void {
    const dt = Math.min(rawDt, 0.05);
    this.elapsed += dt;

    if (this.active && !this.finished) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.finished = true;
        this.active = false;
        soundEngine.playBell(2);
        this.emitState();
      }
    }

    // Heavy Bag Spring Pendulum
    const k = 18;
    const damp = 3.2;
    this.bagVelX += (-k * this.bagAngleX - damp * this.bagVelX) * dt;
    this.bagVelZ += (-k * this.bagAngleZ - damp * this.bagVelZ) * dt;
    this.bagAngleX += this.bagVelX * dt;
    this.bagAngleZ += this.bagVelZ * dt;
    this.heavyBagPivot.rotation.set(this.bagAngleZ, 0, this.bagAngleX);

    // Speed Bag oscillation
    this.speedBagVel = Math.max(0, this.speedBagVel - dt * 12);
    this.speedBagAngle = Math.sin(this.elapsed * (4 + this.speedBagVel)) * Math.min(0.85, 0.1 + this.speedBagVel * 0.045);
    this.speedBagPivot.rotation.x = this.speedBagAngle;

    // Reflex Arm telegraph
    if (this.reflexIncoming) {
      this.reflexTimer -= dt;
      this.reflexArmAngle = THREE.MathUtils.damp(this.reflexArmAngle, 0.9, 6, dt);
      if (this.reflexTimer <= 0) {
        this.reflexIncoming = false;
        this.combo = 0;
        this.feedbackText = '¡Te alcanzó el brazo acolchado!';
        soundEngine.playGymHit('miss');
        this.pickNextPrompt();
        this.emitState();
      }
    } else {
      this.reflexArmAngle = THREE.MathUtils.damp(this.reflexArmAngle, -0.4, 5, dt);
    }
    this.reflexArmPivot.rotation.y = this.reflexArmAngle;

    // Punch & Slip kinetic phase progression on boxer rig
    if (this.punchPhase !== 'none') {
      this.punchTimer += dt;
      if (this.punchPhase === 'windup' && this.punchTimer >= this.punchDuration) {
        this.punchPhase = 'strike';
        this.punchTimer = 0;
        this.punchDuration = 0.11;
      } else if (this.punchPhase === 'strike' && this.punchTimer >= this.punchDuration) {
        this.punchPhase = 'recover';
        this.punchTimer = 0;
        this.punchDuration = 0.16;
      } else if (this.punchPhase === 'recover' && this.punchTimer >= this.punchDuration) {
        this.punchPhase = 'none';
        this.activePunch = null;
        this.punchTimer = 0;
      }
    }
    this.slipX = THREE.MathUtils.damp(this.slipX, 0, 10, dt);
    const punchProgress =
      this.punchDuration > 0 ? THREE.MathUtils.clamp(this.punchTimer / this.punchDuration, 0, 1) : 0;

    poseBoxer(this.boxerRig, {
      dt,
      stance: 'orthodox',
      elapsed: this.elapsed,
      guardHigh: 0.42,
      guardLow: 0,
      slipX: this.slipX,
      leanZ: this.punchPhase === 'strike' ? 0.35 : 0.08,
      activePunch: this.activePunch,
      punchPhase: this.punchPhase,
      punchProgress,
      hitRecoilX: 0,
      hitRecoilY: 0,
      knockdownProgress: 0,
      victoryRaise: this.finished ? 1 : 0,
      sweatLevel: 0.35,
      browDamage: 0,
      jawDamage: 0,
      moveSpeedNorm: 0.25,
    });

    this.cameraShake = Math.max(0, this.cameraShake - dt * 1.4);
    this.camera.position.x = 1.95 + (Math.random() - 0.5) * this.cameraShake;
    this.camera.position.y = 1.68 + (Math.random() - 0.5) * this.cameraShake;
    this.renderer.render(this.scene, this.camera);
  }

  private emitState(): void {
    const grade: DrillHUDState['grade'] =
      this.score >= 2200 ? 'S' : this.score >= 1400 ? 'A' : this.score >= 700 ? 'B' : 'C';
    const gymPointsAwarded = grade === 'S' ? 7 : grade === 'A' ? 5 : grade === 'B' ? 3 : 2;
    this.onStateUpdate({
      active: this.active,
      finished: this.finished,
      timeLeft: Math.ceil(this.timeLeft),
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      promptText: this.promptText,
      promptKey: this.promptKey,
      promptType: this.promptType,
      feedbackText: this.feedbackText,
      grade,
      gymPointsAwarded,
    });
  }

  public dispose(): void {
    this.boxerRig.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
