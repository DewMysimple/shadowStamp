import * as THREE from 'three';

function randomSource(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

/** Independent, shallow paper normals; no image-derived height, color or lighting. */
export function createSurfaceNormalData(width = 512, height = 640, seed = 17041) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4 || width > 2048 || height > 2048) throw new RangeError('Surface dimensions must be integers between 4 and 2048.');
  const random = randomSource(seed);
  const white = new Float32Array(width * height);
  const etched = new Float32Array(white.length);
  const data = new Uint8Array(white.length * 4);
  const sample = (field, x, y) => field[((y + height) % height) * width + ((x + width) % width)];
  for (let i = 0; i < white.length; i++) white[i] = random();
  const noise = (x, y, salt = 0) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = sample(white, ix + salt, iy + salt * 3);
    const b = sample(white, ix + salt + 1, iy + salt * 3);
    const c = sample(white, ix + salt, iy + salt * 3 + 1);
    const d = sample(white, ix + salt + 1, iy + salt * 3 + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  // Irregular fibres at several scales, rather than sine contour rings.
  // The latent height only produces normals; no printed waves or raised ink.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const wx = x + (noise(x / 44, y / 44, 23) - .5) * 14;
    const wy = y + (noise(x / 44, y / 44, 71) - .5) * 14;
    etched[y * width + x] = .5
      + (noise(wx / 2.4, wy / 2.4, 131) - .5) * .11
      + (noise(wx / 5.7, wy / 5.7, 167) - .5) * .10
      + (noise(wx / 13, wy / 13, 73) - .5) * .05;
  }
  const encode = value => Math.round((Math.max(-1, Math.min(1, value)) * .5 + .5) * 255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    const dx = (sample(etched, x + 1, y) - sample(etched, x - 1, y)) * 2.1;
    const dy = (sample(etched, x, y + 1) - sample(etched, x, y - 1)) * 2.1;
    const length = Math.hypot(dx, dy, 1);
    data[i * 4] = encode(dx / length);
    data[i * 4 + 1] = encode(dy / length);
    data[i * 4 + 2] = encode(1 / length);
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

/** Owned by one persistent stamp material, and released with that material. */
export function createSurfaceNormalTexture(seed = 17041) {
  const width = 512, height = 640;
  const { data } = createSurfaceNormalData(width, height, seed);
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.name = 'Independent shallow paper normal';
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
