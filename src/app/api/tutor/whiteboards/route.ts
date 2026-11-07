import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { Stroke } from "@/components/question-detector/Whiteboard"

export const runtime = "nodejs"

interface WhiteboardListItem {
  id: string
  title: string
  thumbnail: string
  width: number
  height: number
  sessionId: string
  createdAt: number
  updatedAt: number
}

interface CreateBody {
  id?: string
  title?: string
  strokes?: Stroke[]
  backgroundImage?: string
  width?: number
  height?: number
  sessionId?: string
  thumbnail?: string
}

/** GET /api/tutor/whiteboards — 列出所有白板 */
export async function GET() {
  try {
    const rows = await db.whiteboard.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, title: true, thumbnail: true,
        width: true, height: true, sessionId: true,
        createdAt: true, updatedAt: true,
      },
    })
    const list: WhiteboardListItem[] = rows.map((r) => ({
      id: r.id, title: r.title, thumbnail: r.thumbnail,
      width: r.width, height: r.height, sessionId: r.sessionId,
      createdAt: r.createdAt.getTime(), updatedAt: r.updatedAt.getTime(),
    }))
    return NextResponse.json({ ok: true, whiteboards: list })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** POST /api/tutor/whiteboards — 新建白板 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateBody
    const id = body.id || `wb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const row = await db.whiteboard.create({
      data: {
        id,
        title: body.title || "未命名画板",
        strokes: JSON.stringify(body.strokes || []),
        backgroundImage: body.backgroundImage || "",
        width: body.width || 1200,
        height: body.height || 800,
        sessionId: body.sessionId || "",
        thumbnail: body.thumbnail || "",
      },
    })
    return NextResponse.json({ ok: true, id: row.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/tutor/whiteboards — 删除所有白板 */
export async function DELETE() {
  try {
    await db.whiteboard.deleteMany({})
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
