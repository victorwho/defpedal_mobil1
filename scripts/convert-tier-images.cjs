/**
 * Convert SVG tier mascot images to optimized 256x256 PNGs.
 *
 * The SVGs in tiers/ contain embedded raster data (base64 <image> tags),
 * so they aren't true vector. We render them at 256x256 and output as
 * optimized PNGs — sufficient for mobile display (max 120x120 on screen).
 *
 * Usage: node scripts/convert-tier-images.cjs
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SVG_DIR = path.resolve(__dirname, '..', 'tiers');
const OUT_DIR = path.resolve(__dirname, '..', 'apps', 'mobile', 'assets', 'tiers');

const TIER_NAMES = [
  'kickstand',
  'spoke',
  'pedaler',
  'street_smart',
  'road_regular',
  'trail_blazer',
  'road_captain',
  'city_guardian',
  'iron_cyclist',
  'legend',
];

async function convertAll() {
  console.log('Converting SVG tier images to optimized 256x256 PNGs...\n');

  for (const name of TIER_NAMES) {
    const svgPath = path.join(SVG_DIR, `${name}.svg`);
    const outPath = path.join(OUT_DIR, `${name}.png`);

    if (!fs.existsSync(svgPath)) {
      console.log(`  SKIP: ${name}.svg not found`);
      continue;
    }

    const svgBuffer = fs.readFileSync(svgPath);

    await sharp(svgBuffer, { density: 300 })
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: false })
      .toFile(outPath);

    const stats = fs.statSync(outPath);
    console.log(`  OK: ${name}.png — ${(stats.size / 1024).toFixed(1)} KB`);
  }

  // Remove the canva duplicate if it exists
  const canvaPath = path.join(OUT_DIR, 'road_regular_canva.png');
  if (fs.existsSync(canvaPath)) {
    fs.unlinkSync(canvaPath);
    console.log('\n  Removed road_regular_canva.png (duplicate)');
  }

  console.log('\nDone!');
}

convertAll().catch((err) => {
  console.error('Conversion failed:', err);
  process.exit(1);
});
