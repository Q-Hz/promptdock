// Execute through browser eval against /tests/browser/manager-layout.html:
//   import('/tests/browser/manager-layout-checks.js').then(m => m.runManagerLayoutChecks())
// Each group can also run on its own; they restore what they mutate so order does not matter much.
const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

const PROMPT_MENU_LABEL = "Prompt 操作";
const FOLDER_MENU_LABEL = "文件夹操作";

async function until(condition, message) {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await tick();
  }
  throw new Error(`Timed out waiting for ${message}`);
}

function sections() {
  return [...document.querySelectorAll("section[data-section-variant]")];
}
function pinnedSection() {
  return sections().find((section) => section.dataset.sectionVariant === "pinned");
}
function folderSection(title) {
  const wanted = title.trim().toLowerCase();
  return sections().find(
    (section) => section.dataset.sectionVariant === "folder"
      && (headerTitle(section) ?? "").toLowerCase() === wanted
  );
}
function headerTitle(section) {
  return section.querySelector("header button .truncate")?.textContent.trim();
}
function countLabel(section) {
  return section.querySelector("header button .tabular-nums")?.textContent.trim();
}
function rows(section) {
  return [...section.querySelectorAll("[data-prompt-id]")];
}
function rowIds(section) {
  return rows(section).map((row) => row.dataset.promptId);
}
function sectionButton(section, fragment) {
  return [...section.querySelectorAll("button")].find((button) => button.textContent.includes(fragment));
}
function viewportOf(section) {
  return section.querySelector("div.overflow-y-auto[style*='max-height']");
}

async function pressKey(element, key, shift = false) {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey: shift, bubbles: true, cancelable: true }));
  await tick();
}

async function revealRow(title, promptId) {
  for (let i = 0; i < 12; i++) {
    const section = folderSection(title);
    if (section?.querySelector(`[data-prompt-id="${promptId}"]`)) return section;
    const more = section && sectionButton(section, "显示更多");
    if (!more) throw new Error(`Row never became visible: ${promptId}`);
    more.click();
    await tick();
  }
  throw new Error(`Row never became visible: ${promptId}`);
}

async function awaitRowInSection(promptId, folderKey) {
  await until(() => [...document.querySelectorAll(`[data-prompt-id="${promptId}"]`)]
    .some((element) => element.closest("section")?.dataset.sectionKey === folderKey),
    `the interface to list ${promptId} under ${folderKey || "the uncategorized section"}`);
}

async function moveViaEditor(promptId, folder) {
  const row = [...document.querySelectorAll(`[data-prompt-id="${promptId}"]`)]
    .find((element) => element.closest("section")?.dataset.sectionVariant === "folder");
  if (!row) throw new Error(`Row not visible for the editor move: ${promptId}`);
  const record = fixtureRecord(promptId);
  row.querySelector("button").click();
  await tick();
  const field = document.querySelector('main input[list="folder-list"]');
  const title = document.querySelector('main input[placeholder="Prompt 标题"]');
  await until(() => field.value === record.folder && title.value === record.title,
    `the editor to load ${promptId}`);
  await setText(field, folder);
  [...document.querySelectorAll("main button")].find((button) => button.textContent.trim() === "保存").click();
  await until(() => fixtureRecord(promptId).folder === folder, `the editor move to ${folder} to commit`);
  await awaitRowInSection(promptId, folder);
}

function menuTrigger(scope, label) {
  const trigger = [...scope.querySelectorAll("button")].find((button) => button.textContent.trim() === "⋮");
  if (!trigger) return null;
  if (trigger.getAttribute("aria-label") !== label) {
    throw new Error(`Unexpected accessible name: ${trigger.getAttribute("aria-label")} (expected ${label})`);
  }
  return trigger;
}

async function openRowMenu(section, promptId, label = PROMPT_MENU_LABEL) {
  const row = section.querySelector(`[data-prompt-id="${promptId}"]`);
  if (!row) throw new Error(`Row not visible: ${promptId}`);
  const trigger = menuTrigger(row, label);
  if (!trigger) throw new Error(`Menu trigger missing on ${promptId}`);
  trigger.click();
  await tick();
  const menu = document.querySelector('div[role="menu"]');
  if (!menu) throw new Error(`Menu did not open for ${promptId}`);
  return menu;
}

async function openFolderMenu(title, label = FOLDER_MENU_LABEL) {
  const section = folderSection(title);
  if (!section) throw new Error(`Folder missing: ${title}`);
  const trigger = menuTrigger(section.querySelector("header"), label);
  if (!trigger) throw new Error(`Folder menu trigger missing on ${title}`);
  trigger.click();
  await tick();
  const menu = document.querySelector('div[role="menu"]');
  if (!menu) throw new Error(`Folder menu did not open for ${title}`);
  return menu;
}

async function clickMenuItem(menu, label, { expectDisabled = false } = {}) {
  const item = [...menu.querySelectorAll('button[role="menuitem"]')].find(
    (button) => button.textContent.trim() === label
  );
  if (!item) throw new Error(`Menu item missing: ${label}`);
  if (expectDisabled) {
    if (!item.disabled) throw new Error(`Menu item should be disabled: ${label}`);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
    await tick();
    if (document.querySelector('div[role="menu"]')) throw new Error("an outside pointerdown should close the menu");
    return;
  }
  if (item.disabled) throw new Error(`Menu item unexpectedly disabled: ${label}`);
  item.click();
  await tick();
}

async function setText(element, value) {
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
}

function sidebarSeparator() {
  return document.querySelector('div[role="separator"][aria-orientation="vertical"]');
}
function sidebarWidth() {
  return document.querySelector("aside").getBoundingClientRect().width;
}
function lastCall(command) {
  const calls = window.managerFixture.callsFor(command);
  return calls[calls.length - 1];
}
function saveCount() {
  return window.managerFixture.callsFor("save_prompt").length;
}
function fixtureRecord(id) {
  return window.managerFixture.records().find((record) => record.id === id);
}

