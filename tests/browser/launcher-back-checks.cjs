// Usage: node tests/browser/launcher-back-checks.cjs <playwright-package-path>
// Run against the synthetic fixture with Vite listening on port 1431.
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2] || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:1431/tests/browser/launcher-preview.html?back-guard');
    const button = name => page.getByRole('button', { name, exact: true });
    const dialog = page.getByRole('alertdialog');
    const text = page.locator('textarea.variable-input');
    const result = page.locator('#result-input');
    const choose = () => page.getByText('Markdown 预览验收', { exact: true }).click();
    const absent = async () => assert.equal(await dialog.count(), 0);
    const modal = async () => {
      await dialog.waitFor();
      assert.equal(await dialog.getByRole('button').count(), 2);
      assert.equal(await button('取消').getAttribute('title'), 'Esc');
      assert.equal(await button('取消').getAttribute('aria-keyshortcuts'), 'Escape');
    };

    await choose();
    await button('返回').hover();
    assert.equal(await button('返回').getAttribute('title'), 'Esc');
    await button('返回').click();
    await page.locator('#launcher-input').waitFor();
    await absent();

    await choose();
    await text.fill('draft');
    await text.press('Escape');
    await modal();
    await button('取消').click();
    assert.equal(await text.inputValue(), 'draft');
    assert.equal(await text.evaluate(el => document.activeElement === el), true);
    await text.press('Escape');
    await modal();
    await page.keyboard.press('Escape');
    await absent();
    assert.equal(await text.inputValue(), 'draft');

    await button('返回').click();
    await modal();
    await button('放弃修改并返回').hover();
    assert.equal(await button('放弃修改并返回').getAttribute('title'), 'Enter');
    // Holding Enter or composing text must not discard the draft.
    await dialog.dispatchEvent('keydown', { key: 'Enter', repeat: true, bubbles: true });
    await modal();
    await dialog.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
    await modal();
    // A fresh Enter confirms discard without generating or copying.
    await page.keyboard.press('Enter');
    await page.locator('#launcher-input').waitFor();
    assert.equal(await result.count(), 0);
    assert.equal(await page.locator('html').getAttribute('data-hide-calls'), null);
    await choose();
    assert.equal(await text.inputValue(), 'initial');

    await page.getByRole('option', { name: 'b', exact: true }).click();
    await button('返回').click();
    await modal();
    await button('取消').click();
    await page.getByRole('option', { name: 'a', exact: true }).click();
    await page.getByRole('checkbox').first().check();
    await button('返回').click();
    await modal();
    await page.keyboard.press('Escape');
    await page.getByRole('checkbox').first().uncheck();
    await text.fill('changed');
    await text.fill('initial');
    await button('返回').click();
    await page.locator('#launcher-input').waitFor();
    await absent();

    await choose();
    await text.fill('kept variable');
    await button('生成提示词').click();
    const generated = await result.inputValue();
    assert.equal(await button('返回').getAttribute('title'), 'Esc');
    await result.fill('edited result');
    await button('返回').click();
    await modal();
    await button('取消').click();
    assert.equal(await result.inputValue(), 'edited result');
    await result.press('Escape');
    await modal();
    await page.keyboard.press('Escape');
    assert.equal(await result.inputValue(), 'edited result');
    await button('返回').click();
    await modal();
    await page.keyboard.press('Enter');
    await text.waitFor();
    assert.equal(await text.inputValue(), 'kept variable');
    await button('生成提示词').click();
    assert.equal(await result.inputValue(), generated);
    await result.fill('another edit');
    await result.fill(generated);
    await result.press('Escape');
    await text.waitFor();
    await absent();
    assert.equal(await text.inputValue(), 'kept variable');
    // Shared manager confirmations must advertise their existing Esc action too.
    await page.evaluate(async () => {
      const dialogs = await import('/src/lib/confirm-dialog.ts');
      void dialogs.openUnsavedDialog();
    });
    await dialog.waitFor();
    assert.equal(await button('取消').getAttribute('title'), 'Esc');
    await page.keyboard.press('Escape');
    await absent();
    await page.evaluate(async () => {
      const dialogs = await import('/src/lib/confirm-dialog.ts');
      void dialogs.openDiscardDialog();
    });
    await dialog.waitFor();
    assert.equal(await button('继续处理').getAttribute('title'), 'Esc');
    await page.keyboard.press('Escape');
    await absent();
    assert.deepEqual(errors, []);
    console.log('PASS: clean back, text/select/multi changes, baseline restoration, cancel/focus, modal Esc/Enter, discard result preserves variables, no page errors');
    await page.goto('http://127.0.0.1:1431/tests/browser/manager-layout.html?lang=zh&theme=light');
    await page.locator('[data-manager-sidebar]').waitFor();
    const iconChecks = await page.evaluate(async () => {
      const checks = await import('/tests/browser/folder-icon-checks.js');
      return checks.runFolderIconChecks();
    });
    assert.deepEqual(errors, []);
    console.log('PASS: folder icon controls, including cancel Esc tooltip: ' + JSON.stringify(iconChecks));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
