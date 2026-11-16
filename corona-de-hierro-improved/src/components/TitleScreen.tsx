import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Volume2, VolumeX, Play, Swords, RotateCcw } from 'lucide-react';
import {
  buildBoxingArena,
  configureRenderer,
  detectSoftwareWebGL,
  scheduleSoftwareAfterDraw,
  setupArenaEnvironment,
} from '../engine/arenaScene';
import { buildBoxerRig, poseBoxer } from '../engine/boxerMesh';
import { CAREER_OPPONENTS, DEFAULT_APPEARANCE } from '../data/careerData';
import { BoxerAppearance } from '../types/game';
import { soundEngine } from '../audio/soundEngine';

interface TitleScreenProps {
  hasSavedCareer: boolean;
  savedAppearance: BoxerAppearance;
  onStartNewCareer: () => void;
  onContinueCareer: () => void;
  onQuickFight: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  hasSavedCareer,
  savedAppearance,
  onStartNewCareer,
  onContinueCareer,
  onQuickFight,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState(soundEngine.isMuted());

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        soundEngine.playClick();
        if (hasSavedCareer) onContinueCareer();
        else onStartNewCareer();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [hasSavedCareer, onContinueCareer, onStartNewCareer]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const { renderer, maxAnisotropy } = configureRenderer(container, isSoftwareGl);

    const scene = new THREE.Scene();
    const disposeEnv = setupArenaEnvironment(renderer, scene, 'world');
    const arena = buildBoxingArena(scene, maxAnisotropy, 'world');

    const camera = new THREE.PerspectiveCamera(
      44,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      80
    );

    const boxerA = buildBoxerRig(savedAppearance || DEFAULT_APPEARANCE);
    boxerA.root.position.set(-0.75, 0, 0.4);
    boxerA.root.rotation.y = Math.atan2(1.5, -0.8);
    scene.add(boxerA.root);

    const champion = CAREER_OPPONENTS[CAREER_OPPONENTS.length - 1];
    const boxerB = buildBoxerRig(champion.appearance);
    boxerB.root.position.set(0.75, 0, -0.4);
    boxerB.root.rotation.y = Math.atan2(-1.5, 0.8);
    scene.add(boxerB.root);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.getElapsedTime();

      // Cinematic slow orbital pan around the ring
      const camAngle = t * 0.16;
      camera.position.set(
        Math.cos(camAngle) * 5.2,
        2.15 + Math.sin(t * 0.35) * 0.25,
        Math.sin(camAngle) * 5.2
      );
      camera.lookAt(0, 1.05, 0);

      // Realistic rhythmic 1-2-3 combo exchange on title centerpiece
      const cycle = t % 4.0;
      let punchA: 'jab' | 'cross' | 'hook_l' | null = null;
      let phaseA: 'none' | 'windup' | 'strike' | 'recover' = 'none';
      let progA = 0;

      if (cycle < 0.32) {
        punchA = 'jab';
        if (cycle < 0.06) { phaseA = 'windup'; progA = cycle / 0.06; }
        else if (cycle < 0.16) { phaseA = 'strike'; progA = (cycle - 0.06) / 0.1; }
        else { phaseA = 'recover'; progA = (cycle - 0.16) / 0.16; }
      } else if (cycle >= 0.36 && cycle < 0.82) {
        const c2 = cycle - 0.36;
        punchA = 'cross';
        if (c2 < 0.11) { phaseA = 'windup'; progA = c2 / 0.11; }
        else if (c2 < 0.23) { phaseA = 'strike'; progA = (c2 - 0.11) / 0.12; }
        else { phaseA = 'recover'; progA = (c2 - 0.23) / 0.23; }
      } else if (cycle >= 0.9 && cycle < 1.42) {
        const c3 = cycle - 0.9;
        punchA = 'hook_l';
        if (c3 < 0.13) { phaseA = 'windup'; progA = c3 / 0.13; }
        else if (c3 < 0.26) { phaseA = 'strike'; progA = (c3 - 0.13) / 0.13; }
        else { phaseA = 'recover'; progA = (c3 - 0.26) / 0.26; }
      }

