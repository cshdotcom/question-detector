import { NextResponse } from "next/server"
import { callVisionChat, type ChatMessage } from "@/lib/ai-service"
import type { AIProviderConfig } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 120

interface CustomQABody {
  message: string
  image?: string
  config?: AIProviderConfig
  history?: { role: "user" | "assistant"; content: string; image?: string }[]
}

const SYS_PROMPT = `你是一名全科辅导老师。用户可以上传任何图片（题目、课本、作业、实物等）并提出任何问题。
你的任务是：
1. 识别图片内容
2. 回答用户的问题
3. 如果是题目，给出详细解析
4. 如果是概念，给出通俗易懂的解释
5. 主动提出延伸问题，引导学生深入思考

回答要求：
- 使用中文
- 语言通俗易懂
- 关键点用 <b>...</b> 加粗
- 公式用 unicode（如 x² √ ∫ ∑）
- 适当使用 <br> 换行
- 不要使用 markdown 代码块`

/** POST /api/tutor/custom-qa — 自定义问答（不创建 session，直接调 AI） */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CustomQABody
    if (!body.message && !body.image) {
      return NextResponse.json({ ok: false, error: "缺少 message 或 image" }, { status: 400 })
    }

    const messages: ChatMessage[] = [
      { role: "system", content: SYS_PROMPT },
    ]

    // 加入历史
    if (body.history && body.history.length > 0) {
      for (const h of body.history.slice(-10)) {
        if (h.image) {
          messages.push({
            role: h.role,
            content: [
              { type: "text", text: h.content || "（图片）" },
              { type: "image_url", image_url: { url: h.image } },
            ],
          })
        } else {
          messages.push({ role: h.role, content: h.content })
        }
      }
    }

    // 当前消息
    if (body.image) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: body.message || "请识别这张图片并回答" },
          { type: "image_url", image_url: { url: body.image } },
        ],
      })
    } else {
      messages.push({ role: "user", content: body.message })
    }

    const result = await callVisionChat(messages, { config: body.config, maxTokens: 8192 })
    return NextResponse.json({ ok: true, text: result.content })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[tutor:custom-qa] failed:", message)
    let friendly = message
    if (message.includes("502") || message.includes("Bad Gateway") || message.includes("<html>")) {
      friendly = "AI 服务暂时不可用（502），请稍后重试或检查 AI 配置"
    } else if (message.includes("401") || message.includes("Unauthorized")) {
      friendly = "AI 配置错误：API Key 无效，请检查 AI 设置"
    }
    return NextResponse.json({ ok: false, error: friendly }, { status: 500 })
  }
}
