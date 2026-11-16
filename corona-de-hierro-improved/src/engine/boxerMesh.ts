import * as THREE from 'three';
import { BoxerAppearance, PunchType } from '../types/game';
import { WEIGHT_CLASSES } from '../data/careerData';
import {
  createContactShadowTexture,
  createLeatherNormalRoughnessMap,
  createSkinBumpTexture,
} from './textures';

export type HitReactionDir = 'none' | 'straight' | 'left' | 'right' | 'up' | 'body';

export interface BoxerAnimState {
  stepPhase: number;
  hipsY: number;
  hipsRotX: number;
  hipsRotY: number;
  hipsRotZ: number;
  hipsPosZ: number;
  torsoRotX: number;
  torsoRotY: number;
  torsoRotZ: number;
  chestRotX: number;
  chestRotY: number;
  headRotX: number;
  headRotY: number;
  headRotZ: number;
  shL: [number, number, number];
  elL: number;
  wristLRotY: number;
  shR: [number, number, number];
  elR: number;
  wristRRotY: number;
  hipLRotX: number;
  hipLRotZ: number;
  kneeLRotX: number;
  hipRRotX: number;
  hipRRotZ: number;
  kneeRRotX: number;
  bodyCrunch: number;
  // Eye blink
  blinkPhase: number;
  blinkAmount: number;
  // Impact flash decay
  impactFlash: number;
}

export interface BoxerRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  chest: THREE.Group;
  headGroup: THREE.Group;
  shoulderL: THREE.Group;
  elbowL: THREE.Group;
  gloveL: THREE.Group;
  trailL: THREE.Mesh;
  shoulderR: THREE.Group;
  elbowR: THREE.Group;
  gloveR: THREE.Group;
  trailR: THREE.Mesh;
  hipL: THREE.Group;
  kneeL: THREE.Group;
  hipR: THREE.Group;
  kneeR: THREE.Group;
  contactShadow: THREE.Mesh;
  browCutMesh: THREE.Mesh;
  bloodTrickleMesh: THREE.Mesh;
  cheekBruiseMesh: THREE.Mesh;
  ribBruiseMesh: THREE.Mesh;
  impactFlashMesh: THREE.Mesh;
  skinMaterial: THREE.MeshPhysicalMaterial;
  gloveMaterial: THREE.MeshPhysicalMaterial;
  anim: BoxerAnimState;
  dispose: () => void;
}

export interface BoxerPoseParams {
  dt?: number;
  stance: 'orthodox' | 'southpaw';
  elapsed: number;
  guardHigh: number;
  guardLow: number;
  slipX: number;
  leanZ: number;
  activePunch: PunchType | null;
  punchPhase: 'none' | 'windup' | 'strike' | 'recover';
  punchProgress: number;
  feintAmount?: number;
  clinchAmount?: number;
  guardBroken?: boolean;
  hitRecoilX: number;
  hitRecoilY: number;
  hitDir?: HitReactionDir;
  knockdownProgress: number;
  victoryRaise: number;
  sweatLevel: number;
  staminaRatio?: number;
  browDamage: number;
  jawDamage: number;
  ribDamage?: number;
  moveSpeedNorm: number;
  impactFlashIntensity?: number;
}

function createInitialAnimState(): BoxerAnimState {
  return {
    stepPhase: 0,
    hipsY: 0.91,
    hipsRotX: 0.06,
    hipsRotY: -0.28,
    hipsRotZ: 0,
    hipsPosZ: 0,
    torsoRotX: 0.14,
    torsoRotY: 0.18,
    torsoRotZ: 0,
    chestRotX: 0,
    chestRotY: 0.08,
    headRotX: 0.16,
    headRotY: -0.1,
    headRotZ: 0,
    shL: [-0.85, 0.25, -0.22],
    elL: -1.78,
    wristLRotY: 0,
    shR: [-0.92, -0.22, 0.24],
    elR: -1.86,
    wristRRotY: 0,
    hipLRotX: -0.22,
    hipLRotZ: -0.1,
    kneeLRotX: 0.28,
    hipRRotX: 0.22,
    hipRRotZ: 0.1,
    kneeRRotX: 0.25,
    bodyCrunch: 0,
    blinkPhase: 0,
    blinkAmount: 0,
    impactFlash: 0,
  };
}

function createGloveGroup(
  gloveMat: THREE.Material,
  accentMat: THREE.Material,
  tapeMat: THREE.Material,
  isLeft: boolean
): THREE.Group {
  const g = new THREE.Group();

  const cuffGeo = new THREE.CylinderGeometry(0.056, 0.052, 0.095, 16);
  const cuff = new THREE.Mesh(cuffGeo, accentMat);
  cuff.position.y = -0.04;
  cuff.castShadow = true;
  g.add(cuff);

  const tapeGeo = new THREE.CylinderGeometry(0.058, 0.056, 0.032, 16);
  const tape = new THREE.Mesh(tapeGeo, tapeMat);
  tape.position.y = -0.078;
  g.add(tape);

  const pts = [
    new THREE.Vector2(0.001, -0.02),
    new THREE.Vector2(0.068, -0.01),
    new THREE.Vector2(0.089, 0.045),
    new THREE.Vector2(0.087, 0.112),
    new THREE.Vector2(0.064, 0.158),
    new THREE.Vector2(0.001, 0.172),
  ];
  const bodyGeo = new THREE.LatheGeometry(pts, 20);
  bodyGeo.scale(1.0, 1.0, 0.86);
  const body = new THREE.Mesh(bodyGeo, gloveMat);
  body.position.y = 0.01;
  body.castShadow = true;
  g.add(body);

  const knuckleGeo = new THREE.BoxGeometry(0.115, 0.038, 0.065);
  const knuckle = new THREE.Mesh(knuckleGeo, gloveMat);
  knuckle.position.set(0, 0.115, 0.038);
  g.add(knuckle);

  const thumbGeo = new THREE.CapsuleGeometry(0.027, 0.056, 6, 12);
  const thumb = new THREE.Mesh(thumbGeo, gloveMat);
  thumb.position.set(isLeft ? -0.066 : 0.066, 0.066, 0.034);
  thumb.rotation.set(0.35, 0, isLeft ? 0.35 : -0.35);
  thumb.castShadow = true;
  g.add(thumb);

  return g;
}

