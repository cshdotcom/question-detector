import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { tokenFromHash } from "@/lib/auth-utils"
import { getEffectiveHash } from "../login/route"

export const runtime = "nodejs"

/**
 * 校验当前请求的 auth_token cookie 是否有效
 * - 200 { ok, loggedIn: true }  → 有效或未启用密码
 * - 401 { ok: false }           → 未登录 / token 过期（改密码后旧 token 全失效）
 *
 * 被 middleware 内部调用做统一鉴权
 */
export async function GET(req: Request) {
  const { hash, passwordEnabled } = await getEffectiveHash()
  if (!passwordEnabled) {
    return NextResponse.json({ ok: true, loggedIn: true, passwordEnabled: false })
  }
  const cookieHeader = req.headers.get("cookie") || ""
  const token = /(?:^|;\s*)auth_token=([^;]+)/.exec(cookieHeader)?.[1]
  if (!token || token !== tokenFromHash(hash!)) {
    return NextResponse.json({ ok: false, loggedIn: false }, { status: 401 })
  }
  return NextResponse.json({ ok: true, loggedIn: true, passwordEnabled: true })
}

export async function POST(req: Request) {
  return GET(req)
}
