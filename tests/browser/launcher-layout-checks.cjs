// Usage: node tests/browser/launcher-layout-checks.cjs <playwright-package-path>
// Synthetic launcher fixture only; Vite must listen on port 1431.
const assert = require('node:assert/strict');
const { chromium } = require(process.argv[2] || 'playwright');
const base = 'http://127.0.0.1:1431/tests/browser/launcher-preview.html';
const prefKey = 'launcher.markdownPreviewOpen';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 640, height: 720 } });
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await context.newPage();
  const button = name => page.getByRole('button', { name, exact: true });
  const choose = async kind => {
    await page.goto(`${base}?variables=${kind}`);
    await page.getByRole('button', { name: 'Markdown 预览验收' }).click();
    await page.locator('[data-launcher-variables]').waitFor();
  };
  const geometry = () => page.evaluate(() => {
    const viewport = document.querySelector('[data-launcher-variables]');
    const fields = document.querySelector('[data-launcher-fields]');
    const rect = element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
    return {
      viewport: rect(viewport), fields: rect(fields),
      inputs: [...viewport.querySelectorAll('textarea')].map(rect),
      options: [...viewport.querySelectorAll('[data-variable-options]')].map(rect),
      actions: rect(document.querySelector('[data-launcher-variable-actions]')),
      scrollHeight: viewport.scrollHeight, clientHeight: viewport.clientHeight,
      hint: rect(document.querySelector('[data-launcher-hint]')),
    };
  });
  try {
    for (const [kind, count] of [['one', 1], ['two', 2], ['three', 3], ['mixed', 2]]) {
      await choose(kind);
      await page.waitForFunction(() => document.querySelector('textarea').offsetHeight > 100);
      const g = await geometry();
      assert.equal(g.inputs.length, count);
      assert.ok(g.inputs.every(input => Math.abs(input.height - g.inputs[0].height) < 1), kind);
      assert.ok(Math.abs(g.fields.height - g.clientHeight) < 2, `${kind} fills viewport`);
      assert.ok(g.actions.bottom <= g.hint.top, `${kind} actions stay visible`);
      assert.ok(g.options.every(option => option.height < 60), 'choices stay compact');
      if (kind === 'two' || kind === 'mixed') assert.equal(await page.locator('textarea').nth(1).inputValue(), 'default request');
    }
    // The native resize handle can enlarge one field without overlapping the next.
    await choose('two');
    await page.waitForFunction(() => document.querySelector('textarea').offsetHeight > 200);
    const textarea = page.locator('textarea').first();
    const bounds = await textarea.boundingBox();
    await page.mouse.move(bounds.x + bounds.width - 3, bounds.y + bounds.height - 3);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width - 3, bounds.y + bounds.height + 97, { steps: 12 });
    await page.mouse.up();
    let g = await geometry();
    assert.ok(g.inputs[0].height > bounds.height + 60, 'manual resize grows input');
    assert.ok(g.inputs[1].top > g.inputs[0].bottom, 'following field moves down');
    assert.ok(g.scrollHeight > g.clientHeight, 'form scrolls after resize');
    assert.ok(g.actions.bottom <= g.hint.top, 'actions remain fixed');
    await textarea.fill('line one');
    await textarea.press('Shift+Enter');
    await textarea.press('a');
    assert.equal(await textarea.inputValue(), 'line one\na');
    if (process.argv[3]) {
      await choose('two');
      await page.waitForFunction(() => document.querySelector('textarea').offsetHeight > 200);
      await page.screenshot({ path: process.argv[3] });
    }
    await page.setViewportSize({ width: 480, height: 320 });
    await choose('many');
    g = await geometry();
    assert.equal(g.inputs.length, 12);
    assert.ok(g.inputs.every(input => input.height >= 80));
    assert.ok(g.scrollHeight > g.clientHeight);
    await page.locator('[data-launcher-variables]').evaluate(el => { el.scrollTop = el.scrollHeight; });
    g = await geometry();
    assert.ok(g.inputs[11].bottom <= g.viewport.bottom + 1, 'last input reachable');
    assert.ok(g.actions.bottom <= g.hint.top, 'actions visible at minimum window size');
    await choose('options');
    assert.equal(await page.locator('textarea').count(), 0);
    await choose('one');
    await page.setViewportSize({ width: 640, height: 720 });
    await page.waitForFunction(() => document.querySelector('textarea').offsetHeight > 500);
    assert.ok(Math.abs((await geometry()).fields.height - (await geometry()).clientHeight) < 2);

    // New WebView instances recover both states using the same persistent storage.
    await button('生成提示词').click();
    await page.evaluate(key => localStorage.removeItem(key), prefKey);
    await button('打开预览').click();
    await page.waitForFunction(key => localStorage.getItem(key) === 'true', prefKey);
    await button('返回').click();
    await button('生成提示词').click();
    assert.equal(await page.locator('[data-preview-toggle]').getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => window.__launcherFixture.emit('main-shown'));
    await page.getByRole('button', { name: 'Markdown 预览验收' }).click();
    await button('生成提示词').click();
    assert.equal(await page.locator('[data-preview-toggle]').getAttribute('aria-pressed'), 'true');
    await page.close();
    const restarted = await context.newPage();
    const generate = async target => {
      await target.goto(base);
      await target.getByRole('button', { name: 'Markdown 预览验收' }).click();
      await target.getByRole('button', { name: '生成提示词', exact: true }).click();
    };
    await generate(restarted);
    assert.equal(await restarted.locator('[data-preview-toggle]').getAttribute('aria-pressed'), 'true');
    await restarted.getByRole('button', { name: '收起预览', exact: true }).click();
    await restarted.waitForFunction(key => localStorage.getItem(key) === 'false', prefKey);
    await restarted.close();
    const closedRestart = await context.newPage();
    await generate(closedRestart);
    assert.equal(await closedRestart.locator('[data-preview-toggle]').getAttribute('aria-pressed'), 'false');
    // Exit must wait for the queued write instead of destroying the page immediately.
    await closedRestart.evaluate(() => { window.__launcherFixture.writeDelay = 200; });
    await closedRestart.getByRole('button', { name: '打开预览', exact: true }).click();
    await closedRestart.evaluate(() => { void window.__launcherFixture.emit('launcher-quit-requested'); });
    assert.deepEqual(await closedRestart.evaluate(() => window.__launcherFixture.quitReplies), []);
    await closedRestart.waitForFunction(() => window.__launcherFixture.quitReplies.length === 1);
    assert.equal(await closedRestart.evaluate(key => localStorage.getItem(key), prefKey), 'true');
    assert.deepEqual(await closedRestart.evaluate(() => window.__launcherFixture.quitReplies), [true]);
    await closedRestart.close();
    const failed = await context.newPage();
    await generate(failed);
    await failed.evaluate(() => { window.__launcherFixture.failWrite = true; });
    await failed.getByRole('button', { name: '收起预览', exact: true }).click();
    await failed.getByRole('alert').waitFor();
    await failed.evaluate(() => window.__launcherFixture.emit('launcher-quit-requested'));
    assert.deepEqual(await failed.evaluate(() => window.__launcherFixture.quitReplies), [false]);
    await failed.evaluate(() => { window.__launcherFixture.failWrite = false; });
    await failed.evaluate(() => window.__launcherFixture.emit('launcher-quit-requested'));
    assert.deepEqual(await failed.evaluate(() => window.__launcherFixture.quitReplies), [false, true]);
    assert.equal(await failed.evaluate(key => localStorage.getItem(key), prefKey), 'false');
    await failed.close();
    const readRetry = await context.newPage();
    await generate(readRetry);
    await readRetry.evaluate(key => {
      localStorage.setItem(key, 'true');
      window.__launcherFixture.failRead = true;
    }, prefKey);
    await readRetry.evaluate(() => window.__launcherFixture.emit('main-shown'));
    await readRetry.getByRole('alert').waitFor();
    await readRetry.evaluate(() => { window.__launcherFixture.failRead = false; });
    await readRetry.evaluate(() => window.__launcherFixture.emit('main-shown'));
    await readRetry.getByRole('button', { name: 'Markdown 预览验收' }).click();
    await readRetry.getByRole('button', { name: '生成提示词', exact: true }).click();
    assert.equal(await readRetry.locator('[data-preview-toggle]').getAttribute('aria-pressed'), 'true');
    assert.equal(await readRetry.getByRole('alert').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: equal text heights, defaults, mixed choices, manual resize, overflow, fixed actions, window resize, preview restore, quit flush/retry, read retry, no page errors');
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
