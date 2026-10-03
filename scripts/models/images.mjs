import { chromium } from '@playwright/test';

/**
 * images.mjs — shrinking a model's textures for the web.
 *
 * A headless Chromium decodes the PNG and JPEG textures, scales them down and
 * encodes WebP, so preparation needs no image library beyond the browser the
 * test suite already installs. Colour conversion is switched off: normal and
 * roughness maps are data, not pictures, and must keep their exact values.
 */

/**
 * @param {{ bytes: Uint8Array, mimeType: string, maxSize: number, quality: number }[]} images
 *   `maxSize` caps the longer side in pixels; `quality` is the WebP quality, 0 to 1
 * @returns {Promise<{ bytes: Uint8Array, width: number, height: number, sourceWidth: number, sourceHeight: number }[]>}
 */
export async function toWebp(images) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const results = [];
    for (const image of images) {
      const encoded = await page.evaluate(async ({ base64, mimeType, maxSize, quality }) => {
        const blob = await (await fetch(`data:${mimeType};base64,${base64}`)).blob();
        const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
        const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, 0, 0, width, height);
        const webp = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/webp', quality })).arrayBuffer());
        let binary = '';
        for (let i = 0; i < webp.length; i += 0x8000) binary += String.fromCharCode(...webp.subarray(i, i + 0x8000));
        return { base64: btoa(binary), width, height, sourceWidth: bitmap.width, sourceHeight: bitmap.height };
      }, { base64: Buffer.from(image.bytes).toString('base64'), mimeType: image.mimeType, maxSize: image.maxSize, quality: image.quality });
      results.push({ ...encoded, bytes: new Uint8Array(Buffer.from(encoded.base64, 'base64')), base64: undefined });
    }
    return results;
  } finally {
    await browser.close();
  }
}
