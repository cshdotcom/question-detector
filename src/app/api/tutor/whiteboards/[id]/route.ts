import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { Stroke } from "@/components/question-detector/Whiteboard"

export const runtime = "nodejs"

interface RouteCtx {
  params: Promise<{ id: string }>
}

interface WhiteboardDetail {
  id: string
  title: string
  strokes: Stroke[]
  backgroundImage: string
  width: number
  height: number
  sessionId: string
  thumbnail: string
  createdAt: number
  updatedAt: number
}

function rowToDetail(row: {
  id: string; title: string; strokes: string; backgroundImage: string;
  width: number; height: number; sessionId: string; thumbnail: string;
  createdAt: Date; updatedAt: Date;
}): WhiteboardDetail {
  let strokes: Stroke[] = []
  try { strokes = JSON.parse(row.strokes || "[]") } catch {}
  return {
    id: row.id, title: row.title, strokes,
    backgroundImage: row.backgroundImage,
    width: row.width, height: row.height,
    sessionId: row.sessionId, thumbnail: row.thumbnail,
    createdAt: row.createdAt.getTime(), updatedAt: row.updatedAt.getTime(),
  }
}

/** GET /api/tutor/whiteboards/[id] */
export async function GET(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const row = await db.whiteboard.findUnique({ where: { id } })
    if (!row) return NextResponse.json({ ok: false, error: "白板不存在" }, { status: 404 })
    return NextResponse.json({ ok: true, whiteboard: rowToDetail(row) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

interface UpdateBody {
  title?: string
  strokes?: Stroke[]
  backgroundImage?: string
  width?: number
  height?: number
  sessionId?: string
  thumbnail?: string
}

/** PUT /api/tutor/whiteboards/[id] */
export async function PUT(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const body = (await req.json()) as UpdateBody
    const exists = await db.whiteboard.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return NextResponse.json({ ok: false, error: "白板不存在" }, { status: 404 })
    await db.whiteboard.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.strokes !== undefined ? { strokes: JSON.stringify(body.strokes) } : {}),
        ...(body.backgroundImage !== undefined ? { backgroundImage: body.backgroundImage } : {}),
        ...(body.width !== undefined ? { width: body.width } : {}),
        ...(body.height !== undefined ? { height: body.height } : {}),
        ...(body.sessionId !== undefined ? { sessionId: body.sessionId } : {}),
        ...(body.thumbnail !== undefined ? { thumbnail: body.thumbnail } : {}),
      },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/tutor/whiteboards/[id] */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    await db.whiteboard.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
