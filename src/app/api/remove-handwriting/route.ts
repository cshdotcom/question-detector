import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 120

interface RemoveHandwritingBody {
  image: string
  width?: number
  height?: number
}

/** 图像编辑 API 支持的输出尺寸 */
const SUPPORTED_SIZES = [
  "1024x1024",
  "768x1344",
  "864x1152",
  "1344x768",
  "1152x864",
  "1440x720",
  "720x1440",
]

/** 根据原图宽高选择最接近宽高比的输出尺寸 */
function pickSize(w: number, h: number): string {
  if (!w || !h || w <= 0 || h <= 0) return "1024x1024"
  const ratio = w / h
  let best = "1024x1024"
  let bestDiff = Infinity
  for (const s of SUPPORTED_SIZES) {
    const [sw, sh] = s.split("x").map(Number)
    const diff = Math.abs(Math.log(sw / sh / ratio))
    if (diff < bestDiff) {
      bestDiff = diff
      best = s
    }
  }
  return best
}

const PROMPT = `Task: ERASE handwritten marks ONLY. NEVER regenerate, rewrite, blur, move, or restyle any printed text.

STRICT RULES (highest priority):
1. ABSOLUTELY DO NOT modify printed text. Every printed character (Chinese, English, digits, math symbols, LaTeX) must remain byte-for-byte identical in position, size, font, sharpness, and color.
2. ABSOLUTELY DO NOT regenerate the page. Do NOT redraw, re-typeset, or "improve" the layout. The output must be a pixel-level edit of the input, not a re-rendering.
3. ABSOLUTELY DO NOT add anything new. No new text, no new lines, no new diagrams that were not in the input.
4. ONLY erase these marks by replacing them with the surrounding paper background color (white or off-white):
   - Handwritten answers, calculations, drafts (pencil, pen, ballpoint — any color)
   - Teacher corrections: ✓, ✗, circles, underlines, wavy lines, arrows
   - Handwritten scores, grades (e.g. "92", "A", "Score")
5. If you are UNSURE whether a mark is handwritten or printed, KEEP IT UNCHANGED. False positives that erase printed text are catastrophic; false negatives that keep some handwriting are acceptable.
6. Keep all printed lines (rules in exercise books, table borders, dividers, header/footer lines) intact. Only erase lines drawn by hand.

What to remove: handwritten answers, pencil/pen calculations, red/blue correction marks, checkmarks, X marks, circles, handwritten scores.
What to keep 100% unchanged: printed question numbers, printed question text, printed options, printed diagrams, printed tables, printed figures, printed math formulas, page numbers.

Output: the same image with ONLY handwritten pixels replaced by paper-color background. Everything else must be pixel-identical to the input.`

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RemoveHandwritingBody
    if (!body?.image) {
      return NextResponse.json({ ok: false, error: "缺少 image 字段" }, { status: 400 })
    }

    let dataUrl = body.image
    if (!dataUrl.startsWith("data:")) {
      dataUrl = `data:image/jpeg;base64,${dataUrl}`
    }

    const size = pickSize(Number(body.width), Number(body.height))

    const ZAIModule = await import("z-ai-web-dev-sdk")
    const ZAI = (ZAIModule as any).default ?? ZAIModule
    const zai = await ZAI.create()

    const response = await zai.images.generations.edit({
      prompt: PROMPT,
      images: [{ url: dataUrl }],
      size,
    })

    const base64 = response?.data?.[0]?.base64
    if (!base64) {
      throw new Error("图像编辑 API 未返回结果")
    }

    return NextResponse.json({
      ok: true,
      dataUrl: `data:image/png;base64,${base64}`,
      size,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[remove-handwriting] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
