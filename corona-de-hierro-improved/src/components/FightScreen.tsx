import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  Award,
  Camera,
  HeartPulse,
  Wind,
  Crosshair,
} from 'lucide-react';
import {
  ActiveInjury,
  BoxerAppearance,
  BoxerStats,
  CameraMode,
  CornerFocus,
  FightResult,
  OpponentProfile,
  PunchType,
  TraitId,
} from '../types/game';
import {
  buildBoxingArena,
  configureRenderer,
  detectSoftwareWebGL,
  scheduleSoftwareAfterDraw,
  setupArenaEnvironment,
} from '../engine/arenaScene';
import { buildBoxerRig, buildRefereeRig } from '../engine/boxerMesh';
import {
  CombatHUDState,
  CombatInputs,
  CombatSimulation,
} from '../engine/combatSimulation';
import { soundEngine } from '../audio/soundEngine';

interface FightScreenProps {
  playerAppearance: BoxerAppearance;
  playerStats: BoxerStats;
  playerTraits: TraitId[];
  activeInjuries: ActiveInjury[];
  opponent: OpponentProfile;
  isTitleFight: boolean;
  onFinishFight: (result: FightResult) => void;
  onAbortFight: () => void;
}

const CAMERA_LABELS: Record<CameraMode, string> = {
  broadcast: 'Cámara TV',
  corner: 'Esquina',
  close: 'Primer Plano',
};

