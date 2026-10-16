// agent-browser eval -b; synthetic IPC with real Vue mount/unmount and blur events.
(async () => {
  const passed = [];
  const expect = (condition, label) => { if (!condition) throw new Error(label); passed.push(label); };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fixture = window.__launcherFixture;
  const choose = async () => {
    const item = document.querySelector('[data-launcher-list] button');
    expect(!!item, 'Prompt can be selected');
    item.click(); await pause(50);
  };
  const hideCount = () => Number(document.documentElement.dataset.hideCalls || 0);
  const originalFocus = document.hasFocus;
  document.hasFocus = () => false;
  document.documentElement.dataset.nativeFocused = 'false';
  try {
    // An async startup that finishes after HMR must never attach a stale blur listener.
    fixture.settingsDelay = 250;
    fixture.remount(); await pause(50);
    fixture.remount(); await pause(350);
    fixture.settingsDelay = 0;
    await choose();
    const before = hideCount();
    window.dispatchEvent(new Event('blur')); await pause(250);
    expect(hideCount() === before, 'Variable entry stays visible after startup is interrupted and remounted');
    [...document.querySelectorAll('button')].find(b => ['生成提示词', 'Generate Prompt'].includes(b.textContent.trim())).click();
    await pause(50);
    window.dispatchEvent(new Event('blur')); await pause(250);
    expect(hideCount() === before && !!document.querySelector('#result-input'), 'Result page stays visible when focus moves outside');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await pause(50);
    expect(!!document.querySelector('[data-launcher-variables]') && hideCount() === before, 'Escape returns from result to variables without hiding');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await pause(50);
    expect(!!document.querySelector('#launcher-input') && hideCount() === before, 'Escape returns from variables to search without hiding');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await pause(50);
    expect(hideCount() === before + 1, 'Escape in search closes the launcher');
    await choose();
    [...document.querySelectorAll('button')].find(b => ['生成提示词', 'Generate Prompt'].includes(b.textContent.trim())).click(); await pause(50);
    [...document.querySelectorAll('button')].find(b => ['复制提示词', 'Copy Prompt', '复制并关闭', 'Copy & Close'].includes(b.textContent.trim())).click(); await pause(100);
    expect(hideCount() === before + 2, 'Successful copy closes the launcher');
    fixture.remount(); await pause(100);
    const searchBefore = hideCount();
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus')); await pause(250);
    expect(hideCount() === searchBefore, 'Transient search blur is cancelled on refocus');
    window.dispatchEvent(new Event('blur')); await pause(250);
    expect(hideCount() === searchBefore + 1, 'Search still hides on sustained external focus');
    return { count: passed.length, passed };
  } finally { document.hasFocus = originalFocus; fixture.settingsDelay = 0; }
})()
