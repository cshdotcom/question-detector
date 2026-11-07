import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const runtime = "nodejs"

interface FavoriteItem {
  id: string
  type: string  // "essay" | "message" | "mistake" | "whiteboard"
  refId: string
  title: string
  summary: string
  thumbnail: string
  content: string
  tags: string[]
  source: string
  createdAt: number
}

interface CreateBody {
  type: "essay" | "message" | "mistake" | "whiteboard"
  refId: string
  title?: string
  summary?: string
  thumbnail?: string
  content?: string
  tags?: string[]
  source?: string
}

/** GET /api/tutor/favorites — 列出收藏（可按类型筛选） */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const type = url.searchParams.get("type")
    const where = type ? { type } : {}
    const rows = await db.favorite.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })
    const list: FavoriteItem[] = rows.map((r) => ({
      id: r.id, type: r.type, refId: r.refId, title: r.title,
      summary: r.summary, thumbnail: r.thumbnail, content: r.content,
      tags: (() => { try { return JSON.parse(r.tags || "[]") } catch { return [] } })(),
      source: r.source, createdAt: r.createdAt.getTime(),
    }))
    return NextResponse.json({ ok: true, favorites: list })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** POST /api/tutor/favorites — 添加收藏 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateBody
    if (!body.type || !body.refId) {
      return NextResponse.json({ ok: false, error: "缺少 type 或 refId" }, { status: 400 })
    }
    // 检查是否已收藏（同一 type+refId）
    const existing = await db.favorite.findFirst({
      where: { type: body.type, refId: body.refId },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ ok: true, id: existing.id, alreadyExists: true })
    }
    const id = `fav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const row = await db.favorite.create({
      data: {
        id,
        type: body.type,
        refId: body.refId,
        title: body.title || "",
        summary: body.summary || "",
        thumbnail: body.thumbnail || "",
        content: body.content || "",
        tags: JSON.stringify(body.tags || []),
        source: body.source || "",
      },
    })
    return NextResponse.json({ ok: true, id: row.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/tutor/favorites — 取消收藏（按 type+refId） */
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const type = url.searchParams.get("type")
    const refId = url.searchParams.get("refId")
    if (type && refId) {
      await db.favorite.deleteMany({ where: { type, refId } })
    } else {
      await db.favorite.deleteMany({})
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
