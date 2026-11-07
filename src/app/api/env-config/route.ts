import { NextResponse } from "next/server"

export const runtime = "nodejs"

/** 返回后端所有 AI 相关配置的状态（不暴露 key，只暴露布尔值 + url/model）
 *  用于让前端知道后端是否配置了默认 AI，以及哪些功能可用
 *
 *  配置项：
 *  - LLM: AI_BASE_URL / AI_API_KEY / AI_MODEL
 *  - TTS: AI_TTS_BASE_URL / AI_TTS_API_KEY / AI_TTS_MODEL / AI_TTS_VOICE
 *  - ASR: AI_ASR_BASE_URL / AI_ASR_API_KEY / AI_ASR_MODEL
 *  - 灰度特性开关: AI_FEATURE_GRADIENT（0-100，控制新特性灰度比例）
 *  - 密码: APP_PASSWORD
 */
export async function GET() {
  // === LLM ===
  const llmBaseURL = process.env.AI_BASE_URL?.trim() || ""
  const llmApiKey = process.env.AI_API_KEY?.trim() || ""
  const llmModel = process.env.AI_MODEL?.trim() || ""
  const hasLLM = !!(llmBaseURL && llmApiKey && llmModel)

  // === TTS（后端默认 TTS 配置，覆盖 z-ai SDK）===
  const ttsBaseURL = process.env.AI_TTS_BASE_URL?.trim() || ""
  const ttsApiKey = process.env.AI_TTS_API_KEY?.trim() || ""
  const ttsModel = process.env.AI_TTS_MODEL?.trim() || ""
  const ttsVoice = process.env.AI_TTS_VOICE?.trim() || ""
  const hasTTS = !!(ttsBaseURL && ttsApiKey && ttsModel)

  // === ASR（后端默认 ASR 配置，覆盖 z-ai SDK）===
  const asrBaseURL = process.env.AI_ASR_BASE_URL?.trim() || ""
  const asrApiKey = process.env.AI_ASR_API_KEY?.trim() || ""
  const asrModel = process.env.AI_ASR_MODEL?.trim() || ""
  const hasASR = !!(asrBaseURL && asrApiKey && asrModel)

  // === 灰度特性开关 ===
  // AI_FEATURE_GRADIENT: 0-100，控制新特性灰度比例
  // 100 = 全量启用，0 = 关闭
  // 可逗号分隔多个特性名: "whiteboard:100,tts:50,asr:30"
  const gradientRaw = process.env.AI_FEATURE_GRADIENT?.trim() || "100"
  const featureGradients: Record<string, number> = {}
  if (gradientRaw.includes(":")) {
    // 格式 feature:percent,feature:percent
    for (const part of gradientRaw.split(",")) {
      const [name, pct] = part.split(":")
      if (name && pct) featureGradients[name.trim()] = Math.max(0, Math.min(100, parseInt(pct.trim()) || 0))
    }
  } else {
    // 单数字 = 全局灰度
    const globalPct = Math.max(0, Math.min(100, parseInt(gradientRaw) || 0))
    featureGradients["_global"] = globalPct
  }

  const hasPassword = !!(process.env.APP_PASSWORD?.trim())

  return NextResponse.json({
    // LLM
    hasDefaultAI: hasLLM,
    llm: {
      configured: hasLLM,
      baseURL: llmBaseURL,  // 暴露 baseURL 和 model（不含 key）
      model: llmModel,
    },
    // TTS
    tts: {
      configured: hasTTS,
      baseURL: ttsBaseURL,
      model: ttsModel,
      voice: ttsVoice,
    },
    // ASR
    asr: {
      configured: hasASR,
      baseURL: asrBaseURL,
      model: asrModel,
    },
    // 灰度
    gradients: featureGradients,
    hasPassword,
  })
}
