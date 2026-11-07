import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { passwordHash, tokenFromHash } from "@/lib/auth-utils"
import { getEffectiveHash } from "../login/route"

export const runtime = "nodejs"

/**
 * 修改密码（需已登录）
 * - body: { currentPassword: string, newPassword: string }
 * - 校验当前密码 → 新密码 hash 写入数据库（覆盖 env / 默认密码）
 * - 重签 auth_token cookie（无需重新登录），所有旧设备的 cookie 立即失效
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : ""
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : ""

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ ok: false, error: "请填写当前密码和新密码" }, { status: 400 })
    }
    if (newPassword.length < 4) {
      return NextResponse.json({ ok: false, error: "新密码至少 4 位" }, { status: 400 })
    }

    const { hash, passwordEnabled } = await getEffectiveHash()
    if (passwordEnabled && passwordHash(currentPassword) !== hash) {
      return NextResponse.json({ ok: false, error: "当前密码错误" }, { status: 401 })
    }

    const newHash = passwordHash(newPassword)
    await db.password.upsert({
      where: { id: 1 },
      update: { hash: newHash },
      create: { id: 1, hash: newHash },
    })

    // 重签 cookie：本设备保持登录，其他设备旧 token 立即失效
    const res = NextResponse.json({ ok: true })
    res.cookies.set("auth_token", tokenFromHash(newHash), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
    return res
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[auth:change-password] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
