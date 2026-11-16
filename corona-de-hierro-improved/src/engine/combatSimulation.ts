import * as THREE from 'three';
import {
  ActiveInjury,
  BoxerAppearance,
  BoxerStats,
  CornerFocus,
  FightResult,
  InjuryZone,
  OpponentProfile,
  PunchType,
  TraitId,
} from '../types/game';
import { RING_HALF_EXTENT } from './arenaScene';
import { BoxerRig, HitReactionDir, RefereeRig, poseBoxer } from './boxerMesh';
import { soundEngine } from '../audio/soundEngine';

export interface FighterState {
  isPlayer: boolean;
  name: string;
  appearance: BoxerAppearance;
  stats: BoxerStats;
  traits: TraitId[];
  x: number;
  z: number;
  vx: number;
  vz: number;
  facingAngle: number;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  guardHealth: number;
  guardBrokenTimer: number;
  stunMeter: number;
  knockdownsInRound: number;
  totalKnockdowns: number;
  guardHigh: number;
  guardLow: number;
  slipX: number;
  leanZ: number;
  dashCooldown: number;
  feintTimer: number;
  clinchTimer: number;
  comboCount: number;
  comboWindowTimer: number;
  tacticPowerBonus: number;
  activePunch: PunchType | null;
  punchPhase: 'none' | 'windup' | 'strike' | 'recover';
  punchTimer: number;
  punchDuration: number;
  punchSpeedMult: number;
  punchHitResolved: boolean;
  counterWindowTimer: number;
  impactFlashTimer: number; // triggers visual flash on clean hit
  hitRecoilX: number;
  hitRecoilY: number;
  hitDir: HitReactionDir;
  hitDirTimer: number;
  knockdownProgress: number;
  victoryRaise: number;
  zoneDamage: Record<InjuryZone, number>;
  pointsScore: number;
  roundPoints: number;
  landedPunches: number;
  thrownPunches: number;
  headPunchesLanded: number;
  bodyPunchesLanded: number;
  countersLanded: number;
}

export interface CombatHUDState {
  phase: 'intro' | 'fighting' | 'knockdown' | 'between_rounds' | 'finished';
  round: number;
  totalRounds: number;
  roundTimeLeft: number;
  betweenRoundTimeLeft: number;
  cornerAdvice: string;
  cornerChoiceMade: CornerFocus | null;
  playerHealth: number;
  playerMaxHealth: number;
  playerStamina: number;
  playerMaxStamina: number;
  playerGuardHealth: number;
  playerCombo: number;
  playerKnockdowns: number;
  opponentHealth: number;
  opponentMaxHealth: number;
  opponentStamina: number;
  opponentMaxStamina: number;
  opponentGuardHealth: number;
  opponentKnockdowns: number;
  knockdownTarget: 'player' | 'opponent' | null;
  knockdownCount: number;
  playerRecoveryProgress: number;
  calloutText: string | null;
  calloutColor: 'gold' | 'red' | 'cyan' | 'white';
  playerScore: number;
  opponentScore: number;
  result: FightResult | null;
}

interface PunchSpec {
  windup: number;
  strike: number;
  recover: number;
  range: number;
  stamina: number;
  damage: number;
  stun: number;
  guardChip: number;
  zone: InjuryZone;
  isStraight: boolean;
  isBody: boolean;
  isOverhand?: boolean; // arcing punch — partially bypasses high guard
}

const PUNCH_SPECS: Record<PunchType, PunchSpec> = {
  jab: {
    windup: 0.06,
    strike: 0.09,
    recover: 0.145,
    range: 1.54,
    stamina: 5.5,
    damage: 6.5,
    stun: 7,
    guardChip: 8,
    zone: 'eyebrow',
    isStraight: true,
    isBody: false,
  },
  cross: {
    windup: 0.11,
    strike: 0.11,
    recover: 0.21,
    range: 1.6,
    stamina: 11,
    damage: 13.5,
    stun: 16,
    guardChip: 20,
    zone: 'nose_jaw',
    isStraight: true,
    isBody: false,
  },
  hook_l: {
    windup: 0.13,
    strike: 0.115,
    recover: 0.22,
    range: 1.38,
    stamina: 12,
    damage: 14.5,
    stun: 18,
    guardChip: 24,
    zone: 'eyebrow',
    isStraight: false,
    isBody: false,
  },
  hook_r: {
    windup: 0.14,
    strike: 0.115,
    recover: 0.23,
    range: 1.38,
    stamina: 13,
    damage: 15.5,
    stun: 19,
    guardChip: 26,
    zone: 'eyebrow',
    isStraight: false,
    isBody: false,
  },
  uppercut: {
    windup: 0.15,
    strike: 0.12,
    recover: 0.25,
    range: 1.26,
    stamina: 14,
    damage: 17.5,
    stun: 23,
    guardChip: 30,
    zone: 'nose_jaw',
    isStraight: false,
    isBody: false,
  },
  body_hook: {
    windup: 0.12,
    strike: 0.115,
    recover: 0.2,
    range: 1.4,
    stamina: 10,
    damage: 11.8,
    stun: 10,
    guardChip: 16,
    zone: 'ribs',
    isStraight: false,
    isBody: true,
  },
  overhand: {
    windup: 0.16,       // telegraphed — requires timing commitment
    strike: 0.13,
    recover: 0.26,
    range: 1.52,        // good reach — longer arc covers distance
    stamina: 14,
    damage: 16.5,       // powerful — lands on the jaw from above
    stun: 21,
    guardChip: 22,
    zone: 'nose_jaw',
    isStraight: false,
    isBody: false,
    isOverhand: true,   // special flag: partially bypasses high guard
  },
};

interface SweatParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

export interface CombatInputs {
  held: Set<string>;
  bufferedPunch: PunchType | null;
  bufferTimer: number;
  justPressedSpace: boolean;
  justPressedFeint: boolean;
  justPressedClinch: boolean;
}

export class CombatSimulation {
  private player: FighterState;
  private opponent: FighterState;
  private opponentProfile: OpponentProfile;
  private isTitleFight: boolean;
  private activeInjuries: ActiveInjury[];
  private playerRig: BoxerRig;
  private opponentRig: BoxerRig;
  private refereeRig: RefereeRig | null;

  private phase: CombatHUDState['phase'] = 'intro';
  private introTimer = 1.9;
  private round = 1;
  private totalRounds: number;
  private roundDuration = 75;
  private roundTimeLeft = 75;
  private betweenRoundTimer = 0;
  private cornerAdvice = '';
  private cornerChoiceMade: CornerFocus | null = null;

  private hitstopTimer = 0;
  private cameraShake = 0;
  private heartbeatCooldown = 0;
  private calloutText: string | null = '¡ASALTO 1!';
  private calloutColor: CombatHUDState['calloutColor'] = 'gold';
  private calloutTimer = 1.8;

  private knockdownTarget: 'player' | 'opponent' | null = null;
  private knockdownCount = 0;
  private knockdownCountTimer = 0;
  private playerRecoveryProgress = 0;
  private aiRecoveryTarget = 0;

  private refX = 0;
  private refZ = -1.9;
  private refArmAngle = 0;

  // Adaptive AI tracking
  private aiDecisionTimer = 0.35;
  private aiStrafeDir = 1;
  private aiPatternMemory = {
    playerJabs: 0,
    playerHighGuardTime: 0,
    lastPlayerPunchTime: 0,
    feintedGuardDrop: 0,
  };

