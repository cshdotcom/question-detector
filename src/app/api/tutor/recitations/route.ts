import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { callVisionChat, type ChatMessage } from "@/lib/ai-service"
import type { AIProviderConfig } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 120

interface RecitationListItem {
  id: string
  title: string
  mode: string
  progress: number
  status: string
  createdAt: number
  updatedAt: number
}

interface CreateBody {
  title?: string
  content: string
  imageData?: string
  mode?: "fillblank" | "supervised" | "selftest" | "aihelp"
  generate?: boolean  // 是否立即生成挖空/记忆帮助
  config?: AIProviderConfig
}

/** GET /api/tutor/recitations — 列出背诵会话 */
export async function GET() {
  try {
    const rows = await db.recitationSession.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, title: true, mode: true, progress: true, status: true,
        createdAt: true, updatedAt: true,
      },
    })
    const list: RecitationListItem[] = rows.map((r) => ({
      id: r.id, title: r.title, mode: r.mode, progress: r.progress, status: r.status,
      createdAt: r.createdAt.getTime(), updatedAt: r.updatedAt.getTime(),
    }))
    return NextResponse.json({ ok: true, recitations: list })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** POST /api/tutor/recitations — 新建背诵会话（可选立即生成挖空/记忆帮助） */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateBody
    if (!body.content || !body.content.trim()) {
      return NextResponse.json({ ok: false, error: "缺少 content" }, { status: 400 })
    }
    const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const mode = body.mode || "fillblank"
    const title = body.title?.trim() || body.content.slice(0, 30)

    let fillBlanks = "[]"
    let memoryAids = ""

    if (body.generate) {
      // 根据模式调用 AI
      if (mode === "fillblank") {
        // 挖空测试：AI 识别关键词并生成挖空
        const sysPrompt = `你是一名背诵辅导老师。请把下面的内容做成"挖空测试"版本。
要求：
1. 选取 5-10 个关键空（名词、动词、数字、公式等）
2. 每个空给出答案和上下文
3. 输出严格 JSON（不要 markdown）：
{
  "blanks": [
    {
      "blankId": "b1",
      "context": "挖空前的文字___挖空后的文字",
      "answer": "被挖掉的词"
    }
  ]
}
原文：${body.content}`
        const messages: ChatMessage[] = [
          { role: "system", content: sysPrompt },
        ]
        if (body.imageData) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: "请根据图片中的内容生成挖空测试" },
              { type: "image_url", image_url: { url: body.imageData } },
            ],
          })
        } else {
          messages.push({ role: "user", content: "请生成挖空测试" })
        }
        const result = await callVisionChat(messages, { config: body.config, maxTokens: 4096 })
        try {
          const txt = result.content.trim().replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim()
          const start = txt.indexOf("{"), end = txt.lastIndexOf("}")
          if (start !== -1 && end !== -1) {
            const obj = JSON.parse(txt.slice(start, end + 1))
            fillBlanks = JSON.stringify(obj.blanks || [])
          }
        } catch {}
      } else if (mode === "aihelp") {
        // AI 帮助记忆：生成记忆口诀/联想/思维导图
        const sysPrompt = `你是一名记忆专家。请帮助学生记忆以下内容，生成记忆辅助。
要求：
1. 给出 3-5 条记忆口诀或联想（简短易记）
2. 给出一个思维导图结构（关键词层级）
3. 输出 JSON：
{
  "mnemonics": ["口诀1", "口诀2", "口诀3"],
  "mindmap": {
    "center": "中心主题",
    "branches": [
      { "name": "分支1", "items": ["要点1", "要点2"] }
    ]
  }
}
原文：${body.content}`
        const messages: ChatMessage[] = [{ role: "system", content: sysPrompt }]
        if (body.imageData) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: "请根据图片内容生成记忆帮助" },
              { type: "image_url", image_url: { url: body.imageData } },
            ],
          })
        } else {
          messages.push({ role: "user", content: "请生成记忆帮助" })
        }
        const result = await callVisionChat(messages, { config: body.config, maxTokens: 4096 })
        try {
          const txt = result.content.trim().replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim()
          const start = txt.indexOf("{"), end = txt.lastIndexOf("}")
          if (start !== -1 && end !== -1) {
            memoryAids = JSON.stringify(JSON.parse(txt.slice(start, end + 1)))
          }
        } catch {}
      }
    }

    const row = await db.recitationSession.create({
      data: {
        id,
        title,
        content: body.content,
        imageData: body.imageData || "",
        mode,
        fillBlanks,
        memoryAids,
      },
    })
    return NextResponse.json({ ok: true, id: row.id, fillBlanks, memoryAids })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[tutor:recitation:create] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/tutor/recitations — 删除所有 */
export async function DELETE() {
  try {
    await db.recitationSession.deleteMany({})
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
