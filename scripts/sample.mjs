/**
 * sample.mjs — read actual pixels out of a screenshot.
 *
 * Lighting has now been guessed at twice from a rendered PNG and been wrong
 * both times, because "that looks like mid grey to me" is not a measurement and
 * because the shading pipeline has more factors in it than the two intensities
 * you set — a 1/π in the Lambert BRDF, an sRGB encode on the way out. This
 * turns the question back into arithmetic: point it at the pixels and it says
 * what they are, in sRGB and in the linear space the lighting maths happens in.
 *
 *   node scripts/sample.mjs shots/look-gl.png 300,925 610,760 400,300
 *
 * Decoding happens in a browser rather than through a PNG library, because
 * there is already a browser here and adding a dependency to look at a colour
 * would be a poor trade.
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const file = process.argv[2] ?? 'shots/look-gl.png';
const points = process.argv.slice(3).map((p) => p.split(',').map(Number));
if (!points.length) {
  console.error('usage: node scripts/sample.mjs <png> x,y [x,y ...]');
  process.exit(2);
}

const data = `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const hits = await page.evaluate(
    async ([src, pts]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return pts.map(([x, y]) => {
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
        return { x, y, r, g, b };
      });
    },
    [data, points],
  );

  /** sRGB 0..255 back to the linear value the shader was working in. */
  const linear = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const hex = (n) => n.toString(16).padStart(2, '0');

  for (const { x, y, r, g, b } of hits) {
    const lin = [r, g, b].map(linear);
    const luma = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    console.log(
      `${String(x).padStart(5)},${String(y).padEnd(5)} #${hex(r)}${hex(g)}${hex(b)}` +
        `  linear ${lin.map((v) => v.toFixed(3)).join(' ')}  luma ${luma.toFixed(3)}`,
    );
  }
} finally {
  await browser.close();
}
