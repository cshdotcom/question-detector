import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { callVisionChat, type ChatMessage } from "@/lib/ai-service"
import type { AIProviderConfig } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 120

interface RouteCtx {
  params: Promise<{ id: string }>
}

interface EssayDetail {
  id: string
  type: string
  title: string
  prompt: string
  wordCount: number
  genre: string
  essay: string
  outline: string
  imageData: string
  status: string
  favorited: boolean
  createdAt: number
  updatedAt: number
}

function rowToDetail(row: {
  id: string; type: string; title: string; prompt: string; wordCount: number; genre: string;
  essay: string; outline: string; imageData: string; status: string; favorited: boolean;
  createdAt: Date; updatedAt: Date;
}): EssayDetail {
  return {
    id: row.id, type: row.type, title: row.title, prompt: row.prompt,
    wordCount: row.wordCount, genre: row.genre, essay: row.essay, outline: row.outline,
    imageData: row.imageData, status: row.status, favorited: row.favorited,
    createdAt: row.createdAt.getTime(), updatedAt: row.updatedAt.getTime(),
  }
}

/** GET /api/tutor/essays/[id] */
export async function GET(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const row = await db.essaySession.findUnique({ where: { id } })
    if (!row) return NextResponse.json({ ok: false, error: "作文不存在" }, { status: 404 })
    return NextResponse.json({ ok: true, essay: rowToDetail(row) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

interface RewriteBody {
  prompt?: string  // 重写要求
  config?: AIProviderConfig
  regenerate?: boolean  // 完全重写（不带修改要求）
  toggleFavorite?: boolean  // 收藏/取消收藏
  generateOutline?: boolean  // 只生成思路
  essay?: string  // 直接更新范文（编辑后保存）
  outline?: string  // 直接更新思路
}

/** PUT /api/tutor/essays/[id] — 重写 / 收藏 / 生成思路 / 保存编辑 */
export async function PUT(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const body = (await req.json()) as RewriteBody
    const existing = await db.essaySession.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ ok: false, error: "作文不存在" }, { status: 404 })

    // 收藏切换
    if (body.toggleFavorite) {
      const newFav = !existing.favorited
      await db.essaySession.update({ where: { id }, data: { favorited: newFav } })
      // 同步到收藏夹
      if (newFav) {
        // 添加收藏
        const existingFav = await db.favorite.findFirst({ where: { type: "essay", refId: id } })
        if (!existingFav) {
          await db.favorite.create({
            data: {
              id: `fav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              type: "essay", refId: id,
              title: existing.title,
              summary: existing.essay.slice(0, 100),
              content: JSON.stringify({ essay: existing.essay, outline: existing.outline, type: existing.type }),
              source: "AI 写作文",
            },
          })
        }
      } else {
        // 取消收藏
        await db.favorite.deleteMany({ where: { type: "essay", refId: id } })
      }
      return NextResponse.json({ ok: true, favorited: newFav })
    }

    // 直接保存编辑（essay/outline 字段）
    if (body.essay !== undefined || body.outline !== undefined) {
      const updateData: Record<string, unknown> = {}
      if (body.essay !== undefined) updateData.essay = body.essay
      if (body.outline !== undefined) updateData.outline = body.outline
      await db.essaySession.update({ where: { id }, data: updateData })
      return NextResponse.json({ ok: true })
    }

    // 只生成思路
    if (body.generateOutline) {
      const isChinese = existing.type === "chinese"
      const sysPrompt = isChinese
        ? `你是一名语文作文辅导老师。根据题目要求，生成详细的写作思路（不写范文）。
输出格式（JSON）：
{
  "analysis": "审题分析（200 字内）",
  "material": "选材建议（3-4 个素材）",
  "structure": ["开头：写法建议", "正文：分 2-3 段要点", "结尾：升华方式"]
}`
        : `You are an English essay tutor. Generate detailed writing outline.
Output JSON:
{
  "analysis": "topic analysis (within 100 words)",
  "material": "3-4 material suggestions",
  "structure": ["introduction: ...", "body: ...", "conclusion: ..."]
}`
      const messages: ChatMessage[] = [{ role: "system", content: sysPrompt }]
      const userText = existing.prompt || existing.title
      if (existing.imageData) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: existing.imageData } },
          ],
        })
      } else {
        messages.push({ role: "user", content: userText })
      }
      const result = await callVisionChat(messages, { config: body.config, maxTokens: 4096 })
      let outline = existing.outline
      try {
        const txt = result.content.trim().replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim()
        const start = txt.indexOf("{"), end = txt.lastIndexOf("}")
        if (start !== -1 && end !== -1) {
          outline = JSON.stringify(JSON.parse(txt.slice(start, end + 1)))
        }
      } catch {
        outline = JSON.stringify({ analysis: result.content })
      }
      await db.essaySession.update({ where: { id }, data: { outline } })
      return NextResponse.json({ ok: true, outline })
    }

    const isChinese = existing.type === "chinese"
    const sysPrompt = isChinese
      ? `你是一名语文作文辅导老师。${body.regenerate ? "请重新撰写一篇范文" : "请根据修改要求重写"}。
要求：
1. 字数约 ${existing.wordCount} 字
2. 文体：${existing.genre}
3. 结构完整、语言生动、立意深刻
4. 不要使用 markdown 代码块

输出格式（JSON）：
{
  "essay": "范文正文...",
  "outline": {
    "analysis": "审题分析",
    "material": "选材建议",
    "structure": ["开头：...", "正文：...", "结尾：..."]
  }
}`
      : `You are an English essay tutor. ${body.regenerate ? "Please write a new essay." : "Please rewrite according to the modification request."}
Requirements:
1. About ${existing.wordCount} words
2. Genre: ${existing.genre}
3. Clear structure, natural language
4. No markdown code blocks

Output format (JSON):
{
  "essay": "essay text...",
  "outline": {
    "analysis": "topic analysis",
    "material": "material suggestions",
    "structure": ["introduction: ...", "body: ...", "conclusion: ..."]
  }
}`

    const messages: ChatMessage[] = [{ role: "system", content: sysPrompt }]
    // 把原题 + 修改要求发给 AI
    const userText = body.regenerate
      ? `题目：${existing.title}\n${existing.prompt}`
      : `题目：${existing.title}\n${existing.prompt}\n\n修改要求：${body.prompt || "无"}\n\n原范文（参考）：\n${existing.essay.slice(0, 500)}...`
    if (existing.imageData) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: existing.imageData } },
        ],
      })
    } else {
      messages.push({ role: "user", content: userText })
    }
    const result = await callVisionChat(messages, { config: body.config, maxTokens: 8192 })
    let essay = ""
    let outline = existing.outline
    try {
      const text = result.content.trim()
      const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim()
      const start = cleaned.indexOf("{")
      const end = cleaned.lastIndexOf("}")
      if (start !== -1 && end !== -1) {
        const json = JSON.parse(cleaned.slice(start, end + 1))
        essay = json.essay || ""
        if (json.outline) outline = JSON.stringify(json.outline)
      }
    } catch {
      essay = result.content
    }
    await db.essaySession.update({
      where: { id },
      data: { essay, outline },
    })
    return NextResponse.json({ ok: true, essay, outline })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[tutor:essay:rewrite] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/tutor/essays/[id] */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    await db.essaySession.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
