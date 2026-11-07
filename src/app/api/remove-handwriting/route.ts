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

const PROMPT = `这是一张试卷/作业/教材的照片。请把图中所有手写和批改痕迹全部去除，包括：
1. 手写答案、演算过程（铅笔、钢笔字迹）
2. 红笔/蓝笔批改：勾号、叉号、圈画、下划线、波浪线、批语
3. 手写的分数、等级（如 "92分"、"Score"、"A" 等老师评分）
把这些区域恢复成干净的空白纸面（保持纸张底色一致）。
必须完整保留所有印刷内容：印刷的题号、题目文字、选项、图表、表格、插图、印刷分隔线和页眉页脚，位置、大小、字体、版面布局完全不变，清晰可读。
注意区分：印刷的黑色横线/表格线要保留，手写或红笔画的线要去掉。
Remove ALL handwritten marks (answers, corrections, checkmarks, circles, underlines, handwritten scores) and restore clean blank paper. Keep all printed text, numbers, diagrams, tables and the layout exactly unchanged.`

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
