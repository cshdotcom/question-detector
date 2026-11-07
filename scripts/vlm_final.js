const fs = require("fs");
async function main() {
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();
  const b64 = fs.readFileSync("/home/z/my-project/scripts/ui_final.png").toString("base64");
  const res = await zai.chat.completions.createVision({
    messages: [{
      role: "user",
      content: [
        { type: "text", text: '这是一个"题目智能框选"网页应用的截图。请检查：1) 页面布局是否正常（三栏：图片画廊/画布/题目列表）？2) 画布中图片上的绿色题目框是否与题目文字对齐？3) 是否有明显的 UI 错乱、重叠或空白异常？简短回答。' },
        { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
      ],
    }],
  });
  console.log(res.choices[0]?.message?.content || "no response");
}
main().catch((e) => { console.error("failed:", e.message); process.exit(1); });
