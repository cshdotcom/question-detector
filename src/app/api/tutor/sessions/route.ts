import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { Question } from "@/lib/types"

export const runtime = "nodejs"

interface SessionListItem {
  id: string
  type: string
  title: string
  imageId: string
  questionIdx: number
  stage: number
  status: string
  createdAt: number
  updatedAt: number
  thumbnail: string
}

interface CreateBody {
  type: "solve" | "lecture"
  imageId: string
  questionIdx: number
  questionSnapshot?: Question
  imageCrop?: string
  title?: string
}

/** GET /api/tutor/sessions — 列出当前用户的所有辅导会话 */
export async function GET() {
  try {
    const rows = await db.tutorSession.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        type: true,
        title: true,
        imageId: true,
        questionIdx: true,
        stage: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    // 关联取 image thumbnail
    const imageIds = Array.from(new Set(rows.map((r) => r.imageId)))
    const images = imageIds.length > 0
      ? await db.storedImage.findMany({ where: { id: { in: imageIds } }, select: { id: true, thumbnail: true } })
      : []
    const thumbMap = new Map(images.map((i) => [i.id, i.thumbnail]))
    const list: SessionListItem[] = rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      imageId: r.imageId,
      questionIdx: r.questionIdx,
      stage: r.stage,
      status: r.status,
      createdAt: r.createdAt.getTime(),
      updatedAt: r.updatedAt.getTime(),
      thumbnail: thumbMap.get(r.imageId) ?? "",
    }))
    return NextResponse.json({ ok: true, sessions: list })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[tutor:list] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** POST /api/tutor/sessions — 新建会话 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateBody
    if (!body.type || (body.type !== "solve" && body.type !== "lecture")) {
      return NextResponse.json({ ok: false, error: "type 必须是 solve 或 lecture" }, { status: 400 })
    }
    if (!body.imageId) {
      return NextResponse.json({ ok: false, error: "缺少 imageId" }, { status: 400 })
    }
    const id = `tutor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const title = body.title?.trim() ||
      (body.questionSnapshot?.content?.slice(0, 40) || `第 ${body.questionIdx + 1} 题`)
    const now = new Date()
    const row = await db.tutorSession.create({
      data: {
        id,
        type: body.type,
        title,
        imageId: body.imageId,
        questionIdx: body.questionIdx,
        questionSnapshot: JSON.stringify(body.questionSnapshot ?? {}),
        imageCrop: body.imageCrop ?? "",
        messages: "[]",
        stage: 0,
        knowledgeCards: "[]",
        visualBoards: "[]",
        status: "active",
      },
    })
    return NextResponse.json({ ok: true, id: row.id, createdAt: now.getTime() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[tutor:create] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/tutor/sessions — 删除所有会话 */
export async function DELETE() {
  try {
    await db.tutorSession.deleteMany({})
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
