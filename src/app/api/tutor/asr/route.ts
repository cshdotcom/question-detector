import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 60

interface ASRBody {
  audio: string  // base64 audio data (without data: prefix)
  format?: "wav" | "mp3" | "webm" | "ogg"
}

/** POST /api/tutor/asr — AI ASR（z-ai-web-dev-sdk）
 *  body: { audio: base64, format?: "wav"|"mp3"|"webm"|"ogg" }
 *  返回 { ok: true, text: "识别文本" } */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ASRBody
    if (!body.audio) {
      return NextResponse.json({ ok: false, error: "缺少 audio 字段" }, { status: 400 })
    }
    const format = body.format || "webm"

    const ZAIModule = await import("z-ai-web-dev-sdk")
    const ZAI = (ZAIModule as unknown as { default?: typeof ZAIModule }).default ?? ZAIModule
    const zai = await (ZAI as unknown as { create: () => Promise<unknown> }).create()

    const response = await (zai as {
      audio: {
        asr: {
          create: (opts: { file_base64: string }) => Promise<{ text?: string }>
        }
      }
    }).audio.asr.create({
      file_base64: body.audio,
    })

    const text = (response as { text?: string })?.text || ""

    return NextResponse.json({ ok: true, text, format })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[tutor:asr] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
