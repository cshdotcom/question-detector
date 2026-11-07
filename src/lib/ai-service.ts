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

/** 从环境变量读取后端默认 AI 配置（部署时统一配置，所有浏览器共享）
 *  - AI_BASE_URL / AI_API_KEY / AI_MODEL 三个都填，才视为后端配置有效
 *  - 前端 localStorage 配置优先（单个浏览器覆盖） */
function getEnvAIConfig(): AIProviderConfig | null {
  const baseURL = process.env.AI_BASE_URL?.trim()
  const apiKey = process.env.AI_API_KEY?.trim()
  const model = process.env.AI_MODEL?.trim()
  if (!baseURL || !apiKey || !model) return null
  return { baseURL, apiKey, model, enabled: true }
}

/** 统一 AI 调用入口：根据配置选择第三方 OpenAI 兼容 API 或 Z.ai SDK
 *  - 优先级：前端传入的 config（浏览器 localStorage） > env 默认（后端兜底） > Z.ai SDK
 *  - 前端关闭第三方时（enabled=false）回退到 env，再回退到 Z.ai SDK
 */
export async function callVisionChat(
  messages: ChatMessage[],
  options: { config?: AIProviderConfig; maxTokens?: number } = {}
): Promise<ChatResult> {
  const cfg = options.config
  // 1. 前端启用了第三方 API → 用前端配置
  if (cfg?.enabled && cfg.apiKey && cfg.baseURL) {
    return callOpenAICompatible(cfg, messages, options.maxTokens)
  }
  // 2. 前端未启用 → 尝试后端 env 默认配置
  const envCfg = getEnvAIConfig()
  if (envCfg) {
    return callOpenAICompatible(envCfg, messages, options.maxTokens)
  }
  // 3. 都没有 → 用内置 Z.ai SDK
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

/** 测试 API 连接（用于设置页面的"测试连接"按钮） */
export async function testAIConnection(cfg: AIProviderConfig): Promise<{ ok: boolean; message: string; latency?: number }> {
  const t0 = Date.now()
  try {
    const result = await callOpenAICompatible(
      cfg,
      [
        { role: "user", content: "回复 'ok' 两个字，仅此而已" },
      ],
      50
    )
    const latency = Date.now() - t0
    const text = (result.content || "").trim().slice(0, 50)
    return { ok: true, message: `连接成功：${text}`, latency }
  } catch (e) {
    return { ok: false, message: (e as Error).message.slice(0, 200) }
  }
}

/** 流式 AI 调用：每次收到 token 调一次 onToken，最终返回完整 content
 *  - OpenAI 兼容 API：用 stream:true，解析 SSE data: 行
 *  - Z.ai SDK：不支持真流式，降级为非流式（一次性返回）
 *  - 中断：调用返回的 abort 函数可中断请求 */
export async function callVisionChatStream(
  messages: ChatMessage[],
  options: {
    config?: AIProviderConfig
    maxTokens?: number
    onToken?: (token: string) => void
    signal?: AbortSignal
  } = {}
): Promise<ChatResult> {
  const cfg = options.config
  // 1. 前端启用了第三方 API → 流式调用 OpenAI 兼容
  if (cfg?.enabled && cfg.apiKey && cfg.baseURL) {
    return callOpenAICompatibleStream(cfg, messages, options)
  }
  // 2. 前端未启用 → 尝试后端 env 默认
  const envCfg = getEnvAIConfig()
  if (envCfg) {
    return callOpenAICompatibleStream(envCfg, messages, options)
  }
  // 3. 都没有 → Z.ai SDK（不支持流式，降级一次性返回）
  const result = await callZaiSDK(messages)
  if (options.onToken) options.onToken(result.content)
  return result
}

/** OpenAI 兼容 API 流式调用 */
async function callOpenAICompatibleStream(
  cfg: AIProviderConfig,
  messages: ChatMessage[],
  options: { maxTokens?: number; onToken?: (t: string) => void; signal?: AbortSignal }
): Promise<ChatResult> {
  const baseURL = cfg.baseURL.replace(/\/$/, "")
  const url = `${baseURL}/chat/completions`
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    max_tokens: options.maxTokens ?? 4096,
    stream: true,
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  })
  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => "")
    throw new Error(`OpenAI 兼容 API 返回 ${resp.status}：${txt.slice(0, 200)}`)
  }
  const reader = resp.body.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""
  let fullContent = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // 解析 SSE：按 \n\n 分割事件
      const events = buffer.split("\n\n")
      buffer = events.pop() || ""
      for (const evt of events) {
        const lines = evt.split("\n").filter(Boolean)
        for (const line of lines) {
          if (!line.startsWith("data:")) continue
          const data = line.slice(5).trim()
          if (data === "[DONE]") continue
          try {
            const json = JSON.parse(data)
            const token = json?.choices?.[0]?.delta?.content
            if (typeof token === "string" && token) {
              fullContent += token
              if (options.onToken) options.onToken(token)
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
  if (!fullContent) {
    // 兜底：流式没拿到内容，可能是模型不支持 stream
    const result = await callOpenAICompatible(cfg, messages, options.maxTokens)
    if (options.onToken) options.onToken(result.content)
    return result
  }
  return { content: fullContent }
}
