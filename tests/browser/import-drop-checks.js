// Run in /tests/browser/import-flow.html with a fresh fixture.
export async function runImportDropChecks() {
  const fixture = window.importFixture;
  const { state } = fixture;
  let assertions = 0;
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
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
  const commandCount = (command) => state.calls.filter((call) => call.command === command).length;
  const button = (label) => [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === label);
  const target = document.querySelector("[data-manager-editor]");
  const activeTarget = () => document.querySelector("[data-manager-editor]") ?? document.querySelector("[data-manager-shell]");
  const validFile = () => new File([
    JSON.stringify({ format: "promptdeck", version: 1, prompts: [{
      id: "dropped", title: "Dropped", body: "body", tags: [], folder: "",
      favorite: false, pinned: false, useCount: 0, lastUsedAt: null, createdAt: 1, updatedAt: 2,
    }] }),
  ], "backup.json", { type: "application/json" });
  const drag = async (files) => {
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    activeTarget().dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    activeTarget().dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    await tick();
    return transfer;
  };
  const drop = async (transfer) => {
    activeTarget().dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    await tick();
  };

  check(!!target, "Manager editor is missing");
  const handle = document.querySelector("[data-prompt-drag-handle]");
  const internal = new DataTransfer();
  handle.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: internal }));
  target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: internal }));
  await tick();
  check(!document.querySelector("[data-import-drop-overlay]"), "Internal sorting showed file import overlay");
  handle.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: internal }));

  let transfer = await drag([new File(["text"], "notes.txt")]);
  check(!!document.querySelector("[data-import-drop-overlay]"), "External file drag showed no overlay");
  await drop(transfer);
  await until(() => state.alerts.length === 1);
  check(state.alerts.some((message) => message.includes(".json")), "Non-JSON file was not rejected");
  check(commandCount("validate_import_content") === 0, "Non-JSON file reached backend validation");

  transfer = await drag([validFile(), validFile()]);
  await drop(transfer);
  await until(() => state.alerts.length === 2);
  check(state.alerts.length === 2 && commandCount("validate_import_content") === 0, "Multiple files were not rejected");

  const title = document.querySelector("[data-manager-field]");
  title.value = "Draft title";
  title.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
  transfer = await drag([validFile()]);
  await drop(transfer);
  await until(() => !!button("保存并继续"));
  check(commandCount("validate_import_content") === 0, "Validation ran before unsaved guard");
  button("取消").click();
  await tick();
  check(commandCount("validate_import_content") === 0, "Cancelled unsaved guard continued import");

  transfer = await drag([validFile()]);
  await drop(transfer);
  await until(() => !!button("放弃修改"));
  button("放弃修改").click();
  await until(() => !!document.querySelector("[data-import-mode-dialog]"));
  check(commandCount("validate_import_content") === 1, "Dropped JSON was not validated");
  document.querySelector('[data-import-mode-dialog] button[aria-label="取消导入"]').click();
  await tick();
  check(commandCount("precheck_import") === 0 && commandCount("import_prompts") === 0, "Closing mode dialog started an import");

  transfer = await drag([new File(["not json"], "bad.json")]);
  await drop(transfer);
  await until(() => state.alerts.length === 3);
  check(!document.querySelector("[data-import-mode-dialog]"), "Invalid JSON opened mode dialog");

  transfer = await drag([validFile()]);
  await drop(transfer);
  await until(() => !!document.querySelector("[data-import-mode-dialog]"));
  button("追加").click();
  await until(() => !!button("确认导入"));
  check(commandCount("precheck_import") === 1, "Merge did not run precheck");
  const previousValidationCount = commandCount("validate_import_content");
  transfer = await drag([validFile()]);
  await drop(transfer);
  check(commandCount("validate_import_content") === previousValidationCount, "Compare page accepted a new drop");
  return { assertions };
}
