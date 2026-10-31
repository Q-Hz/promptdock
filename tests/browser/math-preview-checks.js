// Evaluate on manager-layout.html or launcher-preview.html?variables=math.
(async () => {
  const { mathPreviewBody } = await import('/tests/browser/math-preview-fixture.ts');
  const passed = [];
  const expect = (condition, label) => { if (!condition) throw new Error(label); passed.push(label); };
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(requestAnimationFrame); };
  const button = (...labels) => [...document.querySelectorAll('button')].find(element => labels.includes(element.textContent.trim()));
  const manager = !!document.querySelector('[data-template-editor]');
  let surface;
  if (manager) {
    const toggle = document.querySelector('[data-manager-preview-toggle]');
    if (document.querySelector('[data-manager-preview]')) { toggle.click(); await settle(); }
    const editor = document.querySelector('[data-template-editor] textarea');
    editor.value = mathPreviewBody;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    const title = document.querySelector('main input[data-manager-field]');
    title.value = 'LaTeX 公式预览';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(); toggle.click(); await settle();
    surface = document.querySelector('[data-manager-preview]');
    expect(surface.querySelector('[data-preview-token]'), 'Manager variable markers still work next to formulas');
    expect(surface.querySelector('[data-preview-option] .katex'), 'Optional snippet equations render in the manager');
    expect(editor.value === mathPreviewBody, 'Rendering preserves the manager source exactly');
  } else {
    document.querySelector('[data-launcher-list] button').click(); await settle();
    const toggle = document.querySelector('[data-preview-toggle]');
    if (toggle.getAttribute('aria-pressed') !== 'true') { toggle.click(); await settle(); }
    surface = document.querySelector('[data-variable-preview] [data-markdown-preview]');
    expect(surface?.querySelectorAll('.katex').length >= 7, 'Launcher variable preview renders inline, display and snippet equations');
    const task = document.querySelector('[data-variable-field="task"] textarea');
    task.value = '实时数学预览'; task.dispatchEvent(new Event('input', { bubbles: true })); await settle();
    expect(surface.textContent.includes('实时数学预览') && surface.querySelector('.katex'), 'Live updates preserve formula rendering');
    const live = surface.innerHTML;
    button('生成提示词', 'Generate Prompt').click(); await settle();
    surface = document.querySelector('[data-markdown-preview]');
    expect(surface.innerHTML === live, 'Result and live variable previews use the same KaTeX output');
    const source = document.querySelector('#result-input');
    expect(source.value.includes('$$') && source.value.includes('\\frac') && source.value.includes('\\['), 'Generated copy source keeps the original LaTeX delimiters and commands');
    source.value += '\n\n新公式：$z^3$'; source.dispatchEvent(new Event('input', { bubbles: true })); await settle();
    expect(surface.querySelector('annotation') && [...surface.querySelectorAll('annotation')].some(element => element.textContent === 'z^3'), 'Editing the generated result updates its math preview');
  }
  await document.fonts.ready;
  expect(surface.querySelectorAll('.katex').length >= 7, 'Four math delimiter styles, matrix, table and long equation render');
  expect(!surface.querySelector('.katex-error'), 'Valid synthetic formulas have no math errors');
  expect(surface.querySelector('code')?.textContent === '$x_i$' && !surface.querySelector('code .katex'), 'Code examples stay literal');
  expect(getComputedStyle(surface.querySelector('.katex .mathnormal')).fontFamily.includes('KaTeX'), 'KaTeX font stylesheet is applied');
  expect(document.fonts.check('italic 16px KaTeX_Math'), 'Local math fonts loaded successfully');
  const blocks = [...surface.querySelectorAll('.katex-block')];
  const long = blocks.find(element => element.scrollWidth > element.clientWidth + 10);
  expect(long && getComputedStyle(long).overflowX === 'auto', 'Long equations scroll inside their own block');
  expect(document.documentElement.scrollWidth <= innerWidth, 'Equations do not overflow the window horizontally');
  const fontRequests = performance.getEntriesByType('resource').filter(entry => /KaTeX.*\.(woff2?|ttf)/.test(entry.name));
  expect(fontRequests.length > 0 && fontRequests.every(entry => new URL(entry.name).origin === location.origin), 'Font requests use bundled local assets, not a CDN');
  const mathml = surface.querySelector('.katex-mathml').getBoundingClientRect();
  expect(mathml.width <= 2, 'Accessible MathML is visually hidden instead of duplicating equations');
  return { surface: manager ? 'manager' : 'launcher-live-and-result', count: passed.length, passed };
})()
