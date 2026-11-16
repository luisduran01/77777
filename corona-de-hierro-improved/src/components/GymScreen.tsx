import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Dumbbell, Zap, Shield, Plus, CheckCircle2 } from 'lucide-react';
import { BoxerStats, CareerState, TrainingDrillType } from '../types/game';
import {
  configureRenderer,
  detectSoftwareWebGL,
  scheduleSoftwareAfterDraw,
} from '../engine/arenaScene';
import { DrillHUDState, GymTrainingController } from '../engine/gymTrainingScene';
import { soundEngine } from '../audio/soundEngine';
import * as THREE from 'three';

interface GymScreenProps {
  career: CareerState;
  onUpgradeStat: (statKey: keyof BoxerStats, costPE: number) => void;
  onUpgradeGym: (upgradeKey: keyof CareerState['gymUpgrades'], costMoney: number) => void;
  onCompleteDrill: (
    drillType: TrainingDrillType,
    gymPointsEarned: number,
    bonusStatKey: keyof BoxerStats,
    bonusStatAmount: number
  ) => void;
  onBack: () => void;
}

const STAT_META: {
  key: keyof BoxerStats;
  label: string;
  desc: string;
}[] = [
  { key: 'power', label: 'Potencia de Pegada', desc: 'Aumenta el daño bruto y probabilidad de nocaut.' },
  { key: 'speed', label: 'Velocidad de Manos', desc: 'Reduce el tiempo de preparación y recuperación de golpes.' },
  { key: 'stamina', label: 'Resistencia (Cardio)', desc: 'Mayor reserva de energía y recuperación entre asaltos.' },
  { key: 'technique', label: 'Técnica y Precisión', desc: 'Mejora la eficacia de contragolpes y combinaciones.' },
  { key: 'defense', label: 'Guardia y Reflejos', desc: 'Absorbe más castigo en bloqueo y facilita la esquiva.' },
  { key: 'chin', label: 'Mandíbula y Aguante', desc: 'Aumenta la vida máxima y resistencia al aturdimiento.' },
  { key: 'footwork', label: 'Juego de Pies', desc: 'Desplazamiento más ágil para cortar el cuadrilátero.' },
];

