import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { callVisionChat, type ChatMessage } from "@/lib/ai-service"
import type { AIProviderConfig } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 120

interface RouteCtx {
  params: Promise<{ id: string }>
}

interface RecitationDetail {
  id: string
  title: string
  content: string
  imageData: string
  mode: string
  fillBlanks: unknown[]
  memoryAids: string
  answers: unknown[]
  progress: number
  status: string
  createdAt: number
  updatedAt: number
}

function rowToDetail(row: {
  id: string; title: string; content: string; imageData: string;
  mode: string; fillBlanks: string; memoryAids: string; answers: string;
  progress: number; status: string;
  createdAt: Date; updatedAt: Date;
}): RecitationDetail {
  let fillBlanks: unknown[] = []
  try { fillBlanks = JSON.parse(row.fillBlanks || "[]") } catch {}
  let answers: unknown[] = []
  try { answers = JSON.parse(row.answers || "[]") } catch {}
  return {
    id: row.id, title: row.title, content: row.content, imageData: row.imageData,
    mode: row.mode, fillBlanks, memoryAids: row.memoryAids, answers,
    progress: row.progress, status: row.status,
    createdAt: row.createdAt.getTime(), updatedAt: row.updatedAt.getTime(),
  }
}

/** GET /api/tutor/recitations/[id] */
export async function GET(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const row = await db.recitationSession.findUnique({ where: { id } })
    if (!row) return NextResponse.json({ ok: false, error: "背诵会话不存在" }, { status: 404 })
    return NextResponse.json({ ok: true, recitation: rowToDetail(row) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

interface UpdateBody {
  title?: string
  content?: string
  fillBlanks?: unknown[]
  memoryAids?: string
  answers?: unknown[]
  progress?: number
  status?: string
  // AI 监督：让 AI 听学生背诵并评价
  aiListen?: {
    userSpeech: string  // 学生背诵的语音转文字
  }
  config?: AIProviderConfig
}

/** PUT /api/tutor/recitations/[id] — 更新 / AI 监督评价 */
export async function PUT(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const body = (await req.json()) as UpdateBody
    const existing = await db.recitationSession.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ ok: false, error: "不存在" }, { status: 404 })

    // AI 监督模式：评价学生背诵
    if (body.aiListen) {
      const sysPrompt = `你是一名背诵监督老师。学生正在背诵以下内容：
${existing.content}

学生背诵的内容（语音转文字）：
${body.aiListen.userSpeech}

请评价：
1. 找出学生漏背、错背的地方
2. 给出正确版本
3. 评分（0-100）
4. 鼓励性反馈

输出 JSON：
{
  "score": 85,
  "errors": [
    { "type": "漏背|错背|顺序错误", "original": "原文", "userSaid": "学生背的", "correction": "正确版本" }
  ],
  "feedback": "鼓励性反馈"
}`
      const messages: ChatMessage[] = [
        { role: "system", content: sysPrompt },
        { role: "user", content: body.aiListen.userSpeech },
      ]
      const result = await callVisionChat(messages, { config: body.config, maxTokens: 4096 })
      let evaluation = {}
      try {
        const txt = result.content.trim().replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim()
        const start = txt.indexOf("{"), end = txt.lastIndexOf("}")
        if (start !== -1 && end !== -1) {
          evaluation = JSON.parse(txt.slice(start, end + 1))
        }
      } catch {}
      return NextResponse.json({ ok: true, evaluation })
    }

    // 普通更新
    const updateData: Record<string, unknown> = {}
    if (body.title !== undefined) updateData.title = body.title
    if (body.content !== undefined) updateData.content = body.content
    if (body.fillBlanks !== undefined) updateData.fillBlanks = JSON.stringify(body.fillBlanks)
    if (body.memoryAids !== undefined) updateData.memoryAids = body.memoryAids
    if (body.answers !== undefined) updateData.answers = JSON.stringify(body.answers)
    if (body.progress !== undefined) updateData.progress = body.progress
    if (body.status !== undefined) updateData.status = body.status
    await db.recitationSession.update({ where: { id }, data: updateData })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/tutor/recitations/[id] */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    await db.recitationSession.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
