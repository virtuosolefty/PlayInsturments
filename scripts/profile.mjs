/**
 * profile.mjs — find out where a practice run actually spends its time.
 *
 * "It feels laggy" is not something you can fix by reading code, and the two
 * plausible causes here point in opposite directions: a renderer doing too much
 * per frame, or React re-rendering the whole application on every key press.
 * Guessing between them is how you end up optimising the fast one.
 *
 * So this drives a real run in a real browser — playing along on the computer
 * keyboard, which goes through the same path as a MIDI controller — while
 * collecting three things:
 *
 *   · a V8 CPU profile, aggregated by self time, so the answer is a function
 *     name and not a hunch;
 *   · every frame interval, so the cost is expressed as dropped frames rather
 *     than as milliseconds nobody can picture;
 *   · long tasks, which are what a player actually feels as lag.
 *
 *   node scripts/profile.mjs            Stage renderer
 *   ROLL=canvas node scripts/profile.mjs
 *   SECONDS=20 node scripts/profile.mjs
 */
import { chromium } from '@playwright/test';

const URL = process.argv[2] ?? 'http://localhost:5199/';
const ROLL = process.env.ROLL ?? 'gl';
const SECONDS = Number(process.env.SECONDS ?? 14);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The QWERTY piano row, so the run has input to score. */
const KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1571, height: 962 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

/**
 * Count React commits, and time every animation-frame callback.
 *
 * The commit counter is the DevTools hook. React looks for it at start-up and
 * calls it on every commit whether or not anything is listening, in minified
 * builds as well as development ones — which makes it the only way to ask "how
 * often is this application re-rendering while you play" and get an answer that
 * is true of the build the player is actually running.
 */
await page.addInitScript(() => {
  window.__commits = [];
  window.__cbs = [];
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    inject(renderer) {
      const id = this.renderers.size + 1;
      this.renderers.set(id, renderer);
      return id;
    },
    onCommitFiberRoot() {
      window.__commits.push(performance.now());
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
    isDisabled: false,
  };

  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      const started = performance.now();
      cb(t);
      window.__cbs.push(performance.now() - started);
    });
});

await page.addInitScript(
  ([roll, cues, click]) => {
    localStorage.setItem(
      'piano-practice-coach:v1',
      JSON.stringify({
        version: 1,
        songs: {},
        settings: {
          onboarded: true,
          renderer: roll,
          mode: 'practice',
          countInBars: 0,
          errorCues: cues,
          metronome: click,
        },
      }),
    );
  },
  [ROLL, process.env.CUES !== '0', process.env.CLICK !== '0'],
);

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await wait(1200);

  // Frame intervals and long tasks, collected in the page so the numbers are
  // the page's own and not distorted by the protocol round trip.
  await page.evaluate(() => {
    window.__frames = [];
    window.__long = [];
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      window.__frames.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__long.push({ start: e.startTime, ms: Math.round(e.duration) });
      }
    }).observe({ entryTypes: ['longtask'] });
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });

  await page.keyboard.press('Space'); // start the run
  await wait(700);
  await page.evaluate(() => {
    window.__frames.length = 0;
    window.__long.length = 0;
    window.__commits.length = 0;
    window.__cbs.length = 0;
  });
  await cdp.send('Profiler.start');

  // Play along, roughly two notes a second, held like real notes.
  const until = Date.now() + SECONDS * 1000;
  let i = 0;
  while (Date.now() < until) {
    const key = KEYS[i % KEYS.length];
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.down(key);
    // eslint-disable-next-line no-await-in-loop
    await wait(170);
    // eslint-disable-next-line no-await-in-loop
    await page.keyboard.up(key);
    // eslint-disable-next-line no-await-in-loop
    await wait(330);
    i += 1;
  }

  const { profile } = await cdp.send('Profiler.stop');
  const { frames, long, commits, cbs } = await page.evaluate(() => ({
    frames: window.__frames,
    long: window.__long,
    commits: window.__commits,
    cbs: window.__cbs,
  }));

  /* ------------------------------------------------------------ self time */
  const byNode = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const totalSamples = profile.samples.length;
  for (const id of profile.samples) {
    const node = byNode.get(id);
    if (!node) continue;
    const f = node.callFrame;
    const where = f.url ? f.url.replace(/^.*\/(?=[^/]+$)/, '') : 'native';
    const key = `${f.functionName || '(anonymous)'}  ${where}${f.lineNumber >= 0 ? `:${f.lineNumber + 1}` : ''}`;
    self.set(key, (self.get(key) ?? 0) + 1);
  }
  const ranked = [...self.entries()].sort((a, b) => b[1] - a[1]);

  const pct = (n) => `${((n / totalSamples) * 100).toFixed(1)}%`;
  console.log(`\n=== ${ROLL} · ${SECONDS}s · ${totalSamples} samples ===\n`);
  console.log('top self time');
  for (const [name, n] of ranked.slice(0, 22)) {
    console.log(`  ${pct(n).padStart(6)}  ${name}`);
  }

  /* --------------------------------------------------------------- frames */
  const sorted = frames.slice().sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const budget = 1000 / 60;
  const dropped = frames.filter((f) => f > budget * 1.8).length;
  console.log('\nframe interval, ms');
  console.log(
    `  median ${at(0.5).toFixed(1)}   p90 ${at(0.9).toFixed(1)}   p99 ${at(0.99).toFixed(1)}   worst ${at(1).toFixed(1)}`,
  );
  console.log(`  ${dropped} of ${frames.length} frames took over ${(budget * 1.8).toFixed(0)} ms`);

  /**
   * Long tasks, and whether a React commit happened inside each one.
   *
   * `longtask.startTime` and `performance.now()` share a base, so a commit
   * landing inside the window is direct evidence rather than coincidence —
   * which is the difference between "React is probably it" and knowing.
   */
  console.log('\nlong tasks over 50 ms');
  if (!long.length) console.log('  none');
  const withCommit = long.filter((t) =>
    commits.some((c) => c >= t.start - 1 && c <= t.start + t.ms + 1),
  );
  for (const t of long.slice().sort((a, b) => b.ms - a.ms).slice(0, 12)) {
    const inside = commits.filter((c) => c >= t.start - 1 && c <= t.start + t.ms + 1).length;
    console.log(`  ${String(t.ms).padStart(4)} ms   ${inside} React commit(s) inside`);
  }
  if (long.length) {
    console.log(`  ${withCommit.length} of ${long.length} contained a commit`);
  }

  /* -------------------------------------------------------------- React */
  const span = commits.length ? (commits[commits.length - 1] - commits[0]) / 1000 : 0;
  console.log('\nReact');
  console.log(
    `  ${commits.length} commits in ${span.toFixed(1)}s — ${span ? (commits.length / span).toFixed(1) : 0} per second`,
  );

  /* --------------------------------------- where the frame budget goes */
  const cbTotal = cbs.reduce((s, v) => s + v, 0);
  const wall = frames.reduce((s, v) => s + v, 0);
  const cbSorted = cbs.slice().sort((a, b) => a - b);
  const cbAt = (q) => cbSorted[Math.min(cbSorted.length - 1, Math.floor(cbSorted.length * q))] ?? 0;
  console.log('\nanimation-frame callbacks (both render loops)');
  console.log(
    `  median ${cbAt(0.5).toFixed(1)} ms   p95 ${cbAt(0.95).toFixed(1)} ms   worst ${cbAt(1).toFixed(1)} ms`,
  );
  console.log(
    `  ${((cbTotal / Math.max(1, wall)) * 100).toFixed(1)}% of wall time is spent inside them`,
  );
} finally {
  await browser.close();
}