// ---- AC-06 / AC-12: 分区结构、分批与计数 ----
export async function runStructureChecks() {
  let assertions = 0;
  const check = (value, message) => { if (!value) throw new Error(message); assertions++; };
  await until(() => sections().length > 3, "sections to render");

  const pinned = pinnedSection();
  check(!!pinned, "pinned section should be visible when prompts are pinned");
  check(countLabel(pinned) === "2 条", `pinned count label: ${countLabel(pinned)}`);
  check(rowIds(pinned).join(",") === "combo-pinned,combo-both", `pinned order: ${rowIds(pinned)}`);
  // 置顶条目显示归属文件夹，且引用同一 ID（不复制数据）
  check(pinned.textContent.includes("Combos"), "pinned entries should show their folder");

  const notes = folderSection("NOTE ORGANIZATION");
  check(!!notes, "Note organization section missing");
  check(countLabel(notes) === "30 条", `folder count must stay the real total: ${countLabel(notes)}`);
  check(rows(notes).length === 5, `default batch should show 5 rows, got ${rows(notes).length}`);
  check(sectionButton(notes, "显示更多")?.textContent.trim() === "显示更多", "show-more omits the remaining count");
  check(sectionButton(notes, "收起列表") === undefined, "collapse-list should be hidden at the default batch");

  const writing = folderSection("WRITING");
  check(rows(writing).length === 5, "6-item folder still shows only 5");
  check(sectionButton(writing, "显示更多")?.textContent.trim() === "显示更多", "6-item folder also uses the short label");

  const exact = folderSection("EXACTLY FIVE");
  check(rows(exact).length === 5, "5-item folder shows all");
  check(sectionButton(exact, "显示更多") === undefined, "5-item folder must not offer show-more");

  const solo = folderSection("SOLO");
  check(rows(solo).length === 1, "1-item folder shows its single prompt");
  check(sectionButton(solo, "显示更多") === undefined, "1-item folder must not offer show-more");

  check(!!folderSection("未分类"), "the uncategorized section should use the localized display name");
  const uncategorized = folderSection("未分类");
  check(rowIds(uncategorized).join(",") === "uncat-1,uncat-2", `uncategorized rows: ${rowIds(uncategorized)}`);
  // 真实命名为“未分类”的文件夹不会与空字符串键混淆
  check(uncategorized.dataset.sectionKey === "", "uncategorized key must be the empty string");

  const duplicates = folderSection("DUPLICATES");
  check(rowIds(duplicates).join(",") === "dup-1,dup-2", "same-title prompts stay separately addressable");
  return { group: "structure", assertions };
}

// ---- AC-07: 显示更多 / 收起 / 折叠 ----
export async function runBatchChecks() {
  let assertions = 0;
  const check = (value, message) => { if (!value) throw new Error(message); assertions++; };
  const notes = folderSection("NOTE ORGANIZATION");
  check(rows(notes).length === 5, "batch checks expect the default 5 rows");

  sectionButton(notes, "显示更多").click();
  await tick();
  check(rows(notes).length === 10, `show more adds 5, got ${rows(notes).length}`);
  check(sectionButton(notes, "显示更多")?.textContent.trim() === "显示更多", "show-more label stays short after loading another batch");
  check(sectionButton(notes, "收起列表") !== undefined, "collapse-list appears once more than 5 are shown");

  sectionButton(notes, "显示更多").click();
  await tick();
  check(rows(notes).length === 15, "second show-more adds another 5");

  const viewport = viewportOf(notes);
  viewport.scrollTop = 40;
  sectionButton(notes, "收起列表").click();
  await tick();
  check(rows(notes).length === 5, "collapse-list returns to the default batch");
  check(viewportOf(notes).scrollTop === 0, "collapse-list scrolls the item viewport back to the top");
  check(sectionButton(notes, "收起列表") === undefined, "collapse-list hides again at the default batch");

  // 折叠隐藏条目和更多操作，标题和计数保持可见
  const writing = folderSection("WRITING");
  writing.querySelector("header button").click();
  await tick();
  const collapsed = folderSection("WRITING");
  check(rows(collapsed).length === 0, "a collapsed folder hides its rows");
  check(countLabel(collapsed) === "6 条", "a collapsed folder keeps its real count");
  check(collapsed.querySelector('[role="separator"][aria-orientation="horizontal"]') === null,
    "folder sections do not contain a height grip");
  check(sectionButton(collapsed, "显示更多") === undefined, "a collapsed folder hides show-more");
  check(collapsed.querySelector("header button").getAttribute("aria-expanded") === "false",
    "the toggle reports its collapsed state");

  collapsed.querySelector("header button").click();
  await tick();
  check(rows(folderSection("WRITING")).length === 5, "expanding restores the default batch");
  check(folderSection("WRITING").querySelector("header button").getAttribute("aria-expanded") === "true",
    "the toggle reports its expanded state");

  // 切换其他提示词不改变已展示数量
  sectionButton(folderSection("NOTE ORGANIZATION"), "显示更多").click();
  await tick();
  rows(folderSection("EXACTLY FIVE"))[0].querySelector("button").click();
  await tick();
  check(rows(folderSection("NOTE ORGANIZATION")).length === 10,
    "selecting another prompt keeps the shown count");
  sectionButton(folderSection("NOTE ORGANIZATION"), "收起列表").click();
  await tick();
  return { group: "batch", assertions };
}

// ---- AC-01/02/03/05: 分隔条与自动列表高度 ----
export async function runResizeChecks() {
  let assertions = 0;
  const check = (value, message) => { if (!value) throw new Error(message); assertions++; };

  const separator = sidebarSeparator();
  check(!!separator, "the sidebar separator must exist");
  check(separator.getAttribute("aria-label") === "调整左侧导航宽度（双击恢复默认）",
    `separator needs an accessible name: ${separator.getAttribute("aria-label")}`);
  const available = separator.parentElement.getBoundingClientRect().width - 8;
  const expectedMax = Math.max(220, Math.min(available - 480, available * 0.45));
  const initial = sidebarWidth();
  check(initial >= 220 - 1, `sidebar must respect the 220px minimum, got ${initial}`);
  check(initial <= expectedMax + 1, `sidebar must respect its cap ${expectedMax}, got ${initial}`);
  check(expectedMax - initial > 40,
    `this window leaves no sidebar headroom (initial ${initial}, max ${expectedMax}); use a wider simulated size`);

  separator.focus();
  await pressKey(separator, "ArrowRight");
  await pressKey(separator, "ArrowRight");
  const wider = sidebarWidth();
  check(Math.abs(wider - initial - 32) < 2, `arrow keys should step the width by 16px, got ${wider - initial}`);

  await pressKey(separator, "ArrowLeft", true);
  const shifted = sidebarWidth();
  check(Math.abs(shifted - (wider - 40)) < 2, `shift+arrow should step by 40px, got ${shifted - wider}`);

  await pressKey(separator, "Enter");
  const restored = sidebarWidth();
  check(Math.abs(restored - initial) < 2, `Enter should restore the default width, got ${restored}`);

  await pressKey(separator, "Home");
  const smallest = sidebarWidth();
  check(Math.abs(smallest - 220) < 2, `Home should reach the 220px minimum, got ${smallest}`);
  await pressKey(separator, "End");
  const largest = sidebarWidth();
  check(Math.abs(largest - expectedMax) < 2,
    `End should stop at min(available-480, 45%) = ${expectedMax}, got ${largest}`);
  await pressKey(separator, "Enter");

  // 调节结果写入本地界面偏好，且偏好只含尺寸与折叠状态
  await until(() => {
    const raw = window.managerFixture.prefs()["manager-layout"];
    return !!raw && JSON.parse(raw).sidebarRatio !== null;
  }, "the sidebar ratio to persist");
  const prefs = JSON.parse(window.managerFixture.prefs()["manager-layout"]);
  check(typeof prefs.sidebarRatio === "number", `sidebar ratio should be stored, got ${JSON.stringify(prefs)}`);
  check(prefs.sidebarRatio > 0 && prefs.sidebarRatio <= 0.45, `stored ratio out of range: ${prefs.sidebarRatio}`);

  // 右侧正文不会因左栏变宽而消失
  check(document.querySelector("main").getBoundingClientRect().width >= 300,
    "the editor pane keeps usable width at the largest sidebar");

  // 文件夹高度自动适应，不再提供独立调节柄。
  const notes = folderSection("NOTE ORGANIZATION");
  const grip = notes.querySelector('[role="separator"][aria-orientation="horizontal"]');
  check(grip === null, "an expanded folder must not expose a height grip");
  const navElement = document.querySelector("aside div.overflow-y-auto");
  const navStyle = getComputedStyle(navElement);
  const navHeight = navElement.clientHeight
    - parseFloat(navStyle.paddingTop) - parseFloat(navStyle.paddingBottom);
  const before = parseFloat(viewportOf(notes).style.maxHeight);
  check(Math.abs(before - navHeight * 0.4) < 2,
    `default viewport height should be 40% of the nav area (${navHeight * 0.4}), got ${before}`);

  const writing = folderSection("WRITING");
  check(Math.abs(parseFloat(viewportOf(writing).style.maxHeight) - before) < 2,
    "folders share the current automatic height limit");
  check(document.querySelector('aside [role="separator"]') === null,
    "the sidebar contains no per-folder height handles");

  // 右侧正文与变量提示区之间的分隔条
  const editorSeparator = document.querySelector('main div[role="separator"][aria-orientation="horizontal"]');
  check(!!editorSeparator, "the editor should expose a body / variable-hint separator");
  const bodyBefore = document.querySelector("main textarea").getBoundingClientRect().height;
  editorSeparator.focus();
  await pressKey(editorSeparator, "ArrowDown");
  await pressKey(editorSeparator, "ArrowDown");
  const bodyAfter = document.querySelector("main textarea").getBoundingClientRect().height;
  check(bodyAfter > bodyBefore + 20, `the body should grow when the separator moves down, ${bodyBefore} -> ${bodyAfter}`);
  await pressKey(editorSeparator, "ArrowUp");
  await pressKey(editorSeparator, "ArrowUp");
  const bodyRestored = document.querySelector("main textarea").getBoundingClientRect().height;
  check(Math.abs(bodyRestored - bodyBefore) < 2, `the reverse step should restore the height, got ${bodyRestored}`);
  await pressKey(editorSeparator, "Enter");
  const hint = [...document.querySelectorAll("main div")]
    .find((element) => element.textContent.includes("检测到变量") && element.classList.contains("overflow-y-auto"));
  check(!!hint && hint.getBoundingClientRect().height > 0, "the variable hint keeps its own scrollable area");
  return { group: "resize", assertions };
}