export function buildBoxerRig(appearance: BoxerAppearance): BoxerRig {
  const disposables: { dispose: () => void }[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    disposables.push(t);
    return t;
  };

  const weightCfg =
    WEIGHT_CLASSES.find((w) => w.id === appearance.weightClass) || WEIGHT_CLASSES[1];
  const baseScale = weightCfg.scaleFactor * appearance.heightScale;
  const muscle = appearance.muscleMass;
  const shoulderW = appearance.shoulderWidth;
  const reach = appearance.reachScale;

  const root = new THREE.Group();
  root.scale.set(baseScale, baseScale, baseScale);

  const leatherBump = trackTex(createLeatherNormalRoughnessMap());
  const skinBump = trackTex(createSkinBumpTexture());

  const skinMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(appearance.skinTone),
      roughness: 0.54,
      metalness: 0.02,
      bumpMap: skinBump,
      bumpScale: 0.0022,
      clearcoat: 0.16,
      clearcoatRoughness: 0.4,
      sheen: 0.18,
      sheenRoughness: 0.65,
      sheenColor: new THREE.Color('#fca5a5'),
    })
  );

  const hairMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(appearance.hairColor),
      roughness: 0.88,
      metalness: 0.02,
    })
  );

  const trunksMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(appearance.trunksColor),
      roughness: appearance.trunksPattern === 'metallic' ? 0.25 : 0.4,
      metalness: appearance.trunksPattern === 'metallic' ? 0.72 : 0.15,
      sheen: 0.7,
      sheenRoughness: 0.35,
      sheenColor: new THREE.Color(appearance.trunksAccent),
    })
  );

  const trunksAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(appearance.trunksAccent),
      roughness: 0.28,
      metalness: 0.68,
    })
  );

  const gloveRoughness =
    appearance.gloveFinish === 'matte'
      ? 0.62
      : appearance.gloveFinish === 'glossy'
        ? 0.22
        : 0.2;
  const gloveMetalness = appearance.gloveFinish === 'metallic' ? 0.75 : 0.08;

  const gloveMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(appearance.gloveColor),
      roughness: gloveRoughness,
      metalness: gloveMetalness,
      bumpMap: leatherBump,
      bumpScale: 0.005,
      clearcoat: appearance.gloveFinish === 'glossy' ? 0.8 : 0.22,
      clearcoatRoughness: 0.22,
    })
  );

  const gloveAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(appearance.gloveAccent),
      roughness: 0.3,
      metalness: 0.6,
    })
  );

  const tapeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.86,
      metalness: 0.0,
    })
  );

  const bootsMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(appearance.bootsColor),
      roughness: 0.52,
      metalness: 0.14,
      bumpMap: leatherBump,
      bumpScale: 0.0035,
    })
  );

  const shadowTex = trackTex(createContactShadowTexture());
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(1.22, 1.22));
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.64,
    })
  );
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.012;
  root.add(contactShadow);

  // Impact flash overlay — brief white emissive flash on clean hits
  const flashGeo = trackGeo(new THREE.SphereGeometry(0.42, 10, 8));
  const flashMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const impactFlashMesh = new THREE.Mesh(flashGeo, flashMat);
  impactFlashMesh.position.y = 1.1;
  impactFlashMesh.visible = false;
  root.add(impactFlashMesh);

  const hips = new THREE.Group();
  hips.position.y = 0.94;
  root.add(hips);

  const trunksGeo = trackGeo(new THREE.CylinderGeometry(0.185 * muscle, 0.208 * muscle, 0.265, 22));
  trunksGeo.scale(1.1, 1, 0.82);
  const trunksMesh = new THREE.Mesh(trunksGeo, trunksMat);
  trunksMesh.position.y = -0.01;
  trunksMesh.castShadow = true;
  trunksMesh.receiveShadow = true;
  hips.add(trunksMesh);

  const waistBandGeo = trackGeo(new THREE.CylinderGeometry(0.193 * muscle, 0.193 * muscle, 0.088, 22));
  waistBandGeo.scale(1.1, 1, 0.82);
  const waistBand = new THREE.Mesh(waistBandGeo, trunksAccentMat);
  waistBand.position.y = 0.095;
  waistBand.castShadow = true;
  hips.add(waistBand);

  if (appearance.trunksPattern === 'championship') {
    const buckleGeo = trackGeo(new THREE.BoxGeometry(0.115, 0.072, 0.032));
    const buckle = new THREE.Mesh(buckleGeo, trunksAccentMat);
    buckle.position.set(0, 0.095, 0.158 * muscle);
    hips.add(buckle);
  }

  if (appearance.trunksPattern === 'stripe' || appearance.trunksPattern === 'championship') {
    const stripeGeo = trackGeo(new THREE.BoxGeometry(0.038, 0.245, 0.042));
    const stripeL = new THREE.Mesh(stripeGeo, trunksAccentMat);
    stripeL.position.set(-0.208 * muscle, -0.015, 0);
    const stripeR = new THREE.Mesh(stripeGeo, trunksAccentMat);
    stripeR.position.set(0.208 * muscle, -0.015, 0);
    hips.add(stripeL, stripeR);
  }

  const torso = new THREE.Group();
  torso.position.y = 0.12;
  hips.add(torso);

  const absGeo = trackGeo(new THREE.CylinderGeometry(0.192 * muscle, 0.165 * muscle, 0.225, 20));
  absGeo.scale(1.12, 1, 0.78);
  const absMesh = new THREE.Mesh(absGeo, skinMat);
  absMesh.position.y = 0.1;
  absMesh.castShadow = true;
  torso.add(absMesh);

  const abPlateGeo = trackGeo(new THREE.SphereGeometry(0.042 * muscle, 10, 8));
  abPlateGeo.scale(1.1, 0.8, 0.45);
  for (let row = 0; row < 2; row++) {
    const abL = new THREE.Mesh(abPlateGeo, skinMat);
    abL.position.set(-0.045 * muscle, 0.08 + row * 0.068, 0.132 * muscle);
    const abR = new THREE.Mesh(abPlateGeo, skinMat);
    abR.position.set(0.045 * muscle, 0.08 + row * 0.068, 0.132 * muscle);
    torso.add(abL, abR);
  }

  const ribBruiseMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      roughness: 0.6,
      transparent: true,
      opacity: 0,
    })
  );
  const ribGeo = trackGeo(new THREE.SphereGeometry(0.072 * muscle, 12, 10));
  ribGeo.scale(0.85, 1.15, 0.55);
  const ribBruiseMesh = new THREE.Mesh(ribGeo, ribBruiseMat);
  ribBruiseMesh.position.set(0.145 * muscle, 0.15, 0.085 * muscle);
  torso.add(ribBruiseMesh);

  const chest = new THREE.Group();
  chest.position.y = 0.21;
  torso.add(chest);

  const chestGeo = trackGeo(
    new THREE.CylinderGeometry(0.248 * shoulderW * muscle, 0.186 * muscle, 0.285, 22)
  );
  chestGeo.scale(1.14, 1, 0.76);
  const chestMesh = new THREE.Mesh(chestGeo, skinMat);
  chestMesh.position.y = 0.12;
  chestMesh.castShadow = true;
  chestMesh.receiveShadow = true;
  chest.add(chestMesh);

  const pecGeo = trackGeo(new THREE.SphereGeometry(0.108 * muscle, 16, 12));
  pecGeo.scale(1.12, 0.74, 0.66);
  const pecL = new THREE.Mesh(pecGeo, skinMat);
  pecL.position.set(-0.084 * shoulderW, 0.16, 0.116 * muscle);
  const pecR = new THREE.Mesh(pecGeo, skinMat);
  pecR.position.set(0.084 * shoulderW, 0.16, 0.116 * muscle);
  chest.add(pecL, pecR);

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.28;
  chest.add(headGroup);

  const neckGeo = trackGeo(new THREE.CylinderGeometry(0.068 * muscle, 0.086 * muscle, 0.115, 16));
  const neck = new THREE.Mesh(neckGeo, skinMat);
  neck.position.y = 0.04;
  neck.castShadow = true;
  headGroup.add(neck);

  const skullGeo = trackGeo(new THREE.SphereGeometry(0.115, 24, 18));
  skullGeo.scale(0.88, 1.06, 0.96);
  const skull = new THREE.Mesh(skullGeo, skinMat);
  skull.position.y = 0.175;
  skull.castShadow = true;
  headGroup.add(skull);

  const jawGeo = trackGeo(new THREE.BoxGeometry(0.125, 0.085, 0.135));
  const jaw = new THREE.Mesh(jawGeo, skinMat);
  jaw.position.set(0, 0.115, 0.025);
  jaw.castShadow = true;
  headGroup.add(jaw);

  const earGeo = trackGeo(new THREE.SphereGeometry(0.024, 10, 10));
  earGeo.scale(0.45, 1.15, 0.7);
  const earL = new THREE.Mesh(earGeo, skinMat);
  earL.position.set(-0.104, 0.175, -0.005);
  const earR = new THREE.Mesh(earGeo, skinMat);
  earR.position.set(0.104, 0.175, -0.005);
  headGroup.add(earL, earR);

  const noseGeo = trackGeo(new THREE.ConeGeometry(0.018, 0.048, 8));
  const nose = new THREE.Mesh(noseGeo, skinMat);
  nose.rotation.x = Math.PI * 0.42;
  nose.position.set(0, 0.165, 0.115);
  headGroup.add(nose);

  const browGeo = trackGeo(new THREE.BoxGeometry(0.126, 0.025, 0.034));
  const brow = new THREE.Mesh(browGeo, skinMat);
  brow.position.set(0, 0.2, 0.098);
  headGroup.add(brow);

  const scleraMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25 }));
  const irisMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15 }));
  const scleraGeo = trackGeo(new THREE.SphereGeometry(0.014, 10, 10));
  scleraGeo.scale(1.1, 0.75, 0.6);
  const irisGeo = trackGeo(new THREE.SphereGeometry(0.008, 8, 8));

  const eyeL = new THREE.Mesh(scleraGeo, scleraMat);
  eyeL.position.set(-0.036, 0.184, 0.1);
  const irisL = new THREE.Mesh(irisGeo, irisMat);
  irisL.position.set(-0.036, 0.184, 0.107);

  const eyeR = new THREE.Mesh(scleraGeo, scleraMat);
  eyeR.position.set(0.036, 0.184, 0.1);
  const irisR = new THREE.Mesh(irisGeo, irisMat);
  irisR.position.set(0.036, 0.184, 0.107);
  headGroup.add(eyeL, irisL, eyeR, irisR);

  const mouthguardMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3 }));
  const mouthguardGeo = trackGeo(new THREE.BoxGeometry(0.044, 0.012, 0.012));
  const mouthguard = new THREE.Mesh(mouthguardGeo, mouthguardMat);
  mouthguard.position.set(0, 0.122, 0.094);
  headGroup.add(mouthguard);

  if (appearance.hairStyle === 'buzz' || appearance.hairStyle === 'fade') {
    const capGeo = trackGeo(
      new THREE.SphereGeometry(0.118, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56)
    );
    capGeo.scale(0.89, 1.06, 0.97);
    const cap = new THREE.Mesh(capGeo, hairMat);
    cap.position.y = 0.178;
    headGroup.add(cap);
    if (appearance.hairStyle === 'fade') {
      const topGeo = trackGeo(new THREE.BoxGeometry(0.13, 0.042, 0.15));
      const top = new THREE.Mesh(topGeo, hairMat);
      top.position.set(0, 0.285, 0.005);
      headGroup.add(top);
    }
  } else if (appearance.hairStyle === 'mohawk') {
    const crestGeo = trackGeo(new THREE.BoxGeometry(0.042, 0.068, 0.18));
    const crest = new THREE.Mesh(crestGeo, hairMat);
    crest.position.set(0, 0.292, -0.01);
    headGroup.add(crest);
  } else if (appearance.hairStyle === 'braids') {
    for (let b = -2; b <= 2; b++) {
      const braidGeo = trackGeo(new THREE.CapsuleGeometry(0.016, 0.16, 4, 8));
      const braid = new THREE.Mesh(braidGeo, hairMat);
      braid.position.set(b * 0.03, 0.21, -0.075);
      braid.rotation.x = 0.52;
      headGroup.add(braid);
    }
  } else if (appearance.hairStyle === 'long') {
    const capGeo = trackGeo(
      new THREE.SphereGeometry(0.122, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62)
    );
    capGeo.scale(0.92, 1.08, 1.0);
    const cap = new THREE.Mesh(capGeo, hairMat);
    cap.position.y = 0.178;
    const backGeo = trackGeo(new THREE.CapsuleGeometry(0.075, 0.12, 6, 12));
    const back = new THREE.Mesh(backGeo, hairMat);
    back.position.set(0, 0.12, -0.082);
    headGroup.add(cap, back);
  }

  if (appearance.facialHair === 'stubble') {
    const stubMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(appearance.hairColor),
        roughness: 0.9,
        transparent: true,
        opacity: 0.45,
      })
    );
    const stubGeo = trackGeo(new THREE.BoxGeometry(0.128, 0.06, 0.138));
    const stub = new THREE.Mesh(stubGeo, stubMat);
    stub.position.set(0, 0.105, 0.028);
    headGroup.add(stub);
  } else if (appearance.facialHair === 'goatee') {
    const goatGeo = trackGeo(new THREE.BoxGeometry(0.068, 0.065, 0.048));
    const goat = new THREE.Mesh(goatGeo, hairMat);
    goat.position.set(0, 0.098, 0.088);
    headGroup.add(goat);
  } else if (appearance.facialHair === 'full_beard') {
    const beardGeo = trackGeo(new THREE.BoxGeometry(0.135, 0.095, 0.145));
    const beard = new THREE.Mesh(beardGeo, hairMat);
    beard.position.set(0, 0.098, 0.032);
    headGroup.add(beard);
  }

  if (appearance.hasScar) {
    const scarMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.7 })
    );
    const scarGeo = trackGeo(new THREE.BoxGeometry(0.038, 0.008, 0.01));
    const scar = new THREE.Mesh(scarGeo, scarMat);
    scar.position.set(0.045, 0.185, 0.112);
    scar.rotation.z = -0.35;
    headGroup.add(scar);
  }

  const browCutMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      roughness: 0.3,
      transparent: true,
      opacity: 0,
    })
  );
  const browCutGeo = trackGeo(new THREE.BoxGeometry(0.048, 0.014, 0.016));
  const browCutMesh = new THREE.Mesh(browCutGeo, browCutMat);
  browCutMesh.position.set(-0.04, 0.205, 0.112);
  browCutMesh.rotation.z = 0.25;
  headGroup.add(browCutMesh);

  const bloodTrickleGeo = trackGeo(new THREE.BoxGeometry(0.009, 0.055, 0.012));
  const bloodTrickleMesh = new THREE.Mesh(bloodTrickleGeo, browCutMat);
  bloodTrickleMesh.position.set(-0.048, 0.175, 0.11);
  headGroup.add(bloodTrickleMesh);

  const cheekBruiseMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4c1d95,
      roughness: 0.7,
      transparent: true,
      opacity: 0,
    })
  );
  const cheekGeo = trackGeo(new THREE.SphereGeometry(0.036, 10, 10));
  cheekGeo.scale(1.15, 0.85, 0.48);
  const cheekBruiseMesh = new THREE.Mesh(cheekGeo, cheekBruiseMat);
  cheekBruiseMesh.position.set(0.054, 0.145, 0.098);
  headGroup.add(cheekBruiseMesh);

  // Arms + Subtle Kinetic Punch Trail Streaks
  const armLen = 0.27 * reach;
  const forearmLen = 0.25 * reach;

  const trailGeo = trackGeo(new THREE.ConeGeometry(0.068, 0.36, 10, 1, true));
  trailGeo.translate(0, -0.18, 0);

  const buildArm = (isLeft: boolean) => {
    const sign = isLeft ? -1 : 1;
    const shoulder = new THREE.Group();
    shoulder.position.set(sign * 0.278 * shoulderW * muscle, 0.22, 0);
    chest.add(shoulder);

    const deltGeo = trackGeo(new THREE.SphereGeometry(0.074 * muscle, 14, 12));
    const delt = new THREE.Mesh(deltGeo, skinMat);
    delt.castShadow = true;
    shoulder.add(delt);

    const upperArmGeo = trackGeo(
      new THREE.CapsuleGeometry(0.055 * muscle, armLen - 0.06, 6, 12)
    );
    const upperArm = new THREE.Mesh(upperArmGeo, skinMat);
    upperArm.position.y = -armLen * 0.5;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.y = -armLen;
    shoulder.add(elbow);

    const forearmGeo = trackGeo(
      new THREE.CapsuleGeometry(0.046 * muscle, forearmLen - 0.06, 6, 12)
    );
    const forearm = new THREE.Mesh(forearmGeo, skinMat);
    forearm.position.y = -forearmLen * 0.5;
    forearm.castShadow = true;
    elbow.add(forearm);

    const glove = createGloveGroup(gloveMat, gloveAccentMat, tapeMat, isLeft);
    glove.traverse((obj) => {
      if (obj instanceof THREE.Mesh) trackGeo(obj.geometry);
    });
    glove.position.y = -forearmLen - 0.02;
    glove.rotation.x = Math.PI;
    elbow.add(glove);

    const trailMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfef3c7,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );
    const trail = new THREE.Mesh(trailGeo, trailMat);
    trail.position.y = 0.06;
    trail.visible = false;
    glove.add(trail);

    return { shoulder, elbow, glove, trail };
  };

  const leftArm = buildArm(true);
  const rightArm = buildArm(false);

  const buildLeg = (isLeft: boolean) => {
    const sign = isLeft ? -1 : 1;
    const hip = new THREE.Group();
    hip.position.set(sign * 0.115 * muscle, -0.06, 0);
    hips.add(hip);

    const thighGeo = trackGeo(new THREE.CapsuleGeometry(0.083 * muscle, 0.34, 8, 14));
    const thigh = new THREE.Mesh(thighGeo, skinMat);
    thigh.position.y = -0.21;
    thigh.castShadow = true;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.43;
    hip.add(knee);

    const calfGeo = trackGeo(new THREE.CapsuleGeometry(0.061 * muscle, 0.25, 6, 12));
    const calf = new THREE.Mesh(calfGeo, skinMat);
    calf.position.y = -0.17;
    calf.castShadow = true;
    knee.add(calf);

    const bootShaftGeo = trackGeo(new THREE.CylinderGeometry(0.057, 0.052, 0.175, 14));
    const bootShaft = new THREE.Mesh(bootShaftGeo, bootsMat);
    bootShaft.position.y = -0.34;
    bootShaft.castShadow = true;
    knee.add(bootShaft);

    const collarGeo = trackGeo(new THREE.TorusGeometry(0.056, 0.01, 6, 14));
    const collar = new THREE.Mesh(collarGeo, trunksAccentMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = -0.255;
    knee.add(collar);

    const soleGeo = trackGeo(new THREE.BoxGeometry(0.102, 0.055, 0.225));
    const sole = new THREE.Mesh(soleGeo, bootsMat);
    sole.position.set(0, -0.43, 0.045);
    sole.castShadow = true;
    knee.add(sole);

    return { hip, knee };
  };

  const leftLeg = buildLeg(true);
  const rightLeg = buildLeg(false);

  return {
    root,
    hips,
    torso,
    chest,
    headGroup,
    shoulderL: leftArm.shoulder,
    elbowL: leftArm.elbow,
    gloveL: leftArm.glove,
    trailL: leftArm.trail,
    shoulderR: rightArm.shoulder,
    elbowR: rightArm.elbow,
    gloveR: rightArm.glove,
    trailR: rightArm.trail,
    hipL: leftLeg.hip,
    kneeL: leftLeg.knee,
    hipR: rightLeg.hip,
    kneeR: rightLeg.knee,
    contactShadow,
    browCutMesh,
    bloodTrickleMesh,
    cheekBruiseMesh,
    ribBruiseMesh,
    impactFlashMesh,
    skinMaterial: skinMat,
    gloveMaterial: gloveMat,
    anim: createInitialAnimState(),
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

function easeOutQuint(x: number): number {
  return 1 - Math.pow(1 - THREE.MathUtils.clamp(x, 0, 1), 4);
}

function easeInOutQuad(x: number): number {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function poseBoxer(rig: BoxerRig, p: BoxerPoseParams): void {
  const dt = Math.min(p.dt ?? 0.016, 0.05);
  const a = rig.anim;
  const mirror = p.stance === 'southpaw' ? -1 : 1;
  const staminaRatio = p.staminaRatio ?? 1;
  const fatigueAmp = 1 + (1 - staminaRatio) * 1.4;

  // Skin sweat & trauma overlays
  rig.skinMaterial.roughness = THREE.MathUtils.lerp(0.54, 0.2, p.sweatLevel);
  rig.skinMaterial.clearcoat = THREE.MathUtils.lerp(0.16, 0.74, p.sweatLevel);

  // Impact flash
  const flashTarget = p.impactFlashIntensity ?? 0;
  a.impactFlash = flashTarget > a.impactFlash
    ? flashTarget
    : THREE.MathUtils.damp(a.impactFlash, 0, 18, dt);
  if (a.impactFlash > 0.02) {
    rig.impactFlashMesh.visible = true;
    (rig.impactFlashMesh.material as THREE.MeshBasicMaterial).opacity = a.impactFlash * 0.38;
  } else {
    rig.impactFlashMesh.visible = false;
  }

  // Eye blink (organic rhythm: fast close, slow open)
  a.blinkPhase += dt * (0.55 + Math.random() * 0.08);
  const blinkCycle = Math.sin(a.blinkPhase * 0.72) * Math.sin(a.blinkPhase * 1.13);
  const blinkTrigger = blinkCycle > 0.88;
  const blinkTarget = blinkTrigger ? 1 : 0;
  a.blinkAmount = THREE.MathUtils.damp(a.blinkAmount, blinkTarget, blinkTrigger ? 48 : 12, dt);
  (rig.browCutMesh.material as THREE.MeshStandardMaterial).opacity = THREE.MathUtils.clamp(
    p.browDamage,
    0,
    0.94
  );
  rig.bloodTrickleMesh.visible = p.browDamage > 0.42;
  (rig.cheekBruiseMesh.material as THREE.MeshStandardMaterial).opacity = THREE.MathUtils.clamp(
    p.jawDamage * 0.85,
    0,
    0.85
  );
  cheekUpdate(rig.cheekBruiseMesh, p.jawDamage);
  (rig.ribBruiseMesh.material as THREE.MeshStandardMaterial).opacity = THREE.MathUtils.clamp(
    (p.ribDamage ?? 0) * 0.75,
    0,
    0.72
  );

  // Knockdown animation (smoothly interpolated fall to canvas)
  if (p.knockdownProgress > 0.001) {
    rig.trailL.visible = false;
    rig.trailR.visible = false;
    const kd = THREE.MathUtils.smoothstep(p.knockdownProgress, 0, 1);
    rig.hips.position.set(0, THREE.MathUtils.lerp(a.hipsY, 0.19, kd), 0);
    rig.hips.rotation.set(
      THREE.MathUtils.lerp(a.hipsRotX, -Math.PI * 0.47, kd),
      0,
      THREE.MathUtils.lerp(a.hipsRotZ, 0.14 * mirror, kd)
    );
    rig.torso.rotation.set(0.15 * kd, 0, 0);
    rig.headGroup.rotation.set(-0.3 * kd, 0.35 * kd, 0);
    rig.shoulderL.rotation.set(-0.4, 0, -0.8 * kd);
    rig.elbowL.rotation.set(-0.4, 0, 0);
    rig.shoulderR.rotation.set(-0.4, 0, 0.8 * kd);
    rig.elbowR.rotation.set(-0.4, 0, 0);
    rig.hipL.rotation.set(0.25 * kd, 0, -0.15 * kd);
    rig.kneeL.rotation.set(0.2 * kd, 0, 0);
    rig.hipR.rotation.set(0.1 * kd, 0, 0.15 * kd);
    rig.kneeR.rotation.set(0.15 * kd, 0, 0);
    return;
  }

  // Rhythmic boxer pendulum bounce & realistic footwork stride
  a.stepPhase += dt * (2.6 + p.moveSpeedNorm * 8.5);
  const strideSin = Math.sin(a.stepPhase) * p.moveSpeedNorm;
  const idleBob = Math.sin(p.elapsed * 5.0) * 0.016;
  const breathe = Math.sin(p.elapsed * (2.8 * fatigueAmp)) * (0.024 * fatigueAmp);

  // Target base stance
  let tHipsY = 0.91 + idleBob + Math.abs(strideSin) * 0.018 - p.guardLow * 0.11;
  let tHipsRotX = 0.06;
  let tHipsRotY = -0.3 * mirror;
  let tHipsRotZ = 0;
  let tHipsPosZ = 0;

  // Bob-and-weave U-dip during slip
  const weaveDip = Math.abs(p.slipX) * 0.12;
  tHipsY -= weaveDip;

  let tHipLRotX = -0.24 * mirror - p.guardLow * 0.25 + strideSin * 0.26;
  let tKneeLRotX = 0.3 + p.guardLow * 0.35 + Math.max(0, -strideSin) * 0.22;
  let tHipRRotX = 0.24 * mirror - p.guardLow * 0.25 - strideSin * 0.26;
  let tKneeRRotX = 0.28 + p.guardLow * 0.35 + Math.max(0, strideSin) * 0.22;

  // Directional Hit Recoil Physics
  let bodyCrunchTarget = 0;
  let headSnapX = 0;
  let headSnapY = 0;
  let headSnapZ = 0;
  if (Math.abs(p.hitRecoilX) > 0.02 || Math.abs(p.hitRecoilY) > 0.02) {
    if (p.hitDir === 'body') {
      bodyCrunchTarget = Math.min(0.62, Math.abs(p.hitRecoilY) * 0.55);
      headSnapX = 0.32;
    } else if (p.hitDir === 'up') {
      headSnapX = -0.82 * Math.abs(p.hitRecoilY);
      tHipsY += 0.04;
    } else if (p.hitDir === 'left') {
      headSnapY = 0.58;
      headSnapZ = 0.35;
    } else if (p.hitDir === 'right') {
      headSnapY = -0.58;
      headSnapZ = -0.35;
    } else {
      headSnapX = -p.hitRecoilY * 0.65;
      headSnapY = p.hitRecoilX * 0.42;
    }
  }

  const slipAngleZ = -p.slipX * 0.46;
  let tTorsoRotX =
    0.15 +
    Math.abs(p.slipX) * 0.2 +
    p.guardLow * 0.24 +
    p.leanZ * 0.16 +
    bodyCrunchTarget -
    p.hitRecoilY * 0.2;
  let tTorsoRotY = 0.18 * mirror + p.slipX * 0.24;
  let tTorsoRotZ = slipAngleZ + p.hitRecoilX * 0.22;

  let tChestRotX = breathe;
  let tChestRotY = 0.08 * mirror;

  let tHeadRotX = 0.18 + headSnapX;
  let tHeadRotY = -0.1 * mirror + headSnapY;
  let tHeadRotZ = -slipAngleZ * 0.48 + headSnapZ;

  // Default tight cheek-level guard + fatigue droop
  const droop = (1 - staminaRatio) * 0.14;
  let tShL: [number, number, number] = [
    -0.88 - p.guardHigh * 0.42 + droop,
    0.26,
    -0.2 + p.guardHigh * 0.22,
  ];
  let tElL = -1.82 - p.guardHigh * 0.32 + droop * 1.3;
  let tWristL = 0;

  let tShR: [number, number, number] = [
    -0.96 - p.guardHigh * 0.42 + droop,
    -0.24,
    0.22 - p.guardHigh * 0.22,
  ];
  let tElR = -1.92 - p.guardHigh * 0.3 + droop * 1.3;
  let tWristR = 0;

  // Guard Broken Stagger
  if (p.guardBroken) {
    tShL = [-0.45, 0.1, -0.72];
    tElL = -0.5;
    tShR = [-0.45, -0.1, 0.72];
    tElR = -0.5;
    tTorsoRotX -= 0.22;
  }

  // Clinch
  if ((p.clinchAmount ?? 0) > 0.05) {
    const cl = p.clinchAmount!;
    tShL = [
      THREE.MathUtils.lerp(tShL[0], -1.32, cl),
      0.2,
      THREE.MathUtils.lerp(tShL[2], 0.3, cl),
    ];
    tElL = THREE.MathUtils.lerp(tElL, -1.08, cl);
    tShR = [
      THREE.MathUtils.lerp(tShR[0], -1.32, cl),
      -0.2,
      THREE.MathUtils.lerp(tShR[2], -0.3, cl),
    ];
    tElR = THREE.MathUtils.lerp(tElR, -1.08, cl);
  }

  // Sharp Shoulder Feint
  if ((p.feintAmount ?? 0) > 0.05) {
    const f = Math.sin(p.feintAmount! * Math.PI);
    tShL[0] -= 0.42 * f;
    tElL += 0.62 * f;
    tTorsoRotX += 0.14 * f;
    tHipsPosZ += 0.06 * f;
  }

  // Victory Pose
  if (p.victoryRaise > 0.01) {
    const v = p.victoryRaise;
    tShL = [THREE.MathUtils.lerp(tShL[0], -2.6, v), 0.15, THREE.MathUtils.lerp(tShL[2], -0.35, v)];
    tElL = THREE.MathUtils.lerp(tElL, -0.3, v);
    tShR = [THREE.MathUtils.lerp(tShR[0], -2.6, v), -0.15, THREE.MathUtils.lerp(tShR[2], 0.35, v)];
    tElR = THREE.MathUtils.lerp(tElR, -0.3, v);
  }

  // Full Kinetic-Chain Punch Animations & Motion Streaks
  let showTrailL = false;
  let showTrailR = false;
  let trailOpacity = 0;

  if (p.activePunch && p.punchPhase !== 'none') {
    const t = p.punchProgress;
    let curve = 0;
    let windupRecoil = 0;
    if (p.punchPhase === 'windup') {
      windupRecoil = easeInOutQuad(t);
      curve = -0.18 * windupRecoil;
    } else if (p.punchPhase === 'strike') {
      curve = easeOutQuint(t);
    } else if (p.punchPhase === 'recover') {
      curve = 1 - easeInOutQuad(t);
    }

    const isLead = p.activePunch === 'jab' || p.activePunch === 'hook_l';
    const isLeftArm = p.stance === 'orthodox' ? isLead : !isLead;

    if (p.punchPhase === 'strike') {
      const trailStrength = p.activePunch === 'jab' ? 0.22 : 0.42;
      trailOpacity = Math.sin(t * Math.PI) * trailStrength;
      if (p.activePunch === 'hook_l' || p.activePunch === 'body_hook') showTrailL = true;
      else if (p.activePunch === 'hook_r') showTrailR = true;
      else if (isLeftArm) showTrailL = true;
      else showTrailR = true;
    }

    if (p.activePunch === 'jab') {
      // Snappy jab + lead foot step + chin tuck behind shoulder + rear glove tight on jaw
      tHipsPosZ += 0.09 * curve;
      tHipLRotX -= 0.14 * curve;
      tTorsoRotY -= 0.22 * curve * mirror;
      tChestRotY += 0.32 * curve * mirror;
      tHeadRotX += 0.12 * curve; // tuck chin
      if (isLeftArm) {
        tShL = [
          THREE.MathUtils.lerp(tShL[0], -1.56, curve),
          THREE.MathUtils.lerp(tShL[1], 0.12, curve),
          THREE.MathUtils.lerp(tShL[2], 0.16, curve),
        ];
        tElL = THREE.MathUtils.lerp(tElL, -0.06, curve);
        tWristL = 1.15 * curve; // fist pronation twist
        // Rear arm stays tight protecting chin
        tShR = [-1.28, -0.26, 0.14];
        tElR = -2.18;
      } else {
        tShR = [
          THREE.MathUtils.lerp(tShR[0], -1.56, curve),
          THREE.MathUtils.lerp(tShR[1], -0.12, curve),
          THREE.MathUtils.lerp(tShR[2], -0.16, curve),
        ];
        tElR = THREE.MathUtils.lerp(tElR, -0.06, curve);
        tWristR = -1.15 * curve;
        tShL = [-1.28, 0.26, -0.14];
        tElL = -2.18;
      }
    } else if (p.activePunch === 'cross') {
      // Full hip pivot, back-leg drive, deep torso rotation, forward weight transfer
      tHipsPosZ += 0.16 * curve;
      tHipsRotY += 0.55 * curve * mirror;
      tTorsoRotY -= 0.62 * curve * mirror;
      tTorsoRotX += 0.18 * curve;
      tChestRotY -= 0.38 * curve * mirror;
      tHipRRotX += 0.28 * curve * mirror;
      tKneeRRotX += 0.25 * curve;
      tHeadRotX += 0.14 * curve;
      if (isLeftArm) {
        tShL = [
          THREE.MathUtils.lerp(tShL[0], -1.58, curve),
          0.08,
          THREE.MathUtils.lerp(tShL[2], 0.22, curve),
        ];
        tElL = THREE.MathUtils.lerp(tElL, -0.05, curve);
        tWristL = 1.35 * curve;
        tShR = [-1.28, -0.25, 0.16];
        tElR = -2.2;
      } else {
        tShR = [
          THREE.MathUtils.lerp(tShR[0], -1.58, curve),
          -0.08,
          THREE.MathUtils.lerp(tShR[2], -0.22, curve),
        ];
        tElR = THREE.MathUtils.lerp(tElR, -0.05, curve);
        tWristR = -1.35 * curve;
        tShL = [-1.28, 0.25, -0.16];
        tElL = -2.2;
      }
    } else if (p.activePunch === 'hook_l' || p.activePunch === 'hook_r') {
      const hookLeft = p.activePunch === 'hook_l';
      const dir = hookLeft ? 1 : -1;
      // Anticipation twists torso back during windup, then whips horizontally
      tHipsRotY -= 0.32 * dir * curve;
      tTorsoRotY -= 0.58 * dir * curve;
      tTorsoRotZ += 0.18 * dir * curve;
      tHipsPosZ += 0.08 * curve;
      if (hookLeft) {
        tShL = [
          THREE.MathUtils.lerp(tShL[0], -1.48, curve),
          THREE.MathUtils.lerp(tShL[1], 1.12, curve),
          THREE.MathUtils.lerp(tShL[2], -0.88, curve),
        ];
        tElL = THREE.MathUtils.lerp(tElL, -1.48, curve);
        tWristL = 1.2 * curve;
        tShR = [-1.32, -0.26, 0.14];
        tElR = -2.22;
      } else {
        tShR = [
          THREE.MathUtils.lerp(tShR[0], -1.48, curve),
          THREE.MathUtils.lerp(tShR[1], -1.12, curve),
          THREE.MathUtils.lerp(tShR[2], 0.88, curve),
        ];
        tElR = THREE.MathUtils.lerp(tElR, -1.48, curve);
        tWristR = -1.2 * curve;
        tShL = [-1.32, 0.26, -0.14];
        tElL = -2.22;
      }
    } else if (p.activePunch === 'uppercut') {
      // Drop knees & load hips on windup, explode upward through torso & fist
      const dip = p.punchPhase === 'windup' ? 0.16 * windupRecoil : -0.06 * curve;
      tHipsY -= dip;
      tKneeLRotX += dip * 1.8;
      tKneeRRotX += dip * 1.8;
      tHipsPosZ += 0.12 * curve;
      tTorsoRotX -= 0.26 * curve;
      tTorsoRotY -= 0.42 * curve * mirror;
      if (isLeftArm) {
        tShL = [
          THREE.MathUtils.lerp(tShL[0], -1.32, curve),
          0.12,
          THREE.MathUtils.lerp(tShL[2], 0.18, curve),
        ];
        tElL = THREE.MathUtils.lerp(tElL, -1.52, curve);
        tWristL = -0.8 * curve;
        tShR = [-1.3, -0.24, 0.15];
        tElR = -2.2;
      } else {
        tShR = [
          THREE.MathUtils.lerp(tShR[0], -1.32, curve),
          -0.12,
          THREE.MathUtils.lerp(tShR[2], -0.18, curve),
        ];
        tElR = THREE.MathUtils.lerp(tElR, -1.52, curve);
        tWristR = 0.8 * curve;
        tShL = [-1.3, 0.24, -0.15];
        tElL = -2.2;
      }
    } else if (p.activePunch === 'body_hook') {
      // Level change crouch via knee bend + ripping liver hook
      tHipsY -= 0.19 * Math.abs(curve);
      tKneeLRotX += 0.42 * Math.abs(curve);
      tKneeRRotX += 0.42 * Math.abs(curve);
      tTorsoRotX += 0.36 * curve;
      tTorsoRotY -= 0.45 * curve;
      tHipsPosZ += 0.12 * curve;
      tShL = [
        THREE.MathUtils.lerp(tShL[0], -0.94, curve),
        THREE.MathUtils.lerp(tShL[1], 0.92, curve),
        THREE.MathUtils.lerp(tShL[2], -0.62, curve),
      ];
      tElL = THREE.MathUtils.lerp(tElL, -1.36, curve);
      tWristL = 0.9 * curve;
      tShR = [-1.32, -0.26, 0.15];
      tElR = -2.22;
    } else if (p.activePunch === 'overhand') {
      // Rear-hand looping overhand that arcs OVER the guard from wide-high to jaw
      // Hip/torso load back during windup, then explosively uncoil with shoulder dropping
      tHipsRotY += 0.52 * curve * mirror;
      tTorsoRotY -= 0.72 * curve * mirror;
      tTorsoRotX += 0.12 * curve;
      tTorsoRotZ += 0.26 * curve * mirror;
      tHipsPosZ += 0.14 * curve;
      tHipRRotX += 0.32 * curve * mirror;
      tKneeRRotX += 0.28 * curve;
      tHeadRotX += 0.16 * curve; // chin tuck under arm
      if (isLeftArm) {
        // Southpaw overhand (left rear hand)
        tShL = [
          THREE.MathUtils.lerp(tShL[0], -1.44, curve),
          THREE.MathUtils.lerp(tShL[1], 1.05, curve),
          THREE.MathUtils.lerp(tShL[2], -1.08, curve), // wide arc from outside
        ];
        tElL = THREE.MathUtils.lerp(tElL, -0.72, curve); // elbow stays bent — arc motion
        tWristL = 1.0 * curve;
        tShR = [-1.28, -0.25, 0.14];
        tElR = -2.2;
      } else {
        // Orthodox overhand (right rear hand)
        tShR = [
          THREE.MathUtils.lerp(tShR[0], -1.44, curve),
          THREE.MathUtils.lerp(tShR[1], -1.05, curve),
          THREE.MathUtils.lerp(tShR[2], 1.08, curve), // wide arc from outside
        ];
        tElR = THREE.MathUtils.lerp(tElR, -0.72, curve);
        tWristR = -1.0 * curve;
        tShL = [-1.28, 0.25, -0.14];
        tElL = -2.2;
      }
      // Trail follows same side as the punch arm
      if (p.punchPhase === 'strike') {
        trailOpacity = Math.sin(curve * Math.PI) * 0.55;
        if (isLeftArm) showTrailL = true;
        else showTrailR = true;
      }
    }
  }

  // Smooth exponential damping across all joints (snappy strike vs fluid stance)
  const armLambda = p.punchPhase === 'strike' ? 38 : p.punchPhase === 'windup' ? 28 : 18;
  const bodyLambda = p.punchPhase === 'strike' ? 28 : 16;

  a.hipsY = THREE.MathUtils.damp(a.hipsY, tHipsY, bodyLambda, dt);
  a.hipsRotX = THREE.MathUtils.damp(a.hipsRotX, tHipsRotX, bodyLambda, dt);
  a.hipsRotY = THREE.MathUtils.damp(a.hipsRotY, tHipsRotY, bodyLambda, dt);
  a.hipsRotZ = THREE.MathUtils.damp(a.hipsRotZ, tHipsRotZ, bodyLambda, dt);
  a.hipsPosZ = THREE.MathUtils.damp(a.hipsPosZ, tHipsPosZ, bodyLambda, dt);

  a.torsoRotX = THREE.MathUtils.damp(a.torsoRotX, tTorsoRotX, bodyLambda, dt);
  a.torsoRotY = THREE.MathUtils.damp(a.torsoRotY, tTorsoRotY, bodyLambda, dt);
  a.torsoRotZ = THREE.MathUtils.damp(a.torsoRotZ, tTorsoRotZ, bodyLambda, dt);

  a.chestRotX = THREE.MathUtils.damp(a.chestRotX, tChestRotX, bodyLambda, dt);
  a.chestRotY = THREE.MathUtils.damp(a.chestRotY, tChestRotY, bodyLambda, dt);

  a.headRotX = THREE.MathUtils.damp(a.headRotX, tHeadRotX, 24, dt);
  a.headRotY = THREE.MathUtils.damp(a.headRotY, tHeadRotY, 24, dt);
  a.headRotZ = THREE.MathUtils.damp(a.headRotZ, tHeadRotZ, 24, dt);

  a.shL[0] = THREE.MathUtils.damp(a.shL[0], tShL[0], armLambda, dt);
  a.shL[1] = THREE.MathUtils.damp(a.shL[1], tShL[1], armLambda, dt);
  a.shL[2] = THREE.MathUtils.damp(a.shL[2], tShL[2], armLambda, dt);
  a.elL = THREE.MathUtils.damp(a.elL, tElL, armLambda, dt);
  a.wristLRotY = THREE.MathUtils.damp(a.wristLRotY, tWristL, armLambda, dt);

  a.shR[0] = THREE.MathUtils.damp(a.shR[0], tShR[0], armLambda, dt);
  a.shR[1] = THREE.MathUtils.damp(a.shR[1], tShR[1], armLambda, dt);
  a.shR[2] = THREE.MathUtils.damp(a.shR[2], tShR[2], armLambda, dt);
  a.elR = THREE.MathUtils.damp(a.elR, tElR, armLambda, dt);
  a.wristRRotY = THREE.MathUtils.damp(a.wristRRotY, tWristR, armLambda, dt);

  a.hipLRotX = THREE.MathUtils.damp(a.hipLRotX, tHipLRotX, 16, dt);
  a.kneeLRotX = THREE.MathUtils.damp(a.kneeLRotX, tKneeLRotX, 16, dt);
  a.hipRRotX = THREE.MathUtils.damp(a.hipRRotX, tHipRRotX, 16, dt);
  a.kneeRRotX = THREE.MathUtils.damp(a.kneeRRotX, tKneeRRotX, 16, dt);

  // Apply smoothed transforms to hierarchy
  rig.hips.position.set(0, a.hipsY, a.hipsPosZ);
  rig.hips.rotation.set(a.hipsRotX, a.hipsRotY, a.hipsRotZ);
  rig.torso.rotation.set(a.torsoRotX, a.torsoRotY, a.torsoRotZ);
  rig.chest.rotation.set(a.chestRotX, a.chestRotY, 0);
  rig.headGroup.rotation.set(a.headRotX, a.headRotY, a.headRotZ);

  rig.shoulderL.rotation.set(a.shL[0], a.shL[1], a.shL[2]);
  rig.elbowL.rotation.set(a.elL, 0, 0);
  rig.gloveL.rotation.set(Math.PI, a.wristLRotY, 0);

  rig.shoulderR.rotation.set(a.shR[0], a.shR[1], a.shR[2]);
  rig.elbowR.rotation.set(a.elR, 0, 0);
  rig.gloveR.rotation.set(Math.PI, a.wristRRotY, 0);

  rig.hipL.rotation.set(a.hipLRotX, 0, a.hipLRotZ);
  rig.kneeL.rotation.set(a.kneeLRotX, 0, 0);
  rig.hipR.rotation.set(a.hipRRotX, 0, a.hipRRotZ);
  rig.kneeR.rotation.set(a.kneeRRotX, 0, 0);

  // Update kinetic punch trails with per-punch-type color tinting
  const trailColor =
    p.activePunch === 'overhand' ? 0xff6b35 :   // orange-red for overhand
    p.activePunch === 'uppercut' ? 0xffd700 :   // gold for uppercut
    p.activePunch === 'body_hook' ? 0x38bdf8 :  // cyan for body shots
    p.activePunch === 'hook_l' || p.activePunch === 'hook_r' ? 0xff4466 : // pink-red for hooks
    0xfef3c7;                                   // warm white default

  if (rig.trailL.visible !== (showTrailL && trailOpacity > 0.03)) {
    rig.trailL.visible = showTrailL && trailOpacity > 0.03;
  }
  if (rig.trailL.visible) {
    const matL = rig.trailL.material as THREE.MeshBasicMaterial;
    matL.color.setHex(trailColor);
    matL.opacity = trailOpacity;
  }
  if (rig.trailR.visible !== (showTrailR && trailOpacity > 0.03)) {
    rig.trailR.visible = showTrailR && trailOpacity > 0.03;
  }
  if (rig.trailR.visible) {
    const matR = rig.trailR.material as THREE.MeshBasicMaterial;
    matR.color.setHex(trailColor);
    matR.opacity = trailOpacity;
  }
}

function cheekUpdate(mesh: THREE.Mesh, jawDamage: number): void {
  mesh.scale.setScalar(1 + jawDamage * 0.35);
}

export interface RefereeRig {
  root: THREE.Group;
  body: THREE.Group;
  armR: THREE.Group;
  dispose: () => void;
}

export function buildRefereeRig(): RefereeRig {
  const disposables: { dispose: () => void }[] = [];
  const tGeo = <T extends THREE.BufferGeometry>(g: T): T => { disposables.push(g); return g; };
  const tMat = <T extends THREE.Material>(m: T): T => { disposables.push(m); return m; };

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.92;
  root.add(body);

  const shirtMat = tMat(new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.72 }));
  const slacksMat = tMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.78 }));
  const skinMat = tMat(new THREE.MeshStandardMaterial({ color: 0xd19a72, roughness: 0.55 }));
  const tieMat = tMat(new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 }));

  [-0.1, 0.1].forEach((x) => {
    const leg = new THREE.Mesh(tGeo(new THREE.CapsuleGeometry(0.065, 0.68, 6, 10)), slacksMat);
    leg.position.set(x, -0.45, 0);
    leg.castShadow = true;
    body.add(leg);
  });

  const torso = new THREE.Mesh(tGeo(new THREE.CylinderGeometry(0.18, 0.15, 0.5, 14)), shirtMat);
  torso.position.y = 0.24;
  torso.castShadow = true;
  body.add(torso);

  const bow = new THREE.Mesh(tGeo(new THREE.BoxGeometry(0.07, 0.03, 0.025)), tieMat);
  bow.position.set(0, 0.48, 0.14);
  body.add(bow);

  const head = new THREE.Mesh(tGeo(new THREE.SphereGeometry(0.105, 16, 14)), skinMat);
  head.position.y = 0.62;
  head.castShadow = true;
  body.add(head);

  const armL = new THREE.Mesh(tGeo(new THREE.CapsuleGeometry(0.042, 0.42, 6, 10)), shirtMat);
  armL.position.set(-0.22, 0.22, 0.04);
  armL.rotation.x = -0.35;
  body.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0.22, 0.44, 0);
  const armRMesh = new THREE.Mesh(tGeo(new THREE.CapsuleGeometry(0.042, 0.42, 6, 10)), shirtMat);
  armRMesh.position.y = -0.22;
  armR.add(armRMesh);
  body.add(armR);

  return {
    root,
    body,
    armR,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
