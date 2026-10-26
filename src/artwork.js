import { STAMPS } from './config.js';

// Supplied expressions remain flat ink; the paper normal and hover light are
// generated independently by the existing renderer.
const W = 720;
const H = 900;
const images = new Map();
let preparation;

/** Decode once before either the GPU gallery or its paper fallback is created. */
export function prepareStampArtwork() {
  if (!preparation) {
    preparation = Promise.all(STAMPS.map(async stamp => {
      if (images.has(stamp.id)) return;
      const image = new Image();
      image.src = stamp.image;
      await image.decode();
      images.set(stamp.id, image);
    })).catch(error => {
      preparation = null;
      throw new Error('醒狮图稿未能加载，请刷新重试。', { cause: error });
    });
  }
  return preparation;
}

function seeded(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function text(ctx, value, x, y, size, color, family = '"SimSun", "Songti SC", serif') {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${family}`;
  ctx.fillText(value, x, y);
}

function paperGrain(ctx, seed) {
  const random = seeded(seed);
  const tile = document.createElement('canvas');
  tile.width = 360;
  tile.height = 450;
  const grain = tile.getContext('2d');
  const pixels = grain.createImageData(tile.width, tile.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = Math.round(255 - random() * 7);
    pixels.data[i] = value;
    pixels.data[i + 1] = value;
    pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  grain.putImageData(pixels, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(tile, 0, 0, W, H);
  ctx.restore();
}

function perforate(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (let i = 0; i < 6; i++) {
    const x = (i + .5) * W / 6;
    for (const y of [0, H]) {
      ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (let i = 0; i < 8; i++) {
    const y = (i + .5) * H / 8;
    for (const x of [0, W]) {
      ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

/** One stamp layout around each user-supplied lion expression. */
export function createStampArtwork(kind, width = W, height = H) {
  const stamp = STAMPS.find(item => item.id === kind);
  if (!stamp) throw new Error(`Unknown stamp artwork: ${kind}`);
  const image = images.get(kind);
  if (!image) throw new Error('Call prepareStampArtwork() before creating a stamp.');
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  ctx.scale(canvas.width / W, canvas.height / H);
  ctx.imageSmoothingQuality = 'high';

  const paper = ctx.createLinearGradient(0, 0, W, H);
  paper.addColorStop(0, '#faf6ed');
  paper.addColorStop(1, '#eee5d5');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#c4a58a';
  ctx.lineWidth = 1;
  ctx.strokeRect(39.5, 39.5, 641, 821);

  text(ctx, '醒 狮 八 态', 65, 84, 25, '#81382f');
  ctx.textAlign = 'right';
  text(ctx, `${stamp.number} / 08`, 655, 80, 16, '#927c65', 'monospace');
  ctx.textAlign = 'left';
  ctx.strokeStyle = '#bda58b';
  ctx.beginPath(); ctx.moveTo(65, 105); ctx.lineTo(655, 105); ctx.stroke();

  // Quiet registration circles echo the supplied reference's paper backdrop.
  ctx.strokeStyle = 'rgba(176,145,105,.19)';
  for (const radius of [263, 271]) {
    ctx.beginPath(); ctx.arc(360, 426, radius, 0, Math.PI * 2); ctx.stroke();
  }
  // Preserve the whole illustration, including fur, beard and crown.
  ctx.drawImage(image, 45, 119, 630, 630);

  ctx.strokeStyle = '#bda58b';
  ctx.beginPath(); ctx.moveTo(65, 758); ctx.lineTo(655, 758); ctx.stroke();
  text(ctx, stamp.label, 64, 831, 66, '#9d3029');
  text(ctx, stamp.english, 157, 793, 23, '#573d30', 'Georgia, serif');
  text(ctx, '岭南醒狮 · 神态图志', 159, 826, 18, '#87725e');
  ctx.textAlign = 'right';
  text(ctx, stamp.number, 655, 829, 52, '#a34334', 'Georgia, serif');
  ctx.textAlign = 'left';
  paperGrain(ctx, 7493 + STAMPS.indexOf(stamp) * 811);
  perforate(ctx);
  return canvas;
}
