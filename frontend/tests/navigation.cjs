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

exports.openRecordTools = async page => {
  const tools = page.locator('#record-tools');
  await tools.waitFor();
  if (!await tools.evaluate(element => element.open)) await tools.locator('summary').click();
};
exports.openExports = async page => {
  await exports.openNavigation(page);
  const tools = page.locator('#export-options');
  if (!await tools.evaluate(element => element.open)) await tools.locator('summary').click();
};
