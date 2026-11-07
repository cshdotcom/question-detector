import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { passwordHash, tokenFromHash, BUILTIN_DEFAULT_PASSWORD } from "@/lib/auth-utils"

export const runtime = "nodejs"

/**
 * 获取当前生效的密码 hash：
 * 1. 数据库 Password 表有记录（用户改过密码）→ 用数据库的
 * 2. 否则用 env APP_PASSWORD
 * 3. env 未设置 → 用内置默认密码 "123456"
 * 4. env 显式设置为 "disabled" → 关闭密码保护
 */
export async function getEffectiveHash(): Promise<{ hash: string | null; passwordEnabled: boolean }> {
  const envPassword = (process.env.APP_PASSWORD ?? "").trim()
  // 显式禁用密码保护
  if (envPassword === "disabled") return { hash: null, passwordEnabled: false }

  const row = await db.password.findUnique({ where: { id: 1 } })
  if (row?.hash) return { hash: row.hash, passwordEnabled: true }

  const password = envPassword || BUILTIN_DEFAULT_PASSWORD
  return { hash: passwordHash(password), passwordEnabled: true }
}

/**
 * 登录接口
 * - body: { password: string }
 * - 校验通过 → 设置 auth_token cookie（httpOnly + samesite=lax + maxAge=30d）
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const password = typeof body.password === "string" ? body.password : ""

    const { hash, passwordEnabled } = await getEffectiveHash()
    if (!passwordEnabled) {
      // 未启用密码 → 直接登录成功（token 用固定值）
      const res = NextResponse.json({ ok: true })
      res.cookies.set("auth_token", tokenFromHash("no-password"), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      })
      return res
    }

    if (!password || passwordHash(password) !== hash) {
      return NextResponse.json({ ok: false, error: "密码错误" }, { status: 401 })
    }

    const res = NextResponse.json({ ok: true })
    res.cookies.set("auth_token", tokenFromHash(hash!), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 天
    })
    return res
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[auth:login] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