// ---- AC-14/15/16/17/18/19/21: 排序、移动与空文件夹 ----
export async function runOrderChecks() {
  let assertions = 0;
  const check = (value, message) => { if (!value) throw new Error(message); assertions++; };

  const exact = folderSection("EXACTLY FIVE");
  const before = rowIds(exact);
  const savesAtStart = saveCount();
  const folderOrderBefore = window.managerFixture.organization().folderOrder.join("|");
  const snapshot = fixtureRecord("exact-2");

  // 菜单下移：结果与拖动一致，且不改动内容
  let menu = await openRowMenu(exact, "exact-2");
  await clickMenuItem(menu, "下移");
  await until(() => rowIds(folderSection("EXACTLY FIVE")).join(",") !== before.join(","), "the row to move");
  check(rowIds(folderSection("EXACTLY FIVE")).join(",") === "exact-1,exact-3,exact-2,exact-4,exact-5",
    `move down result: ${rowIds(folderSection("EXACTLY FIVE"))}`);
  const orderCall = lastCall("set_prompt_order");
  check(orderCall?.args.folder === "Exactly five", "the order command must name the real folder");
  check(orderCall?.args.order.join(",") === "exact-1,exact-3,exact-2,exact-4,exact-5",
    `order payload: ${orderCall?.args.order}`);
  const after = fixtureRecord("exact-2");
  check(after.title === snapshot.title && after.body === snapshot.body
    && after.createdAt === snapshot.createdAt && after.folder === snapshot.folder
    && after.useCount === snapshot.useCount && after.pinned === snapshot.pinned,
    "pure reordering must not touch content, identity, folder or usage");
  check(saveCount() === savesAtStart,
    "reordering must not save the whole prompt");
  check(window.managerFixture.organization().folderOrder.join("|") === folderOrderBefore,
    "reordering inside a folder must not move the folder");

  menu = await openRowMenu(folderSection("EXACTLY FIVE"), "exact-2");
  await clickMenuItem(menu, "上移");
  check(rowIds(folderSection("EXACTLY FIVE")).join(",") === before.join(","), "move up restores the order");

  // 文件夹顺序：菜单上移/下移，不改动成员顺序、内容与选中项
  folderSection("EXACTLY FIVE").querySelector('[data-prompt-id="exact-2"] button').click();
  await tick();
  await until(() => document.querySelector('main input[placeholder="Prompt 标题"]').value
    === fixtureRecord("exact-2").title, "the editor to load exact-2");
  folderSection("DUPLICATES").querySelector("header button").click();
  await tick();
  check(rows(folderSection("DUPLICATES")).length === 0, "precondition: Duplicates is collapsed");

  const visibleFolders = () => sections()
    .filter((section) => section.dataset.sectionVariant === "folder")
    .map((section) => section.dataset.sectionKey);
  const visibleBefore = folderOrderBefore.split("|");
  check(visibleFolders().join("|") === folderOrderBefore,
    `the navigation follows the stored folder order: ${visibleFolders().join("|")}`);
  const recordsBefore = JSON.stringify(window.managerFixture.records());
  const exactMembers = window.managerFixture.organization().promptOrderByFolder["Exactly five"].join(",");
  const expectedUp = [...visibleBefore];
  const exactSlot = expectedUp.indexOf("Exactly five");
  [expectedUp[exactSlot - 1], expectedUp[exactSlot]] = [expectedUp[exactSlot], expectedUp[exactSlot - 1]];

  menu = await openFolderMenu("EXACTLY FIVE");
  await clickMenuItem(menu, "上移");
  await until(() => window.managerFixture.organization().folderOrder.join("|") !== folderOrderBefore,
    "the folder order to change");
  check(window.managerFixture.organization().folderOrder.join("|") === expectedUp.join("|"),
    `folder move up result: ${window.managerFixture.organization().folderOrder.join("|")}`);
  check(lastCall("set_folder_order")?.args.order.join("|") === expectedUp.join("|"),
    `folder reordering sends the whole order: ${lastCall("set_folder_order")?.args.order}`);
  check(visibleFolders().join("|") === expectedUp.join("|"), "the navigation re-renders in the new order");
  check(window.managerFixture.organization().promptOrderByFolder["Exactly five"].join(",") === exactMembers,
    "moving a folder must not reorder its members");
  check(JSON.stringify(window.managerFixture.records()) === recordsBefore,
    "moving a folder must not rewrite any prompt");
  check(saveCount() === savesAtStart,
    "moving a folder must not save a prompt");
  check(document.querySelector('main input[placeholder="Prompt 标题"]').value
    === fixtureRecord("exact-2").title, "the selected prompt stays selected while folders move");
  check(rows(folderSection("DUPLICATES")).length === 0, "another folder's collapse state survives the reorder");

  menu = await openFolderMenu("EXACTLY FIVE");
  await clickMenuItem(menu, "下移");
  await until(() => window.managerFixture.organization().folderOrder.join("|") === folderOrderBefore,
    "the folder order to be restored");
  check(visibleFolders().join("|") === folderOrderBefore, "folder move down restores the stored order");
  folderSection("DUPLICATES").querySelector("header button").click();
  await tick();

  // 移到文件夹末尾按完整成员顺序执行
  menu = await openRowMenu(await revealRow("NOTE ORGANIZATION", "note-02"), "note-02");
  await clickMenuItem(menu, "移到文件夹末尾");
  await until(() => rowIds(folderSection("NOTE ORGANIZATION"))[0] === "note-01"
    && !rowIds(folderSection("NOTE ORGANIZATION")).slice(0, 10).includes("note-02"), "note-02 to leave the head");
  const noteOrder = window.managerFixture.organization().promptOrderByFolder["Note organization"];
  check(noteOrder[noteOrder.length - 1] === "note-02", "move-to-end appends after hidden members too");
  check(noteOrder.length === 30, `no member may be lost: ${noteOrder.length}`);
  menu = await openRowMenu(await revealRow("NOTE ORGANIZATION", "note-02"), "note-02");
  await clickMenuItem(menu, "上移");
  await tick();
  const restored = window.managerFixture.organization().promptOrderByFolder["Note organization"];
  check(restored[restored.length - 1] === "note-30", "move up from the end swaps with the previous member");
  sectionButton(folderSection("NOTE ORGANIZATION"), "收起列表").click();
  await tick();

  // 移动到文件夹：追加到真实末尾，计数与归属同步
  const solo = folderSection("SOLO");
  menu = await openRowMenu(solo, "solo-1");
  await clickMenuItem(menu, "移动到文件夹");
  const picker = document.querySelector('div[role="dialog"][data-folder-picker]');
  check(!!picker, "the move-to-folder picker should open");
  check([...picker.querySelectorAll("button")].some((button) => button.textContent.trim() === "未分类"),
    "the picker must offer the uncategorized target");
  check([...picker.querySelectorAll("button")].some((button) => button.textContent.trim() === "Writing"),
    "the picker lists existing folders with their real names");
  await setText(picker.querySelector("input"), "writ");
  check([...picker.querySelectorAll("button")].filter((button) => button.textContent.trim() === "Writing").length === 1,
    "the picker filters folder names");
  [...picker.querySelectorAll("button")].find((button) => button.textContent.trim() === "Writing").click();
  await tick();
  await until(() => fixtureRecord("solo-1").folder === "Writing", "the move to commit");
  await awaitRowInSection("solo-1", "Writing");
  const moveCall = lastCall("move_prompt");
  check(moveCall?.args.toFolder === "Writing", `move target: ${JSON.stringify(moveCall?.args)}`);
  check(moveCall?.args.index === null, "the menu appends to the real end, so no index is sent");
  check(countLabel(folderSection("WRITING")) === "7 条", `target count: ${countLabel(folderSection("WRITING"))}`);
  check(rowIds(folderSection("WRITING")).slice(0, 5).join(",") === "write-1,write-2,write-3,write-4,write-5",
    "the first batch of the target folder is unchanged");
  check(rowIds(folderSection("WRITING")).includes("solo-1"),
    "the moved prompt is revealed in its new folder even beyond the default batch");
  check(folderSection("SOLO") === undefined, "an emptied folder is hidden");
  check(window.managerFixture.organization().folderOrder.includes("Solo"),
    "the hidden folder keeps its stored position");

  // 空文件夹不再作为移动目标出现（列表按成员生成），改由编辑器归属字段恢复
  menu = await openRowMenu(folderSection("WRITING"), "write-1");
  await clickMenuItem(menu, "移动到文件夹");
  const hiddenPicker = document.querySelector('div[role="dialog"][data-folder-picker]');
  check(![...hiddenPicker.querySelectorAll("button")].some((button) => button.textContent.trim() === "Solo"),
    "an emptied folder is not offered as a move target while it has no members");
  await pressKey(hiddenPicker.querySelector("input"), "Escape");
  check(document.querySelector('div[role="dialog"][data-folder-picker]') === null, "Escape closes the picker");

  // 移回原文件夹：位置按保存的偏好恢复，其他文件夹相对顺序不变
  const orderWithoutSolo = window.managerFixture.organization().folderOrder.filter((f) => f !== "Solo").join("|");
  await moveViaEditor("solo-1", "Solo");
  const orderWithSolo = window.managerFixture.organization().folderOrder.filter((f) => f !== "Solo").join("|");
  check(orderWithSolo === orderWithoutSolo, "restoring an empty folder keeps other folders in place");
  const soloIndex = window.managerFixture.organization().folderOrder.indexOf("Solo");
  check(soloIndex === 3, `the Solo folder should return to its saved slot, got ${soloIndex}`);
  check(!!folderSection("SOLO"), "the folder becomes visible again");

  // 移到未分类使用空字符串键
  menu = await openRowMenu(folderSection("SOLO"), "solo-1");
  await clickMenuItem(menu, "移动到文件夹");
  const picker3 = document.querySelector('div[role="dialog"][data-folder-picker]');
  [...picker3.querySelectorAll("button")].find((button) => button.textContent.trim() === "未分类").click();
  await tick();
  await until(() => fixtureRecord("solo-1").folder === "", "the uncategorized move to commit");
  await awaitRowInSection("solo-1", "");
  check(fixtureRecord("solo-1").folder === "", "uncategorized must store the empty string");
  check(rowIds(folderSection("未分类")).includes("solo-1"), "the prompt shows up in the uncategorized section");

  // 还原：Solo 再次为空，同样通过编辑器归属字段移回
  check(folderSection("SOLO") === undefined, "moving the last member away hides the folder again");
  await moveViaEditor("solo-1", "Solo");
  check(countLabel(folderSection("SOLO")) === "1 条", "the Solo folder is back to one member");
  return { group: "order", assertions };
}

