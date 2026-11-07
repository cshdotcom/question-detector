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
