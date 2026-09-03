// Execute through agent-browser eval:
// import('/tests/browser/import-flow-checks.js').then(m => m.runImportFlowChecks('normal'))
// Fixture query: recheck=conflict for stale-conflict, initial=clear for initial-clear,
// targets=duplicate for duplicate. Other scenarios use the default fixture.
export async function runImportFlowChecks(scenario = "normal") {
  const fixture = window.importFixture;
  const { state } = fixture;
  let assertions = 0;
  const check = (value, message) => {
    if (!value) throw new Error(message);
    assertions++;
  };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
  const until = async (condition) => {
    for (let i = 0; i < 150; i++) {
      if (condition()) return;
      await tick();
    }
    throw new Error("Timed out waiting for UI");
  };
  const button = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  const click = async (text) => {
    const b = button(text);
    check(b && !b.disabled && !b.closest("[inert]"), `Button unavailable: ${text}`);
    b.click();
    await tick();
  };
  const choose = async (index) => {
    const radio = document.querySelectorAll('input[name="import-action"]')[index];
    check(radio && !radio.disabled && !radio.closest("[inert]"), "Radio unavailable");
    radio.click();
    await tick();
  };
  const calls = () => state.calls.filter((c) => c.command === "commit_import");
  const compareVisible = () => document.querySelector("h2")?.textContent === "处理导入冲突";
  const chooseAll = async () => {
    await choose(1);
    await click("保存选择并下一条");
    await choose(scenario === "duplicate" ? 1 : 2);
    await click("保存选择并下一条");
  };

  if (button("导入")) await click("导入");
  check(!document.body.textContent.includes("导入摘要"), "Summary UI remains");

  if (scenario === "initial-clear") {
    await until(() => state.pending);
    check(calls().length === 1 && calls()[0].args.decisions.length === 0, "No-conflict merge should commit directly");
    fixture.release("success");
    await until(() => !state.pending && state.alerts.length > 0);
    return { scenario, assertions };
  }

  check(compareVisible() && button("确认导入").disabled, "Unprocessed conflicts must block confirm");
  if (scenario === "cancel") {
    await choose(0);
    await click("保存选择并下一条");
    await click("取消导入");
    await click("继续处理");
    check(compareVisible(), "Continue should preserve comparison");
    await click("取消导入");
    await click("放弃并退出");
    check(!compareVisible() && calls().length === 0, "Cancel must not write");
    return { scenario, assertions };
  }

  await chooseAll();
  check(calls().length === 0, "Saving choices must not commit automatically");
  if (scenario === "duplicate") {
    check(button("确认导入").disabled, "Duplicate local targets must block confirm");
    await choose(0);
    await click("保存选择并下一条");
    check(!button("确认导入").disabled, "Resolving target collision should allow confirm");
    return { scenario, assertions };
  }
  check(!button("确认导入").disabled, "Completed choices should allow confirm");
  if (scenario === "normal") {
    await choose(0);
    check(button("确认导入").disabled, "Editing a saved choice must require saving again");
    await click("保存选择并下一条");
  }
  await click("确认导入");
  check(calls().length === 1 && state.pending, "Confirm must immediately call commit once");
  check(button("正在导入…").disabled && button("取消导入").disabled, "Busy actions must be disabled");
  check(!!document.querySelector('input[name="import-action"]').closest("[inert]"), "Choices must be inert during commit");
  button("正在导入…").click();
  fixture.emit("manager-close-requested");
  fixture.emit("tray-quit-requested");
  await tick();
  check(calls().length === 1, "Duplicate click dispatched a second commit");
  check(state.calls.filter((c) => c.command === "resolve_close" || c.command === "resolve_quit").every((c) => c.args.allow === false), "Closing during commit must be refused");

  if (scenario.startsWith("stale-")) {
    fixture.release("stale");
    await until(() => state.calls.some((c) => c.command === "precheck_import_snapshot"));
    await tick();
    check(calls().length === 1, "Stale recheck must not automatically commit");
    check(state.calls.filter((c) => c.command === "precheck_import").length === 1, "Stale recheck must not reread the file");
    if (scenario === "stale-conflict") {
      check(compareVisible() && button("确认导入").disabled, "Fresh conflicts should require new choices");
      check([...document.querySelectorAll('input[name="import-action"]')].every((r) => !r.checked), "Old choices survived recheck");
      await chooseAll();
      await click("确认导入");
    } else {
      check(state.awaitingAnswer, "Conflict-free recheck needs explicit confirmation");
      fixture.answer(scenario === "stale-clear-confirm");
      await tick();
      if (scenario === "stale-clear-cancel") {
        check(calls().length === 1 && !compareVisible(), "Cancelled recheck must not write or show another page");
        return { scenario, assertions };
      }
      check(calls().length === 2 && calls()[1].args.decisions.length === 0, "Retry should use fresh plan without old choices");
    }
  } else {
    fixture.release("error");
    await until(() => button("确认导入") && !button("确认导入").disabled);
    check(compareVisible(), "Failed commit must preserve comparison for retry");
    await click("确认导入");
    check(calls().length === 2, "Retry did not commit");
    check(JSON.stringify(calls()[0].args) === JSON.stringify(calls()[1].args), "Retry changed the confirmed plan");
  }
  fixture.release("success");
  await until(() => !!button("导入") && !button("导入").closest("[inert]"));
  check(!compareVisible() && !document.body.textContent.includes("导入摘要"), "Success should return directly to editor");
  check(state.alerts.some((a) => a.startsWith("导入完成")), "Success was not reported after commit");
  if (scenario === "normal") {
    check(document.querySelector("textarea").value === "导入正文 A", "Editor did not follow the replaced record");
  }
  return { scenario, assertions };
}
