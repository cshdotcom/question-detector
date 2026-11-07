import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const runtime = "nodejs"

interface MistakeItem {
  id: string
  question: string  // 题目内容（文本）
  questionImage: string  // 题目截图 dataUrl（可选）
  answer: string
  analysis: string
  tags: string[]
  createdAt: number
}

interface MistakeBookListItem {
  id: string
  title: string
  subject: string
  cover: string
  count: number
  createdAt: number
  updatedAt: number
}

interface CreateBody {
  title?: string
  subject?: string
  cover?: string
}

/** GET /api/tutor/mistakes — 列出错题本 */
export async function GET() {
  try {
    const rows = await db.mistakeBook.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, title: true, subject: true, cover: true, count: true,
        createdAt: true, updatedAt: true,
      },
    })
    const list: MistakeBookListItem[] = rows.map((r) => ({
      id: r.id, title: r.title, subject: r.subject, cover: r.cover,
      count: r.count, createdAt: r.createdAt.getTime(), updatedAt: r.updatedAt.getTime(),
    }))
    return NextResponse.json({ ok: true, books: list })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** POST /api/tutor/mistakes — 新建错题本 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateBody
    const id = `mb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const row = await db.mistakeBook.create({
      data: {
        id,
        title: body.title || "未命名错题本",
        subject: body.subject || "math",
        cover: body.cover || "",
        items: "[]",
      },
    })
    return NextResponse.json({ ok: true, id: row.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/tutor/mistakes — 删除所有错题本 */
export async function DELETE() {
  try {
    await db.mistakeBook.deleteMany({})
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export type { MistakeItem, MistakeBookListItem }
