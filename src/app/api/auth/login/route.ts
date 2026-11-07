import { NextResponse } from "next/server"
import { createHash } from "crypto"

export const runtime = "nodejs"

/**
 * 登录接口
 * - body: { password: string }
 * - 校验通过 → 设置 auth_token cookie（httpOnly + samesite=lax + maxAge=30d）
 * - 校验失败 → 401
 *
 * auth_token = sha256(password + "::" + salt)
 * middleware 重新计算并比对
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const password = typeof body.password === "string" ? body.password : ""
    const appPassword = (process.env.APP_PASSWORD || "").trim()

    if (!appPassword) {
      // 未设置密码 → 任何请求都直接登录成功
      const salt = process.env.APP_PASSWORD_SALT || "question-detector-salt-2026"
      const token = createHash("sha256").update(`::${salt}`, "utf8").digest("hex")
      const res = NextResponse.json({ ok: true })
      res.cookies.set("auth_token", token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 天
      })
      return res
    }

    if (password !== appPassword) {
      return NextResponse.json({ ok: false, error: "密码错误" }, { status: 401 })
    }

    const salt = process.env.APP_PASSWORD_SALT || "question-detector-salt-2026"
    const token = createHash("sha256")
      .update(`${password}::${salt}`, "utf8")
      .digest("hex")

    const res = NextResponse.json({ ok: true })
    res.cookies.set("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 天
    })
    return res
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
