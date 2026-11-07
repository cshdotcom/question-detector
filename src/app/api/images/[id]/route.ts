import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { ImageAdjustments, ImageItem, Question } from "@/lib/types"
import { DEFAULT_ADJUSTMENTS } from "@/lib/types"

export const runtime = "nodejs"

interface RouteCtx {
  params: Promise<{ id: string }>
}

/** 数据库记录 → 完整前端 ImageItem（含 dataUrl） */
function rowToFullItem(row: {
  id: string
  name: string
  dataUrl: string
  thumbnail: string
  width: number
  height: number
  source: string
  createdAt: Date
  questions: string
  adjustments: string
  detectMethod: string
  detected: boolean
}): ImageItem & { dataLoaded: boolean; thumbnail: string } {
  let questions: Question[] = []
  try {
    questions = JSON.parse(row.questions || "[]")
  } catch {}
  let adjustments: ImageAdjustments = { ...DEFAULT_ADJUSTMENTS }
  try {
    adjustments = { ...DEFAULT_ADJUSTMENTS, ...JSON.parse(row.adjustments || "{}") }
  } catch {}
  return {
    id: row.id,
    name: row.name,
    dataUrl: row.dataUrl,
    thumbnail: row.thumbnail,
    width: row.width,
    height: row.height,
    source: (row.source as ImageItem["source"]) || "upload",
    createdAt: row.createdAt.getTime(),
    questions,
    detected: row.detected,
    detecting: false,
    detectMethod: row.detectMethod === "ai" || row.detectMethod === "offline" ? row.detectMethod : null,
    adjustments,
    dataLoaded: true,
  }
}

/** GET /api/images/[id] — 完整数据（含原图 dataUrl），供懒加载 */
export async function GET(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const row = await db.storedImage.findUnique({ where: { id } })
    if (!row) {
      return NextResponse.json({ ok: false, error: "图片不存在" }, { status: 404 })
    }
    return NextResponse.json({ ok: true, image: rowToFullItem(row) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[images:get] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

interface UpdateBody {
  name?: string
  dataUrl?: string
  thumbnail?: string
  width?: number
  height?: number
  questions?: Question[]
  adjustments?: ImageAdjustments
  detectMethod?: string
  detected?: boolean
}

/** PUT /api/images/[id] — 部分更新（题目/图片数据/识别状态等） */
export async function PUT(req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    const body = (await req.json()) as UpdateBody
    const exists = await db.storedImage.findUnique({ where: { id }, select: { id: true } })
    if (!exists) {
      return NextResponse.json({ ok: false, error: "图片不存在" }, { status: 404 })
    }
    await db.storedImage.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.dataUrl !== undefined ? { dataUrl: body.dataUrl } : {}),
        ...(body.thumbnail !== undefined ? { thumbnail: body.thumbnail } : {}),
        ...(body.width !== undefined ? { width: body.width } : {}),
        ...(body.height !== undefined ? { height: body.height } : {}),
        ...(body.questions !== undefined ? { questions: JSON.stringify(body.questions) } : {}),
        ...(body.adjustments !== undefined ? { adjustments: JSON.stringify(body.adjustments) } : {}),
        ...(body.detectMethod !== undefined ? { detectMethod: body.detectMethod } : {}),
        ...(body.detected !== undefined ? { detected: body.detected } : {}),
      },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[images:update] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/images/[id] — 删除单张 */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params
    await db.storedImage.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
