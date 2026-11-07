import { NextResponse } from "next/server"
import { testAIConnection } from "@/lib/ai-service"
import type { AIProviderConfig } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 60

interface Body {
  config: AIProviderConfig
}

/** 测试 API 连接：发送一个最小的 chat 请求验证 baseURL/apiKey/model 是否可用 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body
    if (!body?.config?.apiKey || !body?.config?.baseURL) {
      return NextResponse.json({ ok: false, error: "缺少 apiKey 或 baseURL" }, { status: 400 })
    }
    const result = await testAIConnection(body.config)
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.message }, { status: 500 })
    }
    return NextResponse.json({
      ok: true,
      message: result.message,
      latency: result.latency,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
