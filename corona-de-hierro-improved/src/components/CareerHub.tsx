import React, { useState } from 'react';
import {
  Dumbbell,
  Swords,
  UserCog,
  HeartPulse,
  Trophy,
  AlertTriangle,
  Calendar,
  ArrowLeft,
} from 'lucide-react';
import { CAREER_OPPONENTS, WEIGHT_CLASSES } from '../data/careerData';
import { ActiveInjury, CareerState, InjuryZone, OpponentProfile } from '../types/game';
import { soundEngine } from '../audio/soundEngine';

interface CareerHubProps {
  career: CareerState;
  onStartFight: (opponent: OpponentProfile) => void;
  onOpenGym: () => void;
  onOpenEditor: () => void;
  onRestWeek: () => void;
  onPayMedicalTreatment: (injuryId: string, cost: number) => void;
  onExitToTitle: () => void;
}

type HubTab = 'fight_card' | 'rankings' | 'medical';

function computeOverall(stats: CareerState['stats']): number {
  const vals = Object.values(stats);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

const ZONE_LABELS: Record<InjuryZone, string> = {
  eyebrow: 'Arco Superciliar y Ojos',
  nose_jaw: 'Tabique y Mandíbula',
  ribs: 'Costillas y Flanco',
  hands: 'Nudillos y Muñecas',
};

export const CareerHub: React.FC<CareerHubProps> = ({
  career,
  onStartFight,
  onOpenGym,
  onOpenEditor,
  onRestWeek,
  onPayMedicalTreatment,
  onExitToTitle,
}) => {
  const [tab, setTab] = useState<HubTab>('fight_card');
  const [selectedOppId, setSelectedOppId] = useState<string>(() => {
    const nextUndefeated = CAREER_OPPONENTS.find(
      (o) => !career.defeatedOpponentIds.includes(o.id)
    );
    return (nextUndefeated || CAREER_OPPONENTS[CAREER_OPPONENTS.length - 1]).id;
  });

  const overall = computeOverall(career.stats);
  const weightCfg =
    WEIGHT_CLASSES.find((w) => w.id === career.appearance.weightClass) || WEIGHT_CLASSES[1];
  const selectedOpp =
    CAREER_OPPONENTS.find((o) => o.id === selectedOppId) || CAREER_OPPONENTS[0];

  const isOpponentUnlocked = (opp: OpponentProfile): boolean => {
    if (career.defeatedOpponentIds.includes(opp.id)) return true;
    const idx = CAREER_OPPONENTS.findIndex((o) => o.id === opp.id);
    if (idx === 0) return true;
    // Unlock if previous opponent defeated OR rank is within 3 spots
    const prev = CAREER_OPPONENTS[idx - 1];
    return career.defeatedOpponentIds.includes(prev.id) || career.rank <= opp.rank + 2;
  };

  const beltLabel =
    career.belt === 'world'
      ? 'Campeón Mundial Indiscutido'
      : career.belt === 'national'
        ? 'Campeón Nacional'
        : career.belt === 'local'
          ? 'Campeón Metropolitano'
          : `Clasificado #${career.rank}`;

  const getMedicalCost = (inj: ActiveInjury) =>
    inj.severity === 'severe' ? 1400 : inj.severity === 'moderate' ? 750 : 350;

  return (
    <div className="w-full h-full flex flex-col bg-[#090B0F] text-slate-100 overflow-hidden">
      {/* 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-white/10 bg-[#0D1017] shrink-0">
        <div className="flex items-center gap-4 shrink-0">
          <button
            onClick={() => {
              soundEngine.playClick();
              onExitToTitle();
            }}
            className="p-2 rounded-lg bg-[#161B26] border border-white/10 text-slate-300 hover:text-white cursor-pointer"
            title="Menú Principal"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="font-display text-2xl font-bold tracking-wide text-white whitespace-nowrap shrink-0">
            CORONA DE HIERRO
          </span>
        </div>

        <nav className="flex items-center gap-6 text-sm font-medium">
          {[
            ['fight_card', 'Cartelera'],
            ['rankings', 'Clasificación'],
            ['medical', `Enfermería (${career.injuries.length})`],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                soundEngine.playClick();
                setTab(id as HubTab);
              }}
              className={`py-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tab === id
                  ? 'border-amber-500 text-amber-400 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => {
              soundEngine.playClick();
              onOpenGym();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Dumbbell className="w-4 h-4" />
            <span>Entrenar en Gimnasio</span>
          </button>
        </div>
      </header>

      {/* Boxer Career Summary Strip */}
      <div className="px-6 py-4 bg-[#11151E] border-b border-white/10 flex flex-wrap items-center justify-between gap-6 shrink-0">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-lg border border-amber-500/40 flex items-center justify-center font-display text-2xl font-bold text-white"
            style={{ backgroundColor: career.appearance.trunksColor }}
          >
            {overall}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-2xl font-bold text-white tracking-wide">
                {career.appearance.name}
              </h2>
              <span className="text-xs text-slate-400">
                “{career.appearance.nickname}” · {weightCfg.label}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              <span className="text-amber-400 font-medium">{beltLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                Récord {career.record.wins}-{career.record.losses} ({career.record.kos} KO)
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">Semana {career.week}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-xs text-slate-400">Bolsa Disponible</div>
            <div className="font-mono-tabular text-lg font-bold text-emerald-400">
              ${career.money.toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Puntos de Gimnasio</div>
            <div className="font-mono-tabular text-lg font-bold text-amber-400">
              {career.gymPoints} PE
            </div>
          </div>
          <button
            onClick={() => {
              soundEngine.playClick();
              onOpenEditor();
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#19202E] hover:bg-[#222B3D] border border-white/10 text-xs font-medium text-slate-200 cursor-pointer"
          >
            <UserCog className="w-4 h-4 text-amber-400" />
            <span>Personalizar Boxeador</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6">
        {tab === 'fight_card' && (
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Contender List (5 cols) */}
            <div className="lg:col-span-5 space-y-2.5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-200">
                  Combates Locales y Mundiales
                </h3>
                <span className="text-xs text-slate-400">
                  {career.defeatedOpponentIds.length}/{CAREER_OPPONENTS.length} derrotados
                </span>
              </div>

              {CAREER_OPPONENTS.map((opp) => {
                const unlocked = isOpponentUnlocked(opp);
                const defeated = career.defeatedOpponentIds.includes(opp.id);
                const active = selectedOpp.id === opp.id;
                return (
                  <button
                    key={opp.id}
                    disabled={!unlocked}
                    onClick={() => {
                      soundEngine.playClick();
                      setSelectedOppId(opp.id);
                    }}
                    className={`w-full p-3.5 rounded-lg border text-left transition-colors ${
                      !unlocked
                        ? 'bg-[#0D1017] border-white/5 opacity-45 cursor-not-allowed'
                        : active
                          ? 'bg-[#192132] border-amber-500 cursor-pointer'
                          : 'bg-[#121620] border-white/10 hover:border-white/25 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono-tabular text-xs font-bold text-amber-400">
                          {opp.rank === 0 ? 'CAMPEÓN' : `#${opp.rank}`}
                        </span>
                        <span className="font-semibold text-sm text-white">
                          {opp.name}
                        </span>
                      </div>
                      <span className="font-mono-tabular text-xs text-slate-400">
                        {defeated ? 'Derrotado' : `OVR ${opp.overall}`}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                      <span>{opp.tierLabel}</span>
                      <span className="font-mono-tabular text-emerald-400">
                        ${opp.purse.toLocaleString()}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Fight Contract Spotlight (7 cols) */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              <div className="p-6 rounded-xl bg-[#121620] border border-white/10 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
                  <div>
                    <div className="text-xs font-medium text-amber-400">
                      {selectedOpp.tierLabel} · {selectedOpp.rounds} Asaltos
                    </div>
                    <h2 className="mt-1 font-display text-4xl font-bold text-white tracking-wide">
                      {selectedOpp.name} “{selectedOpp.nickname}”
                    </h2>
                    <p className="mt-1 text-xs text-slate-400">
                      {selectedOpp.countryName} · Estilo: {selectedOpp.archetypeLabel} · Récord{' '}
                      <span className="font-mono-tabular">
                        {selectedOpp.record.wins}-{selectedOpp.record.losses} ({selectedOpp.record.kos} KO)
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Bolsa del Combate</div>
                    <div className="font-mono-tabular text-2xl font-bold text-emerald-400">
                      ${selectedOpp.purse.toLocaleString()}
                    </div>
                  </div>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">{selectedOpp.bio}</p>
                <p className="text-sm italic text-amber-200/90">“{selectedOpp.quote}”</p>

                {/* Tactical Scouting Report */}
                <div className="p-3.5 rounded-lg bg-[#0C1018] border border-white/10 text-xs text-slate-300 space-y-1">
                  <div className="font-semibold text-amber-400">
                    Informe Táctico de Don Mateo ({selectedOpp.archetypeLabel})
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    {selectedOpp.archetype === 'counter' &&
                      'Evita repetir jabs predecibles: esquivará y contragolpeará con recto. Usa fintas (R) para hacerle fallar y castiga al cuerpo (B).'}
                    {selectedOpp.archetype === 'brawler' &&
                      'Corta el cuadrilátero y presiona sin parar. Mantén la guardia baja lista (C), contragolpea con uppercut (K) y usa pasos atrás (Espacio).'}
                    {selectedOpp.archetype === 'technician' &&
                      'Controla la distancia con desplazamiento lateral y doble jab. Ataca en ráfagas cortas para romper su ritmo antes de que lea tu guardia.'}
                    {selectedOpp.archetype === 'slugger' &&
                      'Cada golpe suyo busca el nocaut o romper tu guardia. Esquiva lateralmente (Q/E) en su preparación y aprovecha su lenta recuperación.'}
                  </p>
                </div>

                {/* Tale of the Tape Comparison */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  {[
                    ['Potencia', career.stats.power, selectedOpp.stats.power],
                    ['Velocidad', career.stats.speed, selectedOpp.stats.speed],
                    ['Resistencia', career.stats.stamina, selectedOpp.stats.stamina],
                    ['Técnica', career.stats.technique, selectedOpp.stats.technique],
                  ].map(([lbl, myVal, oppVal]) => (
                    <div key={lbl as string} className="p-3 rounded-lg bg-[#0C1018] border border-white/5">
                      <div className="text-xs text-slate-400">{lbl}</div>
                      <div className="mt-1 flex items-baseline justify-between font-mono-tabular">
                        <span className="text-base font-bold text-white">{myVal}</span>
                        <span className="text-xs text-slate-500">vs</span>
                        <span className="text-base font-bold text-red-400">{oppVal}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {career.injuries.length > 0 && (
                  <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-500/30 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-xs text-red-200">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>
                        Tienes {career.injuries.length} lesión(es) activa(s) que reducen tus atributos en el ring.
                      </span>
                    </div>
                    <button
                      onClick={() => setTab('medical')}
                      className="text-xs font-semibold text-amber-400 hover:underline whitespace-nowrap cursor-pointer"
                    >
                      Ver Enfermería
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    onClick={() => {
                      soundEngine.playClick();
                      onRestWeek();
                    }}
                    className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#19202E] hover:bg-[#222C3F] border border-white/10 text-xs font-medium text-slate-200 cursor-pointer"
                  >
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span>Descansar 1 Semana (Recuperar Lesiones)</span>
                  </button>

                  <button
                    onClick={() => {
                      soundEngine.playClick();
                      onStartFight(selectedOpp);
                    }}
                    className="flex items-center gap-2.5 px-7 py-3.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-display text-2xl font-bold tracking-wide transition-colors cursor-pointer shadow-lg"
                  >
                    <Swords className="w-5 h-5" />
                    <span>SUBIR AL CUADRILÁTERO</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'medical' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-3xl font-bold text-white">
                  Parte Médico y Sistema Dinámico de Lesiones
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  El castigo recibido en cada combate genera trauma real por zonas. Descansa entre peleas o invierte en rehabilitación acelerada.
                </p>
              </div>
              <button
                onClick={() => {
                  soundEngine.playClick();
                  onRestWeek();
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs cursor-pointer"
              >
                <Calendar className="w-4 h-4" />
                <span>Avanzar 1 Semana de Descanso</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['eyebrow', 'nose_jaw', 'ribs', 'hands'] as InjuryZone[]).map((zone) => {
                const injury = career.injuries.find((i) => i.zone === zone);
                return (
                  <div
                    key={zone}
                    className={`p-5 rounded-xl border ${
                      injury
                        ? 'bg-[#181217] border-red-500/35'
                        : 'bg-[#121620] border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-white">
                        {ZONE_LABELS[zone]}
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          injury ? 'text-red-400' : 'text-emerald-400'
                        }`}
                      >
                        {injury
                          ? injury.severity === 'severe'
                            ? 'Lesión Grave'
                            : injury.severity === 'moderate'
                              ? 'Lesión Moderada'
                              : 'Molestia Leve'
                          : 'Estado Óptimo (100%)'}
                      </span>
                    </div>

                    {injury ? (
                      <div className="mt-3 space-y-3">
                        <div className="text-sm text-red-200 font-medium">{injury.label}</div>
                        <div className="text-xs text-slate-400">
                          Penalización activa: <span className="text-red-300">{injury.statPenaltyDesc} (-{Math.round(injury.penaltyValue * 100)}%)</span> · Recuperación natural: {injury.weeksRemaining} semana(s)
                        </div>
                        <button
                          disabled={career.money < getMedicalCost(injury)}
                          onClick={() => {
                            soundEngine.playClick();
                            onPayMedicalTreatment(injury.id, getMedicalCost(injury));
                          }}
                          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer disabled:cursor-not-allowed"
                        >
                          <HeartPulse className="w-3.5 h-3.5" />
                          <span>
                            Fisioterapia Especializada (${getMedicalCost(injury).toLocaleString()})
                          </span>
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400">
                        Sin traumatismos activos. Listo para soportar impactos al máximo nivel.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'rankings' && (
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 p-5 rounded-xl bg-[#121620] border border-white/10">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h3 className="font-display text-2xl font-bold text-white">
                  Escalafón Oficial Corona de Hierro
                </h3>
              </div>
              <div className="divide-y divide-white/5">
                {[...CAREER_OPPONENTS].reverse().map((opp) => {
                  const defeated = career.defeatedOpponentIds.includes(opp.id);
                  return (
                    <div
                      key={opp.id}
                      className="py-3 flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-16 font-mono-tabular text-xs font-bold text-amber-400">
                          {opp.rank === 0 ? 'CAMPEÓN' : `#${opp.rank}`}
                        </span>
                        <div>
                          <div className="font-semibold text-white">{opp.name}</div>
                          <div className="text-xs text-slate-400">{opp.tierLabel}</div>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          defeated ? 'text-emerald-400' : 'text-slate-400'
                        }`}
                      >
                        {defeated ? 'Vencido' : `OVR ${opp.overall}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-5 p-5 rounded-xl bg-[#121620] border border-white/10">
              <h3 className="font-display text-2xl font-bold text-white mb-4">
                Historial de Combates
              </h3>
              {career.fightHistory.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Aún no has debutado como profesional. Selecciona tu primer rival en la Cartelera.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {career.fightHistory.map((h, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg bg-[#0C1018] border border-white/5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-white">vs {h.opponentName}</div>
                        <div className="text-slate-400">
                          Semana {h.week} · Asalto {h.round}
                        </div>
                      </div>
                      <span
                        className={`font-mono-tabular font-bold ${
                          h.won ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {h.won ? `VICTORIA (${h.method})` : `DERROTA (${h.method})`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
