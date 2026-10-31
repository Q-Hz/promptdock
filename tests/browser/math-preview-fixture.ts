// Synthetic math only; this fixture never reads the user's library.
export const mathPreviewBody = [
  "# 数学公式预览", "", "本次任务：{{task=公式验收}}", "",
  "行内公式：$E=mc^2$；括号写法：\\(x_i^2+y_i^2=r^2\\)。", "",
  "## 分式、积分与矩阵", "",
  "$$", "\\frac{d}{dx}\\left(\\int_0^x t^2\\,dt\\right)=x^2", "$$", "",
  "\\[", "A=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix},\\quad \\sum_{i=1}^{n}i=\\frac{n(n+1)}{2}", "\\]", "",
  "| 类型 | 公式 |", "| --- | --- |", "| 二次项 | $x^2+y^2$ |", "",
  "## 可选补充", "{{@extra}}", "",
  "## 保留代码原样", "`$x_i$`", "", "```latex", "\\[x^2\\]", "```", "",
  "## 长公式（横向滚动）", "$$", Array.from({ length: 24 }, (_, index) => `a_{${index}}x^{${index}}`).join("+"), "$$", "",
  ":::options extra", ":::option [x] 概率分布",
  "$$p(x)=\\frac{1}{\\sigma\\sqrt{2\\pi}}e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}$$",
  ":::option [ ] 说明", "Explain {{note=the formula}}.", ":::end",
].join("\n");