      // Champion counter-exchange in second half of cycle
      let punchB: 'cross' | null = null;
      let phaseB: 'none' | 'windup' | 'strike' | 'recover' = 'none';
      let progB = 0;
      if (cycle >= 2.1 && cycle < 2.58) {
        const cb = cycle - 2.1;
        punchB = 'cross';
        if (cb < 0.11) { phaseB = 'windup'; progB = cb / 0.11; }
        else if (cb < 0.23) { phaseB = 'strike'; progB = (cb - 0.11) / 0.12; }
        else { phaseB = 'recover'; progB = (cb - 0.23) / 0.25; }
      }

      poseBoxer(boxerA, {
        dt,
        stance: savedAppearance.stance,
        elapsed: t,
        guardHigh: phaseB === 'strike' ? 0.92 : 0.45,
        guardLow: 0,
        slipX: cycle >= 1.95 && cycle < 2.4 ? -0.55 : Math.sin(t * 1.4) * 0.18,
        leanZ: phaseA === 'strike' ? 0.35 : 0.05,
        activePunch: punchA,
        punchPhase: phaseA,
        punchProgress: progA,
        hitRecoilX: 0,
        hitRecoilY: 0,
        knockdownProgress: 0,
        victoryRaise: 0,
        sweatLevel: 0.35,
        browDamage: 0,
        jawDamage: 0,
        moveSpeedNorm: 0.38,
      });

      poseBoxer(boxerB, {
        dt,
        stance: champion.appearance.stance,
        elapsed: t + 1.1,
        guardHigh: phaseA === 'strike' ? 0.94 : 0.45,
        guardLow: 0,
        slipX: cycle >= 0.4 && cycle < 0.85 ? 0.48 : -Math.sin(t * 1.2) * 0.16,
        leanZ: phaseB === 'strike' ? 0.32 : 0.05,
        activePunch: punchB,
        punchPhase: phaseB,
        punchProgress: progB,
        hitRecoilX: 0,
        hitRecoilY: 0,
        knockdownProgress: 0,
        victoryRaise: 0,
        sweatLevel: 0.35,
        browDamage: 0,
        jawDamage: 0,
        moveSpeedNorm: 0.32,
      });

