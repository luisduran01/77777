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
