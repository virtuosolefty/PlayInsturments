/** Latch the real output meter before the short pluck, so slower test hosts
 * cannot miss its peak between Playwright polling round trips. */
export async function watchSound(page) {
  await page.evaluate(() => {
    window.__studioHeardSound = false;
    new MutationObserver(() => {
      if ([...document.querySelectorAll('.level-meter i')].some(bar => bar.style.opacity === '1')) window.__studioHeardSound = true;
    }).observe(document.querySelector('.io-strip'), { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  });
}
