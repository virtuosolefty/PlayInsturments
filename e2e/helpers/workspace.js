/**
 * Chooses Learn or Free play.
 *
 * On an upright phone the workspace switch lives in the sheet the header's
 * button opens; everywhere else it is in the header itself.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'Learn' | 'Free play'} name
 */
export async function chooseWorkspace(page, name) {
  await page.locator('.studio-header').waitFor();
  const sheet = page.getByRole('button', { name: /Change instrument or workspace/ });
  if (await sheet.isVisible()) await sheet.click();
  await page.getByRole('group', { name: 'Workspace', exact: true }).getByRole('button', { name, exact: true }).click();
}
