import { expect } from '@playwright/test';
import {
  readLocalStorageDb,
  readIndexedDbSchema,
  readIndexedDbBackup,
  clearAllPersistence,
} from '../helpers/storage.js';

/**
 * Page Object for the Practice Deck app.
 *
 * There are no `data-testid` hooks anywhere in this codebase yet (see the
 * report from this test run), so every selector here is either an
 * accessible role/name (preferred — it is also what a real player would
 * use to find the control) or a stable, semantically-named CSS class that
 * already exists in the component source. Kept in one place so a future UI
 * change only has to be fixed here, not in every spec file.
 */
export class AppPage {
  constructor(page) {
    this.page = page;

    // Chrome
    this.libraryToggle = page.getByRole('button', { name: /Library/i }).first();
    this.drawerTabs = page.getByRole('tablist');

    // Transport. `.pad-play` (in the always-mounted Controls deck) rather
    // than PiecePanel's `.piece-play`, which only exists before the first
    // note of a run — once a result exists it is replaced by FeedbackPanel,
    // and a selector that only worked for the very first run would make
    // every "play N runs back to back" test flaky-by-construction.
    this.playButton = page.locator('.pad-play');
    this.stopButton = page.getByRole('button', { name: 'Stop' });
    this.countIn = page.locator('.count-in');
    this.pieceTitleHeading = page.locator('.piece-title');

    // First-run onboarding overlay
    this.firstRunDialog = page.getByRole('dialog', { name: /A little practice. A little progress./i });
    this.firstRunDoneButton = this.firstRunDialog.getByRole('button', { name: 'Explore freely' });

    // History / results
    this.rightPane = page.locator('.pane.right');
    this.feedbackPanel = this.rightPane.locator('.section-title', { hasText: 'This run' });
    this.historyPanel = this.rightPane.locator('.section', { hasText: 'Progress' });
    this.moreRunsButton = this.rightPane.getByRole('button', { name: /more runs? in other arrangements/i });
    // Both the post-run report and the first-run onboarding card render a
    // `.report` inside a `.report-overlay`; `:not(.first-run)` is what tells
    // them apart, not `hasNot` — the two classes sit on the same element,
    // not in a parent/descendant relationship.
    this.practiceReport = page.locator('.report-overlay .report:not(.first-run)');
  }

  async goto() {
    // Core studio tests start after onboarding; public entry is covered separately.
    await this.page.addInitScript(() => {
      if(!localStorage.getItem('piano-practice-coach:v1'))localStorage.setItem('piano-practice-coach:v1',JSON.stringify({version:1,songs:{},settings:{onboarded:true}}));
    });
    await this.page.goto('/');
    await expect(this.page.getByRole('heading', { name: 'Practice Deck' })).toBeVisible({ timeout: 15_000 });
  }

  /** Fails loudly if the app rendered its top-level ErrorBoundary instead of the UI. */
  async assertNoFatalError() {
    await expect(
      this.page.getByRole('heading', { name: 'Something in the app broke' }),
    ).toHaveCount(0);
  }

