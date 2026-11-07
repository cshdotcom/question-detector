"use client"

import { authFetch } from "./auth-fetch"

/** 辅导会话 SSE 客户端：调 /api/tutor/sessions/[id]/chat，返回流式 token + 最终 meta
 *  - 调用方传入 onToken / onDone / onError 回调
 *  - 返回 abort 函数，可中断流式 */

export interface TutorMessageMeta {
  stage?: number
  title?: string
  summary?: string
  waitUserReply?: boolean
  followUpQuestion?: string
  knowledgeCards?: unknown[]
  visualBoard?: { html?: string; width?: number; height?: number; caption?: string }
  visualization?: { type?: string; svg?: string; caption?: string }
}

export interface ChatCallbacks {
  onToken?: (token: string) => void
  onDone?: (fullContent: string, meta: TutorMessageMeta, stage: number) => void
  onError?: (err: string) => void
  onStart?: () => void
}

export interface SendChatOptions {
  sessionId: string
  message: string
  config?: import("./types").AIProviderConfig
  regenerate?: boolean
  images?: string[]  // dataUrl 数组
  signal?: AbortSignal  // 外部传入的 abort signal
}

export async function sendTutorChat(opts: SendChatOptions, cb: ChatCallbacks): Promise<void> {
  const { sessionId, message, config, regenerate, images } = opts
  cb.onStart?.()
  try {
    const resp = await authFetch(`/api/tutor/sessions/${sessionId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, config, regenerate, images }),
      signal: opts.signal,
    })
    if (!resp.ok || !resp.body) {
      const txt = await resp.text().catch(() => "")
      throw new Error(txt || `HTTP ${resp.status}`)
    }
    const reader = resp.body.getReader()
    const decoder = new TextDecoder("utf-8")
    let buffer = ""
    let fullContent = ""
    let finalMeta: TutorMessageMeta = {}
    let finalStage = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split("\n\n")
      buffer = events.pop() || ""
      for (const evt of events) {
        const lines = evt.split("\n").filter(Boolean)
        for (const line of lines) {
          if (!line.startsWith("data:")) continue
          const jsonStr = line.slice(5).trim()
          if (!jsonStr) continue
          try {
            const obj = JSON.parse(jsonStr)
            if (obj.type === "token" && typeof obj.text === "string") {
              fullContent += obj.text
              cb.onToken?.(obj.text)
            } else if (obj.type === "done") {
              fullContent = obj.content || fullContent
              finalMeta = (obj.meta as TutorMessageMeta) || {}
              finalStage = typeof obj.stage === "number" ? obj.stage : 0
              cb.onDone?.(fullContent, finalMeta, finalStage)
            } else if (obj.type === "error") {
              cb.onError?.(obj.error || "未知错误")
            }
          } catch {
            // ignore JSON parse errors
          }
        }
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      // 用户主动中断，不算错误
      return
    }
    cb.onError?.((e as Error).message)
  }
}
