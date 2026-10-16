// Evaluate with agent-browser eval -b on manager-layout.html.
(async () => {
  const passed = [];
  const expect = (condition, label) => { if (!condition) throw new Error(label); passed.push(label); };
  const settle = () => new Promise(resolve => setTimeout(resolve, 100));
  const trigger = [...document.querySelectorAll('button')].find(b => ['查看变量示例', 'View variable examples'].includes(b.textContent.trim()));
  if (!document.querySelector('[data-variable-examples]')) trigger.click();
  await settle();
  const dialog = document.querySelector('[data-variable-examples]');
  const content = dialog.querySelector('[data-variable-examples-content]');
  const close = dialog.querySelector('button');
  const rows = [...dialog.querySelectorAll('[data-example-kind]')];
  const locale = new URLSearchParams(location.search).get('lang');
  const headings = [...dialog.querySelectorAll('thead th')];
  const expectedHeadings = locale === 'zh'
    ? ['适用场景', 'Prompt 语法', '调用界面', '生成结果示例']
    : ['Use case', 'Prompt syntax', 'Launcher controls', 'Example output'];
  const { variableExample } = await import('/src/lib/variable-examples.ts');
  await Promise.race([
    Promise.all([...dialog.querySelectorAll('img')].map(img => img.decode())),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Guide screenshots did not load')), 3000)),
  ]);
  expect(dialog.querySelector('h2').textContent === (locale === 'zh' ? '变量语法介绍文档' : 'Variable syntax guide'), 'The guide has the updated localized title');
  expect(JSON.stringify(headings.map(th => th.textContent)) === JSON.stringify(expectedHeadings), 'Four column headings describe the complete usage flow');
  expect(rows.length === 5, 'All five syntax forms are documented');
  expect(rows.every(row => row.cells.length === 4), 'Every syntax uses the same four-column structure');
  expect(rows.every(row => row.querySelector('[data-example-need]').textContent.trim()), 'Every syntax has a concrete use case');
  expect(rows.at(-1).querySelector('h3').textContent === (locale === 'zh' ? '按需添加附加要求' : 'Add requirements as needed') && rows.at(-1).querySelector('[data-example-need] p').textContent.includes('\n\n') && !/只有一条可选要求时|A single optional requirement/.test(rows.at(-1).querySelector('[data-example-need] p').textContent), 'The optional snippet scenario explains combined requirements without the removed toggle sentence');
  expect(rows.every(row => row.cells[0].matches('th[scope="row"]') && row.cells[0].querySelector('h3')), 'Syntax names identify accessible table rows');
  expect(rows.every(row => row.cells[1].querySelector('[data-example-code]') && !row.cells[1].querySelector('[data-example-generated]')), 'Prompt syntax cells contain source examples without generated output');
  expect(rows.every(row => row.cells[2].querySelector('img') && row.cells[2].querySelector('p')), 'Control illustrations and their rules share one column');
  expect(rows.every(row => row.cells[3].children.length === 1 && row.cells[3].querySelector('[data-example-generated]')), 'Generated output occupies its own column without repeated subheadings');
  expect(rows.every(row => row.querySelector('[data-example-code]').textContent === variableExample(row.dataset.exampleKind).code && row.querySelector('[data-example-generated]').textContent === variableExample(row.dataset.exampleKind).generated), 'Displayed source and output preserve all existing localized examples');
  expect(!dialog.querySelector('figcaption') && !/调用界面的实际截图|生成后的文字（示例）|Screenshot of the actual launcher|Generated text \(example\)/.test(dialog.textContent), 'Redundant screenshot captions and output subheadings are removed');
  expect(rows.every(row => row.querySelector('img').naturalWidth >= 300), 'All existing control illustrations load');
  expect(rows.every(row => row.querySelector('img').alt && row.querySelector('[data-example-generated]').textContent.trim()), 'Screenshots have localized alternatives and result examples');
  expect(rows.every(row => row.querySelector('img').src.includes(`/variable-examples/${locale}/`)), 'Screenshot language matches the guide language');
  const rect = dialog.getBoundingClientRect();
  expect(rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight, 'Guide fits the viewport');
  expect(dialog.scrollWidth <= dialog.clientWidth && document.documentElement.scrollWidth <= innerWidth, 'The guide contains overflow inside its scrollable body');
  expect(rows.every(row => row.cells[1].getBoundingClientRect().width >= 300 && row.cells[2].getBoundingClientRect().width >= 380 && row.querySelector('img').clientWidth >= 330), 'Syntax and controls retain readable widths');
  expect(innerWidth >= 1232 ? content.scrollWidth <= content.clientWidth : content.scrollWidth > content.clientWidth, 'Wide windows show all columns; narrow windows scroll horizontally');
  expect(rows.every(row => { const pre = row.querySelector('pre'); return pre.scrollWidth <= pre.clientWidth; }), 'Long syntax examples wrap within their column');
  content.scrollLeft = content.scrollWidth;
  await settle();
  expect(headings.at(-1).getBoundingClientRect().right <= content.getBoundingClientRect().right && rows[0].cells[3].getBoundingClientRect().right <= content.getBoundingClientRect().right, 'The output column is reachable by horizontal scrolling');
  close.focus();
  const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  close.dispatchEvent(shiftTab);
  expect(shiftTab.defaultPrevented && document.activeElement === content, 'Shift+Tab remains in the guide');
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  content.dispatchEvent(tab);
  expect(tab.defaultPrevented && document.activeElement === close, 'Tab remains in the guide');
  rows.at(-1).scrollIntoView({ block: 'end' });
  await settle();
  expect(close.getBoundingClientRect().top >= 0 && rows.at(-1).querySelector('img').getBoundingClientRect().bottom <= content.getBoundingClientRect().bottom, 'Last example is reachable while the close button stays visible');
  expect(headings.every(th => Math.abs(th.getBoundingClientRect().top - content.getBoundingClientRect().top) < 2), 'Column headings remain visible while scrolling vertically');
  const notes = dialog.querySelector('[data-example-notes]');
  expect(notes.firstElementChild.matches('h2') && notes.firstElementChild.textContent === (locale === 'zh' ? '补充说明' : 'Additional notes'), 'A supplementary heading introduces all three notes');
  expect(JSON.stringify([...notes.querySelectorAll('[data-example-note]')].map(section => section.dataset.exampleNote)) === JSON.stringify(['reuse', 'order', 'separator']), 'Three separate notes explain reuse, snippet order and separators');
  const separatorSamples = [...notes.querySelectorAll('pre')].map(pre => pre.textContent);
  expect(JSON.stringify(separatorSamples) === JSON.stringify(locale === 'zh' ? ['语法, 格式', '{{检查项+=[语法|事实|格式]~\\n}}', '语法\n格式'] : ['grammar, format', '{{checks+=[grammar|facts|format]~\\n}}', 'grammar\nformat']), 'Comma and newline separators have matching source and output examples');
  notes.scrollIntoView({ block: 'end', inline: 'start' });
  await settle();
  expect([...notes.querySelectorAll('p, pre')].every(element => element.scrollWidth <= element.clientWidth) && notes.getBoundingClientRect().bottom <= content.getBoundingClientRect().bottom + 1, 'Supplementary explanations wrap to the window width and remain reachable');
  dialog.parentElement.click();
  await settle();
  expect(document.querySelector('[data-variable-examples]') === dialog, 'Clicking the surrounding blank backdrop keeps the guide open');
  dialog.querySelector('header').click();
  await settle();
  expect(document.querySelector('[data-variable-examples]') === dialog, 'Clicking blank space inside the guide keeps it open');
  close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await settle();
  expect(!document.querySelector('[data-variable-examples]'), 'Escape closes the guide');
  trigger.click();
  await settle();
  document.querySelector('[data-variable-examples] button').click();
  await settle();
  expect(!document.querySelector('[data-variable-examples]'), 'The close button still closes the guide');
  trigger.click();
  await settle();
  return { locale, viewport: [innerWidth, innerHeight], count: passed.length, passed };
})()
