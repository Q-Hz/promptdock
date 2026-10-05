// Run with agent-browser eval --stdin (or eval -b for PowerShell) on manager-layout.html?onboarding=1.
(async () => {
  const english = new URLSearchParams(location.search).get("lang") === "en";
  const titles = english
    ? ["Welcome to PromptDock", "Import prompts", "Create a prompt you use often", "Prompt body", "Manage prompts", "Settings", "Launch PromptDock", "Fill in variables", "Copy the complete prompt"]
    : ["欢迎使用 PromptDock", "导入 Prompt", "新建一条常用 Prompt", "Prompt正文内容", "prompt管理", "设置", "调用 PromptDock", "填写变量", "复制完整 Prompt"];
  const images = { 2: "import-json.png", 7: "launcher-search.png", 8: "launcher-variables.png", 9: "launcher-result.png" };
  const results = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 280));
  const action = (name) => document.querySelector(`[data-onboarding-action="${name}"]`);
  const inspect = async (number) => {
    await settle();
    const tour = document.querySelector("[data-onboarding]");
    check(tour?.getAttribute("data-onboarding-step") === String(number), `Wrong step: ${number}`);
    check(tour.querySelector("h2")?.textContent === titles[number - 1], `Wrong title: ${number}`);
    check(!!action("previous") === (number > 1), `Previous button: ${number}`);
    check(!!action("next") === (number < 9), `Next button: ${number}`);
    check(!!action("finish") === (number === 9), `Finish button: ${number}`);
    check(tour.contains(document.activeElement), `Focus escaped: ${number}`);
    check(!!tour.querySelector(".spotlight") === (number >= 3 && number <= 6), `Spotlight: ${number}`);
    const image = tour.querySelector("img");
    check(!!image === !!images[number], `Image presence: ${number}`);
    if (image) {
      await image.decode();
      check(image.src.endsWith(images[number]), `Wrong image: ${number}`);
      check(!!image.alt, `Missing alt: ${number}`);
      check(getComputedStyle(image).objectFit === "contain", `Image cropped: ${number}`);
    }
    const rect = tour.querySelector("[role=dialog]").getBoundingClientRect();
    check(rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1, `Dialog outside viewport: ${number}`);
    for (const button of tour.querySelectorAll("button")) {
      const bounds = button.getBoundingClientRect();
      check(bounds.top >= 0 && bounds.bottom <= innerHeight + 1, `Button outside viewport: ${number}`);
    }
    if (number === 2) {
      const body = tour.querySelector("[id^=onboarding-body] p").textContent;
      check(body === (english
        ? "You can drag in a prompt file (JSON), one file at a time, or select the “Import” button at the top to choose a file to import."
        : "可以将提示词文件（ JSON 文件）拖入，一次一个文件；也可以点击顶部“导入”按钮选择导入的文件。"), "Import body differs from approved copy");
      check(image.naturalWidth === 1241 && image.naturalHeight === 752, "Import screenshot changed");
      check(Math.abs((rect.left + rect.right) / 2 - innerWidth / 2) <= 1, "Import card is not centered");
    }
    results.push({ step: number, title: titles[number - 1], pass: true });
  };
  for (let number = 1; number <= 9; number++) {
    await inspect(number);
    if (number < 9) action("next").click();
  }
  // Return through the inserted step to verify backward navigation and take a screenshot.
  for (let number = 8; number >= 2; number--) {
    action("previous").click();
    await inspect(number);
  }
  return { language: english ? "en" : "zh", viewport: [innerWidth, innerHeight], results };
})();
