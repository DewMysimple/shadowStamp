import { STAMPS } from './config.js';

const W = 720;
const images = new Map();
let preparation;

/** Decode all twelve independent ImageGen scene paintings before creating the gallery. */
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
      throw new Error('邮票美术资产未能加载，请刷新重试。', { cause: error });
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

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawContained(ctx, image, x, y, width, height) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function paperGrain(ctx, width, height, seed) {
  const random = seeded(seed);
  const tile = document.createElement('canvas');
  tile.width = 360;
  tile.height = 450;
  const grain = tile.getContext('2d');
  const pixels = grain.createImageData(tile.width, tile.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = Math.round(255 - random() * 3);
    pixels.data[i] = value;
    pixels.data[i + 1] = value;
    pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  grain.putImageData(pixels, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.7;
  ctx.drawImage(tile, 0, 0, width, height);
  ctx.restore();
}

function perforate(ctx, width, height) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  const radius = 21;
  const horizontalCount = 6;
  const verticalCount = Math.max(5, Math.round(height / 110));
  for (let i = 0; i < horizontalCount; i++) {
    const x = (i + 0.5) * width / horizontalCount;
    for (const y of [0, height]) {
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (let i = 0; i < verticalCount; i++) {
    const y = (i + 0.5) * height / verticalCount;
    for (const x of [0, width]) {
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

/** Compose only the printable paper, type, and perforations around the generated scene. */
export function createStampArtwork(kind, width = W, height) {
  const stamp = STAMPS.find(item => item.id === kind);
  if (!stamp) throw new Error(`Unknown stamp artwork: ${kind}`);
  const image = images.get(kind);
  if (!image) throw new Error('Call prepareStampArtwork() before creating a stamp.');
  const logicalHeight = height ?? Math.round(width / stamp.ratio);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(logicalHeight));
  const ctx = canvas.getContext('2d');
  ctx.scale(canvas.width / W, canvas.height / logicalHeight);
  ctx.imageSmoothingQuality = 'high';
  const H = logicalHeight;

  const paper = ctx.createLinearGradient(0, 0, W, H);
  paper.addColorStop(0, '#fbf7f1');
  paper.addColorStop(1, '#f2ebdf');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  const topBand = Math.max(48, Math.round(H * 0.052));
  const bottomBand = Math.max(50, Math.round(H * 0.05));
  const art = { x: 29, y: topBand + 6, width: W - 58, height: H - topBand - bottomBand - 12 };
  ctx.save();
  ctx.beginPath();
  ctx.rect(art.x, art.y, art.width, art.height);
  ctx.clip();
  drawContained(ctx, image, art.x, art.y, art.width, art.height);
  ctx.restore();

  ctx.strokeStyle = 'rgba(145, 104, 72, .46)';
  ctx.lineWidth = 1.3;
  ctx.strokeRect(17.5, 17.5, W - 35, H - 35);
  ctx.strokeStyle = 'rgba(145, 104, 72, .23)';
  ctx.lineWidth = 1;
  ctx.strokeRect(art.x - 0.5, art.y - 0.5, art.width + 1, art.height + 1);

  ctx.fillStyle = '#a3483d';
  ctx.font = '12px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'left';
  ctx.fillText('POSTAL STUDIES', 34, topBand - 19);
  ctx.font = '10px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  ctx.fillStyle = '#765d51';
  ctx.fillText(`${stamp.place}  ·  ${stamp.english}`, 34, topBand - 5);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#a3483d';
  ctx.font = '32px Georgia, "Times New Roman", serif';
  ctx.fillText(stamp.number, W - 34, topBand - 9);

  const footerY = H - bottomBand + 8;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9e3e34';
  ctx.font = '23px "Microsoft YaHei", "Noto Sans CJK SC", serif';
  ctx.fillText(stamp.title, 34, footerY + 21);
  ctx.fillStyle = '#886e5d';
  ctx.font = '10px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  ctx.fillText(stamp.caption, 36, footerY + 37);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#b39276';
  ctx.font = '9px Georgia, "Times New Roman", serif';
  ctx.fillText(stamp.series === 'guangdong' ? 'LINGNAN' : stamp.series === 'china' ? 'CHINA' : 'WORLD', W - 34, footerY + 33);
  ctx.textAlign = 'left';

  paperGrain(ctx, W, H, 18713 + STAMPS.indexOf(stamp) * 811);
  perforate(ctx, W, H);
  return canvas;
}