export const GymScreen: React.FC<GymScreenProps> = ({
  career,
  onUpgradeStat,
  onUpgradeGym,
  onCompleteDrill,
  onBack,
}) => {
  const [activeDrill, setActiveDrill] = useState<TrainingDrillType | null>(null);
  const [drillHud, setDrillHud] = useState<DrillHUDState | null>(null);
  const [rewardClaimed, setRewardClaimed] = useState(false);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<GymTrainingController | null>(null);

  useEffect(() => {
    if (!activeDrill) return;
    const container = mountRef.current;
    if (!container) return;

    setRewardClaimed(false);
    const isSoftwareGl = detectSoftwareWebGL();
    const { renderer, maxAnisotropy } = configureRenderer(container, isSoftwareGl);

    const ctrl = new GymTrainingController(
      renderer,
      maxAnisotropy,
      career.appearance,
      activeDrill,
      (nextState) => setDrillHud(nextState)
    );
    controllerRef.current = ctrl;
    ctrl.resize(container.clientWidth || 800, container.clientHeight || 500);

    const handleResize = () => {
      if (!container) return;
      ctrl.resize(container.clientWidth || 800, container.clientHeight || 500);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['KeyJ', 'KeyL', 'KeyI', 'KeyO', 'KeyK', 'KeyQ', 'KeyE'].includes(e.code)) {
        e.preventDefault();
        ctrl.handleKeyAction(e.code);
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) return;
      const dt = clock.getDelta();
      ctrl.step(dt);
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
      window.removeEventListener('keydown', handleKeyDown);
      ctrl.dispose();
      renderer.dispose();
      controllerRef.current = null;
    };
  }, [activeDrill, career.appearance]);

  const handleClaimDrill = () => {
    if (!drillHud || !activeDrill || rewardClaimed) return;
    setRewardClaimed(true);
    soundEngine.playClick();
    const bonusKey: keyof BoxerStats =
      activeDrill === 'heavy_bag'
        ? 'power'
        : activeDrill === 'speed_reflex'
          ? 'speed'
          : 'defense';
    const statGain = drillHud.grade === 'S' ? 2 : drillHud.grade === 'A' ? 2 : 1;
    onCompleteDrill(activeDrill, drillHud.gymPointsAwarded, bonusKey, statGain);
    setActiveDrill(null);
    setDrillHud(null);
  };

  const getStatCost = (val: number) => (val >= 88 ? 4 : val >= 75 ? 3 : 2);

  if (activeDrill) {
    return (
      <div className="relative w-full h-full bg-[#090B0F] overflow-hidden">
        <div ref={mountRef} className="absolute inset-0 w-full h-full" />

        {/* Low-occlusion Drill HUD */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="px-4 py-3 rounded-lg bg-[#0D1017]/90 border border-white/10">
              <div className="text-xs text-amber-400 font-medium">
                GIMNASIO EL YUNQUE · {activeDrill === 'heavy_bag' ? 'SACO PESADO' : activeDrill === 'speed_reflex' ? 'PERA DE VELOCIDAD' : 'REFLEJOS DEFENSIVOS'}
              </div>
              <div className="mt-1 flex items-baseline gap-5">
                <span className="font-mono-tabular text-2xl font-bold text-white">
                  {drillHud?.score ?? 0} PTS
                </span>
                <span className="font-mono-tabular text-sm text-amber-400">
                  RACHA x{drillHud?.combo ?? 0}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 pointer-events-auto">
              <div className="px-4 py-2.5 rounded-lg bg-[#0D1017]/90 border border-white/10 font-mono-tabular text-2xl font-bold text-white">
                {drillHud?.timeLeft ?? 28}s
              </div>
              <button
                onClick={() => {
                  soundEngine.playClick();
                  setActiveDrill(null);
                  setDrillHud(null);
                }}
                className="px-3.5 py-2.5 rounded-lg bg-[#161B26]/95 border border-white/15 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
              >
                Salir
              </button>
            </div>
          </div>

          {/* Center-Bottom Trainer Command Prompt */}
          {!drillHud?.finished && (
            <div className="flex flex-col items-center gap-3 pb-2">
              <div className="px-6 py-3.5 rounded-xl bg-[#0D1017]/95 border border-amber-500/50 text-center shadow-2xl">
                <div className="text-xs text-slate-400">{drillHud?.feedbackText}</div>
                <div className="mt-1 flex items-center justify-center gap-3">
                  <span className="px-3 py-1 rounded bg-amber-500 text-slate-950 font-mono-tabular text-xl font-bold">
                    {drillHud?.promptKey}
                  </span>
                  <span className="font-display text-3xl font-bold text-white tracking-wide">
                    {drillHud?.promptText}
                  </span>
                </div>
              </div>

              {/* Clickable Action Pads (for mouse or touch playability) */}
              <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
                {[
                  ['KeyQ', 'Q Esquiva Izq'],
                  ['KeyJ', 'J Jab'],
                  ['KeyL', 'L Recto'],
                  ['KeyI', 'I Gancho Izq'],
                  ['KeyO', 'O Gancho Der'],
                  ['KeyK', 'K Uppercut'],
                  ['KeyE', 'E Esquiva Der'],
                ].map(([code, lbl]) => (
                  <button
                    key={code}
                    onClick={() => controllerRef.current?.handleKeyAction(code)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      drillHud?.promptKey === code.replace('Key', '')
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-[#141923]/95 text-slate-200 border-white/15 hover:border-amber-500/50'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Drill Summary Modal */}
        {drillHud?.finished && (
          <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/80">
            <div className="w-full max-w-md p-7 rounded-xl bg-[#121620] border border-amber-500/40 text-center space-y-5">
              <div className="text-xs font-medium text-amber-400">SESIÓN COMPLETADA</div>
              <div className="font-display text-6xl font-extrabold text-amber-400">
                RANGO {drillHud.grade}
              </div>
              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="p-3 rounded-lg bg-[#0C1018]">
                  <div className="text-xs text-slate-400">Puntuación</div>
                  <div className="font-mono-tabular text-lg font-bold text-white">
                    {drillHud.score}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#0C1018]">
                  <div className="text-xs text-slate-400">Racha Máxima</div>
                  <div className="font-mono-tabular text-lg font-bold text-white">
                    x{drillHud.maxCombo}
                  </div>
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-sm text-emerald-300 font-medium">
                +{drillHud.gymPointsAwarded} Puntos de Gimnasio (PE) · +
                {drillHud.grade === 'S' || drillHud.grade === 'A' ? 2 : 1} Atributo directo
              </div>
              <button
                onClick={handleClaimDrill}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display text-2xl font-bold cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>RECOGER PROGRESO</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-[#090B0F] text-slate-100 overflow-hidden">
      {/* Top Header */}
      <header className="flex items-center justify-between gap-6 px-6 py-4 border-b border-white/10 bg-[#0D1017] shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              soundEngine.playClick();
              onBack();
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#161B26] border border-white/10 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al Hub</span>
          </button>
          <h1 className="font-display text-2xl font-bold tracking-wide text-white">
            GIMNASIO EL YUNQUE — PREPARACIÓN Y ESTADÍSTICAS
          </h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-xs text-slate-400">Bolsa Disponible</div>
            <div className="font-mono-tabular text-lg font-bold text-emerald-400">
              ${career.money.toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Puntos Disponibles</div>
            <div className="font-mono-tabular text-xl font-bold text-amber-400">
              {career.gymPoints} PE
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Playable 3D Training Drills (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-white">
                Entrenamientos Jugables en 3D
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Completa rutinas interactivas en tiempo real para ganar Puntos de Gimnasio (PE) y subir tus habilidades directamente.
              </p>
            </div>

            {[
              {
                id: 'heavy_bag' as TrainingDrillType,
                title: 'Saco Pesado de Potencia',
                sub: 'Física pendular 3D · Mejora Potencia + PE',
                desc: 'Ejecuta combinaciones exactas al ritmo de Don Mateo sobre el saco de cuero.',
                icon: <Dumbbell className="w-5 h-5 text-red-400" />,
              },
              {
                id: 'speed_reflex' as TrainingDrillType,
                title: 'Pera Loca de Velocidad',
                sub: 'Ritmo de manos · Mejora Velocidad + PE',
                desc: 'Mantén una racha ininterrumpida de golpes cortos a alta frecuencia.',
                icon: <Zap className="w-5 h-5 text-amber-400" />,
              },
              {
                id: 'defense_sparring' as TrainingDrillType,
                title: 'Brazo Giratorio y Esquiva',
                sub: 'Reflejos defensivos · Mejora Defensa + PE',
                desc: 'Lee el destello rojo del brazo mecánico, esquiva con Q/E y contragolpea al instante.',
                icon: <Shield className="w-5 h-5 text-sky-400" />,
              },
            ].map((drill) => (
              <div
                key={drill.id}
                className="p-5 rounded-xl bg-[#121620] border border-white/10 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-[#19202E]">{drill.icon}</div>
                    <div>
                      <h3 className="font-semibold text-base text-white">{drill.title}</h3>
                      <div className="text-xs text-amber-400">{drill.sub}</div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{drill.desc}</p>
                <button
                  onClick={() => {
                    soundEngine.playClick();
                    setActiveDrill(drill.id);
                  }}
                  className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Iniciar Entrenamiento 3D
                </button>
              </div>
            ))}

            {/* Gym Equipment Upgrades ($) */}
            <div className="p-5 rounded-xl bg-[#121620] border border-white/10 space-y-3">
              <div className="text-sm font-semibold text-white">
                Equipamiento del Gimnasio (Inversión $)
              </div>
              {(
                [
                  {
                    key: 'heavyBagLevel',
                    label: 'Saco y Material de Pegada',
                    desc: '+1 PE extra por sesión de entrenamiento',
                    baseCost: 1500,
                  },
                  {
                    key: 'medicalStaffLevel',
                    label: 'Cuerpo Médico de Esquina',
                    desc: 'Acelera la recuperación natural de lesiones',
                    baseCost: 1800,
                  },
                  {
                    key: 'sparringPartnerLevel',
                    label: 'Sparrings de Élite',
                    desc: '+1 atributo adicional en entrenamientos A/S',
                    baseCost: 2200,
                  },
                ] as {
                  key: keyof CareerState['gymUpgrades'];
                  label: string;
                  desc: string;
                  baseCost: number;
                }[]
              ).map((up) => {
                const lvl = career.gymUpgrades[up.key];
                const cost = up.baseCost * lvl;
                const maxed = lvl >= 5;
                return (
                  <div
                    key={up.key}
                    className="p-3 rounded-lg bg-[#0C1018] border border-white/5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {up.label} · Nv.{lvl}/5
                      </div>
                      <div className="text-[11px] text-slate-400">{up.desc}</div>
                    </div>
                    <button
                      disabled={maxed || career.money < cost}
                      onClick={() => {
                        soundEngine.playClick();
                        onUpgradeGym(up.key, cost);
                      }}
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-35 text-white font-mono-tabular text-xs font-semibold shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {maxed ? 'MÁX' : `$${cost.toLocaleString()}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed Attribute Upgrade Board (7 cols) */}
          <div className="lg:col-span-7 p-6 rounded-xl bg-[#121620] border border-white/10 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">
                  Mejora de Atributos Generales
                </h2>
                <p className="text-xs text-slate-400">
                  Invierte tus Puntos de Entrenamiento (PE) para pulir cada faceta técnica y física.
                </p>
              </div>
              <span className="font-mono-tabular text-sm font-bold text-amber-400">
                {career.gymPoints} PE disponibles
              </span>
            </div>

            <div className="space-y-3">
              {STAT_META.map((st) => {
                const val = career.stats[st.key];
                const cost = getStatCost(val);
                const canAfford = career.gymPoints >= cost && val < 99;
                return (
                  <div
                    key={st.key}
                    className="p-4 rounded-lg bg-[#0C1018] border border-white/5 flex items-center justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-sm text-white">{st.label}</span>
                        <span className="font-mono-tabular text-base font-bold text-amber-400">
                          {val}/99
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 transition-all duration-200"
                          style={{ width: `${val}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5">{st.desc}</p>
                    </div>

                    <button
                      disabled={!canAfford}
                      onClick={() => {
                        soundEngine.playClick();
                        onUpgradeStat(st.key, cost);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-[#192132] hover:bg-amber-500 hover:text-slate-950 disabled:opacity-35 border border-white/10 text-xs font-semibold text-white transition-colors shrink-0 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="font-mono-tabular">{cost} PE</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
