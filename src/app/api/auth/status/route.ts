import { NextResponse } from "next/server"
import { createHash } from "crypto"

export const runtime = "nodejs"

/** 查询当前是否需要密码、是否已登录 */
export async function GET() {
  const appPassword = (process.env.APP_PASSWORD || "").trim()
  const requiresPassword = !!appPassword
  return NextResponse.json({ requiresPassword })
}

export async function POST(req: Request) {
  const token = req.headers.get("cookie") || ""
  const appPassword = (process.env.APP_PASSWORD || "").trim()
  if (!appPassword) {
    return NextResponse.json({ requiresPassword: false, loggedIn: true })
  }
  const salt = process.env.APP_PASSWORD_SALT || "question-detector-salt-2026"
  const expected = createHash("sha256")
    .update(`${appPassword}::${salt}`, "utf8")
    .digest("hex")
  const loggedIn = token.includes(`auth_token=${expected}`)
  return NextResponse.json({ requiresPassword: true, loggedIn })
}