// ---- AC-09/10/11/20/22: 收藏与置顶互相独立，草稿不被覆盖 ----
export async function runFlagChecks() {
  let assertions = 0;
  const check = (value, message) => { if (!value) throw new Error(message); assertions++; };

  const folderOrderBefore = window.managerFixture.organization().folderOrder.join("|");
  const writingOrderBefore = window.managerFixture.organization().promptOrderByFolder["Writing"].join(",");
  const savesAtStart = saveCount();

  // 收藏第二个文件夹中的提示词：顺序与置顶状态都不变
  const writing = folderSection("WRITING");
  let menu = await openRowMenu(writing, "write-2");
  await clickMenuItem(menu, "收藏");
  await until(() => fixtureRecord("write-2").favorite, "the favorite to persist");
  check(fixtureRecord("write-2").pinned === false, "favoriting must not pin");
  check(window.managerFixture.organization().folderOrder.join("|") === folderOrderBefore,
    "favoriting must not move any folder");
  check(window.managerFixture.organization().promptOrderByFolder["Writing"].join(",") === writingOrderBefore,
    "favoriting must not reorder the folder");
  check(rowIds(folderSection("WRITING")).join(",") === rowIds(folderSection("WRITING")).join(","),
    "rows stay put after favoriting");
  check(lastCall("set_favorite")?.args.favorite === true, "favorite uses a targeted field update");
  check(saveCount() === savesAtStart, "favorite must not save the whole prompt");

  menu = await openRowMenu(folderSection("WRITING"), "write-2");
  await clickMenuItem(menu, "取消收藏");
  await until(() => !fixtureRecord("write-2").favorite, "the unfavorite to persist");

  // 置顶：出现快捷入口，原文件夹位置不变
  menu = await openRowMenu(folderSection("WRITING"), "write-3");
  await clickMenuItem(menu, "置顶");
  await until(() => fixtureRecord("write-3").pinned, "the pin to persist");
  check(rowIds(pinnedSection()).join(",") === "combo-pinned,combo-both,write-3",
    `a new pin appends to the end of the pinned area: ${rowIds(pinnedSection())}`);
  check(window.managerFixture.organization().promptOrderByFolder["Writing"].join(",") === writingOrderBefore,
    "pinning must not reorder the source folder");
  check(window.managerFixture.organization().folderOrder.join("|") === folderOrderBefore,
    "pinning must not move folders");
  check(rowIds(folderSection("WRITING")).includes("write-3"), "the prompt stays in its own folder");
  check(countLabel(folderSection("WRITING")) === "6 条", "the folder count ignores the pinned shortcut");
  check(window.managerFixture.records().filter((record) => record.id === "write-3").length === 1,
    "pinning must not duplicate the record");

  // 取消置顶只移除快捷入口
  menu = await openRowMenu(pinnedSection(), "write-3");
  await clickMenuItem(menu, "取消置顶");
  await until(() => !fixtureRecord("write-3").pinned, "the unpin to persist");
  check(!rowIds(pinnedSection()).includes("write-3"), "unpinning removes the shortcut");
  check(rowIds(folderSection("WRITING")).includes("write-3"), "unpinning keeps the folder entry");
  check(window.managerFixture.organization().promptOrderByFolder["Writing"].join(",") === writingOrderBefore,
    "unpinning must not reorder the folder");
  check(!fixtureRecord("write-3").favorite, "unpinning must not change the favorite state");

  // 同一置顶提示词的两个入口指向同一 ID，修改一处两处同步
  menu = await openRowMenu(pinnedSection(), "combo-both");
  await clickMenuItem(menu, "取消置顶");
  await until(() => !fixtureRecord("combo-both").pinned, "combo-both to unpin");
  check(!rowIds(folderSection("COMBOS")).includes("combo-both") === false,
    "the original folder entry survives unpinning");
  check(rowIds(folderSection("COMBOS")).includes("combo-both"), "combos folder still lists combo-both");
  menu = await openRowMenu(folderSection("COMBOS"), "combo-both");
  await clickMenuItem(menu, "置顶");
  await until(() => fixtureRecord("combo-both").pinned, "combo-both to pin again");
  check(rowIds(pinnedSection()).includes("combo-both"), "re-pinning appends a fresh shortcut");

  // 正文草稿：置顶只同步自己的字段，不保存也不丢弃草稿
  rows(folderSection("COMBOS")).find((row) => row.dataset.promptId === "combo-plain")
    .querySelector("button").click();
  await tick();
  const body = document.querySelector("main textarea");
  await setText(body, "draft body that must survive");
  check(document.querySelector('main [role="status"]')?.textContent.trim() === "未保存",
    "the unsaved badge should show while drafting");
  const pinButton = [...document.querySelectorAll("main button")]
    .find((button) => button.textContent.includes("置顶"));
  check(!!pinButton, "the editor exposes a pin button");
  pinButton.click();
  await until(() => fixtureRecord("combo-plain").pinned, "the editor pin to persist");
  check(document.querySelector("main textarea").value === "draft body that must survive",
    "pinning must not discard the body draft");
  check(document.querySelector('main [role="status"]')?.textContent.trim() === "未保存",
    "pinning must not clear the unsaved badge");
  check(saveCount() === savesAtStart,
    "pinning from the editor must not save the draft");
  check(fixtureRecord("combo-plain").body === "Plain body without any variable"
    || fixtureRecord("combo-plain").body === "Body of {{topic}}",
    "the stored body must stay untouched by the pin operation");

  // 收藏按钮同样只提交收藏
  const favoriteButton = [...document.querySelectorAll("main button")]
    .find((button) => button.textContent.includes("收藏"));
  favoriteButton.click();
  await until(() => fixtureRecord("combo-plain").favorite, "the editor favorite to persist");
  check(document.querySelector("main textarea").value === "draft body that must survive",
    "favoriting must not discard the body draft");
  check(!fixtureRecord("combo-plain").pinned === false, "favorite and pinned coexist");

  // 放弃草稿，恢复初始状态
  await setText(document.querySelector("main textarea"), fixtureRecord("combo-plain").body);
  menu = await openRowMenu(pinnedSection(), "combo-plain");
  await clickMenuItem(menu, "取消置顶");
  await until(() => !fixtureRecord("combo-plain").pinned, "combo-plain to unpin");
  menu = await openRowMenu(folderSection("COMBOS"), "combo-plain");
  await clickMenuItem(menu, "取消收藏");
  await until(() => !fixtureRecord("combo-plain").favorite, "combo-plain to unfavorite");

  // 置顶区内排序只调整置顶顺序
  const pinnedBefore = window.managerFixture.organization().pinnedOrder.join(",");
  menu = await openRowMenu(pinnedSection(), "combo-both");
  await clickMenuItem(menu, "上移");
  await until(() => window.managerFixture.organization().pinnedOrder.join(",") !== pinnedBefore,
    "the pinned order to change");
  check(lastCall("set_pinned_order") !== undefined, "pinned reordering uses the pinned order command");
  check(window.managerFixture.organization().promptOrderByFolder["Combos"] !== undefined,
    "pinned reordering leaves folder membership alone");
  menu = await openRowMenu(pinnedSection(), "combo-both");
  await clickMenuItem(menu, "下移");
  await until(() => window.managerFixture.organization().pinnedOrder.join(",") === pinnedBefore,
    "the pinned order to be restored");
  return { group: "flags", assertions };
}

