import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { callVisionChat, type ChatMessage } from "@/lib/ai-service"
import type { AIProviderConfig } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 120

interface EssayListItem {
  id: string
  type: string
  title: string
  wordCount: number
  genre: string
  status: string
  createdAt: number
  updatedAt: number
}

interface CreateBody {
  type: "chinese" | "english"
  title: string
  prompt?: string
  wordCount?: number
  genre?: string
  imageData?: string
  config?: AIProviderConfig
  generate?: boolean  // 是否立即生成范文
}

/** GET /api/tutor/essays — 列出作文 */
export async function GET() {
  try {
    const rows = await db.essaySession.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, type: true, title: true, wordCount: true, genre: true, status: true,
        createdAt: true, updatedAt: true,
      },
    })
    const list: EssayListItem[] = rows.map((r) => ({
      id: r.id, type: r.type, title: r.title, wordCount: r.wordCount,
      genre: r.genre, status: r.status,
      createdAt: r.createdAt.getTime(), updatedAt: r.updatedAt.getTime(),
    }))
    return NextResponse.json({ ok: true, essays: list })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** POST /api/tutor/essays — 新建作文会话（可选立即生成范文） */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateBody
    if (!body.type || (body.type !== "chinese" && body.type !== "english")) {
      return NextResponse.json({ ok: false, error: "type 必须是 chinese 或 english" }, { status: 400 })
    }
    if (!body.title) {
      return NextResponse.json({ ok: false, error: "缺少 title" }, { status: 400 })
    }
    const id = `essay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const wordCount = body.wordCount || 800
    const genre = body.genre || (body.type === "chinese" ? "议论文" : "essay")

    let essay = ""
    let outline = ""

    if (body.generate) {
      // 立即生成范文
      const sysPrompt = body.type === "chinese"
        ? `你是一名语文作文辅导老师。根据用户提供的题目要求，撰写一篇高质量的范文。
要求：
1. 字数约 ${wordCount} 字
2. 文体：${genre}
3. 结构完整：开头引人入胜、正文层次分明、结尾升华主题
4. 语言生动、立意深刻、有真情实感
5. 不要使用 markdown 代码块，直接输出范文正文

输出格式（JSON）：
{
  "essay": "范文正文...",
  "outline": {
    "analysis": "审题分析",
    "material": "选材建议",
    "structure": ["开头：...", "正文：...", "结尾：..."]
  }
}`
        : `You are an English essay tutor. Based on the user's prompt, write a high-quality essay.
Requirements:
1. About ${wordCount} words
2. Genre: ${genre}
3. Clear structure: introduction, body, conclusion
4. Natural language, proper grammar, insightful content
5. Output the essay text directly, no markdown code blocks

Output format (JSON):
{
  "essay": "essay text...",
  "outline": {
    "analysis": "topic analysis",
    "material": "material suggestions",
    "structure": ["introduction: ...", "body: ...", "conclusion: ..."]
  }
}`

      const messages: ChatMessage[] = [{
        role: "system",
        content: sysPrompt,
      }]
      // 用户消息：题目要求 + 可选附图
      if (body.imageData) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: body.prompt || body.title },
            { type: "image_url", image_url: { url: body.imageData } },
          ],
        })
      } else {
        messages.push({
          role: "user",
          content: body.prompt || body.title,
        })
      }
      const result = await callVisionChat(messages, { config: body.config, maxTokens: 8192 })
      // 解析 JSON
      const text = result.content.trim()
      try {
        // 去除可能的 markdown 代码块
        const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim()
        const start = cleaned.indexOf("{")
        const end = cleaned.lastIndexOf("}")
        if (start !== -1 && end !== -1) {
          const json = JSON.parse(cleaned.slice(start, end + 1))
          essay = json.essay || ""
          outline = JSON.stringify(json.outline || {})
        }
      } catch {
        // JSON 解析失败，直接当文本
        essay = text
      }
    }

    const row = await db.essaySession.create({
      data: {
        id,
        type: body.type,
        title: body.title,
        prompt: body.prompt || "",
        wordCount,
        genre,
        essay,
        outline,
        imageData: body.imageData || "",
      },
    })
    return NextResponse.json({ ok: true, id: row.id, essay, outline })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[tutor:essay:create] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/tutor/essays — 删除所有作文 */
export async function DELETE() {
  try {
    await db.essaySession.deleteMany({})
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