  private particles: SweatParticle[] = [];
  private particleGroup: THREE.Group;
  private particleGeo: THREE.SphereGeometry;
  private particleMat: THREE.MeshStandardMaterial;

  private result: FightResult | null = null;
  private elapsed = 0;
  private lastDt = 0.016;
  private crowdExcitement = 0.25;

  constructor(
    scene: THREE.Scene,
    playerRig: BoxerRig,
    opponentRig: BoxerRig,
    refereeRig: RefereeRig | null,
    playerAppearance: BoxerAppearance,
    playerStats: BoxerStats,
    playerTraits: TraitId[],
    activeInjuries: ActiveInjury[],
    opponentProfile: OpponentProfile,
    isTitleFight: boolean
  ) {
    this.playerRig = playerRig;
    this.opponentRig = opponentRig;
    this.refereeRig = refereeRig;
    this.opponentProfile = opponentProfile;
    this.isTitleFight = isTitleFight;
    this.activeInjuries = activeInjuries;
    this.totalRounds = opponentProfile.rounds;

    this.player = this.createFighter(
      true,
      playerAppearance.name,
      playerAppearance,
      this.applyInjuryPenalties(playerStats, activeInjuries),
      playerTraits,
      -1.2,
      0.8
    );
    this.opponent = this.createFighter(
      false,
      opponentProfile.name,
      opponentProfile.appearance,
      opponentProfile.stats,
      opponentProfile.traits,
      1.2,
      -0.8
    );

    this.particleGroup = new THREE.Group();
    scene.add(this.particleGroup);
    this.particleGeo = new THREE.SphereGeometry(0.023, 6, 6);
    this.particleMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.12,
      metalness: 0.1,
      transparent: true,
      opacity: 0.88,
    });
    for (let i = 0; i < 36; i++) {
      const mesh = new THREE.Mesh(this.particleGeo, this.particleMat);
      mesh.visible = false;
      this.particleGroup.add(mesh);
      this.particles.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.4 });
    }

    soundEngine.playBell(1);
  }

  private applyInjuryPenalties(stats: BoxerStats, injuries: ActiveInjury[]): BoxerStats {
    const mod = { ...stats };
    injuries.forEach((inj) => {
      if (inj.zone === 'hands') mod.power = Math.max(30, Math.round(mod.power * (1 - inj.penaltyValue)));
      else if (inj.zone === 'ribs') mod.stamina = Math.max(30, Math.round(mod.stamina * (1 - inj.penaltyValue)));
      else if (inj.zone === 'nose_jaw') mod.chin = Math.max(30, Math.round(mod.chin * (1 - inj.penaltyValue)));
      else if (inj.zone === 'eyebrow') mod.defense = Math.max(30, Math.round(mod.defense * (1 - inj.penaltyValue)));
    });
    return mod;
  }

  private createFighter(
    isPlayer: boolean,
    name: string,
    appearance: BoxerAppearance,
    stats: BoxerStats,
    traits: TraitId[],
    x: number,
    z: number
  ): FighterState {
    const maxHealth = 100 + stats.chin * 0.65;
    const maxStamina = 100 + stats.stamina * 0.7;
    return {
      isPlayer,
      name,
      appearance,
      stats,
      traits,
      x,
      z,
      vx: 0,
      vz: 0,
      facingAngle: 0,
      health: maxHealth,
      maxHealth,
      stamina: maxStamina,
      maxStamina,
      guardHealth: 100,
      guardBrokenTimer: 0,
      stunMeter: 0,
      knockdownsInRound: 0,
      totalKnockdowns: 0,
      guardHigh: 0,
      guardLow: 0,
      slipX: 0,
      leanZ: 0,
      dashCooldown: 0,
      feintTimer: 0,
      clinchTimer: 0,
      comboCount: 0,
      comboWindowTimer: 0,
      tacticPowerBonus: 0,
      activePunch: null,
      punchPhase: 'none',
      punchTimer: 0,
      punchDuration: 0,
      punchSpeedMult: 1,
      punchHitResolved: false,
      counterWindowTimer: 0,
      impactFlashTimer: 0,
      hitRecoilX: 0,
      hitRecoilY: 0,
      hitDir: 'none',
      hitDirTimer: 0,
      knockdownProgress: 0,
      victoryRaise: 0,
      zoneDamage: { eyebrow: 0, nose_jaw: 0, ribs: 0, hands: 0 },
      pointsScore: 0,
      roundPoints: 0,
      landedPunches: 0,
      thrownPunches: 0,
      headPunchesLanded: 0,
      bodyPunchesLanded: 0,
      countersLanded: 0,
    };
  }

  public chooseCornerFocus(focus: CornerFocus): void {
    if (this.phase !== 'between_rounds' || this.cornerChoiceMade) return;
    this.cornerChoiceMade = focus;
    soundEngine.playClick();

    if (focus === 'cutman') {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + this.player.maxHealth * 0.14);
      this.player.zoneDamage.eyebrow = Math.max(0, this.player.zoneDamage.eyebrow - 18);
      this.player.zoneDamage.nose_jaw = Math.max(0, this.player.zoneDamage.nose_jaw - 15);
    } else if (focus === 'cardio') {
      this.player.maxStamina = Math.min(100 + this.player.stats.stamina * 0.7, this.player.maxStamina + 14);
      this.player.stamina = this.player.maxStamina;
      this.player.guardHealth = 100;
    } else if (focus === 'tactic') {
      this.player.tacticPowerBonus = 0.18;
    }

    this.betweenRoundTimer = Math.min(this.betweenRoundTimer, 0.7);
  }

  public getCameraTargetAndShake() {
    return {
      midX: (this.player.x + this.opponent.x) * 0.5,
      midZ: (this.player.z + this.opponent.z) * 0.5,
      shake: this.cameraShake,
      excitement: this.crowdExcitement,
      phase: this.phase,
      introProgress: 1 - Math.max(0, this.introTimer / 1.9),
      playerPos: { x: this.player.x, z: this.player.z },
      oppPos: { x: this.opponent.x, z: this.opponent.z },
    };
  }

  public step(rawDt: number, inputs: CombatInputs): CombatHUDState {
    const dt = Math.min(rawDt, 0.05);
    this.lastDt = dt;
    this.elapsed += dt;

    this.cameraShake = Math.max(0, this.cameraShake - dt * 2.8);
    this.crowdExcitement = Math.max(0.15, this.crowdExcitement - dt * 0.25);

    if (this.calloutTimer > 0) {
      this.calloutTimer -= dt;
      if (this.calloutTimer <= 0) this.calloutText = null;
    }

    this.updateParticles(dt);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.syncRigs();
      return this.buildHUD();
    }

    if (this.phase === 'intro') {
      this.introTimer -= dt;
      if (this.introTimer <= 0) {
        this.phase = 'fighting';
        this.setCallout('¡A PELEAR!', 'gold', 1.1);
      }
      this.faceEachOther();
      this.updateReferee(dt);
      this.syncRigs();
      return this.buildHUD();
    }

    if (this.phase === 'between_rounds') {
      this.betweenRoundTimer -= dt;
      if (this.betweenRoundTimer <= 0) {
        this.startNextRound();
      }
      this.syncRigs();
      return this.buildHUD();
    }

    if (this.phase === 'knockdown') {
      this.updateKnockdown(dt, inputs);
      this.updateReferee(dt);
      this.syncRigs();
      return this.buildHUD();
    }

    if (this.phase === 'finished') {
      if (this.result?.won) this.player.victoryRaise = Math.min(1, this.player.victoryRaise + dt * 2.5);
      else this.opponent.victoryRaise = Math.min(1, this.opponent.victoryRaise + dt * 2.5);
      this.syncRigs();
      return this.buildHUD();
    }

    // Active Combat
    this.roundTimeLeft -= dt;
    if (this.roundTimeLeft <= 0) {
      this.endRound();
      this.syncRigs();
      return this.buildHUD();
    }

    // Heartbeat warning when critically hurt or rocked
    if (this.heartbeatCooldown > 0) this.heartbeatCooldown -= dt;
    if (
      (this.player.health < this.player.maxHealth * 0.28 || this.player.stunMeter > 72) &&
      this.heartbeatCooldown <= 0
    ) {
      this.heartbeatCooldown = 0.85;
      soundEngine.playHeartbeat();
    }

    this.faceEachOther();
    this.updatePlayerControls(dt, inputs);
    this.updateOpponentAI(dt);
    this.updateFighterKinematics(this.player, this.opponent, dt);
    this.updateFighterKinematics(this.opponent, this.player, dt);
    this.resolveCollisions();
    this.updateReferee(dt);
    this.syncRigs();

    return this.buildHUD();
  }

  private faceEachOther(): void {
    const dx = this.opponent.x - this.player.x;
    const dz = this.opponent.z - this.player.z;
    this.player.facingAngle = Math.atan2(dx, dz);
    this.opponent.facingAngle = Math.atan2(-dx, -dz);
  }

  private updatePlayerControls(dt: number, inputs: CombatInputs): void {
    const p = this.player;
    const held = inputs.held;

    if (p.clinchTimer > 0) {
      p.vx = 0;
      p.vz = 0;
      return;
    }

    const fwdX = Math.sin(p.facingAngle);
    const fwdZ = Math.cos(p.facingAngle);
    const rightX = Math.cos(p.facingAngle);
    const rightZ = -Math.sin(p.facingAngle);

    let moveFwd = 0;
    let moveSide = 0;
    if (held.has('KeyW') || held.has('ArrowUp')) moveFwd += 1;
    if (held.has('KeyS') || held.has('ArrowDown')) moveFwd -= 1;
    if (held.has('KeyD') || held.has('ArrowRight')) moveSide += 1;
    if (held.has('KeyA') || held.has('ArrowLeft')) moveSide -= 1;

    const footSpeed = (1.95 + p.stats.footwork * 0.017) * (p.stamina < 15 ? 0.65 : 1.0);
    const len = Math.hypot(moveFwd, moveSide) || 1;
    const targetVx =
      ((fwdX * moveFwd + rightX * moveSide) / len) * (moveFwd !== 0 || moveSide !== 0 ? footSpeed : 0);
    const targetVz =
      ((fwdZ * moveFwd + rightZ * moveSide) / len) * (moveFwd !== 0 || moveSide !== 0 ? footSpeed : 0);

    p.vx = THREE.MathUtils.damp(p.vx, targetVx, 11, dt);
    p.vz = THREE.MathUtils.damp(p.vz, targetVz, 11, dt);

    if (p.dashCooldown > 0) p.dashCooldown -= dt;
    if (inputs.justPressedSpace && p.dashCooldown <= 0 && p.stamina >= 8 && p.punchPhase === 'none') {
      p.vx = -fwdX * 5.4;
      p.vz = -fwdZ * 5.4;
      p.stamina = Math.max(0, p.stamina - 7);
      p.dashCooldown = 0.65;
      soundEngine.playWhoosh(0.85);
    }

    // Feint (KeyR) — baits AI guard & resets combo rhythm
    if (inputs.justPressedFeint && p.punchPhase === 'none' && p.feintTimer <= 0 && p.stamina >= 3) {
      p.feintTimer = 0.24;
      p.stamina -= 2;
      this.aiPatternMemory.feintedGuardDrop = 0.65;
      soundEngine.playWhoosh(1.45);
      this.setCallout('FINTA', 'cyan', 0.55);
    }

    // Clinch / Amarre (KeyV) when close
    const dist = Math.hypot(this.opponent.x - p.x, this.opponent.z - p.z);
    if (inputs.justPressedClinch && dist <= 1.15 && p.clinchTimer <= 0 && p.punchPhase === 'none') {
      this.triggerClinch(p, this.opponent);
      return;
    }

    const canGuard = p.guardBrokenTimer <= 0 && p.punchPhase === 'none';
    const wantsHighGuard = held.has('KeyF') || held.has('ShiftLeft') || held.has('ShiftRight');
    const wantsLowGuard = held.has('KeyC');
    p.guardHigh = THREE.MathUtils.damp(p.guardHigh, wantsHighGuard && canGuard ? 1 : 0, 16, dt);
    p.guardLow = THREE.MathUtils.damp(p.guardLow, wantsLowGuard && canGuard ? 1 : 0, 16, dt);

    if (p.guardHigh > 0.6) this.aiPatternMemory.playerHighGuardTime += dt;
    else this.aiPatternMemory.playerHighGuardTime = Math.max(0, this.aiPatternMemory.playerHighGuardTime - dt * 0.6);

    let slipTarget = 0;
    if (held.has('KeyQ')) slipTarget = -1;
    if (held.has('KeyE')) slipTarget = 1;
    p.slipX = THREE.MathUtils.damp(p.slipX, p.punchPhase === 'none' ? slipTarget : 0, 14, dt);

    const canComboChain =
      p.punchPhase === 'recover' &&
      p.punchDuration > 0 &&
      p.punchTimer / p.punchDuration >= 0.52;

    if (
      inputs.bufferedPunch &&
      (p.punchPhase === 'none' || canComboChain) &&
      p.guardBrokenTimer <= 0 &&
      p.stamina >= 4
    ) {
      this.startPunch(p, inputs.bufferedPunch);
      inputs.bufferedPunch = null;
      inputs.bufferTimer = 0;
    }
  }

  private triggerClinch(a: FighterState, b: FighterState): void {
    a.clinchTimer = 0.95;
    b.clinchTimer = 0.95;
    a.punchPhase = 'none';
    b.punchPhase = 'none';
    a.activePunch = null;
    b.activePunch = null;
    a.stamina = Math.min(a.maxStamina, a.stamina + 14);
    a.stunMeter = Math.max(0, a.stunMeter - 22);
    soundEngine.playRefWhistle();
    this.setCallout('AMARRE · ¡SEPARACIÓN!', 'white', 1.0);
  }

  private updateOpponentAI(dt: number): void {
    const ai = this.opponent;
    const pl = this.player;
    const arch = this.opponentProfile.archetype;

    if (ai.clinchTimer > 0) {
      ai.vx = 0;
      ai.vz = 0;
      return;
    }

    const dx = pl.x - ai.x;
    const dz = pl.z - ai.z;
    const dist = Math.hypot(dx, dz);
    const fwdX = Math.sin(ai.facingAngle);
    const fwdZ = Math.cos(ai.facingAngle);
    const rightX = Math.cos(ai.facingAngle);
    const rightZ = -Math.sin(ai.facingAngle);

    if (this.aiPatternMemory.feintedGuardDrop > 0) {
      this.aiPatternMemory.feintedGuardDrop -= dt;
    }

    this.aiDecisionTimer -= dt;

    // Hurt AI survival clinch if rocked close
    if (ai.stunMeter > 78 && dist < 1.0 && Math.random() < 0.04) {
      this.triggerClinch(ai, pl);
      return;
    }

    const idealDist = arch === 'brawler' ? 1.05 : arch === 'slugger' ? 1.25 : 1.38;
    let moveFwd = 0;
    if (dist > idealDist + 0.18) moveFwd = 1;
    else if (dist < idealDist - 0.35) moveFwd = -0.8;
    if (ai.stamina < 22) moveFwd = -0.7;

    const footSpeed = (1.65 + ai.stats.footwork * 0.015) * (ai.stamina < 18 ? 0.65 : 1.0);
    const strafeWeight = arch === 'technician' ? 0.85 : arch === 'counter' ? 0.7 : 0.35;
    const targetVx = (fwdX * moveFwd + rightX * this.aiStrafeDir * strafeWeight) * footSpeed;
    const targetVz = (fwdZ * moveFwd + rightZ * this.aiStrafeDir * strafeWeight) * footSpeed;
    ai.vx = THREE.MathUtils.damp(ai.vx, targetVx, 8, dt);
    ai.vz = THREE.MathUtils.damp(ai.vz, targetVz, 8, dt);

    const playerAttacking = pl.punchPhase === 'windup' || pl.punchPhase === 'strike';
    const defSkill = ai.stats.defense / 100;
    let wantHigh = 0;
    let wantLow = 0;
    let wantSlip = 0;

    if (ai.guardBrokenTimer <= 0) {
      if (this.aiPatternMemory.feintedGuardDrop > 0) {
        // Feint baits AI into over-committing high guard
        wantHigh = 1;
      } else if (playerAttacking && dist < 1.85) {
        if (pl.activePunch === 'body_hook') wantLow = defSkill > 0.55 ? 1 : 0.4;
        else if (
          (arch === 'counter' || arch === 'technician') &&
          (pl.activePunch === 'jab' || pl.activePunch === 'cross') &&
          this.aiPatternMemory.playerJabs >= 2
        ) {
          wantSlip = this.aiStrafeDir;
        } else {
          wantHigh = 1;
        }
      } else if (ai.health < ai.maxHealth * 0.35 || ai.stamina < 25) {
        wantHigh = 0.85;
      }
    }

    ai.guardHigh = THREE.MathUtils.damp(ai.guardHigh, ai.punchPhase === 'none' ? wantHigh : 0, 12, dt);
    ai.guardLow = THREE.MathUtils.damp(ai.guardLow, ai.punchPhase === 'none' ? wantLow : 0, 12, dt);
    ai.slipX = THREE.MathUtils.damp(ai.slipX, ai.punchPhase === 'none' ? wantSlip : 0, 12, dt);

    if (this.aiDecisionTimer <= 0 && ai.punchPhase === 'none' && ai.guardBrokenTimer <= 0) {
      const aggroRate =
        arch === 'brawler' ? 0.42 : arch === 'slugger' ? 0.65 : arch === 'counter' ? 0.58 : 0.5;
      this.aiDecisionTimer = aggroRate * (1.25 - ai.stats.speed * 0.004);
      if (Math.random() < 0.35) this.aiStrafeDir *= -1;

      if (dist <= 1.65 && ai.stamina > 18) {
        let choice: PunchType = 'jab';
        const r = Math.random();

        if (this.aiPatternMemory.playerHighGuardTime > 0.95) {
          choice = r < 0.58 ? 'body_hook' : 'uppercut';
        } else if (ai.counterWindowTimer > 0) {
          choice = r < 0.6 ? 'cross' : 'hook_r';
        } else if (arch === 'brawler') {
          choice = r < 0.28 ? 'hook_l' : r < 0.58 ? 'hook_r' : r < 0.78 ? 'body_hook' : 'overhand';
        } else if (arch === 'slugger') {
          choice = r < 0.20 ? 'jab' : r < 0.52 ? 'cross' : r < 0.72 ? 'hook_r' : r < 0.88 ? 'uppercut' : 'overhand';
        } else if (arch === 'counter') {
          choice = pl.punchPhase === 'recover' ? 'cross' : r < 0.55 ? 'jab' : 'hook_l';
        } else {
          choice = r < 0.45 ? 'jab' : r < 0.72 ? 'cross' : r < 0.88 ? 'body_hook' : 'hook_r';
        }

        this.startPunch(ai, choice);
      }
    }
  }

  private startPunch(f: FighterState, type: PunchType): void {
    const spec = PUNCH_SPECS[type];
    const comboSpeedBonus = f.comboCount > 0 ? Math.min(0.14, f.comboCount * 0.05) : 0;
    const speedFactor =
      1.24 -
      f.stats.speed * 0.0042 -
      (f.traits.includes('lightning_hands') ? 0.1 : 0) -
      comboSpeedBonus;
    const clampedMult = THREE.MathUtils.clamp(speedFactor, 0.58, 1.15);

    f.activePunch = type;
    f.punchPhase = 'windup';
    f.punchTimer = 0;
    f.punchSpeedMult = clampedMult;
    f.punchDuration = spec.windup * clampedMult;
    f.punchHitResolved = false;
    f.thrownPunches += 1;

    const staminaMult = f.traits.includes('lightning_hands') ? 0.86 : 1.0;
    f.stamina = Math.max(0, f.stamina - spec.stamina * staminaMult);

    if (f.isPlayer && type === 'jab') {
      if (this.elapsed - this.aiPatternMemory.lastPlayerPunchTime < 1.6) {
        this.aiPatternMemory.playerJabs += 1;
      } else {
        this.aiPatternMemory.playerJabs = 1;
      }
      this.aiPatternMemory.lastPlayerPunchTime = this.elapsed;
    }

    soundEngine.playWhoosh(type === 'jab' ? 1.25 : 0.92);
  }

  private updateFighterKinematics(f: FighterState, foe: FighterState, dt: number): void {
    if (f.feintTimer > 0) f.feintTimer = Math.max(0, f.feintTimer - dt);
    if (f.guardBrokenTimer > 0) f.guardBrokenTimer = Math.max(0, f.guardBrokenTimer - dt);
    if (f.comboWindowTimer > 0) {
      f.comboWindowTimer -= dt;
      if (f.comboWindowTimer <= 0) f.comboCount = 0;
    }

    if (f.clinchTimer > 0) {
      f.clinchTimer -= dt;
      if (f.clinchTimer <= 0) {
        const dx = f.x - foe.x;
        const dz = f.z - foe.z;
        const d = Math.hypot(dx, dz) || 1;
        f.vx = (dx / d) * 2.8;
        f.vz = (dz / d) * 2.8;
      }
    }

    f.x += f.vx * dt;
    f.z += f.vz * dt;
    const limit = RING_HALF_EXTENT - 0.35;
    if (f.x > limit) { f.x = limit; f.vx *= -0.38; }
    if (f.x < -limit) { f.x = -limit; f.vx *= -0.38; }
    if (f.z > limit) { f.z = limit; f.vz *= -0.38; }
    if (f.z < -limit) { f.z = -limit; f.vz *= -0.38; }

    const regenRate =
      (f.guardHigh > 0.5 || f.guardLow > 0.5 ? 4.5 : 13.5) *
      (0.75 + f.stats.stamina * 0.005) *
      (f.traits.includes('marathon_lungs') ? 1.18 : 1.0);
    if (f.punchPhase === 'none') {
      f.stamina = Math.min(f.maxStamina, f.stamina + regenRate * dt);
      if (f.guardHigh < 0.2 && f.guardLow < 0.2 && f.guardBrokenTimer <= 0) {
        f.guardHealth = Math.min(100, f.guardHealth + 18 * dt);
      }
    }

    f.stunMeter = Math.max(0, f.stunMeter - dt * 8.5);
    if (f.counterWindowTimer > 0) f.counterWindowTimer -= dt;
    if (f.hitDirTimer > 0) {
      f.hitDirTimer -= dt;
      if (f.hitDirTimer <= 0) f.hitDir = 'none';
    }
    if (f.impactFlashTimer > 0) f.impactFlashTimer = Math.max(0, f.impactFlashTimer - dt);
    f.hitRecoilX = THREE.MathUtils.damp(f.hitRecoilX, 0, 11, dt);
    f.hitRecoilY = THREE.MathUtils.damp(f.hitRecoilY, 0, 11, dt);

    const fwdVel = f.vx * Math.sin(f.facingAngle) + f.vz * Math.cos(f.facingAngle);
    f.leanZ = THREE.MathUtils.damp(f.leanZ, THREE.MathUtils.clamp(fwdVel * 0.25, -0.45, 0.55), 10, dt);

    if (f.punchPhase !== 'none' && f.activePunch) {
      const spec = PUNCH_SPECS[f.activePunch];
      const speedFactor = f.punchSpeedMult;
      f.punchTimer += dt;

      if (f.punchPhase === 'windup' && f.punchTimer >= f.punchDuration) {
        f.punchPhase = 'strike';
        f.punchTimer = 0;
        f.punchDuration = spec.strike * speedFactor;
        f.x += Math.sin(f.facingAngle) * 0.12;
        f.z += Math.cos(f.facingAngle) * 0.12;
      } else if (f.punchPhase === 'strike') {
        if (!f.punchHitResolved && f.punchTimer >= f.punchDuration * 0.42) {
          f.punchHitResolved = true;
          this.resolvePunchHit(f, foe, f.activePunch);
        }
        if (f.punchTimer >= f.punchDuration) {
          f.punchPhase = 'recover';
          f.punchTimer = 0;
          f.punchDuration = spec.recover * speedFactor;
        }
      } else if (f.punchPhase === 'recover' && f.punchTimer >= f.punchDuration) {
        f.punchPhase = 'none';
        f.activePunch = null;
        f.punchTimer = 0;
      }
    }
  }

  private resolvePunchHit(attacker: FighterState, defender: FighterState, type: PunchType): void {
    const spec = PUNCH_SPECS[type];
    const dist = Math.hypot(defender.x - attacker.x, defender.z - attacker.z);
    const reachBonus = (attacker.appearance.reachScale - 1) * 0.45;
    if (dist > spec.range + reachBonus) return;

    if (spec.isStraight && Math.abs(defender.slipX) > 0.42) {
      defender.counterWindowTimer = 0.75;
      this.setCallout(defender.isPlayer ? '¡ESQUIVE PERFECTO!' : 'ESQUIVA RIVAL', 'cyan', 0.85);
      soundEngine.playWhoosh(1.4);
      return;
    }

    // Overhand partially bypasses high guard — needs ≥0.75 to fully block
    const guardThreshold = spec.isOverhand ? 0.75 : 0.55;
    const isBlocked =
      defender.guardBrokenTimer <= 0 &&
      (spec.isBody ? defender.guardLow > 0.55 : defender.guardHigh > guardThreshold);

    const isCounter =
      !isBlocked &&
      (attacker.counterWindowTimer > 0 ||
        defender.punchPhase === 'windup' ||
        defender.punchPhase === 'recover');

    let dmg =
      spec.damage *
      (0.72 + attacker.stats.power * 0.0065) *
      (1 + attacker.tacticPowerBonus);
    if (attacker.stamina < 15) dmg *= 0.65;
    if (attacker.traits.includes('cold_blood') && attacker.health < attacker.maxHealth * 0.65) {
      dmg *= 1.15;
    }
    if (attacker.traits.includes('glass_cannon')) {
      dmg *= 1.20; // glass cannon — massive power, brittle chin
    }

    if (isCounter) {
      const counterMult = attacker.traits.includes('counter_instinct') ? 1.72 : 1.48;
      dmg *= counterMult;
      attacker.countersLanded += 1;
      attacker.counterWindowTimer = 0;
    }

    if (isBlocked) {
      const bleed = spec.isStraight ? 0.14 : 0.34;
      dmg *= bleed;
      defender.stamina = Math.max(0, defender.stamina - 4.5);
      const defMitigation = 1 - defender.stats.defense * 0.004;
      defender.guardHealth = Math.max(0, defender.guardHealth - spec.guardChip * defMitigation);
      defender.hitRecoilX = (type === 'hook_l' ? 1 : type === 'hook_r' ? -1 : 0.2) * 0.35;
      defender.hitRecoilY = 0.28;
      defender.hitDir = spec.isBody ? 'body' : 'straight';
      defender.hitDirTimer = 0.14;
      soundEngine.playPunchHit(0.7, false, true);
      this.spawnSweatBurst(defender, 3, attacker);

      if (defender.guardHealth <= 0) {
        defender.guardBrokenTimer = 0.95;
        defender.guardHealth = 35;
        defender.guardHigh = 0;
        defender.guardLow = 0;
        soundEngine.playGuardBreak();
        this.cameraShake = 0.16;
        this.setCallout('¡GUARDIA ROTA!', attacker.isPlayer ? 'gold' : 'red', 1.0);
      }
    } else {
      attacker.landedPunches += 1;
      if (spec.isBody) attacker.bodyPunchesLanded += 1;
      else attacker.headPunchesLanded += 1;

      attacker.comboCount += 1;
      attacker.comboWindowTimer = 0.86;
      if (attacker.comboCount >= 2) {
        dmg *= 1 + Math.min(0.24, (attacker.comboCount - 1) * 0.08);
      }

      attacker.roundPoints += isCounter ? 3 : type === 'jab' ? 1 : 2;
      attacker.pointsScore += isCounter ? 3 : 1;

      defender.zoneDamage[spec.zone] += dmg;
      attacker.zoneDamage.hands += dmg * 0.12;

      if (spec.isBody) {
        const drain = attacker.traits.includes('body_snatcher') ? 19 : 13;
        defender.stamina = Math.max(0, defender.stamina - drain);
        defender.maxStamina = Math.max(55, defender.maxStamina - 2.4);
      }

      const chinResist =
        (0.75 + defender.stats.chin * 0.005) *
        (defender.traits.includes('iron_chin') ? 1.18 : 1.0) *
        (defender.traits.includes('glass_cannon') ? 0.82 : 1.0); // glass cannon — brittle jaw
      const stunAdded = (spec.stun * (isCounter ? 1.65 : 1.0)) / chinResist;
      defender.stunMeter += stunAdded;

      const recoilSign =
        type === 'hook_l' ? 1 : type === 'hook_r' ? -1 : (Math.random() - 0.5) * 0.6;
      defender.hitRecoilX = recoilSign * (isCounter ? 1.25 : 0.92);
      defender.hitRecoilY = type === 'uppercut' ? 1.35 : 0.85;
      defender.hitDir =
        type === 'body_hook'
          ? 'body'
          : type === 'uppercut'
            ? 'up'
            : type === 'hook_l'
              ? 'right'
              : type === 'hook_r'
                ? 'left'
                : 'straight';
      defender.hitDirTimer = isCounter ? 0.34 : 0.24;

      const nx = (defender.x - attacker.x) / Math.max(0.1, dist);
      const nz = (defender.z - attacker.z) / Math.max(0.1, dist);
      defender.vx += nx * (isCounter ? 3.5 : 2.15);
      defender.vz += nz * (isCounter ? 3.5 : 2.15);

      if (isCounter && defender.punchPhase === 'windup') {
        defender.punchPhase = 'none';
        defender.activePunch = null;
      }

      defender.impactFlashTimer = isCounter ? 0.22 : type === 'jab' ? 0.08 : 0.14;
      soundEngine.playPunchHit(isCounter ? 1.48 : type === 'jab' ? 0.78 : 1.18, isCounter, false);
      this.spawnSweatBurst(defender, isCounter ? 15 : 8, attacker);
      // Blood-tinted burst when brow damage is high
      if (defender.zoneDamage.eyebrow > 32) {
        this.spawnBloodBurst(defender, isCounter ? 5 : 3, attacker);
      }

      if (isCounter || type === 'uppercut' || type === 'cross') {
        this.hitstopTimer = isCounter ? 0.068 : 0.042;
        this.cameraShake = isCounter ? 0.25 : 0.14;
        this.crowdExcitement = Math.min(1, this.crowdExcitement + (isCounter ? 0.55 : 0.28));
      }

      if (isCounter) {
        this.setCallout(
          attacker.isPlayer ? '¡CONTRAGOLPE LETAL!' : '¡CONTRAGOLPE RIVAL!',
          attacker.isPlayer ? 'gold' : 'red',
          1.05
        );
        soundEngine.playCrowdRoar(0.65);
      } else if (attacker.comboCount >= 3) {
        const comboLabels = ['¡COMBO MORTAL!', '¡LLUVIA DE GOLPES!', '¡SIN COMPASIÓN!', '¡TORMENTA DE PUÑOS!'];
        const label = attacker.comboCount >= 5
          ? '¡DESTRUCCIÓN TOTAL!'
          : comboLabels[Math.min(attacker.comboCount - 3, comboLabels.length - 1)];
        this.setCallout(`${label} x${attacker.comboCount}`, 'gold', 0.8);
      } else if (spec.isBody && dmg > 10) {
        this.setCallout('¡GANCHO AL HÍGADO!', 'cyan', 0.8);
      } else if (type === 'overhand' && !isBlocked) {
        this.setCallout('¡VOLEO DEMOLEDOR!', attacker.isPlayer ? 'gold' : 'red', 0.75);
      }
    }

    defender.health = Math.max(0, defender.health - dmg);

    if (defender.health <= 0 || defender.stunMeter >= 100) {
      this.triggerKnockdown(defender, attacker);
    }
  }

  private triggerKnockdown(downed: FighterState, scorer: FighterState): void {
    downed.knockdownsInRound += 1;
    downed.totalKnockdowns += 1;
    scorer.roundPoints += 10;
    scorer.pointsScore += 10;
    downed.punchPhase = 'none';
    downed.activePunch = null;

    this.phase = 'knockdown';
    this.knockdownTarget = downed.isPlayer ? 'player' : 'opponent';
    this.knockdownCount = 0;
    this.knockdownCountTimer = 0.9;
    this.playerRecoveryProgress = 0;
    this.aiRecoveryTarget =
      downed.totalKnockdowns >= 3 || (downed.health <= 0 && Math.random() < 0.45)
        ? 99
        : 3 + downed.totalKnockdowns * 2 + Math.floor(Math.random() * 2);

    this.cameraShake = 0.36;
    this.crowdExcitement = 1.0;
    this.spawnSweatBurst(downed, 18);
    soundEngine.playCrowdRoar(1.0);
    this.setCallout(
      downed.isPlayer ? '¡DERROBADO! PULSA ESPACIO' : '¡A LA LONA!',
      downed.isPlayer ? 'red' : 'gold',
      2.2
    );
  }

  private updateKnockdown(dt: number, inputs: CombatInputs): void {
    const downed = this.knockdownTarget === 'player' ? this.player : this.opponent;
    downed.knockdownProgress = Math.min(1, downed.knockdownProgress + dt * 3.2);

    if (this.knockdownTarget === 'player' && inputs.justPressedSpace) {
      const recoveryBoost = this.player.traits.includes('iron_chin') ? 0.14 : 0.105;
      this.playerRecoveryProgress = Math.min(1, this.playerRecoveryProgress + recoveryBoost);
      if (this.playerRecoveryProgress >= 1 && this.player.knockdownsInRound < 3) {
        this.riseFromKnockdown(this.player);
        return;
      }
    }

    this.knockdownCountTimer -= dt;
    if (this.knockdownCountTimer <= 0) {
      this.knockdownCount += 1;
      this.knockdownCountTimer = 0.92;
      this.refArmAngle = -1.6;
      soundEngine.playClick();

      if (downed.knockdownsInRound >= 3 && this.knockdownCount >= 3) {
        this.finishFight(
          this.knockdownTarget === 'opponent',
          this.knockdownTarget === 'opponent' ? 'TKO' : 'LOSS_TKO'
        );
        return;
      }

      if (this.knockdownTarget === 'opponent' && this.knockdownCount >= this.aiRecoveryTarget) {
        this.riseFromKnockdown(this.opponent);
        return;
      }

      if (this.knockdownCount >= 10) {
        this.finishFight(
          this.knockdownTarget === 'opponent',
          this.knockdownTarget === 'opponent' ? 'KO' : 'LOSS_KO'
        );
      }
    }
  }

  private riseFromKnockdown(f: FighterState): void {
    f.knockdownProgress = 0;
    const hasBrawlSpirit = f.traits.includes('brawl_spirit');
    f.stunMeter = hasBrawlSpirit ? 15 : 25;
    const healthBoost = hasBrawlSpirit ? 0.30 : 0.20;
    f.health = Math.max(f.maxHealth * 0.28, f.health + f.maxHealth * healthBoost);
    f.stamina = Math.max(f.maxStamina * (hasBrawlSpirit ? 0.60 : 0.45), f.stamina);
    if (hasBrawlSpirit) f.guardHealth = 100;
    this.knockdownTarget = null;
    this.phase = 'fighting';
    this.setCallout(hasBrawlSpirit ? '¡ESPÍRITU DE CAMPEÓN!' : '¡SE LEVANTA Y CONTINÚA!', 'cyan', 1.4);
  }

  private endRound(): void {
    if (this.player.roundPoints > this.opponent.roundPoints) {
      this.player.pointsScore += 10;
      this.opponent.pointsScore += 9;
    } else if (this.opponent.roundPoints > this.player.roundPoints) {
      this.opponent.pointsScore += 10;
      this.player.pointsScore += 9;
    } else {
      this.player.pointsScore += 10;
      this.opponent.pointsScore += 10;
    }

    soundEngine.playBell(2);

    if (this.round >= this.totalRounds) {
      const won = this.player.pointsScore >= this.opponent.pointsScore;
      this.finishFight(won, won ? 'UD' : 'LOSS_DEC');
      return;
    }

    // Generate contextual corner advice from Don Mateo
    if (this.player.zoneDamage.ribs > this.player.zoneDamage.eyebrow + 12) {
      this.cornerAdvice =
        'Don Mateo: «Está castigando tus costillas. Usa C para cubrir el cuerpo y contragolpea con uppercut.»';
    } else if (this.player.stamina < this.player.maxStamina * 0.4) {
      this.cornerAdvice =
        'Don Mateo: «Respira profundo, no persigas golpes al aire. Usa el jab para controlar la distancia.»';
    } else if (this.player.roundPoints > this.opponent.roundPoints) {
      this.cornerAdvice =
        'Don Mateo: «Vas arriba en las tarjetas. Finta con R para abrir su guardia y remata al mentón.»';
    } else {
      this.cornerAdvice =
        'Don Mateo: «Necesitamos más volumen. Combina jab, recto y gancho al cuerpo para frenarlo.»';
    }

    this.cornerChoiceMade = null;
    this.phase = 'between_rounds';
    this.betweenRoundTimer = 7.5;
    this.setCallout(`FIN DEL ASALTO ${this.round}`, 'gold', 2.0);
  }

  private startNextRound(): void {
    this.round += 1;
    this.roundTimeLeft = this.roundDuration;
    this.player.roundPoints = 0;
    this.opponent.roundPoints = 0;
    this.player.knockdownsInRound = 0;
    this.opponent.knockdownsInRound = 0;
    this.player.tacticPowerBonus = this.cornerChoiceMade === 'tactic' ? 0.18 : 0;

    const pRecov = this.player.traits.includes('marathon_lungs') ? 0.26 : 0.16;
    this.player.health = Math.min(this.player.maxHealth, this.player.health + this.player.maxHealth * pRecov);
    this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + this.player.maxStamina * 0.45);
    this.player.guardHealth = 100;

    this.opponent.health = Math.min(this.opponent.maxHealth, this.opponent.health + this.opponent.maxHealth * 0.16);
    this.opponent.stamina = Math.min(this.opponent.maxStamina, this.opponent.stamina + this.opponent.maxStamina * 0.45);
    this.opponent.guardHealth = 100;

    this.player.x = -1.1;
    this.player.z = 0.6;
    this.opponent.x = 1.1;
    this.opponent.z = -0.6;
    this.phase = 'fighting';
    soundEngine.playBell(1);
    this.setCallout(`¡ASALTO ${this.round}!`, 'gold', 1.4);
  }

  private finishFight(won: boolean, method: FightResult['method']): void {
    this.phase = 'finished';
    soundEngine.playBell(3);
    soundEngine.playCrowdRoar(1.0);

    const newInjuries = this.generateDynamicInjuries();
    const koBonus = method === 'KO' || method === 'TKO' ? 1.25 : 1.0;
    const purseEarned = Math.round(this.opponentProfile.purse * (won ? koBonus : 0.35));
    const gymPointsEarned = won
      ? 4 + this.player.countersLanded + (method === 'KO' ? 3 : 1)
      : 3 + Math.min(3, this.player.countersLanded);

    this.result = {
      won,
      method,
      roundEnded: this.round,
      totalRounds: this.totalRounds,
      playerScore: this.player.pointsScore,
      opponentScore: this.opponent.pointsScore,
      landedPunches: this.player.landedPunches,
      thrownPunches: this.player.thrownPunches,
      headPunchesLanded: this.player.headPunchesLanded,
      bodyPunchesLanded: this.player.bodyPunchesLanded,
      countersLanded: this.player.countersLanded,
      knockdownsScored: this.opponent.totalKnockdowns,
      knockdownsTaken: this.player.totalKnockdowns,
      zoneDamageTaken: { ...this.player.zoneDamage },
      newInjuries,
      purseEarned,
      gymPointsEarned,
      opponentId: this.opponentProfile.id,
      opponentName: this.opponentProfile.name,
      isTitleFight: this.isTitleFight,
    };
  }

  private generateDynamicInjuries(): ActiveInjury[] {
    const injuries: ActiveInjury[] = [];
    const zd = this.player.zoneDamage;

    const specs: { zone: InjuryZone; threshold: number; label: string; statPenaltyDesc: string }[] = [
      { zone: 'eyebrow', threshold: 34, label: 'Corte en Arco Superciliar', statPenaltyDesc: '-Defensa por visión reducida' },
      { zone: 'nose_jaw', threshold: 44, label: 'Contusión Mandibular / Tabique', statPenaltyDesc: '-Aguante y mandíbula' },
      { zone: 'ribs', threshold: 36, label: 'Fisura Intercostal', statPenaltyDesc: '-Resistencia cardiovascular' },
      { zone: 'hands', threshold: 32, label: 'Inflamación de Nudillos', statPenaltyDesc: '-Potencia de golpeo' },
    ];

    specs.forEach((s) => {
      const dmg = zd[s.zone];
      if (dmg >= s.threshold) {
        const severity = dmg >= s.threshold * 2.1 ? 'severe' : dmg >= s.threshold * 1.45 ? 'moderate' : 'minor';
        const weeks = severity === 'severe' ? 3 : severity === 'moderate' ? 2 : 1;
        const penaltyValue = severity === 'severe' ? 0.16 : severity === 'moderate' ? 0.1 : 0.06;
        injuries.push({
          id: `${s.zone}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          zone: s.zone,
          label: s.label,
          severity,
          weeksRemaining: weeks,
          statPenaltyDesc: s.statPenaltyDesc,
          penaltyValue,
        });
      }
    });

    this.activeInjuries.forEach((existing) => {
      if (zd[existing.zone] > 18 && !injuries.some((n) => n.zone === existing.zone)) {
        injuries.push({
          ...existing,
          severity: existing.severity === 'minor' ? 'moderate' : 'severe',
          weeksRemaining: existing.weeksRemaining + 1,
          penaltyValue: Math.min(0.22, existing.penaltyValue + 0.04),
        });
      }
    });

    return injuries;
  }

  private resolveCollisions(): void {
    const minSep = this.player.clinchTimer > 0 ? 0.56 : 0.82;
    const dx = this.opponent.x - this.player.x;
    const dz = this.opponent.z - this.player.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    if (dist < minSep) {
      const push = (minSep - dist) * 0.5;
      const nx = dx / dist;
      const nz = dz / dist;
      this.player.x -= nx * push;
      this.player.z -= nz * push;
      this.opponent.x += nx * push;
      this.opponent.z += nz * push;
    }
  }

  private updateReferee(dt: number): void {
    if (!this.refereeRig) return;
    const midX = (this.player.x + this.opponent.x) * 0.5;
    const midZ = (this.player.z + this.opponent.z) * 0.5;

    let targetX = midX;
    let targetZ = midZ - 1.85;
    let kneelY = 0.92;

    if (this.phase === 'knockdown') {
      const downed = this.knockdownTarget === 'player' ? this.player : this.opponent;
      targetX = downed.x + 0.65;
      targetZ = downed.z - 0.65;
      kneelY = 0.62;
    } else {
      const axisX = this.opponent.x - this.player.x;
      const axisZ = this.opponent.z - this.player.z;
      const len = Math.hypot(axisX, axisZ) || 1;
      targetX = THREE.MathUtils.clamp(midX + (axisZ / len) * 1.85, -2.3, 2.3);
      targetZ = THREE.MathUtils.clamp(midZ - (axisX / len) * 1.85, -2.3, 2.3);
    }

    this.refX = THREE.MathUtils.damp(this.refX, targetX, 5, dt);
    this.refZ = THREE.MathUtils.damp(this.refZ, targetZ, 5, dt);
    this.refArmAngle = THREE.MathUtils.damp(this.refArmAngle, 0, 7, dt);

    this.refereeRig.root.position.set(this.refX, 0, this.refZ);
    this.refereeRig.root.rotation.y = Math.atan2(midX - this.refX, midZ - this.refZ);
    this.refereeRig.body.position.y = THREE.MathUtils.damp(this.refereeRig.body.position.y, kneelY, 8, dt);
    this.refereeRig.armR.rotation.x = this.refArmAngle;
  }

  private spawnBloodBurst(target: FighterState, count: number, attacker?: FighterState): void {
    let dirX = 0;
    let dirZ = 0;
    if (attacker) {
      const dx = target.x - attacker.x;
      const dz = target.z - attacker.z;
      const d = Math.hypot(dx, dz) || 1;
      dirX = dx / d;
      dirZ = dz / d;
    }
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.life <= 0) {
        p.life = 0.28 + Math.random() * 0.18;
        p.maxLife = p.life;
        // Start from brow height
        p.mesh.position.set(
          target.x + (Math.random() - 0.5) * 0.08,
          1.68 + (Math.random() - 0.5) * 0.06,
          target.z + (Math.random() - 0.5) * 0.08
        );
        p.vx = dirX * 1.8 + (Math.random() - 0.5) * 2.2;
        p.vy = 0.8 + Math.random() * 1.5;
        p.vz = dirZ * 1.8 + (Math.random() - 0.5) * 2.2;
        // Tint blood-red
        (p.mesh.material as THREE.MeshStandardMaterial).color.setHex(0xcc1111);
        (p.mesh.material as THREE.MeshStandardMaterial).opacity = 0.9;
        p.mesh.scale.setScalar(0.7);
        p.mesh.visible = true;
        spawned += 1;
      }
    }
  }

  private spawnSweatBurst(target: FighterState, count: number, attacker?: FighterState): void {
    let dirX = 0;
    let dirZ = 0;
    if (attacker) {
      const dx = target.x - attacker.x;
      const dz = target.z - attacker.z;
      const d = Math.hypot(dx, dz) || 1;
      dirX = dx / d;
      dirZ = dz / d;
    }

    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.life <= 0) {
        p.life = 0.35 + Math.random() * 0.25;
        p.maxLife = p.life;
        p.mesh.position.set(
          target.x + (Math.random() - 0.5) * 0.14,
          1.46 + (Math.random() - 0.5) * 0.18,
          target.z + (Math.random() - 0.5) * 0.14
        );
        p.vx = dirX * 2.1 + (Math.random() - 0.5) * 3.0;
        p.vy = 1.4 + Math.random() * 2.2;
        p.vz = dirZ * 2.1 + (Math.random() - 0.5) * 3.0;
        p.mesh.visible = true;
        spawned += 1;
      }
    }
  }

  private updateParticles(dt: number): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= 9.5 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        const sc = Math.max(0.01, p.life / p.maxLife);
        p.mesh.scale.setScalar(sc);
        if (p.life <= 0 || p.mesh.position.y < 0.02) {
          p.life = 0;
          p.mesh.visible = false;
          // Reset to default sweat color for next use
          (p.mesh.material as THREE.MeshStandardMaterial).color.setHex(0xe2e8f0);
          (p.mesh.material as THREE.MeshStandardMaterial).opacity = 0.88;
          p.mesh.scale.setScalar(1);
        }
      }
    }
  }

  private syncRigs(): void {
    const syncOne = (f: FighterState, rig: BoxerRig) => {
      rig.root.position.set(f.x, 0, f.z);
      rig.root.rotation.y = f.facingAngle;
      const moveNorm = Math.min(1, Math.hypot(f.vx, f.vz) / 2.8);
      const staminaRatio = THREE.MathUtils.clamp(f.stamina / Math.max(1, f.maxStamina), 0, 1);
      const sweat = THREE.MathUtils.clamp((this.round - 1) * 0.22 + (1 - staminaRatio) * 0.6, 0, 1);
      const punchProgress = f.punchDuration > 0 ? THREE.MathUtils.clamp(f.punchTimer / f.punchDuration, 0, 1) : 0;

      poseBoxer(rig, {
        dt: this.lastDt,
        stance: f.appearance.stance,
        elapsed: this.elapsed + (f.isPlayer ? 0 : 1.7),
        guardHigh: f.guardHigh,
        guardLow: f.guardLow,
        slipX: f.slipX,
        leanZ: f.leanZ,
        activePunch: f.activePunch,
        punchPhase: f.punchPhase,
        punchProgress,
        feintAmount: f.feintTimer > 0 ? 1 - f.feintTimer / 0.24 : 0,
        clinchAmount: f.clinchTimer > 0 ? 1 : 0,
        guardBroken: f.guardBrokenTimer > 0,
        hitRecoilX: f.hitRecoilX,
        hitRecoilY: f.hitRecoilY,
        hitDir: f.hitDir,
        knockdownProgress: f.knockdownProgress,
        victoryRaise: f.victoryRaise,
        sweatLevel: sweat,
        staminaRatio,
        browDamage: Math.min(1, f.zoneDamage.eyebrow / 60),
        jawDamage: Math.min(1, f.zoneDamage.nose_jaw / 70),
        ribDamage: Math.min(1, f.zoneDamage.ribs / 65),
        moveSpeedNorm: moveNorm,
        impactFlashIntensity: f.impactFlashTimer > 0 ? f.impactFlashTimer / 0.22 : 0,
      });
    };

    syncOne(this.player, this.playerRig);
    syncOne(this.opponent, this.opponentRig);
  }

  private setCallout(text: string, color: CombatHUDState['calloutColor'], duration: number): void {
    this.calloutText = text;
    this.calloutColor = color;
    this.calloutTimer = duration;
  }

  private buildHUD(): CombatHUDState {
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      roundTimeLeft: Math.max(0, Math.ceil(this.roundTimeLeft)),
      betweenRoundTimeLeft: Math.max(0, Math.ceil(this.betweenRoundTimer)),
      cornerAdvice: this.cornerAdvice,
      cornerChoiceMade: this.cornerChoiceMade,
      playerHealth: Math.ceil(this.player.health),
      playerMaxHealth: Math.ceil(this.player.maxHealth),
      playerStamina: Math.ceil(this.player.stamina),
      playerMaxStamina: Math.ceil(this.player.maxStamina),
      playerGuardHealth: Math.ceil(this.player.guardHealth),
      playerCombo: this.player.comboCount,
      playerKnockdowns: this.player.totalKnockdowns,
      opponentHealth: Math.ceil(this.opponent.health),
      opponentMaxHealth: Math.ceil(this.opponent.maxHealth),
      opponentStamina: Math.ceil(this.opponent.stamina),
      opponentMaxStamina: Math.ceil(this.opponent.maxStamina),
      opponentGuardHealth: Math.ceil(this.opponent.guardHealth),
      opponentKnockdowns: this.opponent.totalKnockdowns,
      knockdownTarget: this.knockdownTarget,
      knockdownCount: this.knockdownCount,
      playerRecoveryProgress: this.playerRecoveryProgress,
      calloutText: this.calloutText,
      calloutColor: this.calloutColor,
      playerScore: this.player.pointsScore,
      opponentScore: this.opponent.pointsScore,
      result: this.result,
    };
  }

  public dispose(): void {
    this.particleGeo.dispose();
    this.particleMat.dispose();
    if (this.particleGroup.parent) {
      this.particleGroup.parent.remove(this.particleGroup);
    }
  }
}