      arena.updateArena(t, 0.28);
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
      window.removeEventListener('resize', handleResize);
      boxerA.dispose();
      boxerB.dispose();
      arena.dispose();
      disposeEnv();
      renderer.dispose();
    };
  }, [savedAppearance]);

  const toggleMute = () => {
    const next = soundEngine.toggleMute();
    setMuted(next);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#090B0F]">
      {/* Isolated 3D Live Ring Backdrop */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Atmospheric Vignette Scrim (no backdrop-filter over WebGL) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, rgba(9,11,15,0.88) 0%, rgba(9,11,15,0.45) 45%, rgba(9,11,15,0.18) 100%)',
        }}
      />

      {/* Audio Toggle */}
      <div className="absolute top-6 right-6 z-20">
        <button
          onClick={toggleMute}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#12161F]/90 border border-white/10 text-xs font-medium text-slate-300 hover:text-white hover:border-amber-500/40 transition-colors cursor-pointer"
          title={muted ? 'Activar sonido' : 'Silenciar sonido'}
        >
          {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
          <span>{muted ? 'Sin sonido' : 'Audio'}</span>
        </button>
      </div>

      {/* Left Negative-Space Hero Title Lockup */}
      <div className="relative z-10 h-full flex flex-col justify-between p-8 md:p-14 max-w-2xl pointer-events-none">
        <div className="pt-4">
          {/* Bespoke Inline SVG Championship Crest + Wordmark */}
          <svg
            viewBox="0 0 540 165"
            className="w-full max-w-[490px] drop-shadow-[0_8px_24px_rgba(0,0,0,0.8)]"
            aria-label="Corona de Hierro"
          >
            <defs>
              <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FDE68A" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#B45309" />
              </linearGradient>
            </defs>
            {/* Crown Crest */}
            <path
              d="M16 44 L8 14 L29 29 L43 6 L57 29 L78 14 L70 44 Z"
              fill="url(#goldGrad)"
            />
            <rect x="14" y="48" width="58" height="5" rx="1.5" fill="#DC2626" />
            <text
              x="94"
              y="39"
              fill="#94A3B8"
              fontFamily="'Plus Jakarta Sans', sans-serif"
              fontSize="13"
              fontWeight="600"
              letterSpacing="4"
            >
              CAMPEONATO MUNDIAL DE BOXEO
            </text>
            <text
              x="10"
              y="108"
              fill="#F8FAFC"
              fontFamily="'Barlow Condensed', sans-serif"
              fontSize="68"
              fontWeight="800"
              letterSpacing="1.5"
            >
              CORONA DE
            </text>
            <text
              x="10"
              y="156"
              fill="url(#goldGrad)"
              fontFamily="'Barlow Condensed', sans-serif"
              fontSize="68"
              fontWeight="800"
              letterSpacing="2"
            >
              HIERRO
            </text>
          </svg>

          <p className="mt-4 text-base text-slate-300 max-w-md leading-relaxed">
            Física de impacto real, inteligencia artificial adaptativa, lesiones dinámicas y ascenso cinematográfico desde el sótano del barrio hasta el título mundial indiscutido.
          </p>
        </div>

        {/* Primary Action Stack */}
        <div className="flex flex-col gap-3 max-w-sm pointer-events-auto">
          {hasSavedCareer ? (
            <>
              <button
                onClick={() => {
                  soundEngine.playClick();
                  onContinueCareer();
                }}
                className="flex items-center justify-between px-6 py-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display text-2xl font-bold tracking-wide transition-colors cursor-pointer shadow-lg"
              >
                <span>CONTINUAR CARRERA</span>
                <Play className="w-5 h-5 fill-current" />
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    soundEngine.playClick();
                    onQuickFight();
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#161B26]/95 border border-white/15 hover:border-amber-500/50 text-sm font-semibold text-slate-100 transition-colors cursor-pointer"
                >
                  <Swords className="w-4 h-4 text-amber-400" />
                  <span>Combate Rápido</span>
                </button>
                <button
                  onClick={() => {
                    soundEngine.playClick();
                    onStartNewCareer();
                  }}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#161B26]/95 border border-white/15 hover:border-red-500/50 text-sm font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 text-slate-400" />
                  <span>Nueva Carrera</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  soundEngine.playClick();
                  onStartNewCareer();
                }}
                className="flex items-center justify-between px-6 py-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display text-2xl font-bold tracking-wide transition-colors cursor-pointer shadow-lg"
              >
                <span>INICIAR MODO CARRERA</span>
                <Play className="w-5 h-5 fill-current" />
              </button>
              <button
                onClick={() => {
                  soundEngine.playClick();
                  onQuickFight();
                }}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#161B26]/95 border border-white/15 hover:border-amber-500/50 text-sm font-semibold text-slate-100 transition-colors cursor-pointer"
              >
                <Swords className="w-4 h-4 text-amber-400" />
                <span>Combate de Exhibición Directo</span>
              </button>
            </>
          )}
        </div>

        {/* Single Flat Control Hint Line */}
        <div className="pt-4 text-xs font-mono-tabular text-slate-400 tracking-wide">
          WASD Desplazar · J Jab · L Recto · I/O Ganchos · K Uppercut · B Cuerpo · Q/E Esquiva · F Guardia · Esc Pausa
        </div>
      </div>
    </div>
  );
};
