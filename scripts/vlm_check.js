const fs = require("fs");

async function main() {
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();
  const b64 = fs.readFileSync("/home/z/my-project/scripts/compare.png").toString("base64");
  const res = await zai.chat.completions.createVision({
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: '这是一张对比图：左边是原始试卷（含红色手写答案、红圈、蓝色解答、红笔批改横线和勾），右边是AI去除手写后的结果。请回答：1) 右图中手写内容（红色答案/圈/勾/横线、蓝色解答）是否已基本去除？2) 右图印刷的黑色题目文字是否保留完整清晰？3) 有没有明显的画面异常（文字扭曲、版面错位）？简短回答。',
          },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      },
    ],
  });
  console.log(res.choices[0]?.message?.content || "no response");
}

main().catch((e) => {
  console.error("VLM check failed:", e.message);
  process.exit(1);
});
