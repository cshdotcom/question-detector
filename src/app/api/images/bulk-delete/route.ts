import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const runtime = "nodejs"

/** POST /api/images/bulk-delete — 批量删除 { ids: string[] } */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { ids?: string[] }
    const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : []
    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "缺少 ids" }, { status: 400 })
    }
    const result = await db.storedImage.deleteMany({ where: { id: { in: ids } } })
    return NextResponse.json({ ok: true, deleted: result.count })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[images:bulk-delete] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
