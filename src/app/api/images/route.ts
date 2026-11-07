import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { ImageItem, ImageAdjustments, Question } from "@/lib/types"
import { DEFAULT_ADJUSTMENTS } from "@/lib/types"

export const runtime = "nodejs"

/** 数据库记录 → 前端 ImageItem（列表模式：不含 dataUrl，用 thumbnail 代替） */
export function rowToListItem(row: {
  id: string
  name: string
  thumbnail: string
  width: number
  height: number
  source: string
  createdAt: Date
  questions: string
  adjustments: string
  detectMethod: string
  detected: boolean
}): Omit<ImageItem, "dataUrl"> & { dataUrl: string; dataLoaded: boolean } {
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
    dataUrl: "",
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
    dataLoaded: false,
  }
}

/** GET /api/images — 列表（含题目与缩略图，不含原图 dataUrl，原图走 /api/images/[id] 懒加载） */
export async function GET() {
  try {
    const rows = await db.storedImage.findMany({
      orderBy: { createdAt: "asc" },
      // 列表查询排除大字段 dataUrl
      select: {
        id: true,
        name: true,
        thumbnail: true,
        width: true,
        height: true,
        source: true,
        createdAt: true,
        questions: true,
        adjustments: true,
        detectMethod: true,
        detected: true,
      },
    })
    return NextResponse.json({ ok: true, images: rows.map(rowToListItem) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[images:list] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

interface CreateBody {
  id?: string
  name?: string
  dataUrl?: string
  thumbnail?: string
  width?: number
  height?: number
  source?: string
  questions?: Question[]
  adjustments?: ImageAdjustments
  detectMethod?: string
  detected?: boolean
}

/** POST /api/images — 新建图片记录 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateBody
    if (!body?.id || !body?.dataUrl) {
      return NextResponse.json({ ok: false, error: "缺少 id 或 dataUrl" }, { status: 400 })
    }
    const row = await db.storedImage.create({
      data: {
        id: body.id,
        name: body.name ?? "未命名",
        dataUrl: body.dataUrl,
        thumbnail: body.thumbnail ?? "",
        width: body.width ?? 0,
        height: body.height ?? 0,
        source: body.source ?? "upload",
        questions: JSON.stringify(body.questions ?? []),
        adjustments: JSON.stringify(body.adjustments ?? DEFAULT_ADJUSTMENTS),
        detectMethod: body.detectMethod ?? "",
        detected: body.detected ?? false,
      },
    })
    return NextResponse.json({ ok: true, id: row.id })
  } catch (err) {
    // upsert 语义：已存在则更新
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes("Unique constraint")) {
      try {
        const body = (await req.clone().json()) as CreateBody
        await db.storedImage.update({
          where: { id: body.id },
          data: {
            name: body.name ?? undefined,
            dataUrl: body.dataUrl,
            thumbnail: body.thumbnail ?? undefined,
            width: body.width ?? undefined,
            height: body.height ?? undefined,
            source: body.source ?? undefined,
          },
        })
        return NextResponse.json({ ok: true, id: body.id })
      } catch {
        // fallthrough
      }
    }
    console.error("[images:create] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/images — 清空全部 */
export async function DELETE() {
  try {
    await db.storedImage.deleteMany({})
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
