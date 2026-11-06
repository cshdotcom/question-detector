import type { AIProviderConfig } from "./types"

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >
}

export interface ChatResult {
  content: string
}

/** 统一 AI 调用入口：根据配置选择 Z.ai SDK 或第三方 OpenAI 兼容 API */
export async function callVisionChat(
  messages: ChatMessage[],
  options: { config?: AIProviderConfig; maxTokens?: number } = {}
): Promise<ChatResult> {
  const cfg = options.config
  if (cfg?.enabled && cfg.apiKey) {
    return callOpenAICompatible(cfg, messages, options.maxTokens)
  }
  return callZaiSDK(messages)
}

/** 调用第三方 OpenAI 兼容 API */
async function callOpenAICompatible(
  cfg: AIProviderConfig,
  messages: ChatMessage[],
  maxTokens?: number
): Promise<ChatResult> {
  const baseURL = cfg.baseURL.replace(/\/$/, "")
  const url = `${baseURL}/chat/completions`
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    max_tokens: maxTokens ?? 4096,
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "")
    throw new Error(`OpenAI 兼容 API 返回 ${resp.status}：${txt.slice(0, 200)}`)
  }
  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== "string") {
    // 部分模型返回数组
    if (Array.isArray(content)) {
      const text = content
        .map((c: any) => (c?.type === "text" ? c.text : ""))
        .join("")
      return { content: text }
    }
    throw new Error("OpenAI 兼容 API 返回内容为空")
  }
  return { content }
}

/** 调用 Z.ai 内置 SDK（默认） */
async function callZaiSDK(messages: ChatMessage[]): Promise<ChatResult> {
  const ZAIModule = await import("z-ai-web-dev-sdk")
  const ZAI = (ZAIModule as any).default ?? ZAIModule
  const zai = await ZAI.create()
  // 转换消息格式
  const formatted = messages.map((m) => ({
    role: m.role,
    content: Array.isArray(m.content)
      ? m.content
      : [{ type: "text" as const, text: m.content }],
  }))
  const resp = await zai.chat.completions.createVision({
    messages: formatted,
    thinking: { type: "disabled" },
  })
  const content = resp.choices?.[0]?.message?.content ?? ""
  return { content }
}
