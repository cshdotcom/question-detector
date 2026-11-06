import { NextResponse } from "next/server"
import { callVisionChat, type ChatMessage } from "@/lib/ai-service"
import type { DetectedQuestionDTO, AIProviderConfig } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 60

interface DetectBody {
  image: string
  config?: AIProviderConfig
}

const PROMPT = `你是一个题目识别助手。下面这张图是用户拍摄的试卷/作业/教材照片。
请识别图片中所有的"题目"，并返回严格的 JSON 数组（不要任何额外文字、不要 markdown 代码块）。

每道题目包含：
- number: 题号字符串（如 "1"、"2(1)"、"三"、"五" 等；若图上没有显式题号，留空字符串）
- content: 题目正文（题目中的文字内容，包括题干、选项；可换行用 \\n 表示）
- bbox: 题目在图上的位置框，使用相对坐标（0~1，左上角为原点，宽高均为相对值）：
  - x, y, width, height
- kind: 题目类型，三选一：
  - "normal"：普通题目（选择题、填空题、计算题等）
  - "passage"：阅读理解的文章/材料本身
  - "passage_question"：阅读理解的题目（属于某篇文章后的题目）
- images: 题目内嵌的配图数组（几何图形、函数图、电路图、表格、插图等），每项：
  - bbox: 配图在原图中的相对位置框
  - caption: 配图说明（可选）

要求：
1. 数组按题目在图上从上到下的顺序排列。
2. 阅读理解识别：
   - 如果图中有一篇文章/材料后跟多个题目，把文章本身作为一个 kind="passage" 的项
   - 后面的每道题目作为 kind="passage_question" 的项
   - 同一篇文章的题目尽量关联同一篇文章
3. 同一道题目中的所有内容（题干 + 选项 + 空行 + 配图）都属于同一个 bbox（题目的 bbox 应包含配图）。
4. bbox 要尽量紧贴题目区域，不要包含相邻题目。
5. 如果题目内含几何图、函数图、表格、电路图等"配图"，请把每个配图单独提取到 images 数组中。
6. 如果没有识别到配图，images 返回空数组 []。
7. 如果图中没有识别到任何题目，返回 []。
8. 只输出 JSON 数组本身，不要包装，不要解释。
9. 如果一道题目在当前页未结束（延续到下一页），请在该项中加 "crossPageContinues": true；
   如果是上一页的延续，请加 "crossPageContinued": true。

示例输出：
[{"number":"","content":"Read the following passage and answer the questions...","bbox":{"x":0.05,"y":0.05,"width":0.90,"height":0.40},"kind":"passage","images":[]},{"number":"1","content":"What is the main idea?","bbox":{"x":0.05,"y":0.50,"width":0.90,"height":0.08},"kind":"passage_question","images":[]},{"number":"2","content":"计算 $x^2 + 2x + 1 = 0$ 的解。","bbox":{"x":0.05,"y":0.60,"width":0.90,"height":0.10},"kind":"normal","images":[{"bbox":{"x":0.30,"y":0.65,"width":0.40,"height":0.20},"caption":"函数图像"}]}]`

function extractJson(text: string): DetectedQuestionDTO[] {
  if (!text) return []
  // 去掉 markdown 代码块 + 修复中文标点
  let s = text.trim()
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```/g, "")
    .trim()
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
  const start = s.indexOf("[")
  const end = s.lastIndexOf("]")
  if (start === -1 || end === -1 || end <= start) return []
  s = s.slice(start, end + 1)
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
  try {
    const parsed = JSON.parse(s)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((it) => it && typeof it === "object")
      .map((it) => ({
        number: typeof it.number === "string" ? it.number : String(it.number ?? ""),
        content: typeof it.content === "string" ? it.content : String(it.content ?? ""),
        bbox: {
          x: Number(it.bbox?.x ?? 0.05),
          y: Number(it.bbox?.y ?? 0.05),
          width: Number(it.bbox?.width ?? 0.9),
          height: Number(it.bbox?.height ?? 0.15),
        },
        kind: (it.kind === "passage" || it.kind === "passage_question" ? it.kind : "normal") as
          | "normal"
          | "passage"
          | "passage_question",
        images: Array.isArray(it.images)
          ? it.images
              .filter((sub: unknown) => sub && typeof sub === "object")
              .map((sub: any) => ({
                bbox: {
                  x: Number(sub?.bbox?.x ?? 0.1),
                  y: Number(sub?.bbox?.y ?? 0.1),
                  width: Number(sub?.bbox?.width ?? 0.3),
                  height: Number(sub?.bbox?.height ?? 0.3),
                },
                caption: typeof sub?.caption === "string" ? sub.caption : "",
              }))
          : [],
        crossPageContinues: !!it.crossPageContinues,
        crossPageContinued: !!it.crossPageContinued,
      }))
      .map((q) => ({
        ...q,
        bbox: {
          x: Math.max(0, Math.min(0.99, q.bbox.x)),
          y: Math.max(0, Math.min(0.99, q.bbox.y)),
          width: Math.max(0.02, Math.min(1 - q.bbox.x, q.bbox.width)),
          height: Math.max(0.02, Math.min(1 - q.bbox.y, q.bbox.height)),
        },
        images: q.images?.map((si) => ({
          ...si,
          bbox: {
            x: Math.max(0, Math.min(0.99, si.bbox.x)),
            y: Math.max(0, Math.min(0.99, si.bbox.y)),
            width: Math.max(0.02, Math.min(1 - si.bbox.x, si.bbox.width)),
            height: Math.max(0.02, Math.min(1 - si.bbox.y, si.bbox.height)),
          },
        })),
      }))
  } catch {
    return []
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as DetectBody
    if (!body?.image) {
      return NextResponse.json({ error: "缺少 image 字段" }, { status: 400 })
    }

    let dataUrl = body.image
    if (!dataUrl.startsWith("data:")) {
      dataUrl = `data:image/jpeg;base64,${dataUrl}`
    }

    // config 必须由前端传入（localStorage 仅在浏览器存在，服务端无法读取）
    const config = body.config

    const messages: ChatMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ]

    const result = await callVisionChat(messages, { config, maxTokens: 8192 })
    const questions = extractJson(result.content)

    return NextResponse.json({
      ok: true,
      questions,
      provider: config?.enabled && config.apiKey ? "openai-compatible" : "zai",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message, questions: [] }, { status: 500 })
  }
}
