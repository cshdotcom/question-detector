"use client"

/**
 * 统一 fetch 封装：处理鉴权失效（401）
 *
 * 当后端 middleware 检测到登录态失效（cookie 过期 / 改过密码 / 未登录），
 * 会直接返回 401 JSON `{ ok:false, code:"UNAUTHORIZED", error:"..." }`。
 * 这里检测到 401 时，自动重定向到 /login，避免前端组件把"未登录"误显示为"识别失败"。
 *
 * 使用方式：用 `authFetch` 代替原生 `fetch`，或对已有 fetch 结果调用 `assertAuth`。
 */

let redirecting = false

export function redirectToLogin(reason?: string) {
  if (redirecting) return
  if (typeof window === "undefined") return
  redirecting = true
  const from = window.location.pathname + window.location.search
  const url = `/login?from=${encodeURIComponent(from)}&reason=${encodeURIComponent(reason || "session-expired")}`
  console.warn("[auth] redirecting to login:", reason || "session-expired")
  window.location.href = url
}

/** 检查 fetch 响应，若 401 自动跳登录页 */
export async function assertAuth(resp: Response): Promise<boolean> {
  if (resp.status === 401) {
    let reason = "session-expired"
    try {
      const data = await resp.clone().json()
      reason = data?.code === "UNAUTHORIZED" ? "session-expired" : "unauthorized"
    } catch {}
    redirectToLogin(reason)
    return false
  }
  return true
}

/** 包裹 fetch：检测 401 自动跳登录 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const resp = await fetch(input, init)
  await assertAuth(resp)
  return resp
}