// ---- AC-08: 搜索覆盖折叠与未显示条目，且禁用拖动排序 ----
export async function runSearchChecks() {
  let assertions = 0;
  const check = (value, message) => { if (!value) throw new Error(message); assertions++; };

  // 先折叠一个文件夹并把它显示到 10 条，确认搜索不受影响、清空后可恢复
  const notes = folderSection("NOTE ORGANIZATION");
  sectionButton(notes, "显示更多").click();
  await tick();
  check(rows(folderSection("NOTE ORGANIZATION")).length === 10, "precondition: 10 rows shown");
  folderSection("WRITING").querySelector("header button").click();
  await tick();
  check(rows(folderSection("WRITING")).length === 0, "precondition: Writing collapsed");

  const search = document.querySelector('aside input[placeholder^="搜索"]');
  await setText(search, "zeppelin");
  await until(() => folderSection("NOTE ORGANIZATION") && rows(folderSection("NOTE ORGANIZATION")).length === 1,
    "the search to narrow the list");
  const matched = folderSection("NOTE ORGANIZATION");
  check(rowIds(matched).join(",") === "note-20", "search must reach prompts beyond the first batch");
  check(countLabel(matched) === "匹配 1 / 共 30", `search count label: ${countLabel(matched)}`);
  check(folderSection("WRITING") === undefined, "folders without matches are hidden");
  check(rows(folderSection("WRITING") ?? document.createElement("section")).length === 0,
    "a collapsed folder is temporarily expanded only when it has matches");

  // 搜索命中折叠文件夹时临时展开
  await setText(search, "draft");
  await until(() => folderSection("WRITING") !== undefined, "Writing to reappear");
  check(rows(folderSection("WRITING")).length === 5, "a matched collapsed folder expands to the first batch");
  check(countLabel(folderSection("WRITING")) === "匹配 6 / 共 6",
    `matched count: ${countLabel(folderSection("WRITING"))}`);
  sectionButton(folderSection("WRITING"), "显示更多").click();
  await tick();
  check(rows(folderSection("WRITING")).length === 6, "search results also batch by five");

  // 非空搜索时禁用拖动排序，但保留“移动到文件夹”
  const row = rows(folderSection("WRITING"))[0];
  check(row.getAttribute("draggable") === "false", "dragging must be disabled during a search");
  check(folderSection("WRITING").textContent.includes("清空搜索后可拖动排序"),
    "the disabled state must be explained");
  const menu = await openRowMenu(folderSection("WRITING"), row.dataset.promptId);
  await clickMenuItem(menu, "上移", { expectDisabled: true });
  await clickMenuItem(menu, "下移", { expectDisabled: true });
  const menu2 = await openRowMenu(folderSection("WRITING"), row.dataset.promptId);
  const moveItem = [...menu2.querySelectorAll('button[role="menuitem"]')]
    .find((button) => button.textContent.trim() === "移动到文件夹");
  check(moveItem && !moveItem.disabled, "move-to-folder stays available during a search");
  await clickMenuItem(menu2, "移动到文件夹");
  const picker = document.querySelector('div[role="dialog"][data-folder-picker]');
  check(!!picker, "the picker opens during a search");
  await pressKey(picker.querySelector("input"), "Escape");
  check(document.querySelector('div[role="dialog"][data-folder-picker]') === null,
    "Escape cancels the move without changing any data");

  // 清空搜索恢复之前的展开状态与显示数量
  await setText(search, "");
  await until(() => countLabel(folderSection("NOTE ORGANIZATION")) === "30 条", "the search to clear");
  check(rows(folderSection("NOTE ORGANIZATION")).length === 10,
    "clearing the search restores the previously shown count");
  check(rows(folderSection("WRITING")).length === 0, "clearing the search restores the collapsed folder");
  check(rows(folderSection("WRITING") ?? document.createElement("div")).length === 0, "still collapsed");
  check(rows(folderSection("NOTE ORGANIZATION"))[0].getAttribute("draggable") === "true",
    "dragging is allowed again once the search is cleared");
  folderSection("WRITING").querySelector("header button").click();
  await tick();
  sectionButton(folderSection("NOTE ORGANIZATION"), "收起列表").click();
  await tick();
  return { group: "search", assertions };
}

