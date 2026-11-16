import { useEffect, useState } from 'react';
import {
  CAREER_OPPONENTS,
  STORY_BEATS,
  WEIGHT_CLASSES,
  createInitialCareerState,
} from './data/careerData';
import {
  BoxerAppearance,
  BoxerStats,
  CareerState,
  FightResult,
  GameScreen,
  NarrativeChoice,
  OpponentProfile,
  StoryBeat,
  TraitId,
  TrainingDrillType,
  WeightClassId,
} from './types/game';
import { TitleScreen } from './components/TitleScreen';
import { CharacterEditor } from './components/CharacterEditor';
import { CareerHub } from './components/CareerHub';
import { GymScreen } from './components/GymScreen';
import { FightScreen } from './components/FightScreen';
import { NarrativeModal } from './components/NarrativeModal';

const STORAGE_KEY = 'corona_de_hierro_career_v1';

function loadSavedCareer(): CareerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CareerState;
      if (parsed && parsed.appearance && parsed.stats) {
        return parsed;
      }
    }
  } catch {
    // fallback to fresh state
  }
  return createInitialCareerState();
}

export default function App() {
  const [career, setCareer] = useState<CareerState>(() => loadSavedCareer());
  const [screen, setScreen] = useState<GameScreen>('title');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [activeOpponent, setActiveOpponent] = useState<OpponentProfile | null>(null);
  const [isExhibitionFight, setIsExhibitionFight] = useState(false);
  const [activeStoryBeat, setActiveStoryBeat] = useState<StoryBeat | null>(null);

  useEffect(() => {
    try {
      if (career.initialized) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(career));
      }
    } catch {
      // ignore storage quota errors
    }
  }, [career]);

  // Trigger cinematic career narrative beats based on rank progression
  useEffect(() => {
    if (screen !== 'career' || activeStoryBeat) return;
    const pending = STORY_BEATS.find(
      (b) => career.rank <= b.triggerRankMin && !career.seenStoryIds.includes(b.id)
    );
    if (pending) {
      setActiveStoryBeat(pending);
    }
  }, [screen, career.rank, career.seenStoryIds, activeStoryBeat]);

  const handleStartNewCareer = () => {
    const fresh = createInitialCareerState();
    setCareer(fresh);
    setIsCreatingNew(true);
    setScreen('editor');
  };

  const handleContinueCareer = () => {
    setIsCreatingNew(false);
    setScreen('career');
  };

  const handleQuickFight = () => {
    const exhibitionOpp = CAREER_OPPONENTS[3]; // Carlos Ibáñez (Arena Central)
    setActiveOpponent(exhibitionOpp);
    setIsExhibitionFight(true);
    setScreen('fight');
  };

  const handleSaveEditor = (
    appearance: BoxerAppearance,
    traits: TraitId[],
    adjustedStats: BoxerStats
  ) => {
    setCareer((prev) => ({
      ...prev,
      initialized: true,
      appearance,
      traits,
      stats: adjustedStats,
    }));
    setIsCreatingNew(false);
    setScreen('career');
  };

  const handleSelectStoryChoice = (choice: NarrativeChoice) => {
    if (!activeStoryBeat) return;
    setCareer((prev) => ({
      ...prev,
      money: prev.money + (choice.purseBonus || 0),
      gymPoints: prev.gymPoints + (choice.gymPointsBonus || 0),
      morale: Math.min(100, Math.max(0, prev.morale + (choice.moraleDelta || 0))),
      seenStoryIds: [...prev.seenStoryIds, activeStoryBeat.id],
    }));
    setActiveStoryBeat(null);
  };

  const handleUpgradeStat = (statKey: keyof BoxerStats, costPE: number) => {
    setCareer((prev) => {
      if (prev.gymPoints < costPE || prev.stats[statKey] >= 99) return prev;
      return {
        ...prev,
        gymPoints: prev.gymPoints - costPE,
        stats: {
          ...prev.stats,
          [statKey]: Math.min(99, prev.stats[statKey] + 1),
        },
      };
    });
  };

  const handleUpgradeGym = (
    upgradeKey: keyof CareerState['gymUpgrades'],
    costMoney: number
  ) => {
    setCareer((prev) => {
      if (prev.money < costMoney || prev.gymUpgrades[upgradeKey] >= 5) return prev;
      return {
        ...prev,
        money: prev.money - costMoney,
        gymUpgrades: {
          ...prev.gymUpgrades,
          [upgradeKey]: prev.gymUpgrades[upgradeKey] + 1,
        },
      };
    });
  };

  const handleCompleteDrill = (
    _drillType: TrainingDrillType,
    gymPointsEarned: number,
    bonusStatKey: keyof BoxerStats,
    bonusStatAmount: number
  ) => {
    setCareer((prev) => {
      const bagBonus = prev.gymUpgrades.heavyBagLevel - 1;
      const sparBonus =
        bonusStatAmount >= 2 && prev.gymUpgrades.sparringPartnerLevel > 1 ? 1 : 0;
      return {
        ...prev,
        gymPoints: prev.gymPoints + gymPointsEarned + bagBonus,
        stats: {
          ...prev.stats,
          [bonusStatKey]: Math.min(99, prev.stats[bonusStatKey] + bonusStatAmount + sparBonus),
        },
      };
    });
  };

  const handleRestWeek = () => {
    setCareer((prev) => {
      const healStep = prev.gymUpgrades.medicalStaffLevel >= 3 ? 2 : 1;
      const healed = prev.injuries
        .map((inj) => ({ ...inj, weeksRemaining: inj.weeksRemaining - healStep }))
        .filter((inj) => inj.weeksRemaining > 0);
      const newWeek = prev.week + 1;
      // Age increments every 52 weeks (1 boxing year)
      const currentAge = prev.age ?? 22;
      const newAge = newWeek % 52 === 0 ? currentAge + 1 : currentAge;
      // Age-based stat decay: once boxer is 36+ each year subtract 1 speed & footwork
      let agedStats = prev.stats;
      if (newAge > currentAge && newAge >= 36) {
        agedStats = {
          ...prev.stats,
          speed: Math.max(50, prev.stats.speed - 1),
          footwork: Math.max(50, prev.stats.footwork - 1),
        };
      }
      return {
        ...prev,
        week: newWeek,
        age: newAge,
        stats: agedStats,
        morale: Math.min(100, prev.morale + 10),
        injuries: healed,
      };
    });
  };

  const handlePayMedicalTreatment = (injuryId: string, cost: number) => {
    setCareer((prev) => {
      if (prev.money < cost) return prev;
      return {
        ...prev,
        money: prev.money - cost,
        injuries: prev.injuries.filter((i) => i.id !== injuryId),
      };
    });
  };

  const handleStartCareerFight = (opp: OpponentProfile) => {
    setActiveOpponent(opp);
    setIsExhibitionFight(false);
    setScreen('fight');
  };

  // Change weight class — costs morale and resets rank if moving up
  const handleChangeWeightClass = (newClass: WeightClassId) => {
    setCareer((prev) => {
      if (prev.appearance.weightClass === newClass) return prev;
      const isMovingUp =
        WEIGHT_CLASSES.findIndex((w) => w.id === newClass) >
        WEIGHT_CLASSES.findIndex((w) => w.id === prev.appearance.weightClass);
      return {
        ...prev,
        appearance: { ...prev.appearance, weightClass: newClass },
        // Moving up: harder, loses ranking. Moving down: easier, minor morale drop
        rank: isMovingUp ? Math.min(16, prev.rank + 4) : Math.max(prev.rank - 2, prev.rank),
        belt: isMovingUp ? 'none' : prev.belt,
        morale: Math.max(15, prev.morale - (isMovingUp ? 20 : 10)),
        week: prev.week + 4, // Training camp takes 4 weeks
      };
    });
  };

  const handleFinishFight = (res: FightResult) => {
    if (isExhibitionFight) {
      setActiveOpponent(null);
      setIsExhibitionFight(false);
      setScreen('title');
      return;
    }

    setCareer((prev) => {
      const opp = CAREER_OPPONENTS.find((o) => o.id === res.opponentId);
      const isKO = res.method === 'KO' || res.method === 'TKO';
      const nextRank =
        res.won && opp ? Math.min(prev.rank, opp.rank) : prev.rank;

      let nextBelt = prev.belt;
      if (res.won && opp) {
        if (opp.rank === 0) nextBelt = 'world';
        else if (opp.rank <= 4 && nextBelt !== 'world') nextBelt = 'national';
        else if (opp.rank <= 11 && nextBelt === 'none') nextBelt = 'local';
      }

      // Track multi-division championship belts
      let nextChampionshipBeltsWon = prev.championshipBeltsWon ?? [];
      if (res.won && opp && opp.rank === 0) {
        const currentClass = prev.appearance.weightClass as WeightClassId;
        if (!nextChampionshipBeltsWon.includes(currentClass)) {
          nextChampionshipBeltsWon = [...nextChampionshipBeltsWon, currentClass];
        }
      }

      // Age progression: 1 fight = 2 weeks (travel + camp)
      const newWeek = prev.week + 2;
      const currentAge = prev.age ?? 22;
      const newAge = Math.floor(newWeek / 52) + 22;

      // Merge new injuries (replace/worsen same zone or add new)
      const updatedInjuries = [...prev.injuries]
        .map((inj) => ({ ...inj, weeksRemaining: Math.max(1, inj.weeksRemaining - 1) }));

      res.newInjuries.forEach((ni) => {
        const idx = updatedInjuries.findIndex((x) => x.zone === ni.zone);
        if (idx >= 0) updatedInjuries[idx] = ni;
        else updatedInjuries.push(ni);
      });

      const nextDefeated =
        res.won && !prev.defeatedOpponentIds.includes(res.opponentId)
          ? [...prev.defeatedOpponentIds, res.opponentId]
          : prev.defeatedOpponentIds;

      return {
        ...prev,
        week: newWeek,
        age: newAge > currentAge ? newAge : currentAge,
        rank: nextRank,
        belt: nextBelt,
        championshipBeltsWon: nextChampionshipBeltsWon,
        money: prev.money + res.purseEarned,
        gymPoints: prev.gymPoints + res.gymPointsEarned,
        morale: Math.min(100, Math.max(15, prev.morale + (res.won ? 12 : -10))),
        record: {
          wins: prev.record.wins + (res.won ? 1 : 0),
          losses: prev.record.losses + (res.won ? 0 : 1),
          kos: prev.record.kos + (res.won && isKO ? 1 : 0),
        },
        injuries: updatedInjuries,
        defeatedOpponentIds: nextDefeated,
        fightHistory: [
          {
            week: prev.week,
            opponentName: res.opponentName,
            won: res.won,
            method: res.method,
            round: res.roundEnded,
          },
          ...prev.fightHistory,
        ],
      };
    });

    setActiveOpponent(null);
    setScreen('career');
  };

  return (
    <div className="w-full h-full bg-[#090B0F] overflow-hidden">
      {screen === 'title' && (
        <TitleScreen
          hasSavedCareer={career.initialized}
          savedAppearance={career.appearance}
          onStartNewCareer={handleStartNewCareer}
          onContinueCareer={handleContinueCareer}
          onQuickFight={handleQuickFight}
        />
      )}

      {screen === 'editor' && (
        <CharacterEditor
          initialAppearance={career.appearance}
          initialTraits={career.traits}
          baseStats={career.stats}
          isNewCareer={isCreatingNew}
          onSave={handleSaveEditor}
          onCancel={() => setScreen(career.initialized ? 'career' : 'title')}
        />
      )}

      {screen === 'career' && (
        <>
          <CareerHub
            career={career}
            onStartFight={handleStartCareerFight}
            onOpenGym={() => setScreen('gym')}
            onOpenEditor={() => {
              setIsCreatingNew(false);
              setScreen('editor');
            }}
            onRestWeek={handleRestWeek}
            onPayMedicalTreatment={handlePayMedicalTreatment}
            onExitToTitle={() => setScreen('title')}
          />
          {activeStoryBeat && (
            <NarrativeModal
              beat={activeStoryBeat}
              onSelectChoice={handleSelectStoryChoice}
            />
          )}
        </>
      )}

      {screen === 'gym' && (
        <GymScreen
          career={career}
          onUpgradeStat={handleUpgradeStat}
          onUpgradeGym={handleUpgradeGym}
          onCompleteDrill={handleCompleteDrill}
          onBack={() => setScreen('career')}
        />
      )}

      {screen === 'fight' && activeOpponent && (
        <FightScreen
          playerAppearance={career.appearance}
          playerStats={career.stats}
          playerTraits={career.traits}
          activeInjuries={isExhibitionFight ? [] : career.injuries}
          opponent={activeOpponent}
          isTitleFight={activeOpponent.rank === 0 || activeOpponent.rank === 4 || activeOpponent.rank === 11}
          onFinishFight={handleFinishFight}
          onAbortFight={() => {
            setActiveOpponent(null);
            setScreen(isExhibitionFight ? 'title' : 'career');
          }}
        />
      )}
    </div>
  );
}
