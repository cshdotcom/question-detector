import { NextResponse, type NextRequest } from "next/server"
import { createHash } from "crypto"

/**
 * 访问密码保护中间件
 *
 * - env APP_PASSWORD 不设置 → 公开访问，不做任何拦截
 * - env APP_PASSWORD 设置 → 必须先在 /login 输入正确密码，写入 auth_token cookie 才能访问其他页面
 *
 * auth_token = sha256(password + "::" + APP_PASSWORD_SALT)
 * 服务端在 middleware 中重新计算并比对，避免 cookie 直接存明文
 *
 * 注意：Next.js 16 middleware 默认 Edge Runtime 不支持 Node crypto，
 * 因此显式 export const runtime = "nodejs"
 */

export const runtime = "nodejs"

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/status"]
const PUBLIC_PREFIXES = ["/_next", "/favicon", "/logo.svg", "/robots.txt"]

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true
  for (const p of PUBLIC_PREFIXES) {
    if (pathname.startsWith(p)) return true
  }
  return false
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 没有 APP_PASSWORD → 公开访问
  const appPassword = process.env.APP_PASSWORD?.trim()
  if (!appPassword) {
    return NextResponse.next()
  }

  // 公开路径放行
  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  // 检查 cookie auth_token
  const token = req.cookies.get("auth_token")?.value
  if (!token) {
    return redirectToLogin(req)
  }

  // 重新计算并比对
  const salt = process.env.APP_PASSWORD_SALT || "question-detector-salt-2026"
  const expected = sha256(`${appPassword}::${salt}`)
  if (token !== expected) {
    return redirectToLogin(req)
  }

  return NextResponse.next()
}

function redirectToLogin(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone()
  url.pathname = "/login"
  url.search = ""
  if (req.method === "GET") {
    url.searchParams.set("from", req.nextUrl.pathname + req.nextUrl.search)
  }
  return NextResponse.redirect(url)
}

export const config = {
  // 匹配所有路径（middleware 内部判断是否需要拦截）
  matcher: ["/((?!.*\\.).*)"],
}

