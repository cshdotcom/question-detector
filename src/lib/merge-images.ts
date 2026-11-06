"use client"

import type { ImageItem } from "./types"
import { uid } from "./utils"
import { loadImage } from "./image-utils"

/**
 * 把多张图片垂直拼接为一张长图
 * 用于跨页题：用户拍了多页，合并成一张来识别
 */
export async function mergeImagesVertically(
  images: ImageItem[],
  options: { gap?: number; backgroundColor?: string; maxSide?: number } = {}
): Promise<{ dataUrl: string; width: number; height: number }> {
  if (images.length === 0) {
    throw new Error("没有可合并的图片")
  }
  if (images.length === 1) {
    return { dataUrl: images[0].dataUrl, width: images[0].width, height: images[0].height }
  }
  const gap = options.gap ?? 0
  const bg = options.backgroundColor ?? "#ffffff"
  // 最大边长设大一些（让合并后的长图有足够清晰度）
  const maxSide = options.maxSide ?? 2200

  // 加载所有图片
  const loaded = await Promise.all(images.map((im) => loadImage(im.dataUrl)))

  // 统一宽度：取最小宽度（避免小图被拉伸糊）+ 不超过 maxSide
  const minWidth = Math.min(...loaded.map((im) => im.naturalWidth))
  const targetWidth = Math.min(maxSide, minWidth)

  // 计算每张图缩放后的高度
  const scaled = loaded.map((im) => {
    const ratio = im.naturalHeight / im.naturalWidth
    const w = targetWidth
    const h = Math.round(w * ratio)
    return { img: im, w, h }
  })
  const totalHeight = scaled.reduce((sum, s) => sum + s.h, 0) + gap * (scaled.length - 1)

  // 如果合并后的图过大，按比例缩到 maxSide
  let scaleDown = 1
  if (totalHeight > maxSide * 1.6) {
    scaleDown = (maxSide * 1.6) / totalHeight
  }
  const finalW = Math.round(targetWidth * scaleDown)
  const finalH = Math.round(totalHeight * scaleDown)

  // 先画到全尺寸 canvas
  const fullCanvas = document.createElement("canvas")
  fullCanvas.width = targetWidth
  fullCanvas.height = totalHeight
  const fullCtx = fullCanvas.getContext("2d")
  if (!fullCtx) throw new Error("无法创建画布上下文")
  fullCtx.fillStyle = bg
  fullCtx.fillRect(0, 0, targetWidth, totalHeight)
  let y = 0
  for (const s of scaled) {
    fullCtx.drawImage(s.img, 0, y, s.w, s.h)
    y += s.h + gap
  }

  // 缩到最终尺寸
  let finalDataUrl: string
  if (scaleDown < 1) {
    const c2 = document.createElement("canvas")
    c2.width = finalW
    c2.height = finalH
    const c2ctx = c2.getContext("2d")
    if (!c2ctx) throw new Error("无法创建缩放画布上下文")
    c2ctx.drawImage(fullCanvas, 0, 0, finalW, finalH)
    finalDataUrl = c2.toDataURL("image/jpeg", 0.92)
  } else {
    finalDataUrl = fullCanvas.toDataURL("image/jpeg", 0.92)
  }

  // 清理
  fullCanvas.width = 0
  fullCanvas.height = 0

  return {
    dataUrl: finalDataUrl,
    width: finalW,
    height: finalH,
  }
}

/** 把多个图片合并为一项 ImageItem，记录来源 */
export async function mergeImageItems(images: ImageItem[]): Promise<ImageItem> {
  const { dataUrl, width, height } = await mergeImagesVertically(images)
  const item: ImageItem = {
    id: uid("merged"),
    name: `跨页合并 (${images.length}张)`,
    dataUrl,
    width,
    height,
    source: "merged",
    createdAt: Date.now(),
    questions: [],
    detected: false,
    detecting: false,
    adjustments: { rotation: 0, brightness: 1, contrast: 1, saturate: 1 },
    mergedFrom: images.map((im) => im.id),
  }
  return item
}

/** 把整张图片画到一个 canvas 上，叠加题目框 + 题号标签 */
export async function renderImageWithBoxes(
  img: ImageItem,
  options: {
    showLabels?: boolean
    selectedOnly?: string | null
    boxColor?: string
    selectedColor?: string
    /** 是否按批改结果分色：错题红、部分正确黄、正确绿、未批改保持 boxColor */
    showGradingColor?: boolean
  } = {}
): Promise<string> {
  const image = await loadImage(img.dataUrl)
  const canvas = document.createElement("canvas")
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return img.dataUrl
  ctx.drawImage(image, 0, 0)
  const {
    showLabels = true,
    selectedOnly = null,
    boxColor = "#10b981",
    selectedColor = "#e11d48",
    showGradingColor = false,
  } = options
  const W = canvas.width
  const H = canvas.height
  ctx.lineWidth = Math.max(2, Math.round(W / 500))
  ctx.font = `bold ${Math.max(16, Math.round(W / 50))}px sans-serif`
  for (const q of img.questions) {
    if (selectedOnly && q.id !== selectedOnly) continue
    const x = q.bbox.x * W
    const y = q.bbox.y * H
    const w = q.bbox.width * W
    const h = q.bbox.height * H
    const isSel = q.id === selectedOnly
    // 按批改结果着色
    let color = isSel ? selectedColor : boxColor
    if (showGradingColor && q.grading) {
      if (q.grading.correct === false) color = "#dc2626" // 红
      else if (q.grading.correct === "partial") color = "#d97706" // 黄
      else if (q.grading.correct === true) color = "#16a34a" // 绿
    } else if (showGradingColor && q.kind === "passage") {
      color = "#3b82f6" // 蓝色：阅读材料
    }
    ctx.strokeStyle = color
    ctx.strokeRect(x, y, w, h)
    if (showLabels && q.number) {
      const label = q.kind === "passage" ? "阅读材料" : `第 ${q.number} 题`
      const tw = ctx.measureText(label).width
      const lh = Math.max(20, Math.round(W / 40))
      ctx.fillStyle = color
      ctx.fillRect(x, Math.max(0, y - lh), tw + 16, lh)
      ctx.fillStyle = "#fff"
      ctx.textBaseline = "middle"
      ctx.fillText(label, x + 8, Math.max(0, y - lh) + lh / 2)
    }
  }
  return canvas.toDataURL("image/jpeg", 0.92)
}

/** 把多个题目图片打包为 ZIP 不太现实（依赖 jszip），改为逐个下载，浏览器原生支持 */
export async function downloadMultipleImages(
  items: { dataUrl: string; filename: string }[]
) {
  for (const it of items) {
    const a = document.createElement("a")
    a.href = it.dataUrl
    a.download = it.filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    // 让浏览器有时间处理
    await new Promise((r) => setTimeout(r, 200))
  }
}
