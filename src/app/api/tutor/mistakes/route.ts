import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { callVisionChat, type ChatMessage } from "@/lib/ai-service"
import type { AIProviderConfig } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 60

interface MistakeItem {
  id: string
  question: string
  questionImage: string
  answer: string
  analysis: string
  tags: string[]
  knowledgePoint: string
  createdAt: number
}

interface MistakeBookListItem {
  id: string
  title: string
  subject: string
  cover: string
  count: number
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

// 默认学科错题本配置
const DEFAULT_SUBJECTS = [
  { id: "math", name: "数学错题本" },
  { id: "chinese", name: "语文错题本" },
  { id: "english", name: "英语错题本" },
  { id: "physics", name: "物理错题本" },
  { id: "chemistry", name: "化学错题本" },
  { id: "biology", name: "生物错题本" },
]

/** 确保默认学科错题本存在（首次访问时自动创建） */
async function ensureDefaultBooks() {
  for (const sub of DEFAULT_SUBJECTS) {
    const existing = await db.mistakeBook.findFirst({
      where: { subject: sub.id, isDefault: true },
      select: { id: true },
    })
    if (!existing) {
      await db.mistakeBook.create({
        data: {
          id: `mb_default_${sub.id}`,
          title: sub.name,
          subject: sub.id,
          isDefault: true,
          items: "[]",
        },
      })
    }
  }
}

/** GET /api/tutor/mistakes — 列出错题本（自动创建默认学科本） */
export async function GET() {
  try {
    await ensureDefaultBooks()
    const rows = await db.mistakeBook.findMany({
      orderBy: [{ isDefault: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true, title: true, subject: true, cover: true, count: true, isDefault: true,
        createdAt: true, updatedAt: true,
      },
    })
    const list: MistakeBookListItem[] = rows.map((r) => ({
      id: r.id, title: r.title, subject: r.subject, cover: r.cover,
      count: r.count, isDefault: r.isDefault,
      createdAt: r.createdAt.getTime(), updatedAt: r.updatedAt.getTime(),
    }))
    return NextResponse.json({ ok: true, books: list })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

interface CreateBody {
  title?: string
  subject?: string
  cover?: string
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
        subject: body.subject || "other",
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

/** DELETE /api/tutor/mistakes — 删除所有错题本（保留默认） */
export async function DELETE() {
  try {
    await db.mistakeBook.deleteMany({ where: { isDefault: false } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
