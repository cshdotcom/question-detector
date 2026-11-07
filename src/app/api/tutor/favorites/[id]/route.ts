import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const runtime = "nodejs"

interface RouteCtx {
  params: Promise<{ id: string }>
}

/** GET /api/tutor/favorites/[id] — 收藏详情 */
export async function GET(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const row = await db.favorite.findUnique({ where: { id } })
    if (!row) return NextResponse.json({ ok: false, error: "收藏不存在" }, { status: 404 })
    return NextResponse.json({
      ok: true,
      favorite: {
        ...row,
        tags: (() => { try { return JSON.parse(row.tags || "[]") } catch { return [] } })(),
        createdAt: row.createdAt.getTime(),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/tutor/favorites/[id] — 删除收藏 */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    await db.favorite.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
