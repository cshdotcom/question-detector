import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { callVisionChat, type ChatMessage } from "@/lib/ai-service"
import type { AIProviderConfig } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 120

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
  knowledgePoint: string
  createdAt: number
}

interface MistakeBookDetail {
  id: string
  title: string
  subject: string
  cover: string
  items: MistakeItem[]
  count: number
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

function rowToDetail(row: {
  id: string; title: string; subject: string; cover: string;
  items: string; count: number; isDefault: boolean;
  createdAt: Date; updatedAt: Date;
}): MistakeBookDetail {
  let items: MistakeItem[] = []
  try { items = JSON.parse(row.items || "[]") } catch {}
  return {
    id: row.id, title: row.title, subject: row.subject, cover: row.cover,
    items, count: row.count, isDefault: row.isDefault,
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
  // AI 录入：传图片 dataUrl，AI 识别后追加新错题
  aiImportImage?: string
  config?: AIProviderConfig
  // 智能复习：根据错题生成复习题
  generateReview?: { timeRange: string; duration: number }
  // 举一反三：根据指定错题生成相似题
  generateSimilar?: { itemId: string }
}

const SUBJECT_NAMES: Record<string, string> = {
  math: "数学", chinese: "语文", english: "英语",
  physics: "物理", chemistry: "化学", biology: "生物", other: "综合",
}

/** PUT /api/tutor/mistakes/[id] — 更新 / AI 录入 / 智能复习 / 举一反三 */
export async function PUT(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const body = (await req.json()) as UpdateBody
    const exists = await db.mistakeBook.findUnique({ where: { id } })
    if (!exists) return NextResponse.json({ ok: false, error: "错题本不存在" }, { status: 404 })

    // === AI 录入：识别图片中的题目+答案+解析 ===
    if (body.aiImportImage) {
      const subjectName = SUBJECT_NAMES[exists.subject] || "综合"
      const sysPrompt = `你是一名${subjectName}老师。请识别这张错题图片，提取题目、正确答案、解析和知识点。
返回严格 JSON（不要 markdown 代码块）：
{
  "question": "题目原文",
  "answer": "正确答案",
  "analysis": "详细解析（解题思路、关键步骤）",
  "knowledgePoint": "考点（一句话）",
  "tags": ["标签1", "标签2"]
}
要求：
1. 题目原文要完整，包括题号、题干、选项（如有）
2. 答案要准确，多选题用 ABCD 表示
3. 解析要详细，分步骤说明
4. 知识点用一句话概括（如"一元二次方程的因式分解"）
5. tags 2-4 个（如["因式分解", "一元二次方程"]）`
      const messages: ChatMessage[] = [{
        role: "user",
        content: [
          { type: "text", text: sysPrompt },
          { type: "image_url", image_url: { url: body.aiImportImage } },
        ],
      }]
      const result = await callVisionChat(messages, { config: body.config, maxTokens: 4096 })
      // 解析 JSON
      let parsed: Record<string, unknown> | null = null
      try {
        const txt = result.content.trim().replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim()
        const start = txt.indexOf("{"), end = txt.lastIndexOf("}")
        if (start !== -1 && end !== -1) {
          parsed = JSON.parse(txt.slice(start, end + 1))
        }
      } catch {}
      if (!parsed) {
        return NextResponse.json({ ok: false, error: "AI 识别失败，请重试" }, { status: 500 })
      }
      const newItem: MistakeItem = {
        id: `mi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        question: String(parsed.question || ""),
        questionImage: body.aiImportImage,
        answer: String(parsed.answer || ""),
        analysis: String(parsed.analysis || ""),
        knowledgePoint: String(parsed.knowledgePoint || ""),
        tags: Array.isArray(parsed.tags) ? (parsed.tags as string[]).map(String) : [],
        createdAt: Date.now(),
      }
      const oldItems: MistakeItem[] = (() => { try { return JSON.parse(exists.items || "[]") } catch { return [] } })()
      const newItems = [...oldItems, newItem]
      await db.mistakeBook.update({
        where: { id },
        data: { items: JSON.stringify(newItems), count: newItems.length },
      })
      return NextResponse.json({ ok: true, item: newItem, count: newItems.length })
    }

    // === 智能复习：根据错题生成复习题 ===
    if (body.generateReview) {
      const { timeRange, duration } = body.generateReview
      const allItems: MistakeItem[] = (() => { try { return JSON.parse(exists.items || "[]") } catch { return [] } })()
      if (allItems.length === 0) {
        return NextResponse.json({ ok: false, error: "错题本为空，无法生成复习" }, { status: 400 })
      }
      // 按时间范围筛选
      const now = Date.now()
      const ranges: Record<string, number> = {
        "week": 7 * 24 * 3600 * 1000,
        "month": 30 * 24 * 3600 * 1000,
        "semester": 120 * 24 * 3600 * 1000,
        "all": Infinity,
      }
      const range = ranges[timeRange] || ranges.week
      const filtered = allItems.filter((it) => now - it.createdAt < range)
      if (filtered.length === 0) {
        return NextResponse.json({ ok: false, error: "所选时间范围内无错题" }, { status: 400 })
      }
      const subjectName = SUBJECT_NAMES[exists.subject] || "综合"
      const numQuestions = Math.min(6, Math.max(4, Math.floor(duration / 5)))
      // 构造错题摘要给 AI
      const mistakeSummary = filtered.slice(0, 10).map((it, i) => ({
        idx: i + 1,
        question: it.question.slice(0, 200),
        knowledgePoint: it.knowledgePoint,
        answer: it.answer.slice(0, 100),
      }))
      const sysPrompt = `你是一名${subjectName}老师。根据学生的错题记录，生成 ${numQuestions} 道复习题。
错题摘要：${JSON.stringify(mistakeSummary)}

要求：
1. 题目要覆盖错题中的知识点，但不要直接复制原题
2. 难度与原错题相当或略低（帮助学生巩固）
3. 每题包含题干、答案、解析、考点
4. 题型可以多样化（选择题、填空题、解答题）

返回严格 JSON（不要 markdown）：
{
  "reviewItems": [
    {
      "question": "题目",
      "answer": "答案",
      "analysis": "解析",
      "knowledgePoint": "考点",
      "type": "选择题|填空题|解答题"
    }
  ]
}`
      const result = await callVisionChat([{ role: "user", content: sysPrompt }], { config: body.config, maxTokens: 8192 })
      let reviewItems: unknown[] = []
      try {
        const txt = result.content.trim().replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim()
        const start = txt.indexOf("{"), end = txt.lastIndexOf("}")
        if (start !== -1 && end !== -1) {
          const parsed = JSON.parse(txt.slice(start, end + 1))
          reviewItems = Array.isArray(parsed.reviewItems) ? parsed.reviewItems : []
        }
      } catch {}
      return NextResponse.json({ ok: true, reviewItems, count: reviewItems.length })
    }

    // === 举一反三：根据指定错题生成相似题 ===
    if (body.generateSimilar) {
      const allItems: MistakeItem[] = (() => { try { return JSON.parse(exists.items || "[]") } catch { return [] } })()
      const target = allItems.find((it) => it.id === body.generateSimilar?.itemId)
      if (!target) {
        return NextResponse.json({ ok: false, error: "错题不存在" }, { status: 404 })
      }
      const subjectName = SUBJECT_NAMES[exists.subject] || "综合"
      const sysPrompt = `你是一名${subjectName}老师。根据这道错题，生成 3 道相似的变式练习题，帮助学生举一反三。

原错题：
题目：${target.question}
答案：${target.answer}
考点：${target.knowledgePoint}

要求：
1. 3 道题考查相同知识点，但情境/数值不同
2. 难度递进（第 1 题与原题相当，第 2 题略难，第 3 题拓展）
3. 每题包含题干、答案、解析、考点

返回严格 JSON：
{
  "similarItems": [
    {
      "question": "题目",
      "answer": "答案",
      "analysis": "解析",
      "knowledgePoint": "考点",
      "difficulty": "基础|中等|拓展"
    }
  ]
}`
      const result = await callVisionChat([{ role: "user", content: sysPrompt }], { config: body.config, maxTokens: 8192 })
      let similarItems: unknown[] = []
      try {
        const txt = result.content.trim().replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim()
        const start = txt.indexOf("{"), end = txt.lastIndexOf("}")
        if (start !== -1 && end !== -1) {
          const parsed = JSON.parse(txt.slice(start, end + 1))
          similarItems = Array.isArray(parsed.similarItems) ? parsed.similarItems : []
        }
      } catch {}
      return NextResponse.json({ ok: true, similarItems, count: similarItems.length })
    }

    // === 普通更新 ===
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
    // 默认错题本不能删除（只能清空）
    const existing = await db.mistakeBook.findUnique({ where: { id }, select: { isDefault: true } })
    if (existing?.isDefault) {
      // 清空内容但不删除
      await db.mistakeBook.update({ where: { id }, data: { items: "[]", count: 0 } })
      return NextResponse.json({ ok: true, cleared: true })
    }
    await db.mistakeBook.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
