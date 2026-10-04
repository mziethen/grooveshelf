exports.openNavigation = async page => {
  const toggle = page.locator('#nav-toggle');
  if (!await toggle.isVisible()) return;
  // Module initialization can finish after the page load event. Wait for the
  // mobile navigation's inert state before interacting with its toggle.
  await page.waitForFunction(() => document.querySelector('#app-navigation').inert ||
    document.querySelector('#nav-toggle').getAttribute('aria-expanded') === 'true');
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await page.waitForFunction(() => document.querySelector('#nav-toggle').getAttribute('aria-expanded') === 'true');
};
