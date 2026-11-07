import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { Question, AIProviderConfig } from "@/lib/types"

export const runtime = "nodejs"

interface RouteCtx {
  params: Promise<{ id: string }>
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  timestamp: number
  stage?: number
  meta?: Record<string, unknown>
}

interface TutorSessionDetail {
  id: string
  type: string
  title: string
  imageId: string
  questionIdx: number
  questionSnapshot: Question
  imageCrop: string
  messages: ChatMessage[]
  stage: number
  knowledgeCards: unknown[]
  visualBoards: unknown[]
  status: string
  archived: boolean
  createdAt: number
  updatedAt: number
}

function rowToDetail(row: {
  id: string; type: string; title: string; imageId: string; questionIdx: number;
  questionSnapshot: string; imageCrop: string; messages: string; stage: number;
  knowledgeCards: string; visualBoards: string; status: string; archived: boolean;
  createdAt: Date; updatedAt: Date;
}): TutorSessionDetail {
  let q: Question = {} as Question
  try { q = JSON.parse(row.questionSnapshot || "{}") } catch {}
  let msgs: ChatMessage[] = []
  try { msgs = JSON.parse(row.messages || "[]") } catch {}
  let cards: unknown[] = []
  try { cards = JSON.parse(row.knowledgeCards || "[]") } catch {}
  let boards: unknown[] = []
  try { boards = JSON.parse(row.visualBoards || "[]") } catch {}
  return {
    id: row.id, type: row.type, title: row.title, imageId: row.imageId,
    questionIdx: row.questionIdx, questionSnapshot: q, imageCrop: row.imageCrop,
    messages: msgs, stage: row.stage, knowledgeCards: cards, visualBoards: boards,
    status: row.status, archived: row.archived,
    createdAt: row.createdAt.getTime(), updatedAt: row.updatedAt.getTime(),
  }
}

/** GET /api/tutor/sessions/[id] — 详情 */
export async function GET(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const row = await db.tutorSession.findUnique({ where: { id } })
    if (!row) return NextResponse.json({ ok: false, error: "会话不存在" }, { status: 404 })
    return NextResponse.json({ ok: true, session: rowToDetail(row) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

interface UpdateBody {
  title?: string
  messages?: ChatMessage[]
  stage?: number
  knowledgeCards?: unknown[]
  visualBoards?: unknown[]
  status?: string
  archived?: boolean
}

/** PUT /api/tutor/sessions/[id] — 更新 */
export async function PUT(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const body = (await req.json()) as UpdateBody
    const exists = await db.tutorSession.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return NextResponse.json({ ok: false, error: "会话不存在" }, { status: 404 })
    await db.tutorSession.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.messages !== undefined ? { messages: JSON.stringify(body.messages) } : {}),
        ...(body.stage !== undefined ? { stage: body.stage } : {}),
        ...(body.knowledgeCards !== undefined ? { knowledgeCards: JSON.stringify(body.knowledgeCards) } : {}),
        ...(body.visualBoards !== undefined ? { visualBoards: JSON.stringify(body.visualBoards) } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.archived !== undefined ? { archived: body.archived } : {}),
      },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[tutor:update] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/tutor/sessions/[id] — 删除 */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    await db.tutorSession.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

// Re-export types for downstream use
export type { TutorSessionDetail, ChatMessage, AIProviderConfig }
