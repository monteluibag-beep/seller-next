import sharp from 'sharp';

// logo-icon.png'den favicon boyutları üret
const src = 'public/logo-icon.png';

// 32x32 favicon.png (app/favicon.ico yerine kullanılacak)
await sharp(src)
  .resize(32, 32, { fit: 'contain', background: { r: 232, g: 93, b: 4, alpha: 1 } })
  .png()
  .toFile('public/favicon-32.png');

// 180x180 apple-touch-icon
await sharp(src)
  .resize(160, 160, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 10, bottom: 10, left: 10, right: 10, background: { r: 232, g: 93, b: 4, alpha: 1 } })
  .resize(180, 180)
  .png()
  .toFile('public/apple-touch-icon.png');

// 192x192 android icon
await sharp(src)
  .resize(160, 160, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 16, bottom: 16, left: 16, right: 16, background: { r: 232, g: 93, b: 4, alpha: 1 } })
  .resize(192, 192)
  .png()
  .toFile('public/icon-192.png');

// app/favicon.ico yerine kullanılacak 64x64 PNG → app klasörüne
await sharp(src)
  .resize(48, 48, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 8, bottom: 8, left: 8, right: 8, background: { r: 232, g: 93, b: 4, alpha: 1 } })
  .resize(64, 64)
  .png()
  .toFile('app/favicon.png');

console.log('✅ Favicon dosyaları oluşturuldu');
