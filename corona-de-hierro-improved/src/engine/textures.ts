import * as THREE from 'three';

export function createRingCanvasTexture(
  maxAnisotropy: number,
  tier: 'local' | 'national' | 'world' = 'world'
): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base canvas color by tier
  const baseColor =
    tier === 'local' ? '#252B36' : tier === 'national' ? '#1E293B' : '#161D2A';
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // Subtle canvas weave grain
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i < size; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  // Soft overhead spotlight radial gradient bake
  const rad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    40,
    size / 2,
    size / 2,
    size * 0.52
  );
  rad.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
  rad.addColorStop(0.6, 'rgba(255, 255, 255, 0.03)');
  rad.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, size, size);

  // Outer fighting zone perimeter lines
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.42)';
  ctx.lineWidth = 6;
  ctx.strokeRect(72, 72, size - 144, size - 144);

  // Red & Blue corner markings
  ctx.fillStyle = 'rgba(220, 38, 38, 0.55)';
  ctx.beginPath();
  ctx.moveTo(72, 72);
  ctx.lineTo(185, 72);
  ctx.lineTo(72, 185);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(37, 99, 235, 0.55)';
  ctx.beginPath();
  ctx.moveTo(size - 72, size - 72);
  ctx.lineTo(size - 185, size - 72);
  ctx.lineTo(size - 72, size - 185);
  ctx.closePath();
  ctx.fill();

  // Center championship emblem
  ctx.save();
  ctx.translate(size / 2, size / 2);

  ctx.strokeStyle = tier === 'local' ? 'rgba(226, 232, 240, 0.25)' : 'rgba(245, 158, 11, 0.55)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(0, 0, 165, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 146, 0, Math.PI * 2);
  ctx.stroke();

  // Crown emblem in center
  ctx.fillStyle = tier === 'local' ? 'rgba(226, 232, 240, 0.16)' : 'rgba(245, 158, 11, 0.22)';
  ctx.beginPath();
  ctx.moveTo(-64, 34);
  ctx.lineTo(-76, -32);
  ctx.lineTo(-32, 2);
  ctx.lineTo(0, -52);
  ctx.lineTo(32, 2);
  ctx.lineTo(76, -32);
  ctx.lineTo(64, 34);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = tier === 'local' ? 'rgba(226, 232, 240, 0.4)' : 'rgba(245, 158, 11, 0.72)';
  ctx.font = '700 28px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CORONA DE HIERRO', 0, 74);

  ctx.font = '600 16px "Barlow Condensed", sans-serif';
  ctx.fillStyle = 'rgba(226, 232, 240, 0.35)';
  const subLabel =
    tier === 'local' ? 'CIRCUITO LOCAL' : tier === 'national' ? 'LIGA NACIONAL' : 'CAMPEONATO MUNDIAL';
  ctx.fillText(subLabel, 0, 98);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function createLeatherNormalRoughnessMap(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const grain = 165 + Math.floor(Math.random() * 55);
    imgData.data[i] = grain;
    imgData.data[i + 1] = grain;
    imgData.data[i + 2] = grain;
    imgData.data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.needsUpdate = true;
  return texture;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createGymFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#181C24';
  ctx.fillRect(0, 0, size, size);

  // Rubber gym mat tiles
  const tile = 64;
  for (let y = 0; y < size; y += tile) {
    for (let x = 0; x < size; x += tile) {
      ctx.fillStyle = (x / tile + y / tile) % 2 === 0 ? '#1C212B' : '#171B23';
      ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
    }
  }

  // Subtle rubber speckles
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(245,158,11,0.025)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createSkinBumpTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const pore = 122 + Math.floor(Math.random() * 28);
    imgData.data[i] = pore;
    imgData.data[i + 1] = pore;
    imgData.data[i + 2] = pore;
    imgData.data[i + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.needsUpdate = true;
  return tex;
}

export function createTattooTexture(style: string): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, size, size);

  if (style === 'none') {
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  // Ink color: dark vintage deep blue-black tattoo ink
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (style === 'chest_eagle' || style === 'full_inked') {
    // Majestic spread eagle emblem on chest
    ctx.lineWidth = 6;
    ctx.beginPath();
    // Head / Beak
    ctx.arc(size / 2, 140, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(size / 2 - 6, 142);
    ctx.lineTo(size / 2 - 28, 148);
    ctx.lineTo(size / 2 - 4, 156);
    ctx.fill();

    // Wings spread
    for (let w = 0; w < 5; w++) {
      ctx.beginPath();
      // Left Wing
      ctx.moveTo(size / 2 - 20, 160 + w * 12);
      ctx.quadraticCurveTo(size / 2 - 120, 90 + w * 15, 60 + w * 25, 110 + w * 32);
      ctx.quadraticCurveTo(size / 2 - 90, 190 + w * 12, size / 2 - 15, 180 + w * 14);
      ctx.stroke();
      ctx.fill();

      // Right Wing
      ctx.beginPath();
      ctx.moveTo(size / 2 + 20, 160 + w * 12);
      ctx.quadraticCurveTo(size / 2 + 120, 90 + w * 15, size - (60 + w * 25), 110 + w * 32);
      ctx.quadraticCurveTo(size / 2 + 90, 190 + w * 12, size / 2 + 15, 180 + w * 14);
      ctx.stroke();
      ctx.fill();
    }
    // Banner / stars
    ctx.lineWidth = 4;
    ctx.strokeRect(size / 2 - 100, 270, 200, 36);
  }

  if (style === 'sleeve_tribal_left' || style === 'full_inked') {
    // Polynesian / Maori dense sharp geometries
    ctx.lineWidth = 5;
    for (let y = 40; y < 480; y += 45) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(140, y + 25);
      ctx.lineTo(90, y + 50);
      ctx.lineTo(40, y + 25);
      ctx.closePath();
      ctx.fill();
      // Repeating spearheads
      ctx.beginPath();
      ctx.arc(160, y + 25, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (style === 'sleeve_dragon_right' || style === 'full_inked') {
    // Oriental coiled dragon & waves
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(size - 60, 60);
    ctx.bezierCurveTo(size - 180, 140, size - 40, 260, size - 160, 340);
    ctx.bezierCurveTo(size - 220, 390, size - 80, 440, size - 120, 490);
    ctx.stroke();

    // Scales & claws
    for (let s = 100; s < 450; s += 35) {
      ctx.beginPath();
      ctx.arc(size - 110, s, 16, 0, Math.PI);
      ctx.stroke();
    }
  }

  if (style === 'back_wings' || style === 'full_inked') {
    // Massive angel / demon wings covering shoulder blades
    ctx.lineWidth = 6;
    for (let f = 0; f < 7; f++) {
      ctx.beginPath();
      ctx.moveTo(size / 2 - 30, 220 + f * 25);
      ctx.bezierCurveTo(size / 2 - 190, 260 + f * 10, 40, 340 + f * 20, 25, 460);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(size / 2 + 30, 220 + f * 25);
      ctx.bezierCurveTo(size / 2 + 190, 260 + f * 10, size - 40, 340 + f * 20, size - 25, 460);
      ctx.stroke();
    }
  }

  if (style === 'neck_crown') {
    // Imperial Crown & Gothic script on throat/neck
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(size / 2 - 45, 120);
    ctx.lineTo(size / 2 - 35, 75);
    ctx.lineTo(size / 2 - 15, 100);
    ctx.lineTo(size / 2, 60);
    ctx.lineTo(size / 2 + 15, 100);
    ctx.lineTo(size / 2 + 35, 75);
    ctx.lineTo(size / 2 + 45, 120);
    ctx.closePath();
    ctx.fill();

    // Laurel branch
    ctx.beginPath();
    ctx.arc(size / 2, 135, 55, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createTrunksPatternTexture(
  pattern: string,
  baseColor: string,
  accentColor: string
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  if (pattern === 'stripe') {
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, 0, 48, size);
    ctx.fillRect(size - 48, 0, 48, size);
    ctx.fillRect(size / 2 - 24, 0, 48, size);
  } else if (pattern === 'championship') {
    ctx.fillStyle = accentColor;
    // Top border waistband
    ctx.fillRect(0, 0, size, 64);
    ctx.fillRect(0, size - 48, size, 48);
    // Gold stars
    ctx.fillStyle = '#FFF';
    for (let i = 60; i < size; i += 90) {
      ctx.beginPath();
      ctx.arc(i, 32, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pattern === 'camo') {
    // Tactical military camouflage patches
    const patches = [
      { x: 80, y: 100, r: 60, col: accentColor },
      { x: 280, y: 160, r: 85, col: '#1E293B' },
      { x: 180, y: 340, r: 90, col: accentColor },
      { x: 400, y: 280, r: 70, col: '#0F172A' },
      { x: 340, y: 440, r: 80, col: accentColor },
      { x: 90, y: 460, r: 65, col: '#1E293B' },
    ];
    patches.forEach((p) => {
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, p.r * 0.65, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (pattern === 'gladiator') {
    // Roman/spartan vertical leather pteryges flaps with gold studs
    ctx.fillStyle = accentColor;
    for (let x = 32; x < size; x += 64) {
      ctx.fillRect(x, 120, 40, size - 150);
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.arc(x + 20, size - 60, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accentColor;
    }
  } else if (pattern === 'flames') {
    // Dynamic hot rod flames rising from bottom
    ctx.fillStyle = accentColor;
    for (let x = 0; x < size; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, size);
      ctx.quadraticCurveTo(x + 16, size - 140, x + 32, size - 220);
      ctx.quadraticCurveTo(x + 48, size - 140, x + 64, size);
      ctx.closePath();
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function createApronBannerTexture(
  maxAnisotropy: number,
  tier: 'local' | 'national' | 'world'
): THREE.CanvasTexture {
  const w = 1024;
  const h = 192;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = tier === 'world' ? '#0B0F19' : tier === 'national' ? '#131B2E' : '#18181B';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = tier === 'local' ? '#94A3B8' : '#F59E0B';
  ctx.fillRect(0, 0, w, 10);
  ctx.fillRect(0, h - 10, w, 10);

  ctx.fillStyle = '#F8FAFC';
  ctx.font = '800 58px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const title =
    tier === 'local'
      ? 'CIRCUITO DEL BARRIO · BOXEO EN VIVO'
      : tier === 'national'
        ? 'LIGA NACIONAL · CORONA DE HIERRO'
        : 'CAMPEONATO MUNDIAL INDISCUTIDO';
  ctx.fillText(title, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createJumbotronTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0F172A');
  grad.addColorStop(0.5, '#1E1B4B');
  grad.addColorStop(1, '#0F172A');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, w - 24, h - 24);

  ctx.fillStyle = '#F59E0B';
  ctx.font = '800 44px "Barlow Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CORONA DE HIERRO', w / 2, 95);

  ctx.fillStyle = '#E2E8F0';
  ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('NOCHE DE CAMPEONATO EN VIVO', w / 2, 152);

  ctx.fillStyle = '#DC2626';
  ctx.fillRect(w / 2 - 70, 182, 140, 28);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 16px "Barlow Condensed", sans-serif';
  ctx.fillText('TRANSMISIÓN OFICIAL', w / 2, 201);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}
