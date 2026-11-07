import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { tokenFromHash } from "@/lib/auth-utils"
import { getEffectiveHash } from "../login/route"

export const runtime = "nodejs"

/** GET /api/auth/status — 查询是否启用密码（不暴露 hash） */
export async function GET() {
  const envPassword = (process.env.APP_PASSWORD ?? "").trim()
  if (envPassword === "disabled") {
    return NextResponse.json({ requiresPassword: false, loggedIn: true })
  }
  const row = await db.password.findUnique({ where: { id: 1 } })
  return NextResponse.json({
    requiresPassword: true,
    usingCustomPassword: !!row?.hash, // 用户是否改过密码
  })
}

/** POST /api/auth/status — 查询是否启用密码 + 当前是否已登录 */
export async function POST(req: Request) {
  const { hash, passwordEnabled } = await getEffectiveHash()
  if (!passwordEnabled) {
    return NextResponse.json({ requiresPassword: false, loggedIn: true })
  }
  const cookieHeader = req.headers.get("cookie") || ""
  const token = /(?:^|;\s*)auth_token=([^;]+)/.exec(cookieHeader)?.[1]
  const loggedIn = !!token && token === tokenFromHash(hash!)
  return NextResponse.json({ requiresPassword: true, loggedIn })
}