// ---- AC-01/04/31: 右侧编辑区与控件可达性 ----
export async function runEditorChecks() {
  let assertions = 0;
  const check = (value, message) => { if (!value) throw new Error(message); assertions++; };

  rows(folderSection("SOLO"))[0].querySelector("button").click();
  await tick();
  await until(() => document.querySelector("main textarea").value === "Plain body without any variable",
    "the prompt without variables to load");
  check(document.querySelector('main div[role="separator"][aria-orientation="horizontal"]') === null,
    "without a variable hint the body takes the remaining space and no separator is shown");

  rows(folderSection("EXACTLY FIVE"))[0].querySelector("button").click();
  await tick();
  await until(() => document.querySelector("main textarea").value === "Body of {{topic}}",
    "the prompt with a variable to load");
  check(!!document.querySelector('main div[role="separator"][aria-orientation="horizontal"]'),
    "with a variable hint the separator returns");
  check(document.querySelector("main").textContent.includes("检测到变量"), "the variable hint is visible");

  // 底部操作始终可见，不需要滚动整个编辑区
  const appRect = document.getElementById("app").getBoundingClientRect();
  const saveButton = [...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "保存");
  const deleteButton = [...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "删除");
  check(!!saveButton && !!deleteButton, "save and delete must exist");
  for (const [name, element] of [["save", saveButton], ["delete", deleteButton]]) {
    const rect = element.getBoundingClientRect();
    check(rect.bottom <= appRect.bottom + 1 && rect.top >= appRect.top - 1,
      `${name} button must stay inside the manager window: ${JSON.stringify(rect)} vs ${JSON.stringify(appRect)}`);
    check(rect.width > 0 && rect.height > 0, `${name} button must not be collapsed`);
  }
  const titleInput = document.querySelector('main input[placeholder="Prompt 标题"]');
  check(titleInput.getBoundingClientRect().height > 0, "the title input stays reachable");

  // 独立收藏与置顶按钮有不同图标、文案与可访问名称
  const favorite = [...document.querySelectorAll("main button")].find((b) => b.textContent.includes("⭐"));
  const pin = [...document.querySelectorAll("main button")].find((b) => b.textContent.includes("📌"));
  check(!!favorite && !!pin && favorite !== pin, "favorite and pin must be separate controls");
  check(favorite.getAttribute("aria-label") !== pin.getAttribute("aria-label"),
    "favorite and pin need distinct accessible names");
  check(favorite.getAttribute("aria-pressed") === "false" && pin.getAttribute("aria-pressed") === "false",
    "both toggles report their pressed state");

  // 窄窗口下不允许把正文压到不可编辑
  const bodyHeight = document.querySelector("main textarea").getBoundingClientRect().height;
  check(bodyHeight >= 100, `the body keeps an editable height, got ${bodyHeight}`);
  return { group: "editor", assertions };
}

