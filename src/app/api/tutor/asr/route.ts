import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

interface ASRBody {
  audio: string  // base64 audio data (without data: prefix)
  format?: "wav" | "mp3" | "webm" | "ogg"
  // 第三方 ASR 配置（前端传入，覆盖 env）
  config?: {
    baseURL?: string
    apiKey?: string
    model?: string
  }
}

/** 获取生效的 ASR 配置：
 *  优先级：前端传入 config > env 配置 > z-ai SDK
 */
function getASRConfig(body: ASRBody) {
  const envBaseURL = process.env.AI_ASR_BASE_URL?.trim() || ""
  const envApiKey = process.env.AI_ASR_API_KEY?.trim() || ""
  const envModel = process.env.AI_ASR_MODEL?.trim() || ""

  const cfg = body.config || {}
  const baseURL = cfg.baseURL?.trim() || envBaseURL
  const apiKey = cfg.apiKey?.trim() || envApiKey
  const model = cfg.model?.trim() || envModel || "whisper-1"

  return { baseURL, apiKey, model, useThirdparty: !!(baseURL && apiKey) }
}

/** POST /api/tutor/asr — ASR 语音识别
 *  优先级：前端 config > env（AI_ASR_*）> z-ai SDK
 *  - 前端 config 或 env 配置了 baseURL+apiKey → 调 OpenAI 兼容 /audio/transcriptions
 *  - 都没配置 → 用 z-ai-web-dev-sdk
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ASRBody
    if (!body.audio) {
      return NextResponse.json({ ok: false, error: "缺少 audio 字段" }, { status: 400 })
    }
    const format = body.format || "webm"
    const { baseURL, apiKey, model, useThirdparty } = getASRConfig(body)

    let text = ""

    if (useThirdparty) {
      // 调 OpenAI 兼容 /audio/transcriptions
      const url = baseURL.replace(/\/$/, "")
      const endpoint = url.endsWith("/audio/transcriptions") ? url : `${url}/audio/transcriptions`
      // base64 → Buffer
      const audioBuffer = Buffer.from(body.audio, "base64")
      const formData = new FormData()
      const blob = new Blob([audioBuffer], { type: `audio/${format}` })
      formData.append("file", blob, `audio.${format}`)
      formData.append("model", model)
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData,
      })
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "")
        throw new Error(`第三方 ASR 返回 ${resp.status}：${txt.slice(0, 200)}`)
      }
      const data = await resp.json()
      text = (data.text || "").trim()
    } else {
      // 用 z-ai-web-dev-sdk
      const ZAIModule = await import("z-ai-web-dev-sdk")
      const ZAI = (ZAIModule as unknown as { default?: typeof ZAIModule }).default ?? ZAIModule
      const zai = await (ZAI as unknown as { create: () => Promise<unknown> }).create()
      const response = await (zai as {
        audio: {
          asr: {
            create: (opts: { file_base64: string }) => Promise<{ text?: string }>
          }
        }
      }).audio.asr.create({ file_base64: body.audio })
      text = (response as { text?: string })?.text || ""
    }

    return NextResponse.json({
      ok: true,
      text,
      format,
      engine: useThirdparty ? "thirdparty" : "zai-sdk",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[tutor:asr] failed:", message)
    let friendly = message
    if (message.includes("502") || message.includes("Bad Gateway")) {
      friendly = "ASR 服务暂时不可用（502），请检查 AI ASR 配置或稍后重试"
    } else if (message.includes("401") || message.includes("Unauthorized")) {
      friendly = "ASR API Key 无效，请检查配置"
    }
    return NextResponse.json({ ok: false, error: friendly }, { status: 500 })
  }
}
