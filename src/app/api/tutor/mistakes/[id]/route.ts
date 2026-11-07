import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const runtime = "nodejs"

interface RouteCtx {
  params: Promise<{ id: string }>
}

interface MistakeItem {
  id: string
  question: string
  questionImage: string
  answer: string
  analysis: string
  tags: string[]
  createdAt: number
}

interface MistakeBookDetail {
  id: string
  title: string
  subject: string
  cover: string
  items: MistakeItem[]
  count: number
  createdAt: number
  updatedAt: number
}

function rowToDetail(row: {
  id: string; title: string; subject: string; cover: string;
  items: string; count: number;
  createdAt: Date; updatedAt: Date;
}): MistakeBookDetail {
  let items: MistakeItem[] = []
  try { items = JSON.parse(row.items || "[]") } catch {}
  return {
    id: row.id, title: row.title, subject: row.subject, cover: row.cover,
    items, count: row.count,
    createdAt: row.createdAt.getTime(), updatedAt: row.updatedAt.getTime(),
  }
}

/** GET /api/tutor/mistakes/[id] */
export async function GET(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const row = await db.mistakeBook.findUnique({ where: { id } })
    if (!row) return NextResponse.json({ ok: false, error: "错题本不存在" }, { status: 404 })
    return NextResponse.json({ ok: true, book: rowToDetail(row) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

interface UpdateBody {
  title?: string
  subject?: string
  cover?: string
  items?: MistakeItem[]
}

/** PUT /api/tutor/mistakes/[id] */
export async function PUT(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const body = (await req.json()) as UpdateBody
    const exists = await db.mistakeBook.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return NextResponse.json({ ok: false, error: "错题本不存在" }, { status: 404 })
    const updateData: Record<string, unknown> = {}
    if (body.title !== undefined) updateData.title = body.title
    if (body.subject !== undefined) updateData.subject = body.subject
    if (body.cover !== undefined) updateData.cover = body.cover
    if (body.items !== undefined) {
      updateData.items = JSON.stringify(body.items)
      updateData.count = body.items.length
    }
    await db.mistakeBook.update({ where: { id }, data: updateData })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/tutor/mistakes/[id] */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    await db.mistakeBook.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
