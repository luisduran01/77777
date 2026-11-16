export type WeightClassId = 'lightweight' | 'welterweight' | 'middleweight' | 'heavyweight';

export type StanceType = 'orthodox' | 'southpaw';

export type HairStyleId =
  | 'bald'
  | 'buzz'
  | 'fade'
  | 'textured_crop'
  | 'slick_back'
  | 'dreadlocks'
  | 'cornrows'
  | 'curly_afro'
  | 'topknot'
  | 'mohawk'
  | 'braids'
  | 'long';

export type FacialHairId =
  | 'clean'
  | 'stubble'
  | 'heavy_stubble'
  | 'goatee'
  | 'mustache_vintage'
  | 'full_beard'
  | 'viking_beard';

export type TrunksPatternId =
  | 'classic'
  | 'stripe'
  | 'championship'
  | 'metallic'
  | 'camo'
  | 'gladiator'
  | 'flames';

export type GloveFinishId = 'matte' | 'glossy' | 'metallic' | 'vintage_leather';

export type BootsStyleId =
  | 'classic_high'
  | 'speed_low'
  | 'golden_champion'
  | 'pro_laced';

export type TattooStyleId =
  | 'none'
  | 'chest_eagle'
  | 'sleeve_tribal_left'
  | 'sleeve_dragon_right'
  | 'back_wings'
  | 'full_inked'
  | 'neck_crown';

export type FightStyleTechnique =
  | 'orthodox_classic'
  | 'philly_shell'
  | 'peek_a_boo'
  | 'slugger_heavy';

export type TraitId =
  | 'iron_chin'
  | 'lightning_hands'
  | 'counter_instinct'
  | 'body_snatcher'
  | 'marathon_lungs'
  | 'cold_blood'
  | 'glass_cannon'    // +20% daño infligido, -18% resistencia a stun (mandíbula de cristal)
  | 'brawl_spirit';   // Levantarse de un KO restaura guardia completa; combo bonus ampliado

export interface BoxerAppearance {
  name: string;
  nickname: string;
  countryCode: string;
  countryName: string;
  weightClass: WeightClassId;
  stance: StanceType;
  skinTone: string;
  heightScale: number; // 0.92 - 1.08
  reachScale: number; // 0.92 - 1.10
  muscleMass: number; // 0.85 - 1.20
  shoulderWidth: number; // 0.90 - 1.15
  hairStyle: HairStyleId;
  hairColor: string;
  facialHair: FacialHairId;
  hasScar: boolean;
  tattooStyle: TattooStyleId;
  tattooArmL?: boolean;
  tattooArmR?: boolean;
  tattooChest?: boolean;
  tattooBack?: boolean;
  fightTechnique?: FightStyleTechnique;
  // Indumentaria personalizable completa
  trunksColor: string;
  trunksAccent: string;
  trunksPattern: TrunksPatternId;
  gloveColor: string;
  gloveAccent: string;
  gloveFinish: GloveFinishId;
  gloveTapeColor?: string;
  bootsStyle?: BootsStyleId;
  bootsColor: string;
  bootsAccentColor?: string;
  bootsSoleColor?: string;
}

export interface BoxerStats {
  power: number; // 1 - 99: Pegada / Daño
  speed: number; // 1 - 99: Velocidad de manos
  stamina: number; // 1 - 99: Resistencia cardiovascular
  technique: number; // 1 - 99: Precisión, combos y contragolpes
  defense: number; // 1 - 99: Solidez de guardia y reflejos de esquiva
  chin: number; // 1 - 99: Mandíbula y aguante al KO
  footwork: number; // 1 - 99: Desplazamiento en el cuadrilátero
}

export type InjuryZone = 'eyebrow' | 'nose_jaw' | 'ribs' | 'hands';
export type InjurySeverity = 'minor' | 'moderate' | 'severe';

export interface ActiveInjury {
  id: string;
  zone: InjuryZone;
  label: string;
  severity: InjurySeverity;
  weeksRemaining: number;
  statPenaltyDesc: string;
  penaltyValue: number; // 0.05 to 0.22
}

export type AIArchetype = 'counter' | 'brawler' | 'technician' | 'slugger';

export interface OpponentProfile {
  id: string;
  rank: number; // 15 down to 1 (0 = Champion)
  tier: 'local' | 'national' | 'world';
  tierLabel: string;
  name: string;
  nickname: string;
  countryCode: string;
  countryName: string;
  record: { wins: number; losses: number; kos: number };
  archetype: AIArchetype;
  archetypeLabel: string;
  overall: number;
  purse: number;
  rankingGain: number;
  rounds: number;
  bio: string;
  quote: string;
  appearance: BoxerAppearance;
  stats: BoxerStats;
  traits: TraitId[];
}

export interface NarrativeChoice {
  label: string;
  effectText: string;
  purseBonus?: number;
  gymPointsBonus?: number;
  moraleDelta?: number;
  opponentAggressionMod?: number;
}

export interface StoryBeat {
  id: string;
  triggerRankMin: number;
  speaker: string;
  speakerRole: string;
  title: string;
  dialogue: string;
  choices: NarrativeChoice[];
}

export type CameraMode = 'broadcast' | 'corner' | 'close';
export type CornerFocus = 'cutman' | 'cardio' | 'tactic';

export interface FightResult {
  won: boolean;
  method: 'KO' | 'TKO' | 'UD' | 'MD' | 'LOSS_KO' | 'LOSS_TKO' | 'LOSS_DEC';
  roundEnded: number;
  totalRounds: number;
  playerScore: number;
  opponentScore: number;
  landedPunches: number;
  thrownPunches: number;
  headPunchesLanded: number;
  bodyPunchesLanded: number;
  countersLanded: number;
  knockdownsScored: number;
  knockdownsTaken: number;
  zoneDamageTaken: Record<InjuryZone, number>;
  newInjuries: ActiveInjury[];
  purseEarned: number;
  gymPointsEarned: number;
  opponentId: string;
  opponentName: string;
  isTitleFight: boolean;
}

export type TrainingDrillType = 'heavy_bag' | 'speed_reflex' | 'defense_sparring';

export interface CareerState {
  initialized: boolean;
  week: number;
  age?: number; // edad del boxeador (ej. 22 años al debutar)
  rank: number; // starts at 16 (unranked contender), 0 = Undisputed World Champion
  belt: 'none' | 'local' | 'national' | 'world';
  championshipBeltsWon?: WeightClassId[]; // registro de títulos en distintas divisiones para doble / triple campeón
  money: number;
  gymPoints: number;
  morale: number; // 0 - 100
  hype: number; // 0 - 100
  record: { wins: number; losses: number; kos: number };
  appearance: BoxerAppearance;
  stats: BoxerStats;
  traits: TraitId[];
  injuries: ActiveInjury[];
  defeatedOpponentIds: string[];
  seenStoryIds: string[];
  gymUpgrades: {
    heavyBagLevel: number;
    medicalStaffLevel: number;
    sparringPartnerLevel: number;
  };
  fightHistory: {
    week: number;
    opponentName: string;
    won: boolean;
    method: string;
    round: number;
  }[];
}

export type PunchType =
  | 'jab'
  | 'cross'
  | 'hook_l'
  | 'hook_r'
  | 'uppercut'
  | 'body_hook'
  | 'overhand';  // Voleo en arco trasero que pasa por encima de la guardia alta

export type GameScreen =
  | 'title'
  | 'editor'
  | 'career'
  | 'gym'
  | 'fight';
