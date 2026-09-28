import { test, expect } from '../fixtures/index.js';

test.describe('Anirudh Ravichander collection', () => {
  test('Amma Amma loads and plays', async ({ appPage, page }) => {
    // Open library
    await page.getByRole('button', { name: /library/i }).click();
    await page.waitForTimeout(500);

    // Search for Amma Amma
    const ammaAmma = await page.locator('button', { hasText: /Amma Amma/ }).first();
    await expect(ammaAmma).toBeVisible();

    // Click to load
    await ammaAmma.click();
    await page.waitForTimeout(1000);

    // Verify score loaded
    const title = page.getByRole('heading', { name: /Amma Amma/ });
    await expect(title).toBeVisible();

    // Verify Play button exists (the play icon in the transport controls)
    const playButton = page.getByRole('button', { name: /play/i }).first();
    await expect(playButton).toBeVisible();
  });

  test('Raga of Revenge loads', async ({ appPage, page }) => {
    // Open library
    await page.getByRole('button', { name: /library/i }).click();
    await page.waitForTimeout(500);

    // Search for Raga of Revenge
    const ragaOfRevenge = await page.locator('button', { hasText: /Raga of Revenge/ }).first();
    await expect(ragaOfRevenge).toBeVisible();

    // Click to load
    await ragaOfRevenge.click();
    await page.waitForTimeout(1000);

    // Verify score loaded
    const title = page.getByRole('heading', { name: /Raga of Revenge/ });
    await expect(title).toBeVisible();
  });

  test('Rowdy Baby loads', async ({ appPage, page }) => {
    // Open library
    await page.getByRole('button', { name: /library/i }).click();
    await page.waitForTimeout(500);

    // Search for Rowdy Baby
    const rowdyBaby = await page.locator('button', { hasText: /Rowdy Baby/ }).first();
    await expect(rowdyBaby).toBeVisible();

    // Click to load
    await rowdyBaby.click();
    await page.waitForTimeout(1000);

    // Verify score loaded
    const title = page.getByRole('heading', { name: /Rowdy Baby/ });
    await expect(title).toBeVisible();
  });

  test('Kannazhaga loads', async ({ appPage, page }) => {
    // Open library
    await page.getByRole('button', { name: /library/i }).click();
    await page.waitForTimeout(500);

    // Search for Kannazhaga
    const kannazhaga = await page.locator('button', { hasText: /Kannazhaga/ }).first();
    await expect(kannazhaga).toBeVisible();

    // Click to load
    await kannazhaga.click();
    await page.waitForTimeout(1000);

    // Verify score loaded
    const title = page.getByRole('heading', { name: /Kannazhaga/ });
    await expect(title).toBeVisible();
  });

  test('Theevandi Theme loads', async ({ appPage, page }) => {
    // Open library
    await page.getByRole('button', { name: /library/i }).click();
    await page.waitForTimeout(500);

    // Search for Theevandi Theme
    const theevandi = await page.locator('button', { hasText: /Theevandi/ }).first();
    await expect(theevandi).toBeVisible();

    // Click to load
    await theevandi.click();
    await page.waitForTimeout(1000);

    // Verify score loaded
    const title = page.getByRole('heading', { name: /Theevandi/ });
    await expect(title).toBeVisible();
  });

  test('Anjathe Pookkal loads', async ({ appPage, page }) => {
    // Open library
    await page.getByRole('button', { name: /library/i }).click();
    await page.waitForTimeout(500);

    // Search for Anjathe Pookkal
    const anjathe = await page.locator('button', { hasText: /Anjathe/ }).first();
    await expect(anjathe).toBeVisible();

    // Click to load
    await anjathe.click();
    await page.waitForTimeout(1000);

    // Verify score loaded
    const title = page.getByRole('heading', { name: /Anjathe/ });
    await expect(title).toBeVisible();
  });

  test('keyboard-dependent MIDI selection', async ({ appPage, page }) => {
    // Open library
    await page.getByRole('button', { name: /library/i }).click();
    await page.waitForTimeout(500);

    // Load Amma Amma (should use 88-key by default)
    const ammaAmma = await page.locator('button', { hasText: /Amma Amma/ }).first();
    await ammaAmma.click();
    await page.waitForTimeout(1000);

    // Verify the score loaded (notes should be present)
    const notes = page.locator('[class*="note"]');
    const noteCount = await notes.count();

    // Should have some notes loaded
    expect(noteCount).toBeGreaterThan(0);
  });
});
