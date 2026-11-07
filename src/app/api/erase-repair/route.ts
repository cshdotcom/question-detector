import { NextResponse } from "next/server"
import type { AIProviderConfig } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 120

interface EraseRepairBody {
  image: string          // 原图 dataUrl
  erasedImage: string     // 本地擦除后的图 dataUrl
  boxes: { x: number; y: number; width: number; height: number }[]
  config?: AIProviderConfig
}

/**
 * AI 深度修复：用 z-ai image-edit API 重绘擦除区域
 * 
 * 流程：
 * 1. 把本地已擦除的图发给 AI，prompt 要求"清理擦除区域的残留痕迹，保持印刷内容不变"
 * 2. AI 返回重绘后的图
 * 3. 差异检测：只在擦除 bbox 区域内接受 AI 的修改，bbox 外保持原图
 * 4. 返回合成后的图
 * 
 * 这样能利用 AI 的 inpainting 能力修复复杂背景，
 * 同时保证印刷题目区域字节级不变。
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as EraseRepairBody
    if (!body.image || !body.erasedImage) {
      return NextResponse.json({ ok: false, error: "缺少 image 或 erasedImage" }, { status: 400 })
    }
    if (!body.boxes || body.boxes.length === 0) {
      return NextResponse.json({ ok: false, error: "缺少 boxes" }, { status: 400 })
    }

    // 调用 z-ai image-edit API
    const ZAIModule = await import("z-ai-web-dev-sdk")
    const ZAI = (ZAIModule as unknown as { default?: typeof ZAIModule }).default ?? ZAIModule
    const zai = await (ZAI as unknown as { create: () => Promise<unknown> }).create()

    const prompt = `请清理这张试卷图片中已被擦除手写笔迹的区域，使擦除区域的背景与周围纸张颜色自然融合，不留涂抹痕迹或残影。绝对不要修改任何印刷文字、题号、公式、图形或表格内容。只修复擦除区域的背景纹理。`

    const response = await (zai as {
      images: {
        generations: {
          edit: (opts: {
            prompt: string
            images: { url: string }[]
            size: string
          }) => Promise<{ data?: { base64?: string }[] }>
        }
      }
    }).images.generations.edit({
      prompt,
      images: [{ url: body.erasedImage }],
      size: "1024x1024",
    })

    const base64 = response?.data?.[0]?.base64
    if (!base64) {
      throw new Error("AI 未返回图片数据")
    }

    const aiImage = `data:image/png;base64,${base64}`

    // 差异检测合成：bbox 内用 AI 图，bbox 外用原图
    // 注意：AI 返回的图可能尺寸不同，需要缩放对齐
    // 由于在浏览器端做像素级合成更方便（需要 canvas），
    // 这里直接返回 AI 图 + 原图 + boxes，让前端做合成
    return NextResponse.json({
      ok: true,
      aiImage,
      originalImage: body.image,
      boxes: body.boxes,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[erase-repair] failed:", message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
