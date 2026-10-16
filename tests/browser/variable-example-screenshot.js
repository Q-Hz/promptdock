// Prepare the actual launcher for an element screenshot, using its localized example body.
// Run via agent-browser eval -b after opening launcher-preview.html?example=Plain&lang=zh.
(async () => {
  const params = new URLSearchParams(location.search);
  const kind = params.get('example');
  const zh = params.get('lang') !== 'en';
  const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); };
  if (!document.querySelector('[data-launcher-variables]')) {
    document.querySelector('[data-launcher-results] button, [data-launcher-content] button')?.click();
    // The search fixture contains exactly one prompt.
    if (!document.querySelector('[data-launcher-variables]')) {
      document.querySelector('button')?.click();
    }
    await settle();
  }
  if (!document.querySelector('[data-launcher-variables]')) throw new Error('Example was not opened');
  if (kind === 'Plain') {
    const field = document.querySelector('textarea');
    field.value = zh ? '今天完成了需求评审。' : 'We completed the requirements review today.';
    field.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (kind === 'Select') {
    const options = document.querySelectorAll('[role="option"]');
    options[1].click();
  } else if (kind === 'Multi') {
    const options = document.querySelectorAll('[data-variable-options] input');
    options[0].click();
    options[2].click();
  } else if (kind === 'Snippet') {
    document.querySelector('[data-snippet-expand]').click();
  }
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  await settle();
  const inputs = [...document.querySelectorAll('[data-launcher-fields] textarea')];
  if (inputs.some(input => input.getBoundingClientRect().height < 80)) throw new Error('Clipped example field');
  return { kind, lang: zh ? 'zh' : 'en', fields: inputs.length };
})()
