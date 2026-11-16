import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createApronBannerTexture,
  createJumbotronTexture,
  createRingCanvasTexture,
} from './textures';

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function scheduleSoftwareAfterDraw(
  renderer: THREE.WebGLRenderer,
  cb: () => void,
  setTimerId: (id: number) => void
): void {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  if (!gl || !gl.fenceSync) {
    setTimerId(window.setTimeout(cb, 80));
    return;
  }
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  const poll = () => {
    const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.ALREADY_SIGNALED;
    if (state === gl.UNSIGNALED) {
      setTimerId(window.setTimeout(poll, 5));
    } else {
      if (sync) gl.deleteSync(sync);
      setTimerId(window.setTimeout(cb, 80));
    }
  };
  setTimerId(window.setTimeout(poll, 5));
}

export function configureRenderer(
  container: HTMLElement,
  isSoftwareGl: boolean
): { renderer: THREE.WebGLRenderer; maxAnisotropy: number } {
  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(
    container.clientWidth || window.innerWidth,
    container.clientHeight || window.innerHeight
  );

  container.innerHTML = '';
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';

  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);
  return { renderer, maxAnisotropy };
}

export function setupArenaEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  tier: 'local' | 'national' | 'world' = 'world'
): () => void {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmremGenerator.dispose();

  const bgHex = tier === 'local' ? 0x06080c : tier === 'national' ? 0x070a12 : 0x05070d;
  scene.background = new THREE.Color(bgHex);
  scene.fog = new THREE.FogExp2(bgHex, tier === 'local' ? 0.04 : 0.024);

  return () => {
    envTex.dispose();
  };
}

export interface ArenaRig {
  group: THREE.Group;
  flashLights: THREE.Points;
  crowdMesh: THREE.InstancedMesh;
  updateArena: (
    elapsed: number,
    excitement: number,
    fighters?: { x: number; z: number }[]
  ) => void;
  dispose: () => void;
}

export const RING_HALF_EXTENT = 2.85;