// ---- AC-01: 当前窗口尺寸下的自适应布局 ----
export async function runWindowChecks() {
  let assertions = 0;
  const check = (value, message) => { if (!value) throw new Error(message); assertions++; };
  await until(() => sections().length > 3, "sections to render");

  const app = document.getElementById("app").getBoundingClientRect();
  const aside = document.querySelector("aside").getBoundingClientRect();
  const main = document.querySelector("main").getBoundingClientRect();
  const separator = sidebarSeparator().getBoundingClientRect();

  check(Math.abs(app.width - aside.width - main.width - separator.width) < 2,
    `the two panes plus the separator should fill the window: ${app.width} vs ${aside.width + main.width + separator.width}`);
  check(aside.right <= separator.left + 1 && separator.right <= main.left + 1,
    "the sidebar, separator and editor must not overlap");
  check(aside.width >= 150, `the sidebar keeps usable width, got ${aside.width}`);
  check(main.width >= 300, `the editor keeps usable width, got ${main.width}`);
  check(separator.width > 0 && separator.height > 40,
    `the separator stays visible and grabbable: ${separator.width}x${separator.height}`);
  check(aside.bottom <= app.bottom + 1 && main.bottom <= app.bottom + 1,
    "neither pane overflows the window");

  // 搜索框固定在导航顶部，导航自己滚动
  const search = document.querySelector('aside input[placeholder^="搜索"]').getBoundingClientRect();
  const nav = document.querySelector("aside div.overflow-y-auto");
  const navRect = nav.getBoundingClientRect();
  check(search.top >= aside.top - 1 && search.bottom <= navRect.top + 1,
    "the search box stays pinned above the scrolling navigation");
  check(nav.scrollHeight > nav.clientHeight, "a long list scrolls inside the navigation, not the whole page");
  check(document.getElementById("app").scrollHeight <= app.height + 1,
    "the manager itself must not grow a whole-page scrollbar");

  // 右侧正文随窗口高度增长，底部操作可达
  const body = document.querySelector("main textarea").getBoundingClientRect();
  check(body.height >= 100, `the body keeps an editable height, got ${body.height}`);
  const saveButton = [...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === "保存");
  const saveRect = saveButton.getBoundingClientRect();
  check(saveRect.bottom <= app.bottom + 1 && saveRect.height > 0,
    `save stays reachable at this size: ${JSON.stringify(saveRect)} vs bottom ${app.bottom}`);
  return { group: "window", assertions, size: `${Math.round(app.width)}x${Math.round(app.height)}` };
}

// ---- AC-31: 英文与深色主题下的可辨识性 ----
export async function runLocaleChecks() {
  let assertions = 0;
  const check = (value, message) => { if (!value) throw new Error(message); assertions++; };
  await until(() => sections().length > 3, "sections to render");

  check(document.querySelector('aside input[placeholder^="Search"]') !== null,
    "the fixture should render the English interface");
  check(!document.querySelector("aside").textContent.includes("显示更多"),
    "no Chinese batching label remains in the English sidebar");
  check(document.documentElement.classList.contains("dark"), "the fixture should run in the dark theme");

  const pinned = pinnedSection();
  check(headerTitle(pinned) === "Pinned", `pinned section title: ${headerTitle(pinned)}`);
  check(countLabel(pinned) === "2", `the English count label carries no unit: ${countLabel(pinned)}`);
  check(!document.querySelector("aside div.overflow-y-auto").textContent.includes("Pinning adds a shortcut only"),
    "the pinned explanation is removed");

  const notes = folderSection("NOTE ORGANIZATION");
  check(countLabel(notes) === "30", `folder count: ${countLabel(notes)}`);
  check(sectionButton(notes, "Show more")?.textContent.trim() === "Show more",
    "the English show-more label also omits the remaining count");
  check(notes.querySelector("header button .truncate").getAttribute("title") === "Note organization",
    "a truncated folder name stays fully readable through its title");
  const firstRow = rows(notes)[0];
  check(firstRow.querySelector("button").getAttribute("title") === fixtureRecord(firstRow.dataset.promptId).title,
    "a truncated prompt title stays fully readable through its tooltip");

  // 两处保留的分隔条有英文可访问名称，并且可聚焦
  const sidebar = sidebarSeparator();
  check(sidebar.getAttribute("aria-label") === "Resize the sidebar (double-click to reset)",
    `sidebar separator label: ${sidebar.getAttribute("aria-label")}`);
  const grip = notes.querySelector('[role="separator"][aria-orientation="horizontal"]');
  check(grip === null, "no item height grip remains");
  rows(folderSection("EXACTLY FIVE"))[0].querySelector("button").click();
  await tick();
  const editorSeparator = document.querySelector('main div[role="separator"][aria-orientation="horizontal"]');
  check(editorSeparator.getAttribute("aria-label") === "Resize the body and variable hint (double-click to reset)",
    `editor separator label: ${editorSeparator.getAttribute("aria-label")}`);
  for (const element of [sidebar, editorSeparator]) {
    element.focus();
    check(document.activeElement === element, "each separator takes keyboard focus");
    check(element.getAttribute("tabindex") === "0", "each separator is in the tab order");
  }

  // 收藏与置顶是独立控件，文案与可访问名称都不同
  const favorite = [...document.querySelectorAll("main button")].find((button) => button.textContent.includes("⭐"));
  const pin = [...document.querySelectorAll("main button")].find((button) => button.textContent.includes("📌"));
  check(favorite.textContent.includes("Favorite") && pin.textContent.includes("Pin"),
    `English toggle labels: ${favorite.textContent.trim()} / ${pin.textContent.trim()}`);
  check(favorite.getAttribute("aria-label") !== pin.getAttribute("aria-label"),
    "the two toggles keep distinct accessible names in English");
  check(favorite.getAttribute("aria-pressed") === "false" && pin.getAttribute("aria-pressed") === "false",
    "both toggles expose their pressed state");

  // 行菜单与文件夹菜单使用英文文案，深色主题下弹层为深色
  const menu = await openRowMenu(folderSection("EXACTLY FIVE"), "exact-1", "Prompt actions");
  const labels = [...menu.querySelectorAll('button[role="menuitem"]')].map((button) => button.textContent.trim());
  check(labels.join("|") === "Favorite|Pin|Move up|Move down|Move to end of folder|Move to folder",
    `English prompt menu: ${labels.join("|")}`);
  const menuBackground = getComputedStyle(menu).backgroundColor;
  check(menuBackground !== "rgb(255, 255, 255)", `the menu surface follows the dark theme: ${menuBackground}`);
  await clickMenuItem(menu, "Move to folder");
  const picker = document.querySelector('div[role="dialog"][data-folder-picker]');
  check(picker.getAttribute("aria-label") === "Move to Folder", `picker label: ${picker.getAttribute("aria-label")}`);
  check(picker.querySelector("input").getAttribute("placeholder") === "Search folders…",
    "the folder filter has an English placeholder");
  check([...picker.querySelectorAll("button")].some((button) => button.textContent.trim() === "Uncategorized"),
    "the uncategorized target uses the English display name");
  check(getComputedStyle(picker).backgroundColor !== "rgb(255, 255, 255)",
    "the picker surface follows the dark theme");
  await pressKey(picker.querySelector("input"), "Escape");

  // 搜索期间的英文提示
  const search = document.querySelector('aside input[placeholder^="Search"]');
  await setText(search, "draft");
  await until(() => folderSection("WRITING") !== undefined, "Writing to match");
  check(countLabel(folderSection("WRITING")) === "Matched 6 / 6",
    `English matched count: ${countLabel(folderSection("WRITING"))}`);
  check(folderSection("WRITING").textContent.includes("Clear the search to reorder by dragging"),
    "the disabled drag hint is translated");
  const folderMenu = await openFolderMenu("WRITING", "Folder actions");
  const folderLabels = [...folderMenu.querySelectorAll('button[role="menuitem"]')]
    .map((button) => button.textContent.trim());
  check(folderLabels.join("|") === "Move up|Move down", `English folder menu: ${folderLabels.join("|")}`);
  await pressKey(folderMenu.querySelector('button[role="menuitem"]'), "Escape");
  await setText(search, "");
  await until(() => countLabel(folderSection("NOTE ORGANIZATION")) === "30", "the search to clear");
  return { group: "locale", assertions };
}

