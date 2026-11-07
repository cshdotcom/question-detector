import { NextResponse, type NextRequest } from "next/server"

/**
 * 统一鉴权中间件
 *
 * 每个请求（动态路径）通过内部调用 /api/auth/verify 校验 auth_token cookie：
 * - verify 200 → 放行（含「未启用密码」场景）
 * - verify 401 → 重定向 /login（未登录、token 过期、密码已被修改）
 *
 * /api/auth/* 全部放行，由各自 handler 处理（login 无需登录即可调用）
 */

export const runtime = "nodejs"

const PUBLIC_PREFIXES = ["/login", "/api/auth"]

function isPublic(pathname: string): boolean {
  for (const p of PUBLIC_PREFIXES) {
    if (pathname === p || pathname.startsWith(p + "/")) return true
  }
  return false
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  // 内部转发到 verify（verify 已在放行名单中，不会递归触发 middleware）
  try {
    const verifyUrl = new URL("/api/auth/verify", req.nextUrl.origin)
    const verifyResp = await fetch(verifyUrl, {
      headers: { cookie: req.headers.get("cookie") || "" },
      cache: "no-store",
    })
    if (verifyResp.ok) {
      return NextResponse.next()
    }
  } catch (e) {
    // verify 调用失败时保守放行（避免数据库故障导致整站不可用）
    console.error("[middleware] verify failed:", e)
    return NextResponse.next()
  }

  return redirectToLogin(req)
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
  // 匹配所有动态路径（自动排除带扩展名的静态资源）
  matcher: ["/((?!.*\\.).*)"],
}