export function buildBoxingArena(
  scene: THREE.Scene,
  maxAnisotropy: number,
  tier: 'local' | 'national' | 'world' = 'world'
): ArenaRig {
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

  const group = new THREE.Group();
  scene.add(group);

  // 1. Broadcast 3-Point + Overhead Arena Rig (<= 3 shadow casters)
  const hemi = new THREE.HemisphereLight(0x93c5fd, 0x1c1917, 0.72);
  group.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.15);
  keyLight.position.set(3.8, 7.6, 4.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 20;
  keyLight.shadow.camera.left = -4.5;
  keyLight.shadow.camera.right = 4.5;
  keyLight.shadow.camera.top = 4.5;
  keyLight.shadow.camera.bottom = -4.5;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  group.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x60a5fa, 1.1);
  rimLight.position.set(-4.5, 4.5, -4.5);
  group.add(rimLight);

  const overheadSpot = new THREE.SpotLight(0xfffbeb, 28, 18, Math.PI / 4.2, 0.55, 1.4);
  overheadSpot.position.set(0, 6.9, 0);
  overheadSpot.target.position.set(0, 0, 0);
  group.add(overheadSpot, overheadSpot.target);

  // 2. Volumetric Spotlight Beams (ShaderMaterial soft cones)
  const beamMat = trackMat(
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(tier === 'local' ? 0xfde68a : 0xfffbeb) },
        uOpacity: { value: tier === 'local' ? 0.11 : 0.14 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPos;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPos;
        void main() {
          vec3 viewDir = normalize(vViewPos);
          float fresnel = pow(abs(dot(vNormal, viewDir)), 1.8);
          float verticalFade = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
          float alpha = fresnel * verticalFade * uOpacity;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
  );

  const beamGeo = trackGeo(new THREE.ConeGeometry(3.4, 6.4, 24, 1, true));
  const mainBeam = new THREE.Mesh(beamGeo, beamMat);
  mainBeam.position.set(0, 3.3, 0);
  group.add(mainBeam);

  if (tier !== 'local') {
    const cornerBeamGeo = trackGeo(new THREE.ConeGeometry(1.8, 6.2, 18, 1, true));
    [
      [-2.2, -2.2],
      [2.2, 2.2],
    ].forEach(([bx, bz]) => {
      const cb = new THREE.Mesh(cornerBeamGeo, beamMat);
      cb.position.set(bx * 0.65, 3.2, bz * 0.65);
      cb.lookAt(0, 0, 0);
      cb.rotateX(Math.PI / 2);
      group.add(cb);
    });
  }

  // 3. Ring Mat & Apron Banners
  const ringCanvasTex = trackTex(createRingCanvasTexture(maxAnisotropy, tier));
  const apronTex = trackTex(createApronBannerTexture(maxAnisotropy, tier));
  const matGeo = trackGeo(new THREE.BoxGeometry(6.8, 0.24, 6.8));
  const matSurface = trackMat(
    new THREE.MeshStandardMaterial({
      map: ringCanvasTex,
      roughness: 0.78,
      metalness: 0.04,
    })
  );
  const apronMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: tier === 'local' ? 0x1e293b : 0x111827,
      roughness: 0.65,
      metalness: 0.1,
    })
  );
  const ringDeck = new THREE.Mesh(matGeo, [
    apronMat,
    apronMat,
    matSurface,
    apronMat,
    apronMat,
    apronMat,
  ]);
  ringDeck.position.y = -0.12;
  ringDeck.receiveShadow = true;
  group.add(ringDeck);

  // Event Banner Skirt
  const skirtGeo = trackGeo(new THREE.BoxGeometry(6.95, 0.88, 6.95));
  const skirtBannerMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: apronTex,
      roughness: 0.55,
      metalness: 0.08,
    })
  );
  const skirtBottomMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0b0f17, roughness: 0.8 })
  );
  const skirt = new THREE.Mesh(skirtGeo, [
    skirtBannerMat,
    skirtBannerMat,
    skirtBottomMat,
    skirtBottomMat,
    skirtBannerMat,
    skirtBannerMat,
  ]);
  skirt.position.y = -0.68;
  group.add(skirt);

  // Arena Floor
  const arenaFloorGeo = trackGeo(new THREE.PlaneGeometry(60, 60));
  const arenaFloorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x07090e,
      roughness: 0.86,
      metalness: 0.08,
    })
  );
  const arenaFloor = new THREE.Mesh(arenaFloorGeo, arenaFloorMat);
  arenaFloor.rotation.x = -Math.PI / 2;
  arenaFloor.position.y = -1.12;
  group.add(arenaFloor);

  // Ringside Announcer Desk + Monitors
  const deskGeo = trackGeo(new THREE.BoxGeometry(2.6, 0.72, 0.65));
  const deskMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x161b26, roughness: 0.5 }));
  const desk = new THREE.Mesh(deskGeo, deskMat);
  desk.position.set(0, -0.76, 4.15);
  group.add(desk);

  const monGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.26, 0.04));
  const monMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.45,
    })
  );
  [-0.55, 0.55].forEach((mx) => {
    const mon = new THREE.Mesh(monGeo, monMat);
    mon.position.set(mx, -0.27, 4.05);
    mon.rotation.x = -0.35;
    group.add(mon);
  });

  // 4. Corner Posts, Corner Stools, Turnbuckles & Dynamic Ropes
  const cornerCoord = 3.12;
  const corners = [
    { x: -cornerCoord, z: -cornerCoord, color: 0xdc2626 },
    { x: cornerCoord, z: cornerCoord, color: 0x2563eb },
    { x: cornerCoord, z: -cornerCoord, color: 0xe2e8f0 },
    { x: -cornerCoord, z: cornerCoord, color: 0xe2e8f0 },
  ];

  const steelMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.25, metalness: 0.88 })
  );
  const postGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.06, 1.48, 12));
  const padGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 1.18, 12));

  corners.forEach((c) => {
    const post = new THREE.Mesh(postGeo, steelMat);
    post.position.set(c.x, 0.72, c.z);
    post.castShadow = true;
    group.add(post);

    const padMat = trackMat(
      new THREE.MeshStandardMaterial({ color: c.color, roughness: 0.42, metalness: 0.1 })
    );
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(c.x * 0.96, 0.76, c.z * 0.96);
    pad.castShadow = true;
    group.add(pad);
  });

  // Ring Corner Steps
  const stepMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6, roughness: 0.4 }));
  const step1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.65, 0.35, 0.4)), stepMat);
  step1.position.set(-3.75, -0.95, -3.1);
  const step2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.65, 0.65, 0.4)), stepMat);
  step2.position.set(-3.45, -0.8, -3.1);
  group.add(step1, step2);

  // 4x4 Rope Segments stored for subtle perimeter deflection
  const ropeHeights = [0.42, 0.71, 1.0, 1.29];
  const ropeColors =
    tier === 'world'
      ? [0xdc2626, 0xf8fafc, 0xf8fafc, 0x2563eb]
      : [0xb91c1c, 0xcbd5e1, 0xcbd5e1, 0x1e40af];

  interface RopeSegment {
    mesh: THREE.Mesh;
    side: 'n' | 's' | 'e' | 'w';
  }
  const ropeSegments: RopeSegment[] = [];
  const rLimit = cornerCoord * 0.96;

  ropeHeights.forEach((y, idx) => {
    const rMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: ropeColors[idx],
        roughness: 0.52,
        metalness: 0.08,
      })
    );
    const defs: { a: THREE.Vector3; b: THREE.Vector3; side: RopeSegment['side'] }[] = [
      { a: new THREE.Vector3(-rLimit, y, -rLimit), b: new THREE.Vector3(rLimit, y, -rLimit), side: 'n' },
      { a: new THREE.Vector3(rLimit, y, -rLimit), b: new THREE.Vector3(rLimit, y, rLimit), side: 'e' },
      { a: new THREE.Vector3(rLimit, y, rLimit), b: new THREE.Vector3(-rLimit, y, rLimit), side: 's' },
      { a: new THREE.Vector3(-rLimit, y, rLimit), b: new THREE.Vector3(-rLimit, y, -rLimit), side: 'w' },
    ];
    defs.forEach((d) => {
      const curve = new THREE.LineCurve3(d.a, d.b);
      const rGeo = trackGeo(new THREE.TubeGeometry(curve, 8, 0.022, 8, false));
      const rope = new THREE.Mesh(rGeo, rMat);
      rope.castShadow = true;
      group.add(rope);
      ropeSegments.push({ mesh: rope, side: d.side });
    });
  });

  // 5. Overhead Truss & Suspended Arena Jumbotron
  const trussMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.85 })
  );
  const beamGeoBox = trackGeo(new THREE.BoxGeometry(7.2, 0.22, 0.22));
  const beamZ1 = new THREE.Mesh(beamGeoBox, trussMat);
  beamZ1.position.set(0, 5.9, -3.4);
  const beamZ2 = new THREE.Mesh(beamGeoBox, trussMat);
  beamZ2.position.set(0, 5.9, 3.4);
  group.add(beamZ1, beamZ2);

  if (tier !== 'local') {
    const jumboTex = trackTex(createJumbotronTexture(maxAnisotropy));
    const jumboGeo = trackGeo(new THREE.BoxGeometry(2.8, 1.35, 2.8));
    const jumboScreenMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: jumboTex,
        emissiveMap: jumboTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.72,
        roughness: 0.2,
      })
    );
    const jumboCapMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8 }));
    const jumbo = new THREE.Mesh(jumboGeo, [
      jumboScreenMat,
      jumboScreenMat,
      jumboCapMat,
      jumboCapMat,
      jumboScreenMat,
      jumboScreenMat,
    ]);
    jumbo.position.set(0, 6.75, 0);
    group.add(jumbo);
  }

  const fixtureGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.22, 0.28, 12));
  const lensMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfffbeb,
      emissive: 0xfef3c7,
      emissiveIntensity: 2.3,
    })
  );
  for (let i = -2; i <= 2; i += 2) {
    const fix1 = new THREE.Mesh(fixtureGeo, trussMat);
    fix1.position.set(i * 1.1, 5.7, -3.2);
    fix1.rotation.x = 0.45;
    const lens1 = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.18, 12)), lensMat);
    lens1.rotation.x = Math.PI / 2;
    lens1.position.y = -0.145;
    fix1.add(lens1);

    const fix2 = new THREE.Mesh(fixtureGeo, trussMat);
    fix2.position.set(i * 1.1, 5.7, 3.2);
    fix2.rotation.x = -0.45;
    const lens2 = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.18, 12)), lensMat);
    lens2.rotation.x = Math.PI / 2;
    lens2.position.y = -0.145;
    fix2.add(lens2);
    group.add(fix1, fix2);
  }

  // 6. Instanced Stadium Crowd + Camera Flashes
  const crowdCount = tier === 'local' ? 75 : tier === 'national' ? 150 : 240;
  const specGeo = trackGeo(new THREE.CapsuleGeometry(0.18, 0.36, 4, 8));
  const specMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 }));
  const crowdMesh = new THREE.InstancedMesh(specGeo, specMat, crowdCount);
  const dummy = new THREE.Object3D();
  const baseAngles: number[] = [];
  const baseRadii: number[] = [];
  const baseHeights: number[] = [];
  const color = new THREE.Color();

  for (let i = 0; i < crowdCount; i++) {
    const ringTier = i % 3;
    const angle = (i / crowdCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
    const radius = 6.2 + ringTier * 2.1 + Math.random() * 0.6;
    const y = -0.45 + ringTier * 0.85;
    baseAngles.push(angle);
    baseRadii.push(radius);
    baseHeights.push(y);

    dummy.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    dummy.lookAt(0, 0.6, 0);
    const sc = 0.88 + Math.random() * 0.28;
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    crowdMesh.setMatrixAt(i, dummy.matrix);

    color.setHSL(0.58 + (Math.random() - 0.5) * 0.15, 0.25, 0.14 + Math.random() * 0.14);
    crowdMesh.setColorAt(i, color);
  }
  crowdMesh.instanceMatrix.needsUpdate = true;
  if (crowdMesh.instanceColor) crowdMesh.instanceColor.needsUpdate = true;
  crowdMesh.computeBoundingSphere();
  group.add(crowdMesh);

  const flashCount = 28;
  const flashPos = new Float32Array(flashCount * 3);
  for (let i = 0; i < flashCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 6.8 + Math.random() * 4.5;
    flashPos[i * 3] = Math.cos(a) * r;
    flashPos[i * 3 + 1] = 0.2 + Math.random() * 2.1;
    flashPos[i * 3 + 2] = Math.sin(a) * r;
  }
  const flashGeo = trackGeo(new THREE.BufferGeometry());
  flashGeo.setAttribute('position', new THREE.BufferAttribute(flashPos, 3));
  const flashMat = trackMat(
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.26,
      transparent: true,
      opacity: 0.0,
    })
  );
  const flashLights = new THREE.Points(flashGeo, flashMat);
  group.add(flashLights);

  const updateArena = (
    elapsed: number,
    excitement: number,
    fighters?: { x: number; z: number }[]
  ) => {
    if (excitement > 0.05) {
      for (let i = 0; i < crowdCount; i += 2) {
        const bounce = Math.abs(Math.sin(elapsed * 8 + i)) * 0.17 * excitement;
        dummy.position.set(
          Math.cos(baseAngles[i]) * baseRadii[i],
          baseHeights[i] + bounce,
          Math.sin(baseAngles[i]) * baseRadii[i]
        );
        dummy.lookAt(0, 0.6, 0);
        dummy.updateMatrix();
        crowdMesh.setMatrixAt(i, dummy.matrix);
      }
      crowdMesh.instanceMatrix.needsUpdate = true;
    }

    const pulse = Math.sin(elapsed * 19.3) * Math.cos(elapsed * 7.1);
    flashMat.opacity = pulse > 0.72 - excitement * 0.35 ? 0.9 : 0.0;

    // Subtle dynamic rope flex if a fighter leans near the perimeter
    if (fighters && fighters.length > 0) {
      let pushN = 0;
      let pushS = 0;
      let pushE = 0;
      let pushW = 0;
      fighters.forEach((f) => {
        if (f.z < -2.2) pushN = Math.max(pushN, (-2.2 - f.z) * 0.14);
        if (f.z > 2.2) pushS = Math.max(pushS, (f.z - 2.2) * 0.14);
        if (f.x > 2.2) pushE = Math.max(pushE, (f.x - 2.2) * 0.14);
        if (f.x < -2.2) pushW = Math.max(pushW, (-2.2 - f.x) * 0.14);
      });
      ropeSegments.forEach((seg) => {
        if (seg.side === 'n') seg.mesh.position.z = -pushN;
        else if (seg.side === 's') seg.mesh.position.z = pushS;
        else if (seg.side === 'e') seg.mesh.position.x = pushE;
        else if (seg.side === 'w') seg.mesh.position.x = -pushW;
      });
    }
  };

  return {
    group,
    flashLights,
    crowdMesh,
    updateArena,
    dispose: () => {
      scene.remove(group);
      disposables.forEach((d) => d.dispose());
    },
  };
}
