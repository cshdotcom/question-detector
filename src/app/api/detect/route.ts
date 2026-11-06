import { NextResponse } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import type { DetectedQuestionDTO } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 60

interface DetectBody {
  image: string // dataURL 或纯 base64
}

const PROMPT = `你是一个题目识别助手。下面这张图是用户拍摄的试卷/作业照片。
请识别图片中所有的"题目"，并返回严格的 JSON 数组（不要任何额外文字、不要 markdown 代码块）。

每道题目包含：
- number: 题号字符串（如 "1"、"2(1)"、"三"、"五" 等；若图上没有显式题号，留空字符串）
- content: 题目正文（题目中的文字内容，包括题干、选项；可换行用 \\n 表示）
- bbox: 题目在图上的位置框，使用相对坐标（0~1，左上角为原点，宽高均为相对值）：
  - x: 左上角横坐标（0~1）
  - y: 左上角纵坐标（0~1）
  - width: 框宽度（0~1）
  - height: 框高度（0~1）

要求：
1. 数组按题目在图上从上到下的顺序排列。
2. 同一道题目中的所有内容（题干 + 选项 + 空行）都属于同一个 bbox。
3. bbox 要尽量紧贴题目区域，不要包含相邻题目。
4. 如果图中没有识别到任何题目，返回 []。
5. 只输出 JSON 数组本身，不要包装，不要解释。

示例输出格式：
[{"number":"1","content":"计算 23 + 45 = ?","bbox":{"x":0.05,"y":0.10,"width":0.90,"height":0.12}},{"number":"2","content":"下列哪个是偶数？\\nA. 3\\nB. 4","bbox":{"x":0.05,"y":0.25,"width":0.90,"height":0.18}}]`

function extractJson(text: string): DetectedQuestionDTO[] {
  if (!text) return []
  let s = text.trim()
  const start = s.indexOf("[")
  const end = s.lastIndexOf("]")
  if (start === -1 || end === -1 || end <= start) return []
  s = s.slice(start, end + 1)
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
      }))
      .map((q) => ({
        ...q,
        bbox: {
          x: Math.max(0, Math.min(0.99, q.bbox.x)),
          y: Math.max(0, Math.min(0.99, q.bbox.y)),
          width: Math.max(0.02, Math.min(1 - q.bbox.x, q.bbox.width)),
          height: Math.max(0.02, Math.min(1 - q.bbox.y, q.bbox.height)),
        },
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

    const zai = await ZAI.create()
    const resp = await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    })

    const content = resp.choices?.[0]?.message?.content ?? ""
    const questions = extractJson(content)

    return NextResponse.json({
      ok: true,
      questions,
      raw: content,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message, questions: [] }, { status: 500 })
  }
}