export const FightScreen: React.FC<FightScreenProps> = ({
  playerAppearance,
  playerStats,
  playerTraits,
  activeInjuries,
  opponent,
  isTitleFight,
  onFinishFight,
  onAbortFight,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  const simRef = useRef<CombatSimulation | null>(null);
  const cameraModeRef = useRef<CameraMode>('broadcast');

  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(soundEngine.isMuted());
  const [cameraMode, setCameraMode] = useState<CameraMode>('broadcast');

  const [hud, setHud] = useState<CombatHUDState>({
    phase: 'intro',
    round: 1,
    totalRounds: opponent.rounds,
    roundTimeLeft: 75,
    betweenRoundTimeLeft: 7,
    cornerAdvice: '',
    cornerChoiceMade: null,
    playerHealth: 100,
    playerMaxHealth: 100,
    playerStamina: 100,
    playerMaxStamina: 100,
    playerGuardHealth: 100,
    playerCombo: 0,
    playerKnockdowns: 0,
    opponentHealth: 100,
    opponentMaxHealth: 100,
    opponentStamina: 100,
    opponentMaxStamina: 100,
    opponentGuardHealth: 100,
    opponentKnockdowns: 0,
    knockdownTarget: null,
    knockdownCount: 0,
    playerRecoveryProgress: 0,
    calloutText: '¡ASALTO 1!',
    calloutColor: 'gold',
    playerScore: 0,
    opponentScore: 0,
    result: null,
  });

  const inputsRef = useRef<CombatInputs>({
    held: new Set<string>(),
    bufferedPunch: null,
    bufferTimer: 0,
    justPressedSpace: false,
    justPressedFeint: false,
    justPressedClinch: false,
  });

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  const cycleCamera = () => {
    soundEngine.playClick();
    setCameraMode((prev) =>
      prev === 'broadcast' ? 'corner' : prev === 'corner' ? 'close' : 'broadcast'
    );
  };

  const queuePunch = (punch: PunchType) => {
    inputsRef.current.bufferedPunch = punch;
    inputsRef.current.bufferTimer = 0.16;
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const { renderer, maxAnisotropy } = configureRenderer(container, isSoftwareGl);

    const scene = new THREE.Scene();
    const disposeEnv = setupArenaEnvironment(renderer, scene, opponent.tier);
    const arena = buildBoxingArena(scene, maxAnisotropy, opponent.tier);

    const camera = new THREE.PerspectiveCamera(
      46,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      80
    );

    const playerRig = buildBoxerRig(playerAppearance);
    const opponentRig = buildBoxerRig(opponent.appearance);
    const refereeRig = buildRefereeRig();
    scene.add(playerRig.root, opponentRig.root, refereeRig.root);

    const sim = new CombatSimulation(
      scene,
      playerRig,
      opponentRig,
      refereeRig,
      playerAppearance,
      playerStats,
      playerTraits,
      activeInjuries,
      opponent,
      isTitleFight
    );
    simRef.current = sim;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        setPaused((prev) => !prev);
        return;
      }
      if (e.code === 'Tab') {
        e.preventDefault();
        setCameraMode((prev) =>
          prev === 'broadcast' ? 'corner' : prev === 'corner' ? 'close' : 'broadcast'
        );
        return;
      }
      if (pausedRef.current) return;

      inputsRef.current.held.add(e.code);

      if (e.code === 'KeyJ') queuePunch('jab');
      else if (e.code === 'KeyL' || e.code === 'KeyU') queuePunch('cross');
      else if (e.code === 'KeyI') queuePunch('hook_l');
      else if (e.code === 'KeyO') queuePunch('hook_r');
      else if (e.code === 'KeyY') queuePunch('overhand');
      else if (e.code === 'KeyK') queuePunch('uppercut');
      else if (e.code === 'KeyB' || e.code === 'KeyH') queuePunch('body_hook');
      else if (e.code === 'KeyR') inputsRef.current.justPressedFeint = true;
      else if (e.code === 'KeyV') inputsRef.current.justPressedClinch = true;
      else if (e.code === 'Space') {
        e.preventDefault();
        inputsRef.current.justPressedSpace = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      inputsRef.current.held.delete(e.code);
    };

    const onBlur = () => {
      inputsRef.current.held.clear();
    };

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onResize);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;
    let lastHudSync = 0;

    const camPos = new THREE.Vector3(0, 4.2, 5.8);
    const camLook = new THREE.Vector3(0, 1.05, 0);
    const desiredPos = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();

    const tick = () => {
      if (disposed) return;
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);

      if (!pausedRef.current) {
        if (inputsRef.current.bufferTimer > 0) {
          inputsRef.current.bufferTimer -= dt;
          if (inputsRef.current.bufferTimer <= 0) inputsRef.current.bufferedPunch = null;
        }

        const nextHud = sim.step(dt, inputsRef.current);
        inputsRef.current.justPressedSpace = false;
        inputsRef.current.justPressedFeint = false;
        inputsRef.current.justPressedClinch = false;

        lastHudSync += dt;
        if (lastHudSync >= 0.05 || nextHud.phase !== 'fighting') {
          lastHudSync = 0;
          setHud(nextHud);
        }

        const camInfo = sim.getCameraTargetAndShake();
        const fightAxisX = camInfo.oppPos.x - camInfo.playerPos.x;
        const fightAxisZ = camInfo.oppPos.z - camInfo.playerPos.z;
        const axisLen = Math.hypot(fightAxisX, fightAxisZ) || 1;
        const perpX = -fightAxisZ / axisLen;
        const perpZ = fightAxisX / axisLen;

        if (camInfo.phase === 'intro') {
          // Cinematic crane sweep down into the ring
          const sweep = camInfo.introProgress;
          desiredPos.set(
            THREE.MathUtils.lerp(0.8, camInfo.midX + perpX * 3.85 - (fightAxisX / axisLen) * 1.15, sweep),
            THREE.MathUtils.lerp(4.4, 2.05, sweep),
            THREE.MathUtils.lerp(5.2, camInfo.midZ + perpZ * 3.85 - (fightAxisZ / axisLen) * 1.15, sweep)
          );
          desiredLook.set(camInfo.midX, 1.1, camInfo.midZ);
        } else {
          const mode = cameraModeRef.current;
          if (mode === 'corner') {
            desiredPos.set(
              camInfo.playerPos.x - (fightAxisX / axisLen) * 2.15 + perpX * 1.05,
              1.78,
              camInfo.playerPos.z - (fightAxisZ / axisLen) * 2.15 + perpZ * 1.05
            );
            desiredLook.set(camInfo.oppPos.x, 1.28, camInfo.oppPos.z);
          } else if (mode === 'close') {
            desiredPos.set(
              camInfo.midX + perpX * 2.65 - (fightAxisX / axisLen) * 0.75,
              1.68,
              camInfo.midZ + perpZ * 2.65 - (fightAxisZ / axisLen) * 0.75
            );
            desiredLook.set(camInfo.midX, 1.25, camInfo.midZ);
          } else {
            desiredPos.set(
              camInfo.midX + perpX * 3.85 - (fightAxisX / axisLen) * 1.15,
              2.05,
              camInfo.midZ + perpZ * 3.85 - (fightAxisZ / axisLen) * 1.15
            );
            desiredLook.set(camInfo.midX, 1.08, camInfo.midZ);
          }
        }

        camPos.x = THREE.MathUtils.damp(camPos.x, desiredPos.x, 5.8, dt);
        camPos.y = THREE.MathUtils.damp(camPos.y, desiredPos.y, 5.8, dt);
        camPos.z = THREE.MathUtils.damp(camPos.z, desiredPos.z, 5.8, dt);
        camLook.x = THREE.MathUtils.damp(camLook.x, desiredLook.x, 8.2, dt);
        camLook.y = THREE.MathUtils.damp(camLook.y, desiredLook.y, 8.2, dt);
        camLook.z = THREE.MathUtils.damp(camLook.z, desiredLook.z, 8.2, dt);

        camera.position.set(
          camPos.x + (Math.random() - 0.5) * camInfo.shake,
          camPos.y + (Math.random() - 0.5) * camInfo.shake,
          camPos.z + (Math.random() - 0.5) * camInfo.shake
        );
        camera.lookAt(camLook);

        arena.updateArena(clock.getElapsedTime(), camInfo.excitement, [
          camInfo.playerPos,
          camInfo.oppPos,
        ]);
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        scheduleSoftwareAfterDraw(renderer, tick, (id) => {
          frameId = id;
        });
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
      sim.dispose();
      simRef.current = null;
      playerRig.dispose();
      opponentRig.dispose();
      refereeRig.dispose();
      arena.dispose();
      disposeEnv();
      renderer.dispose();
    };
  }, [playerAppearance, playerStats, playerTraits, activeInjuries, opponent, isTitleFight]);

  const playerHpPct = Math.max(0, Math.min(100, (hud.playerHealth / Math.max(1, hud.playerMaxHealth)) * 100));
  const playerStamPct = Math.max(0, Math.min(100, (hud.playerStamina / Math.max(1, hud.playerMaxStamina)) * 100));
  const oppHpPct = Math.max(0, Math.min(100, (hud.opponentHealth / Math.max(1, hud.opponentMaxHealth)) * 100));
  const oppStamPct = Math.max(0, Math.min(100, (hud.opponentStamina / Math.max(1, hud.opponentMaxStamina)) * 100));

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleCornerSelect = (focus: CornerFocus) => {
    simRef.current?.chooseCornerFocus(focus);
  };

  const accuracyPct =
    hud.result && hud.result.thrownPunches > 0
      ? Math.round((hud.result.landedPunches / hud.result.thrownPunches) * 100)
      : 0;

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (pausedRef.current || hud.phase !== 'fighting') return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.button === 0) queuePunch('jab');
    else if (e.button === 2) queuePunch('cross');
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-[#06080E]"
      onMouseDown={handleCanvasMouseDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Isolated WebGL Ring Viewport */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Low-Occlusion Broadcast HUD (No backdrop-filter over WebGL) */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 md:p-6">
        {/* Top Broadcast Corner Bars */}
        <div className="grid grid-cols-12 items-start gap-3 max-w-6xl mx-auto w-full">
          {/* Player Corner (Red) */}
          <div className="col-span-5 bg-[#0D1017]/88 border border-white/10 rounded-lg px-4 py-2.5">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-display text-lg font-bold text-white tracking-wide truncate">
                {playerAppearance.name}
              </span>
              <span className="font-mono-tabular text-red-400 font-bold">
                {hud.playerHealth} HP
              </span>
            </div>
            <div className="w-full h-2.5 rounded bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all duration-100"
                style={{ width: `${playerHpPct}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-100"
                  style={{ width: `${playerStamPct}%` }}
                />
              </div>
              <div className="w-16 h-1.5 rounded bg-slate-800 overflow-hidden" title="Estabilidad de Guardia">
                <div
                  className="h-full bg-sky-400 transition-all duration-100"
                  style={{ width: `${hud.playerGuardHealth}%` }}
                />
              </div>
              <span className="font-mono-tabular text-[11px] text-amber-300">
                KD {hud.playerKnockdowns}
              </span>
            </div>
          </div>

          {/* Center Round Clock */}
          <div className="col-span-2 flex flex-col items-center bg-[#0D1017]/92 border border-amber-500/35 rounded-lg py-2 px-2">
            <span className="text-[11px] font-semibold text-amber-400 tracking-wider">
              ASALTO {hud.round}/{hud.totalRounds}
            </span>
            <span className="font-mono-tabular text-2xl font-bold text-white leading-tight">
              {formatTime(hud.roundTimeLeft)}
            </span>
          </div>

          {/* Opponent Corner (Blue) */}
          <div className="col-span-5 bg-[#0D1017]/88 border border-white/10 rounded-lg px-4 py-2.5">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-mono-tabular text-sky-400 font-bold">
                {hud.opponentHealth} HP
              </span>
              <span className="font-display text-lg font-bold text-white tracking-wide truncate">
                {opponent.name}
              </span>
            </div>
            <div className="w-full h-2.5 rounded bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-sky-500 transition-all duration-100 ml-auto"
                style={{ width: `${oppHpPct}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="font-mono-tabular text-[11px] text-sky-300">
                KD {hud.opponentKnockdowns}
              </span>
              <div className="w-16 h-1.5 rounded bg-slate-800 overflow-hidden" title="Guardia Rival">
                <div
                  className="h-full bg-cyan-400 transition-all duration-100 ml-auto"
                  style={{ width: `${hud.opponentGuardHealth}%` }}
                />
              </div>
              <div className="flex-1 h-1.5 rounded bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-100 ml-auto"
                  style={{ width: `${oppStamPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Center Callout / Combo / Knockdown Interactive Count */}
        <div className="flex flex-col items-center justify-center gap-3">
          {hud.playerCombo >= 2 && hud.phase === 'fighting' && (
            <div className="font-mono-tabular text-xs font-bold text-amber-300 bg-[#0D1017]/88 border border-amber-500/40 px-3 py-1 rounded">
              RACHA DE COMBINACIÓN x{hud.playerCombo}
            </div>
          )}

          {hud.calloutText && (
            <div
              className={`font-display text-4xl md:text-5xl font-extrabold tracking-wider drop-shadow-[0_4px_14px_rgba(0,0,0,0.95)] ${
                hud.calloutColor === 'gold'
                  ? 'text-amber-400'
                  : hud.calloutColor === 'red'
                    ? 'text-red-500'
                    : hud.calloutColor === 'cyan'
                      ? 'text-sky-400'
                      : 'text-white'
              }`}
            >
              {hud.calloutText}
            </div>
          )}

          {hud.phase === 'knockdown' && (
            <div className="px-8 py-5 rounded-xl bg-[#0D1017]/95 border border-red-500/45 text-center space-y-2.5">
              <div className="text-xs font-semibold text-slate-300 tracking-wider">
                CUENTA DE PROTECCIÓN DEL ÁRBITRO
              </div>
              <div className="font-display text-7xl font-extrabold text-amber-400">
                {hud.knockdownCount}
              </div>
              {hud.knockdownTarget === 'player' && (
                <div className="space-y-1.5 w-60">
                  <div className="text-xs font-semibold text-red-300">
                    ¡PULSA ESPACIO RÁPIDO PARA LEVANTARTE!
                  </div>
                  <div className="w-full h-3 rounded bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-75"
                      style={{ width: `${hud.playerRecoveryProgress * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Compact Move Strip & Camera/Audio/Pause Controls */}
        <div className="flex items-center justify-between gap-3 max-w-6xl mx-auto w-full">
          <div className="px-3.5 py-2 rounded-lg bg-[#0D1017]/88 border border-white/10 text-[11px] font-mono-tabular text-slate-300 truncate">
            WASD Mover · J Jab · L Recto · I/O Ganchos · K Upper · B Cuerpo · Y Voleo · R Finta · V Amarre · Q/E Esquiva · F/C Guardia
          </div>

          <div className="pointer-events-auto flex items-center gap-2 shrink-0">
            <button
              onClick={cycleCamera}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0D1017]/90 border border-white/15 text-xs font-medium text-slate-200 hover:text-white cursor-pointer"
              title="Cambiar ángulo de cámara (Tab)"
            >
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span>{CAMERA_LABELS[cameraMode]}</span>
            </button>
            <button
              onClick={() => setMuted(soundEngine.toggleMute())}
              className="p-2 rounded-lg bg-[#0D1017]/90 border border-white/15 text-slate-300 hover:text-white cursor-pointer"
              title="Audio"
            >
              {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
            </button>
            <button
              onClick={() => setPaused((p) => !p)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0D1017]/90 border border-white/15 text-xs font-medium text-slate-200 hover:text-white cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pausa</span>
            </button>
          </div>
        </div>
      </div>

      {/* Between-Rounds Interactive Cutman & Corner Strategy */}
      {hud.phase === 'between_rounds' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75">
          <div className="w-full max-w-xl p-6 rounded-xl bg-[#111620] border border-amber-500/40 space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <div className="text-xs font-medium text-amber-400">
                  DESCANSO EN LA ESQUINA ROJA · ASALTO {hud.round} COMPLETADO
                </div>
                <h3 className="font-display text-3xl font-bold text-white">
                  Instrucciones de Don Mateo
                </h3>
              </div>
              <span className="font-mono-tabular text-2xl font-bold text-amber-400">
                {hud.betweenRoundTimeLeft}s
              </span>
            </div>

            <p className="text-sm text-slate-200 leading-relaxed">{hud.cornerAdvice}</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                disabled={!!hud.cornerChoiceMade}
                onClick={() => handleCornerSelect('cutman')}
                className="p-4 rounded-lg bg-[#171E2C] hover:bg-[#1E2738] border border-white/10 hover:border-emerald-500/50 text-left space-y-1.5 cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                  <HeartPulse className="w-4 h-4" />
                  <span>Trabajo de Cutman</span>
                </div>
                <div className="text-xs text-slate-300">
                  Enfría cortes e inflamación (+14% Salud y reduce trauma).
                </div>
              </button>

              <button
                disabled={!!hud.cornerChoiceMade}
                onClick={() => handleCornerSelect('cardio')}
                className="p-4 rounded-lg bg-[#171E2C] hover:bg-[#1E2738] border border-white/10 hover:border-sky-500/50 text-left space-y-1.5 cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2 text-sky-400 font-semibold text-xs">
                  <Wind className="w-4 h-4" />
                  <span>Recuperar Aire</span>
                </div>
                <div className="text-xs text-slate-300">
                  Hidratación y respiración (100% Estamina y Guardia).
                </div>
              </button>

              <button
                disabled={!!hud.cornerChoiceMade}
                onClick={() => handleCornerSelect('tactic')}
                className="p-4 rounded-lg bg-[#171E2C] hover:bg-[#1E2738] border border-white/10 hover:border-amber-500/50 text-left space-y-1.5 cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                  <Crosshair className="w-4 h-4" />
                  <span>Ajuste Ofensivo</span>
                </div>
                <div className="text-xs text-slate-300">
                  +18% potencia de impacto durante el próximo asalto.
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {paused && hud.phase !== 'finished' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-sm p-6 rounded-xl bg-[#121620] border border-white/15 space-y-4 text-center">
            <h2 className="font-display text-3xl font-bold text-white">COMBATE EN PAUSA</h2>
            <div className="text-xs text-slate-400">
              {playerAppearance.name} vs {opponent.name}
            </div>
            <div className="space-y-2.5 pt-2">
              <button
                onClick={() => setPaused(false)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Reanudar Combate</span>
              </button>
              <button
                onClick={() => {
                  soundEngine.playClick();
                  onAbortFight();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[#19202E] hover:bg-red-900/50 border border-white/10 text-slate-200 text-sm font-medium cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Abandonar y Volver</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Fight Decision, CompuBox & Dynamic Injury Report Modal */}
      {hud.phase === 'finished' && hud.result && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/85">
          <div className="w-full max-w-xl p-7 rounded-xl bg-[#121620] border border-amber-500/40 space-y-5">
            <div className="text-center border-b border-white/10 pb-4">
              <div className="text-xs font-medium text-amber-400 tracking-wider">
                VEREDICTO OFICIAL · ASALTO {hud.result.roundEnded}/{hud.result.totalRounds}
              </div>
              <h2
                className={`mt-1 font-display text-5xl font-extrabold ${
                  hud.result.won ? 'text-amber-400' : 'text-red-500'
                }`}
              >
                {hud.result.won ? '¡VICTORIA!' : 'DERROTA'}
              </h2>
              <p className="text-sm text-slate-300 mt-1">
                Método: <span className="font-semibold text-white">{hud.result.method}</span> · Tarjetas{' '}
                <span className="font-mono-tabular">
                  {hud.result.playerScore} - {hud.result.opponentScore}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-lg bg-[#0C1018]">
                <div className="text-xs text-slate-400">Precisión</div>
                <div className="font-mono-tabular text-lg font-bold text-white">
                  {accuracyPct}% ({hud.result.landedPunches}/{hud.result.thrownPunches})
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#0C1018]">
                <div className="text-xs text-slate-400">Cabeza / Cuerpo</div>
                <div className="font-mono-tabular text-lg font-bold text-slate-200">
                  {hud.result.headPunchesLanded} / {hud.result.bodyPunchesLanded}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#0C1018]">
                <div className="text-xs text-slate-400">Contragolpes</div>
                <div className="font-mono-tabular text-lg font-bold text-amber-400">
                  {hud.result.countersLanded}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#0C1018]">
                <div className="text-xs text-slate-400">Bolsa Ganada</div>
                <div className="font-mono-tabular text-lg font-bold text-emerald-400">
                  +${hud.result.purseEarned.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Dynamic Injury Report */}
            <div className="p-4 rounded-lg bg-[#0C1018] border border-white/10 space-y-2">
              <div className="text-xs font-semibold text-slate-300">
                Parte Médico Post-Combate
              </div>
              {hud.result.newInjuries.length === 0 ? (
                <div className="text-xs text-emerald-400">
                  Sin lesiones nuevas. Tu preparación física absorbió el intercambio limpiamente.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {hud.result.newInjuries.map((inj) => (
                    <div key={inj.id} className="flex items-center justify-between text-xs">
                      <span className="text-red-300 font-medium">{inj.label}</span>
                      <span className="text-slate-400">
                        {inj.weeksRemaining} sem · {inj.statPenaltyDesc}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                soundEngine.playClick();
                onFinishFight(hud.result!);
              }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display text-2xl font-bold tracking-wide cursor-pointer"
            >
              <Award className="w-5 h-5" />
              <span>CONTINUAR CARRERA (+{hud.result.gymPointsEarned} PE)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
