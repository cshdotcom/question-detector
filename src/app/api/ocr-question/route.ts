import { NextResponse } from "next/server"
import { callVisionChat, type ChatMessage } from "@/lib/ai-service"
import type { AIProviderConfig, BBox } from "@/lib/types"
import { loadAIConfig } from "@/lib/ai-config"

export const runtime = "nodejs"
export const maxDuration = 60

interface OCRBody {
  image: string
  bbox?: BBox
  config?: AIProviderConfig
}

const PROMPT = `请识别图片中的题目文字内容。返回严格的 JSON，不要 markdown 代码块：

{
  "number": "题号字符串（如 '1'、'2(1)'，没有则留空字符串）",
  "content": "题目完整文字内容（包括题干和选项，换行用 \\n 表示）",
  "kind": "normal | passage | passage_question（默认 normal；如果是阅读理解文章用 passage；文章后的题目用 passage_question）"
}

要求：
1. content 包含题目的全部文字，包括选项、括号、公式
2. 数学公式用 LaTeX：行内用 $...$，行间用 $$...$$
3. 不要解释，只返回 JSON
4. 如果用户指定了区域（bbox），重点识别该区域`

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as OCRBody
    if (!body?.image) {
      return NextResponse.json({ error: "缺少 image 字段" }, { status: 400 })
    }

    let dataUrl = body.image
    if (!dataUrl.startsWith("data:")) {
      dataUrl = `data:image/jpeg;base64,${dataUrl}`
    }

    let config = body.config
    if (!config) {
      config = loadAIConfig() as AIProviderConfig
    }

    const contextText = body.bbox
      ? `用户已用框选中一个区域，bbox 为 ${JSON.stringify(body.bbox)}（相对坐标 0-1，左上角为原点）。请重点识别该区域内的题目。${PROMPT}`
      : PROMPT

    const messages: ChatMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: contextText },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ]

    const result = await callVisionChat(messages, { config, maxTokens: 2048 })

    const txt = result.content.trim()
    const start = txt.indexOf("{")
    const end = txt.lastIndexOf("}")
    let parsed: { number: string; content: string; kind?: string }
    if (start !== -1 && end !== -1 && end > start) {
      try {
        parsed = JSON.parse(txt.slice(start, end + 1))
      } catch {
        parsed = { number: "", content: result.content }
      }
    } else {
      parsed = { number: "", content: result.content }
    }

    return NextResponse.json({
      ok: true,
      number: parsed.number || "",
      content: parsed.content || "",
      kind: parsed.kind === "passage" || parsed.kind === "passage_question" ? parsed.kind : "normal",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
