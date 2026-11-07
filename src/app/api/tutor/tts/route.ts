import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 30

interface TTSBody {
  text: string
  voice?: string
  speed?: number
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
  // 兜底：超过 maxLen 的硬切
  const final: string[] = []
  for (const c of chunks) {
    if (c.length <= maxLen) {
      final.push(c)
    } else {
      for (let i = 0; i < c.length; i += maxLen) {
        final.push(c.slice(i, i + maxLen))
      }
    }
  }
  return final
}

/** POST /api/tutor/tts — AI TTS（z-ai-web-dev-sdk）
 *  body: { text, voice?, speed? }
 *  返回 { ok:true, audioDataUrl: "data:audio/wav;base64,..." } */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TTSBody
    const text = (body.text || "").trim()
    if (!text) {
      return NextResponse.json({ ok: false, error: "text 不能为空" }, { status: 400 })
    }
    const voice = body.voice || "tongtong"
    const speed = typeof body.speed === "number" ? Math.max(0.5, Math.min(2.0, body.speed)) : 1.0

    const ZAIModule = await import("z-ai-web-dev-sdk")
    const ZAI = (ZAIModule as unknown as { default?: typeof ZAIModule }).default ?? ZAIModule
    const zai = await (ZAI as unknown as { create: () => Promise<unknown> }).create()

    const chunks = splitText(text, 1000)
    const audioBuffers: Buffer[] = []
    for (const chunk of chunks) {
      const response = await (zai as {
        audio: {
          tts: {
            create: (opts: {
              input: string
              voice: string
              speed: number
              response_format: string
              stream: boolean
            }) => Promise<Response>
          }
        }
      }).audio.tts.create({
        input: chunk,
        voice,
        speed,
        response_format: "wav",
        stream: false,
      })
      const arrayBuffer = await response.arrayBuffer()
      audioBuffers.push(Buffer.from(new Uint8Array(arrayBuffer)))
    }
    // 合并所有 chunks 的 wav → base64 dataUrl
    const combined = Buffer.concat(audioBuffers)
    const base64 = combined.toString("base64")
    const dataUrl = `data:audio/wav;base64,${base64}`

    return NextResponse.json({
      ok: true,
      audioDataUrl: dataUrl,
      format: "wav",
      duration: text.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[tutor:tts] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