// 重新加载前调用：留下可验证的尺寸与折叠偏好
export async function prepareRestartState() {
  const separator = sidebarSeparator();
  separator.focus();
  await pressKey(separator, "ArrowRight");
  await pressKey(separator, "ArrowRight");
  await pressKey(separator, "ArrowRight");
  const notes = folderSection("NOTE ORGANIZATION");
  sectionButton(notes, "显示更多").click();
  await tick();
  sectionButton(notes, "显示更多").click();
  await tick();
  folderSection("WRITING").querySelector("header button").click();
  await tick();
  await until(() => {
    const raw = window.managerFixture.prefs()["manager-layout"];
    if (!raw) return false;
    const stored = JSON.parse(raw);
    return stored.sidebarRatio !== null
      && stored.collapsed["Writing"] === true;
  }, "the sidebar and collapse preferences to persist");
  return {
    sidebarWidth: sidebarWidth(),
    noteHeight: parseFloat(viewportOf(folderSection("NOTE ORGANIZATION")).style.maxHeight),
    noteRows: rows(folderSection("NOTE ORGANIZATION")).length,
    prefs: JSON.parse(window.managerFixture.prefs()["manager-layout"]),
  };
}

// 重新加载后调用：验证尺寸与折叠偏好恢复，而“已展示条数”回到默认
export async function verifyRestartState(expected) {
  let assertions = 0;
  const check = (value, message) => { if (!value) throw new Error(message); assertions++; };
  await until(() => sections().length > 3, "sections to render after reload");
  const stored = JSON.parse(window.managerFixture.prefs()["manager-layout"]);
  check(Math.abs(stored.sidebarRatio - expected.prefs.sidebarRatio) < 1e-9, "the sidebar ratio survived the restart");
  check(Math.abs(sidebarWidth() - expected.sidebarWidth) < 2,
    `the sidebar width is restored: ${sidebarWidth()} vs ${expected.sidebarWidth}`);
  check(folderSection("WRITING") && rows(folderSection("WRITING")).length === 0,
    "the collapsed folder stays collapsed after a restart");
  const notes = folderSection("NOTE ORGANIZATION");
  check(rows(notes).length === 5, `the shown count resets to the default batch, got ${rows(notes).length}`);
  check(expected.noteRows === 15, `precondition: the previous session had shown ${expected.noteRows}`);
  check(Math.abs(parseFloat(viewportOf(notes).style.maxHeight) - expected.noteHeight) < 2,
    "the automatic folder viewport height is stable at the same window size");
  return { group: "restart", assertions };
}

export async function runBulkFolderChecks() {
  let assertions = 0;
  const check = (value, message) => { if (!value) throw new Error(message); assertions++; };
  const controls = document.querySelector('[data-folder-bulk-actions]');
  const [expand, collapse] = controls.querySelectorAll('button');
  const notes = folderSection('NOTE ORGANIZATION');
  const body = document.querySelector('main textarea');
  const originalBody = body.value;
  const savedBefore = saveCount();
  const orderBefore = JSON.stringify(window.managerFixture.organization());
  check(expand.textContent.trim() === '全部展开' && collapse.textContent.trim() === '全部收起', 'bulk action labels');
  check(!document.querySelector('aside').textContent.includes('置顶只是快捷入口'), 'remove the pinned explanation');
  check(document.querySelector('aside [role="separator"]') === null, 'remove all folder height handles');
  check(expand.disabled && !collapse.disabled, 'disable only the already satisfied bulk action');
  const more = sectionButton(notes, '显示更多');
  let box = more.getBoundingClientRect();
  const container = notes.getBoundingClientRect();
  check(Math.abs((box.left + box.right) / 2 - (container.left + container.right) / 2) < 2, 'show more is centered');
  more.click();
  await tick();
  box = sectionButton(notes, '显示更多').getBoundingClientRect();
  check(Math.abs((box.left + box.right) / 2 - (container.left + container.right) / 2) < 2, 'show more stays centered alongside collapse-list');
  await setText(body, 'Bulk action unsaved draft');
  collapse.click();
  await tick();
  check(sections().every(s => rows(s).length === 0), 'collapse every folder and the pinned section');
  check(collapse.disabled && !expand.disabled, 'collapsed state updates button availability');
  check(body.value === 'Bulk action unsaved draft' && saveCount() === savedBefore, 'bulk collapse preserves the draft without saving');
  await until(() => Object.values(JSON.parse(window.managerFixture.prefs()['manager-layout'] || '{}').collapsed || {}).filter(Boolean).length === sections().length, 'bulk collapse preferences to persist');
  const search = document.querySelector('aside input');
  await setText(search, 'zeppelin');
  check(rows(folderSection('NOTE ORGANIZATION')).length === 1, 'search temporarily opens the matching folder');
  collapse.click();
  await tick();
  check(sections().every(s => rows(s).length === 0), 'bulk collapse works within search results');
  expand.click();
  await tick();
  check(rows(folderSection('NOTE ORGANIZATION')).length === 1, 'bulk expand restores search results');
  await setText(search, '');
  check(sections().every(s => rows(s).length === 0), 'clearing search restores the original collapsed state');
  expand.click();
  await tick();
  check(rows(folderSection('NOTE ORGANIZATION')).length === 10, 'expand all preserves the existing batch size');
  check(rows(folderSection('WRITING')).length === 5, 'expand all does not load all records');
  check(body.value === 'Bulk action unsaved draft' && JSON.stringify(window.managerFixture.organization()) === orderBefore, 'bulk actions preserve draft and order');
  await setText(search, 'no-match-for-bulk-controls');
  check(expand.disabled && collapse.disabled, 'both actions are disabled for empty results');
  await setText(search, '');
  sectionButton(folderSection('NOTE ORGANIZATION'), '收起列表').click();
  await setText(body, originalBody);
  return { group: 'bulk', assertions };
}

export async function runManagerLayoutChecks() {
  const results = [
    await runWindowChecks(),
    await runStructureChecks(),
    await runBulkFolderChecks(),
    await runBatchChecks(),
    await runResizeChecks(),
    await runOrderChecks(),
    await runFlagChecks(),
    await runSearchChecks(),
    await runEditorChecks(),
  ];
  return {
    assertions: results.reduce((total, result) => total + result.assertions, 0),
    groups: results.map((result) => `${result.group}:${result.assertions}`).join(" "),
    alerts: window.managerFixture.state.alerts,
  };
}
