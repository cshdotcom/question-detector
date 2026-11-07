import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 30

interface TTSBody {
  text: string
  voice?: string
  speed?: number
  // 第三方 TTS 配置（前端传入，覆盖 env）
  config?: {
    baseURL?: string
    apiKey?: string
    model?: string
    voice?: string
  }
}

/** 把长文本拆成 ≤1000 字符的块（按句号/问号/感叹号切分） */
function splitText(text: string, maxLen = 1000): string[] {
  if (text.length <= maxLen) return [text]
  const sentences = text.match(/[^。？！.!?]+[。？！.!?]+/g) || [text]
  const chunks: string[] = []
  let cur = ""
  for (const s of sentences) {
    if ((cur + s).length <= maxLen) {
      cur += s
    } else {
      if (cur) chunks.push(cur.trim())
      cur = s
    }
  }
  if (cur) chunks.push(cur.trim())
  const final: string[] = []
  for (const c of chunks) {
    if (c.length <= maxLen) final.push(c)
    else for (let i = 0; i < c.length; i += maxLen) final.push(c.slice(i, i + maxLen))
  }
  return final
}

/** 获取生效的 TTS 配置：
 *  优先级：前端传入 config > env 配置 > z-ai SDK 内置
 */
function getTTSConfig(body: TTSBody) {
  const envBaseURL = process.env.AI_TTS_BASE_URL?.trim() || ""
  const envApiKey = process.env.AI_TTS_API_KEY?.trim() || ""
  const envModel = process.env.AI_TTS_MODEL?.trim() || ""
  const envVoice = process.env.AI_TTS_VOICE?.trim() || "tongtong"

  const cfg = body.config || {}
  const baseURL = cfg.baseURL?.trim() || envBaseURL
  const apiKey = cfg.apiKey?.trim() || envApiKey
  const model = cfg.model?.trim() || envModel || "tts-1"
  const voice = cfg.voice?.trim() || body.voice || envVoice || "tongtong"

  return { baseURL, apiKey, model, voice, useThirdparty: !!(baseURL && apiKey) }
}

/** POST /api/tutor/tts — TTS 语音合成
 *  优先级：前端 config > env（AI_TTS_*）> z-ai SDK
 *  - 前端 config 或 env 配置了 baseURL+apiKey → 调 OpenAI 兼容 /audio/speech
 *  - 都没配置 → 用 z-ai-web-dev-sdk
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TTSBody
    const text = (body.text || "").trim()
    if (!text) {
      return NextResponse.json({ ok: false, error: "text 不能为空" }, { status: 400 })
    }
    const speed = typeof body.speed === "number" ? Math.max(0.5, Math.min(2.0, body.speed)) : 1.0
    const { baseURL, apiKey, model, voice, useThirdparty } = getTTSConfig(body)

    const chunks = splitText(text, 1000)
    const audioBuffers: Buffer[] = []

    if (useThirdparty) {
      // 调 OpenAI 兼容 /audio/speech
      const url = baseURL.replace(/\/$/, "")
      const endpoint = url.endsWith("/audio/speech") ? url : `${url}/audio/speech`
      for (const chunk of chunks) {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: chunk,
            voice,
            response_format: "mp3",
            speed,
          }),
        })
        if (!resp.ok) {
          const txt = await resp.text().catch(() => "")
          throw new Error(`第三方 TTS 返回 ${resp.status}：${txt.slice(0, 200)}`)
        }
        const arrayBuffer = await resp.arrayBuffer()
        audioBuffers.push(Buffer.from(new Uint8Array(arrayBuffer)))
      }
    } else {
      // 用 z-ai-web-dev-sdk
      const ZAIModule = await import("z-ai-web-dev-sdk")
      const ZAI = (ZAIModule as unknown as { default?: typeof ZAIModule }).default ?? ZAIModule
      const zai = await (ZAI as unknown as { create: () => Promise<unknown> }).create()
      for (const chunk of chunks) {
        const response = await (zai as {
          audio: {
            tts: {
              create: (opts: {
                input: string; voice: string; speed: number
                response_format: string; stream: boolean
              }) => Promise<Response>
            }
          }
        }).audio.tts.create({
          input: chunk, voice, speed,
          response_format: "wav", stream: false,
        })
        const arrayBuffer = await response.arrayBuffer()
        audioBuffers.push(Buffer.from(new Uint8Array(arrayBuffer)))
      }
    }

    const combined = Buffer.concat(audioBuffers)
    const base64 = combined.toString("base64")
    const format = useThirdparty ? "mp3" : "wav"
    const dataUrl = `data:audio/${format};base64,${base64}`

    return NextResponse.json({
      ok: true,
      audioDataUrl: dataUrl,
      format,
      duration: text.length,
      engine: useThirdparty ? "thirdparty" : "zai-sdk",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[tutor:tts] failed:", message)
    // 友好错误
    let friendly = message
    if (message.includes("502") || message.includes("Bad Gateway")) {
      friendly = "TTS 服务暂时不可用（502），请检查 AI TTS 配置或稍后重试"
    } else if (message.includes("401") || message.includes("Unauthorized")) {
      friendly = "TTS API Key 无效，请检查配置"
    }
    return NextResponse.json({ ok: false, error: friendly }, { status: 500 })
  }
}
