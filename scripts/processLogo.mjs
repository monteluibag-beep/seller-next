import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';

const src = 'public/logo.png';

// Read original
const img = sharp(src);
const meta = await img.metadata();
const { width, height } = meta;

console.log(`Original: ${width}x${height}`);

// The icon is the left square portion — roughly width = height of the image
const iconSize = height;  // icon is roughly square, same height as image
const iconWidth = Math.round(iconSize * 1.05); // slight padding

// Step 1: Crop to icon only
const cropped = await sharp(src)
  .extract({ left: 0, top: 0, width: Math.min(iconWidth, width), height })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { data, info } = cropped;
const pixels = new Uint8ClampedArray(data);
const w = info.width;
const h = info.height;

// Step 2 & 3: Remove white background + change orange → white
for (let i = 0; i < pixels.length; i += 4) {
  const r = pixels[i], g = pixels[i+1], b = pixels[i+2];

  // Remove white/near-white background
  if (r > 235 && g > 235 && b > 235) {
    pixels[i+3] = 0; // fully transparent
    continue;
  }

  // Change orange to white using hue detection (orange hue ≈ 20-45°)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let hue = 0;
  if (delta > 10) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
    if (hue < 0) hue += 360;
  }
  const sat = max === 0 ? 0 : delta / max;
  if (hue >= 10 && hue <= 55 && sat > 0.25 && max > 80) {
    pixels[i]   = 255; // R → white
    pixels[i+1] = 255; // G → white
    pixels[i+2] = 255; // B → white
    continue;
  }
}

// Save processed icon (transparan bg, beyaz C)
await sharp(Buffer.from(pixels), {
  raw: { width: w, height: h, channels: 4 }
})
  .png()
  .toFile('public/logo-icon.png');

console.log(`✅ public/logo-icon.png saved (${w}x${h})`);

// Also save full logo with transparent bg + orange→white for offer PDF etc.
const fullRaw = await sharp(src)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const fp = new Uint8ClampedArray(fullRaw.data);
for (let i = 0; i < fp.length; i += 4) {
  const r = fp[i], g = fp[i+1], b = fp[i+2];
  if (r > 235 && g > 235 && b > 235) { fp[i+3] = 0; }
}

await sharp(Buffer.from(fp), {
  raw: { width: fullRaw.info.width, height: fullRaw.info.height, channels: 4 }
})
  .png()
  .toFile('public/logo-transparent.png');

console.log(`✅ public/logo-transparent.png saved`);
