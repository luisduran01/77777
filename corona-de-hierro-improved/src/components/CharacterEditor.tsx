import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Check, ArrowLeft, User, Sliders, Shield, Sparkles } from 'lucide-react';
import {
  BOXER_TRAITS,
  COUNTRIES,
  GEAR_PALETTES,
  HAIR_COLORS,
  SKIN_TONES,
  WEIGHT_CLASSES,
} from '../data/careerData';
import {
  BoxerAppearance,
  BoxerStats,
  FacialHairId,
  GloveFinishId,
  HairStyleId,
  PunchType,
  TraitId,
  TrunksPatternId,
} from '../types/game';
import { buildBoxerRig, poseBoxer } from '../engine/boxerMesh';
import {
  configureRenderer,
  detectSoftwareWebGL,
  scheduleSoftwareAfterDraw,
} from '../engine/arenaScene';
import { soundEngine } from '../audio/soundEngine';

interface CharacterEditorProps {
  initialAppearance: BoxerAppearance;
  initialTraits: TraitId[];
  baseStats: BoxerStats;
  isNewCareer: boolean;
  onSave: (appearance: BoxerAppearance, traits: TraitId[], adjustedStats: BoxerStats) => void;
  onCancel: () => void;
}

type EditorTab = 'identity' | 'body' | 'gear' | 'traits';

