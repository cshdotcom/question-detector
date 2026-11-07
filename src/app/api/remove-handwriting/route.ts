import { NextResponse } from "next/server"
import { callVisionChat, type ChatMessage } from "@/lib/ai-service"
import type { AIProviderConfig } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 120

interface BBoxDTO {
  x: number
  y: number
  width: number
  height: number
}

interface RemoveHandwritingBody {
  image: string
  width?: number
  height?: number
  config?: AIProviderConfig
}

/**
 * 用 VLM（文字模型 / 视觉大模型）识别手写笔迹区域，返回 bbox 列表。
 * 不再使用绘图模型（images.generations.edit），因为绘图模型无法精确控制文字、会破坏印刷题目。
 *
 * 后续由前端按 bbox 在 canvas 上做「洋葱皮」局部像素擦除：
 *  - 手写笔迹像素 → 用周围纸张色填充
 *  - 印刷题目像素 → 字节级保持原样
 */
const PROMPT = `你是一个手写笔迹检测助手。给定一张试卷/作业/教材的照片，请找出所有手写或批改痕迹的位置框，返回严格的 JSON 数组（不要任何额外文字、不要 markdown 代码块）。

要检测的"手写痕迹"包括：
1. 手写答案、演算过程、草稿（铅笔、钢笔、圆珠笔、马克笔，任何颜色）
2. 老师批改痕迹：勾号 ✓、叉号 ✗、圈、下划线、波浪线、箭头、批语
3. 手写的分数、等级（如 "92"、"A"、"Score"）

【绝对不要】识别为手写痕迹的内容（必须保留为印刷）：
- 印刷的题号、题目文字、选项、说明文字
- 印刷的几何图形、函数图、表格、插图、坐标轴
- 印刷的横线（作业本上的格线、表格线、分隔线）
- 印刷的页眉页脚、页码

每项 bbox：
- x, y, width, height 都是相对坐标（0~1，左上角原点）
- 框要尽量紧贴单个手写痕迹，不要把多个独立答案合并成大框
- 同一行多个字可以合并为一个框，但不要跨行
- 如果没有任何手写痕迹，返回空数组 []

示例输出：
[
  {"x":0.10,"y":0.32,"width":0.55,"height":0.04},
  {"x":0.10,"y":0.45,"width":0.40,"height":0.03}
]

只输出 JSON 数组本身，不要包装，不要解释。`

function extractBBoxes(text: string): BBoxDTO[] {
  if (!text) return []
  let s = text
    .trim()
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```/g, "")
    .trim()
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
  const start = s.indexOf("[")
  const end = s.lastIndexOf("]")
  if (start === -1 || end === -1 || end <= start) return []
  s = s.slice(start, end + 1)
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
  try {
    const parsed = JSON.parse(s)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((it) => it && typeof it === "object" && it.bbox !== undefined || (it && typeof it === "object" && (it.x !== undefined || it.width !== undefined)))
      .map((it) => {
        // 兼容 {bbox:{...}} 和 {...}
        const b = it.bbox ?? it
        return {
          x: Number(b.x ?? 0),
          y: Number(b.y ?? 0),
          width: Number(b.width ?? 0),
          height: Number(b.height ?? 0),
        }
      })
      .filter((b) => b.width > 0.001 && b.height > 0.001)
      .map((b) => ({
        x: Math.max(0, Math.min(0.99, b.x)),
        y: Math.max(0, Math.min(0.99, b.y)),
        width: Math.max(0.005, Math.min(1 - b.x, b.width)),
        height: Math.max(0.005, Math.min(1 - b.y, b.height)),
      }))
  } catch {
    return []
  }
}

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

    // config 优先：前端传入的（浏览器 localStorage）> env 默认（后端兜底）
    const config = body.config

    const messages: ChatMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ]

    const result = await callVisionChat(messages, { config, maxTokens: 4096 })
    const boxes = extractBBoxes(result.content)

    return NextResponse.json({
      ok: true,
      boxes,
      provider: config?.enabled && config.apiKey ? "openai-compatible" : "env-or-zai",
      count: boxes.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[remove-handwriting] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