  /**
   * Dismisses the onboarding card if present, retrying the click.
   *
   * Occasionally observed in this suite (rare, not reproducible on demand):
   * the card reappears a little later in the test, well after the DOM
   * confirmed it was gone. `settings.onboarded` is plain React state
   * persisted by a `useEffect` in `useAppData.js` that runs *after* the
   * commit that closes the card — so there is a real, if narrow, window
   * where the UI already reads "dismissed" but the write to localStorage
   * has not landed yet. Not waiting for that write is enough on its own to
   * explain what was observed. Rather than spend more of this task chasing
   * a sub-100ms window empirically, close it here: don't hand control back
   * to a test until the persisted value, not just the DOM, says dismissed.
   */
  async dismissFirstRunIfPresent() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const visible = await this.firstRunDoneButton.isVisible().catch(() => false);
      if (!visible) break;
      await this.firstRunDoneButton.click({ timeout: 5_000 }).catch(() => {});
      await this.firstRunDoneButton
        .waitFor({ state: 'hidden', timeout: 3_000 })
        .catch(() => {});
    }
    // Confirms the DOM state; throws with a clear message if dismissal
    // never actually stuck after 3 attempts.
    await expect(this.firstRunDoneButton).toBeHidden();

    // Confirms the *persisted* state — see the note above.
    await expect
      .poll(async () => (await this.readLocalStorageDb())?.settings?.onboarded, {
        message: '"onboarded" setting should be durably persisted before continuing',
        timeout: 5_000,
      })
      .toBe(true);
  }

  async waitForLibraryManifest() {
    // The library fetches /songs/songs.json on mount and picks the first
    // entry once it arrives — the piece title changing away from nothing is
    // the observable signal that it landed.
    await expect(this.pieceTitleHeading.first()).not.toHaveText('', { timeout: 15_000 });
  }

  async openLibrary() {
    // Defensive: any full-screen overlay (the post-run report, or — should
    // it ever reappear mid-test — the first-run card) sits in front of the
    // drawer toggle and would otherwise turn every subsequent click in a
    // multi-step flow into a 45s timeout instead of a clear failure here.
    if (await this.practiceReport.isVisible().catch(() => false)) await this.closeReport();
    await this.dismissFirstRunIfPresent();

    const expanded = await this.libraryToggle.getAttribute('aria-expanded');
    if (expanded !== 'true') await this.libraryToggle.click();
    await expect(this.libraryToggle).toHaveAttribute('aria-expanded', 'true');
  }

  async closeLibrary() {
    const expanded = await this.libraryToggle.getAttribute('aria-expanded');
    if (expanded === 'true') await this.libraryToggle.click();
    await expect(this.libraryToggle).toHaveAttribute('aria-expanded', 'false');
  }

  async selectDrawerTab(name) {
    await this.openLibrary();
    await this.page.getByRole('tab', { name: ({Path:'Today’s plan'})[name] ?? name, exact:true }).click();
  }

  /** Opens Input & sound with its More options out: timing, touch, the keyboard's size and fit, external sound. */
  async openMoreOptions() {
    await this.closeLibrary();
    await this.page.locator('.setup-trigger').click();
    const dialog = this.page.getByRole('dialog', { name: 'Your instrument, ready to play.' });
    await dialog.locator('.setup-more > summary').click();
    return dialog;
  }

  async closeMoreOptions() {
    await this.page.getByRole('button', { name: 'Done', exact: true }).click();
  }

  /** Picks a piece from the "Practice library" list by its visible title. */
  async selectSongByTitle(title) {
    await this.selectDrawerTab('Songs');
    await this.page.locator('.song-list button.song', { hasText: title }).first().click();
    await this.closeLibrary();
    await expect(this.pieceTitleHeading.first()).toContainText(title);
  }

  async currentPieceTitle() {
    return this.pieceTitleHeading.first().innerText();
  }

  /** `id` is one of the values in KEYBOARD_PROFILES (devices.js), e.g. 'mpk-mini', 'generic-88'. */
  async setKeyboardProfile(id) {
    const dialog = await this.openMoreOptions();
    await dialog.getByLabel('Keyboard', { exact: true }).selectOption(id);
    await this.closeMoreOptions();
  }

  /** `label` is one of 'As written' | 'Octave shift' | 'Fit my keys'. */
  async setFit(label) {
    const dialog = await this.openMoreOptions();
    await dialog.getByRole('button', { name: label, exact: true }).click();
    await this.closeMoreOptions();
  }

  async setDailyGoalMinutes(minutes) {
    await this.selectDrawerTab('Progress');
    // `StreakStrip` (and its "Daily goal" slider) is rendered by both the
    // Path tab and the Progress tab — Drawer.jsx keeps every tab's content
    // mounted (just `hidden`) so neither loses state when you switch away.
    // Scope to the tab panel that is actually visible, or this resolves to
    // two elements and Playwright's strict mode (correctly) refuses to
    // guess which one you meant.
    const slider = this.page.locator('.drawer-body > div:not([hidden]) .goal-field input[type="range"]');
    await slider.evaluate((el, value) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, String(value));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, minutes);
    await this.closeLibrary();
  }

  /** Starts a run and waits out the count-in bar so notes played next are actually judged. */
  async startPlaying() {
    // A previous run's report is still on screen — dismiss it first, the
    // way a player reviewing their result and then pressing Play again
    // would.
    if (await this.practiceReport.isVisible().catch(() => false)) {
      await this.closeReport();
    }
    await this.playButton.click();
    // The count-in is a bar of clicks (settings.countInBars, default 1) —
    // it may already have come and gone by the time we look, so tolerate
    // never seeing it appear.
    await this.countIn.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {});
    await this.countIn.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
  }

  /**
   * Simulates playing on a computer keyboard — the same
   * `emitSyntheticMidi` path a real MPK Mini's Web MIDI events go through
   * (see useComputerKeyboard.js / midiInput.js). This is a real exercise of
   * the scoring engine, not a UI-only click: every keypress becomes a
   * `noteon`/`noteoff` pair that `PracticeSession.noteOn` matches, scores,
   * and folds into the run's summary exactly as hardware input would.
   *
   * The exact pitches are irrelevant to what these tests assert (they don't
   * grade musicianship) — what matters, and what `matcher.js` guarantees, is
   * that a note event during a scored run always becomes either a hit or a
   * "wrong note", so a handful of presses is enough to guarantee a
   * persistable result (`hit + wrongNotes > 0`, the guard `finish()` uses
   * before it calls `recordSession`).
   */
  async simulateNotes(keys = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'a', 's', 'd', 'f', 'g']) {
    for (const key of keys) {
      await this.page.keyboard.press(key, { delay: 55 });
      await this.page.waitForTimeout(150);
    }
  }

  async stop() {
    await expect(this.stopButton).toBeEnabled();
    await this.stopButton.click();
  }

  /** Play → pass the count-in → play a spread of notes → stop. One full, realistic run. */
  async playCompleteSession(keys) {
    await this.startPlaying();
    await this.simulateNotes(keys);
    await this.stop();
  }

  /** The "Runs" figure from the History panel, or null if the panel/row isn't showing. */
  async historyRunsCount() {
    const row = this.rightPane.locator('.kv', { hasText: 'Runs' });
    if (!(await row.count())) return null;
    const text = await row.locator('span').nth(1).innerText();
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }

  async isHistoryPanelVisible() {
    return this.historyPanel.isVisible().catch(() => false);
  }

  /** Dismisses the post-run report overlay (its own "Close" button, not Escape — see useDialog). */
  async closeReport() {
    await this.practiceReport.getByRole('button', { name: 'Close' }).click();
    await expect(this.practiceReport).toBeHidden();
  }

  // ---------------------------------------------------------------- storage

  async readLocalStorageDb() {
    return this.page.evaluate(readLocalStorageDb);
  }

  async readIndexedDbSchema() {
    return this.page.evaluate(readIndexedDbSchema);
  }

  async readIndexedDbBackup() {
    return this.page.evaluate(readIndexedDbBackup);
  }

  async clearAllPersistence() {
    await this.page.evaluate(clearAllPersistence);
  }
}