export const CharacterEditor: React.FC<CharacterEditorProps> = ({
  initialAppearance,
  initialTraits,
  baseStats,
  isNewCareer,
  onSave,
  onCancel,
}) => {
  const [appearance, setAppearance] = useState<BoxerAppearance>(initialAppearance);
  const [traits, setTraits] = useState<TraitId[]>(initialTraits);
  const [activeTab, setActiveTab] = useState<EditorTab>('identity');

  const mountRef = useRef<HTMLDivElement | null>(null);
  const rigRef = useRef<ReturnType<typeof buildBoxerRig> | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;
  const previewAnimRef = useRef<{
    punch: PunchType | null;
    phase: 'none' | 'windup' | 'strike' | 'recover';
    timer: number;
    duration: number;
  }>({ punch: null, phase: 'none', timer: 0, duration: 0.1 });

  // Initialize isolated 3D Studio Viewport
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const { renderer } = configureRenderer(container, isSoftwareGl);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0e14);
    scene.fog = new THREE.FogExp2(0x0b0e14, 0.06);
    sceneRef.current = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(
      40,
      (container.clientWidth || 700) / (container.clientHeight || 700),
      0.1,
      50
    );
    camera.position.set(0.55, 1.38, 2.9);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.enablePan = false;
    controls.minDistance = 2.0;
    controls.maxDistance = 4.2;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.minPolarAngle = Math.PI * 0.25;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.update();

    // Studio 3-Point Lighting
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x1c1917, 0.72);
    const key = new THREE.DirectionalLight(0xfff1d6, 2.3);
    key.position.set(2.5, 4.5, 3.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    const rim = new THREE.DirectionalLight(0xf59e0b, 1.1);
    rim.position.set(-3, 3.5, -2.5);
    scene.add(hemi, key, rim);

    // Pedestal Turntable
    const pedGeo = new THREE.CylinderGeometry(0.95, 1.08, 0.14, 36);
    const pedMat = new THREE.MeshStandardMaterial({
      color: 0x161b24,
      roughness: 0.45,
      metalness: 0.4,
    });
    const pedRingGeo = new THREE.TorusGeometry(0.96, 0.015, 8, 48);
    const pedRingMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.25,
      metalness: 0.85,
    });
    const pedestal = new THREE.Mesh(pedGeo, pedMat);
    pedestal.position.y = -0.07;
    pedestal.receiveShadow = true;
    const pedRing = new THREE.Mesh(pedRingGeo, pedRingMat);
    pedRing.rotation.x = Math.PI / 2;
    pedRing.position.y = 0.005;
    scene.add(pedestal, pedRing);

    // Initial Boxer Rig
    const rig = buildBoxerRig(appearanceRef.current);
    scene.add(rig.root);
    rigRef.current = rig;

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 600;
      const h = container.clientHeight || 600;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.getElapsedTime();
      const pa = previewAnimRef.current;
      if (pa.phase !== 'none') {
        pa.timer += dt;
        if (pa.phase === 'windup' && pa.timer >= pa.duration) {
          pa.phase = 'strike';
          pa.timer = 0;
          pa.duration = 0.11;
        } else if (pa.phase === 'strike' && pa.timer >= pa.duration) {
          pa.phase = 'recover';
          pa.timer = 0;
          pa.duration = 0.2;
        } else if (pa.phase === 'recover' && pa.timer >= pa.duration) {
          pa.phase = 'none';
          pa.punch = null;
          pa.timer = 0;
        }
      }
      if (rigRef.current) {
        poseBoxer(rigRef.current, {
          dt,
          stance: appearanceRef.current.stance,
          elapsed: t,
          guardHigh: 0.32,
          guardLow: 0,
          slipX: 0,
          leanZ: pa.phase === 'strike' ? 0.32 : 0,
          activePunch: pa.punch,
          punchPhase: pa.phase,
          punchProgress: pa.duration > 0 ? THREE.MathUtils.clamp(pa.timer / pa.duration, 0, 1) : 0,
          hitRecoilX: 0,
          hitRecoilY: 0,
          knockdownProgress: 0,
          victoryRaise: 0,
          sweatLevel: 0.2,
          browDamage: 0,
          jawDamage: 0,
          moveSpeedNorm: 0.15,
        });
      }
      controls.update();
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
      controls.dispose();
      if (rigRef.current) rigRef.current.dispose();
      pedGeo.dispose();
      pedMat.dispose();
      pedRingGeo.dispose();
      pedRingMat.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, []);

  // Rebuild 3D Boxer Rig live when customization options change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (rigRef.current) {
      scene.remove(rigRef.current.root);
      rigRef.current.dispose();
    }
    const nextRig = buildBoxerRig(appearance);
    scene.add(nextRig.root);
    rigRef.current = nextRig;
  }, [appearance]);

  const updateField = <K extends keyof BoxerAppearance>(key: K, value: BoxerAppearance[K]) => {
    setAppearance((prev) => ({ ...prev, [key]: value }));
  };

  const toggleTrait = (id: TraitId) => {
    soundEngine.playClick();
    setTraits((prev) => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter((t) => t !== id) : prev;
      }
      if (prev.length >= 2) {
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  const weightCfg = WEIGHT_CLASSES.find((w) => w.id === appearance.weightClass) || WEIGHT_CLASSES[1];
  const previewStats: BoxerStats = {
    power: Math.min(99, Math.max(40, baseStats.power + (weightCfg.baseModifiers.power || 0))),
    speed: Math.min(99, Math.max(40, baseStats.speed + (weightCfg.baseModifiers.speed || 0))),
    stamina: Math.min(99, Math.max(40, baseStats.stamina + (weightCfg.baseModifiers.stamina || 0))),
    technique: Math.min(99, Math.max(40, baseStats.technique + (weightCfg.baseModifiers.technique || 0))),
    defense: Math.min(99, Math.max(40, baseStats.defense + (weightCfg.baseModifiers.defense || 0))),
    chin: Math.min(99, Math.max(40, baseStats.chin + (weightCfg.baseModifiers.chin || 0))),
    footwork: Math.min(99, Math.max(40, baseStats.footwork + (weightCfg.baseModifiers.footwork || 0))),
  };

  const handleConfirm = () => {
    soundEngine.playClick();
    const cleanedName = appearance.name.trim() || 'Mateo Mendoza';
    const cleanedNick = appearance.nickname.trim() || 'El Relámpago';
    onSave(
      { ...appearance, name: cleanedName, nickname: cleanedNick },
      traits,
      isNewCareer ? previewStats : baseStats
    );
  };

  const tabs: { id: EditorTab; label: string; icon: React.ReactNode }[] = [
    { id: 'identity', label: 'Identidad', icon: <User className="w-4 h-4" /> },
    { id: 'body', label: 'Físico y Rostro', icon: <Sliders className="w-4 h-4" /> },
    { id: 'gear', label: 'Equipamiento', icon: <Shield className="w-4 h-4" /> },
    { id: 'traits', label: 'Rasgos Únicos', icon: <Sparkles className="w-4 h-4" /> },
  ];

  return (
    <div className="w-full h-full flex flex-col lg:flex-row bg-[#090B0F] text-slate-100 overflow-hidden">
      {/* Left 3D Live Interactive Viewport */}
      <div className="relative w-full lg:w-[48%] h-[42vh] lg:h-full border-b lg:border-b-0 lg:border-r border-white/10">
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        <div className="pointer-events-none absolute top-5 left-5 right-5 flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-amber-400 tracking-wider">
              {isNewCareer ? 'CREACIÓN DE ASPIRANTE' : 'VESTUARIO DEL CAMPEÓN'}
            </p>
            <h1 className="font-display text-4xl font-bold tracking-tight text-white">
              {appearance.name || 'Sin Nombre'}
            </h1>
            <p className="text-sm text-slate-400">
              “{appearance.nickname || 'Sin Apodo'}” · {weightCfg.label} ({weightCfg.kgRange})
            </p>
          </div>
          <button
            onClick={() => {
              soundEngine.playClick();
              onCancel();
            }}
            className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#12161F]/90 border border-white/15 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver</span>
          </button>
        </div>

        <div className="pointer-events-none absolute bottom-4 left-5 right-5 flex items-center justify-between gap-2">
          <div className="text-xs text-slate-400">
            Arrastra sobre el boxeador para rotar 360° · Rueda para acercar
          </div>
          <div className="pointer-events-auto flex items-center gap-1.5">
            {(
              [
                ['jab', 'Jab'],
                ['cross', 'Recto'],
                ['hook_l', 'Gancho'],
                ['uppercut', 'Upper'],
              ] as [PunchType, string][]
            ).map(([pType, lbl]) => (
              <button
                key={pType}
                onClick={() => {
                  soundEngine.playWhoosh(pType === 'jab' ? 1.25 : 0.95);
                  previewAnimRef.current = {
                    punch: pType,
                    phase: 'windup',
                    timer: 0,
                    duration: pType === 'jab' ? 0.06 : 0.12,
                  };
                }}
                className="px-2.5 py-1 rounded bg-[#141923] hover:bg-amber-500 hover:text-slate-950 border border-white/15 text-[11px] font-medium text-slate-200 transition-colors cursor-pointer"
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right Deep Customization Console */}
      <div className="flex-1 flex flex-col h-[58vh] lg:h-full overflow-hidden bg-[#0E121A]">
        {/* Category Tabs */}
        <div className="flex items-center gap-2 px-6 pt-5 pb-4 border-b border-white/10 overflow-x-auto shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                soundEngine.playClick();
                setActiveTab(t.id);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === t.id
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-[#161B26] text-slate-300 hover:text-white hover:bg-[#1E2534]'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Scrollable Controls */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'identity' && (
            <div className="space-y-6 max-w-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Nombre del Boxeador
                  </label>
                  <input
                    type="text"
                    maxLength={24}
                    value={appearance.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#161B26] border border-white/10 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Apodo de Cartelera
                  </label>
                  <input
                    type="text"
                    maxLength={22}
                    value={appearance.nickname}
                    onChange={(e) => updateField('nickname', e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#161B26] border border-white/10 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  Nacionalidad en el Cuadrilátero
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {COUNTRIES.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => {
                        soundEngine.playClick();
                        setAppearance((prev) => ({
                          ...prev,
                          countryCode: c.code,
                          countryName: c.name,
                        }));
                      }}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors cursor-pointer ${
                        appearance.countryCode === c.code
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                          : 'bg-[#161B26] border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      {c.code} · {c.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  Categoría de Peso
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {WEIGHT_CLASSES.map((wc) => (
                    <button
                      key={wc.id}
                      onClick={() => {
                        soundEngine.playClick();
                        updateField('weightClass', wc.id);
                      }}
                      className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        appearance.weightClass === wc.id
                          ? 'bg-amber-500/15 border-amber-500'
                          : 'bg-[#161B26] border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-white">{wc.label}</span>
                        <span className="font-mono-tabular text-xs text-amber-400">{wc.kgRange}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {wc.id === 'lightweight' && 'Máxima velocidad y juego de pies.'}
                        {wc.id === 'welterweight' && 'Equilibrio perfecto entre ritmo y técnica.'}
                        {wc.id === 'middleweight' && 'Pegada sólida sin perder movilidad.'}
                        {wc.id === 'heavyweight' && 'Potencia demoledora y mandíbula pesada.'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  Guardia Natural
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'orthodox', label: 'Ortodoxo (Diestro)', desc: 'Jab izquierdo adelante, recto derecho atrás.' },
                    { id: 'southpaw', label: 'Zurdo (Southpaw)', desc: 'Jab derecho adelante, ángulo invertido.' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        soundEngine.playClick();
                        updateField('stance', s.id as 'orthodox' | 'southpaw');
                      }}
                      className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        appearance.stance === s.id
                          ? 'bg-amber-500/15 border-amber-500'
                          : 'bg-[#161B26] border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="font-semibold text-sm text-white">{s.label}</div>
                      <div className="text-xs text-slate-400 mt-1">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'body' && (
            <div className="space-y-6 max-w-2xl">
              {/* Skin Tone */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Tono de Piel</label>
                <div className="flex flex-wrap gap-3">
                  {SKIN_TONES.map((st) => (
                    <button
                      key={st.hex}
                      onClick={() => updateField('skinTone', st.hex)}
                      title={st.name}
                      className={`w-10 h-10 rounded-lg border-2 transition-transform cursor-pointer ${
                        appearance.skinTone === st.hex
                          ? 'border-amber-400 scale-110'
                          : 'border-white/15 hover:scale-105'
                      }`}
                      style={{ backgroundColor: st.hex }}
                    />
                  ))}
                </div>
              </div>

              {/* Body Proportions Sliders */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[
                  { key: 'heightScale', label: 'Estatura', min: 0.92, max: 1.08, step: 0.01 },
                  { key: 'reachScale', label: 'Envergadura / Alcance', min: 0.92, max: 1.1, step: 0.01 },
                  { key: 'muscleMass', label: 'Masa Muscular', min: 0.88, max: 1.2, step: 0.01 },
                  { key: 'shoulderWidth', label: 'Anchura de Hombros', min: 0.92, max: 1.15, step: 0.01 },
                ].map((sl) => (
                  <div key={sl.key} className="p-3.5 rounded-lg bg-[#161B26] border border-white/10">
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-slate-300 font-medium">{sl.label}</span>
                      <span className="font-mono-tabular text-amber-400">
                        {Math.round((appearance[sl.key as keyof BoxerAppearance] as number) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={sl.min}
                      max={sl.max}
                      step={sl.step}
                      value={appearance[sl.key as keyof BoxerAppearance] as number}
                      onChange={(e) =>
                        updateField(sl.key as keyof BoxerAppearance, parseFloat(e.target.value) as never)
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                ))}
              </div>

              {/* Hair Style & Color */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Estilo de Cabello</label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['buzz', 'Rapado'],
                      ['fade', 'Degradado'],
                      ['mohawk', 'Cresta'],
                      ['braids', 'Trenzas'],
                      ['long', 'Melena'],
                    ] as [HairStyleId, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => updateField('hairStyle', id)}
                      className={`px-3.5 py-2 rounded-lg text-xs font-medium border cursor-pointer ${
                        appearance.hairStyle === id
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                          : 'bg-[#161B26] border-white/10 text-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Vello Facial</label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['clean', 'Afeitado'],
                      ['stubble', 'Sombra'],
                      ['goatee', 'Candado'],
                      ['full_beard', 'Barba Completa'],
                    ] as [FacialHairId, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => updateField('facialHair', id)}
                      className={`px-3.5 py-2 rounded-lg text-xs font-medium border cursor-pointer ${
                        appearance.facialHair === id
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                          : 'bg-[#161B26] border-white/10 text-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-2">Color de Pelo</label>
                  <div className="flex gap-2.5">
                    {HAIR_COLORS.map((hc) => (
                      <button
                        key={hc.hex}
                        onClick={() => updateField('hairColor', hc.hex)}
                        title={hc.name}
                        className={`w-8 h-8 rounded-lg border-2 cursor-pointer ${
                          appearance.hairColor === hc.hex ? 'border-amber-400 scale-110' : 'border-white/15'
                        }`}
                        style={{ backgroundColor: hc.hex }}
                      />
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-[#161B26] border border-white/10 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appearance.hasScar}
                    onChange={(e) => updateField('hasScar', e.target.checked)}
                    className="accent-amber-500 w-4 h-4"
                  />
                  <span className="text-xs font-medium text-slate-200">Cicatriz en la ceja derecha</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'gear' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  Conjunto de Pantalón de Combate
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {GEAR_PALETTES.map((gp) => (
                    <button
                      key={gp.name}
                      onClick={() => {
                        soundEngine.playClick();
                        setAppearance((prev) => ({
                          ...prev,
                          trunksColor: gp.main,
                          trunksAccent: gp.accent,
                        }));
                      }}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                        appearance.trunksColor === gp.main
                          ? 'bg-amber-500/15 border-amber-500'
                          : 'bg-[#161B26] border-white/10'
                      }`}
                    >
                      <span
                        className="w-6 h-6 rounded border border-white/20 shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${gp.main} 60%, ${gp.accent} 60%)`,
                        }}
                      />
                      <span className="text-xs font-medium text-slate-200">{gp.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  Corte y Diseño del Pantalón
                </label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['classic', 'Clásico'],
                      ['stripe', 'Franja Lateral'],
                      ['championship', 'Cinturón Campeón'],
                      ['metallic', 'Satén Metálico'],
                    ] as [TrunksPatternId, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => updateField('trunksPattern', id)}
                      className={`px-3.5 py-2 rounded-lg text-xs font-medium border cursor-pointer ${
                        appearance.trunksPattern === id
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                          : 'bg-[#161B26] border-white/10 text-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  Guantes Profesionales
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {GEAR_PALETTES.map((gp) => (
                    <button
                      key={`glove_${gp.name}`}
                      onClick={() => {
                        soundEngine.playClick();
                        setAppearance((prev) => ({
                          ...prev,
                          gloveColor: gp.main,
                          gloveAccent: gp.accent,
                        }));
                      }}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                        appearance.gloveColor === gp.main
                          ? 'bg-amber-500/15 border-amber-500'
                          : 'bg-[#161B26] border-white/10'
                      }`}
                    >
                      <span
                        className="w-6 h-6 rounded border border-white/20 shrink-0"
                        style={{ backgroundColor: gp.main }}
                      />
                      <span className="text-xs font-medium text-slate-200">{gp.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  Acabado del Cuero (Guantes)
                </label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ['matte', 'Cuero Mate'],
                      ['glossy', 'Barniz Brillante'],
                      ['metallic', 'Acabado Metálico'],
                    ] as [GloveFinishId, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => updateField('gloveFinish', id)}
                      className={`px-3.5 py-2 rounded-lg text-xs font-medium border cursor-pointer ${
                        appearance.gloveFinish === id
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                          : 'bg-[#161B26] border-white/10 text-slate-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'traits' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <p className="text-sm text-slate-300">
                  Selecciona <span className="text-amber-400 font-semibold">2 atributos únicos</span> que definen tu estilo dentro del cuadrilátero.
                </p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {BOXER_TRAITS.map((tr) => {
                    const selected = traits.includes(tr.id);
                    return (
                      <button
                        key={tr.id}
                        onClick={() => toggleTrait(tr.id)}
                        className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                          selected
                            ? 'bg-amber-500/15 border-amber-500'
                            : 'bg-[#161B26] border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-white">{tr.name}</span>
                          {selected && <Check className="w-4 h-4 text-amber-400" />}
                        </div>
                        <div className="text-xs text-amber-400 mt-0.5">{tr.subtitle}</div>
                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{tr.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-[#161B26] border border-white/10">
                <h3 className="text-xs font-semibold text-slate-300 mb-3">
                  Proyección de Atributos Iniciales ({weightCfg.label})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {[
                    ['Potencia', previewStats.power],
                    ['Velocidad', previewStats.speed],
                    ['Resistencia', previewStats.stamina],
                    ['Técnica', previewStats.technique],
                    ['Defensa', previewStats.defense],
                    ['Mandíbula', previewStats.chin],
                    ['Juego de Pies', previewStats.footwork],
                  ].map(([lbl, val]) => (
                    <div key={lbl as string} className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#0E121A]">
                      <span className="text-slate-400">{lbl}</span>
                      <span className="font-mono-tabular font-bold text-amber-400">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Bottom Save Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-[#0B0E14] flex items-center justify-between gap-4 shrink-0">
          <div className="text-xs text-slate-400">
            Rasgos activos: <span className="text-slate-200 font-medium">{traits.map((id) => BOXER_TRAITS.find((t) => t.id === id)?.name).join(' · ')}</span>
          </div>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display text-xl font-bold tracking-wide transition-colors cursor-pointer shrink-0"
          >
            <Check className="w-5 h-5" />
            <span>{isNewCareer ? 'COMENZAR CARRERA' : 'GUARDAR CAMBIOS'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
