import { NextResponse } from "next/server"

export const runtime = "nodejs"

/** 登出：清除 auth_token cookie */
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set("auth_token", "", { path: "/", maxAge: 0 })
  return res
}
