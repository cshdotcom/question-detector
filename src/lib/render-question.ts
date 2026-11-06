"use client"

import type { ImageItem, Question } from "./types"
import { loadImage, cropToDataUrl } from "./image-utils"

export interface RenderOptions {
  /** 是否显示批改结果 */
  showGrading?: boolean
  /** 是否显示配图 */
  showSubImages?: boolean
  /** 是否显示阅读材料 */
  showPassage?: boolean
  /** 是否显示题目截图 */
  showQuestionImage?: boolean
  /** 是否在题目截图上叠加框 */
  showBoxOnImage?: boolean
  /** 选项：要导出哪些图片（按 imageId 过滤），undefined 表示全部 */
  onlyImageIds?: Set<string>
  /** 选项：每张图要导出哪些题目（按 qid 过滤），undefined 表示全部 */
  onlyQuestionIds?: Set<string>
}

/**
 * 把一道题目渲染为带文字 + 截图 + 配图的 canvas（支持中文）
 * 返回 dataUrl
 */
export async function renderQuestionToCanvas(
  img: ImageItem,
  q: Question,
  passageContent?: string,
  options: RenderOptions = {}
): Promise<{ dataUrl: string; width: number; height: number }> {
  const {
    showGrading = true,
    showSubImages = true,
    showQuestionImage = true,
  } = options
  // 先估算尺寸，准备文字行
  const W = 800
  const padding = 40
  let y = padding
  const lineHeight = 24
  const lines: { text: string; font: string; color: string; indent?: number }[] = []

  // 题号标题
  const title = q.kind === "passage" ? "阅读材料" : q.number ? `第 ${q.number} 题` : "未编号题"
  lines.push({ text: title, font: "bold 22px sans-serif", color: "#1f2937" })

  // 类型标签
  if (q.kind === "passage_question") {
    lines.push({ text: "（阅读理解题）", font: "italic 14px sans-serif", color: "#6b7280", indent: 8 })
  }

  // 阅读材料内容（如果是 passage_question，附带文章）
  if (q.kind === "passage_question" && passageContent) {
    lines.push({ text: "阅读材料：", font: "bold 14px sans-serif", color: "#3b82f6", indent: 8 })
    passageContent.split("\n").forEach((line) => {
      lines.push({ text: line || " ", font: "13px sans-serif", color: "#4b5563", indent: 16 })
    })
    lines.push({ text: " ", font: "13px sans-serif", color: "#000" })
  }

  // 题目内容
  lines.push({ text: "题目：", font: "bold 14px sans-serif", color: "#374151", indent: 8 })
  q.content.split("\n").forEach((line) => {
    lines.push({ text: line || " ", font: "14px sans-serif", color: "#1f2937", indent: 16 })
  })
  lines.push({ text: " ", font: "14px sans-serif", color: "#000" })

  // 批改结果
  if (showGrading && q.grading) {
    const statusText =
      q.grading.correct === true ? "✓ 正确" :
      q.grading.correct === "partial" ? "△ 部分正确" : "✗ 错误"
    const statusColor =
      q.grading.correct === true ? "#16a34a" :
      q.grading.correct === "partial" ? "#d97706" : "#dc2626"
    lines.push({ text: `批改结果：${statusText}${typeof q.grading.score === "number" ? `  得分：${q.grading.score}` : ""}`, font: "bold 14px sans-serif", color: statusColor })
    if (q.grading.correctAnswer) {
      lines.push({ text: `正确答案：${q.grading.correctAnswer}`, font: "14px sans-serif", color: "#374151", indent: 8 })
    }
    if (q.grading.knowledgePoints && q.grading.knowledgePoints.length > 0) {
      lines.push({ text: `知识点：${q.grading.knowledgePoints.join("、")}`, font: "13px sans-serif", color: "#6b7280", indent: 8 })
    }
    if (q.grading.explanation) {
      lines.push({ text: "解析：", font: "bold 14px sans-serif", color: "#374151", indent: 8 })
      q.grading.explanation.split("\n").forEach((line) => {
        lines.push({ text: line || " ", font: "13px sans-serif", color: "#4b5563", indent: 16 })
      })
    }
    lines.push({ text: " ", font: "14px sans-serif", color: "#000" })
  }

  // 计算文字总高度
  let textHeight = 0
  const ctxForMeasure = document.createElement("canvas").getContext("2d")
  if (ctxForMeasure) {
    for (const ln of lines) {
      ctxForMeasure.font = ln.font
      const wrapped = wrapText(ctxForMeasure, ln.text, W - padding * 2 - (ln.indent || 0))
      textHeight += wrapped.length * lineHeight
    }
  } else {
    textHeight = lines.length * lineHeight
  }

  // 计算截图区域高度
  let imgSectionHeight = 0
  if (showQuestionImage) imgSectionHeight += 200 + 20
  if (showSubImages && q.images.length > 0) {
    imgSectionHeight += 220 * Math.ceil(q.images.length / 2) + 20
  }

  const totalHeight = padding + textHeight + imgSectionHeight + padding

  // 创建 canvas
  const canvas = document.createElement("canvas")
  // 用 2x 渲染保证清晰度
  const dpr = 2
  canvas.width = W * dpr
  canvas.height = totalHeight * dpr
  const ctx = canvas.getContext("2d")
  if (!ctx) return { dataUrl: "", width: W, height: totalHeight }
  ctx.scale(dpr, dpr)
  // 背景
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, W, totalHeight)

  // 画文字
  y = padding
  for (const ln of lines) {
    ctx.font = ln.font
    ctx.fillStyle = ln.color
    ctx.textBaseline = "top"
    const wrapped = wrapText(ctx, ln.text, W - padding * 2 - (ln.indent || 0))
    for (const w of wrapped) {
      ctx.fillText(w, padding + (ln.indent || 0), y)
      y += lineHeight
    }
  }

  // 画题目截图
  if (showQuestionImage) {
    try {
      const qDataUrl = await cropToDataUrl(img, q.bbox, 700, true)
      if (qDataUrl) {
        const qImg = await loadImage(qDataUrl)
        const drawW = W - padding * 2
        const drawH = Math.min(200, drawW * (qImg.naturalHeight / qImg.naturalWidth))
        ctx.drawImage(qImg, padding, y, drawW, drawH)
        y += drawH + 20
      }
    } catch {
      // 忽略
    }
  }

  // 画配图
  if (showSubImages && q.images.length > 0) {
    const subW = (W - padding * 2 - 10) / 2
    const subH = 200
    for (let i = 0; i < q.images.length; i++) {
      const si = q.images[i]
      const col = i % 2
      const row = Math.floor(i / 2)
      const sx = padding + col * (subW + 10)
      const sy = y + row * (subH + 10)
      try {
        const subDataUrl = si.dataUrl ?? (await cropToDataUrl(img, si.bbox, 500, true))
        if (subDataUrl) {
          const subImg = await loadImage(subDataUrl)
          // 保持比例
          const ratio = subImg.naturalWidth / subImg.naturalHeight
          let dw = subW
          let dh = subH
          if (ratio > dw / dh) {
            dh = dw / ratio
          } else {
            dw = dh * ratio
          }
          ctx.fillStyle = "#f9fafb"
          ctx.fillRect(sx, sy, subW, subH)
          ctx.strokeStyle = "#e5e7eb"
          ctx.strokeRect(sx, sy, subW, subH)
          ctx.drawImage(subImg, sx + (subW - dw) / 2, sy + (subH - dh) / 2, dw, dh)
          if (si.caption) {
            ctx.fillStyle = "#6b7280"
            ctx.font = "12px sans-serif"
            ctx.textBaseline = "top"
            ctx.fillText(si.caption.slice(0, 30), sx + 4, sy + subH - 18)
          }
        }
      } catch {
        // 忽略
      }
    }
    y += subH * Math.ceil(q.images.length / 2) + 20
  }

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.92),
    width: W,
    height: totalHeight,
  }
}

/** 简单的中文文字换行 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text) return [""]
  // 中文按字符切，英文按词切
  const isMostlyCJK = /[\u4e00-\u9fa5]/.test(text)
  if (isMostlyCJK) {
    const result: string[] = []
    let current = ""
    for (const ch of text) {
      const test = current + ch
      if (ctx.measureText(test).width > maxWidth && current) {
        result.push(current)
        current = ch
      } else {
        current = test
      }
    }
    if (current) result.push(current)
    return result.length > 0 ? result : [text]
  } else {
    // 英文按空格切
    const words = text.split(" ")
    const result: string[] = []
    let current = ""
    for (const w of words) {
      const test = current ? current + " " + w : w
      if (ctx.measureText(test).width > maxWidth && current) {
        result.push(current)
        current = w
      } else {
        current = test
      }
    }
    if (current) result.push(current)
    return result.length > 0 ? result : [text]
  }
}

/** 把整个图片（含框 + 题目内容）渲染为一张大图，用于 PDF */
export async function renderImageFullPage(
  img: ImageItem,
  options: RenderOptions = {}
): Promise<{ dataUrl: string; width: number; height: number }> {
  // 先渲染原图（带框）
  const { renderImageWithBoxes } = await import("./merge-images")
  const withBoxes = await renderImageWithBoxes(img, {
    showLabels: true,
    showGradingColor: options.showGrading !== false,
  })
  const boxImg = await loadImage(withBoxes)
  // 然后在下方追加每道题的文字内容
  const { showPassage = true } = options
  const questions = img.questions.filter((q) => {
    if (!showPassage && q.kind === "passage") return false
    return true
  })
  // 计算总高度
  const imgW = boxImg.naturalWidth
  const imgH = boxImg.naturalHeight
  // 每道题占 200px 高
  const qSectionHeight = questions.length * 200 + 40
  const totalH = imgH + qSectionHeight
  const canvas = document.createElement("canvas")
  canvas.width = imgW
  canvas.height = totalH
  const ctx = canvas.getContext("2d")
  if (!ctx) return { dataUrl: withBoxes, width: imgW, height: imgH }
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, imgW, totalH)
  ctx.drawImage(boxImg, 0, 0)
  let y = imgH + 20
  ctx.fillStyle = "#1f2937"
  ctx.font = `bold ${Math.max(18, imgW / 50)}px sans-serif`
  ctx.textBaseline = "top"
  ctx.fillText(`图片：${img.name}`, 20, y)
  y += 30
  // 每道题渲染
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    const title = q.kind === "passage" ? "阅读材料" : q.number ? `第 ${q.number} 题` : `题 ${i + 1}`
    ctx.fillStyle = "#1f2937"
    ctx.font = `bold ${Math.max(16, imgW / 60)}px sans-serif`
    ctx.fillText(title, 20, y)
    y += 22
    // 内容预览
    ctx.fillStyle = "#4b5563"
    ctx.font = `${Math.max(12, imgW / 80)}px sans-serif`
    const preview = (q.content || "(无内容)").slice(0, 80) + (q.content.length > 80 ? "..." : "")
    ctx.fillText(preview, 40, y)
    y += 18
    // 批改
    if (q.grading) {
      const status = q.grading.correct === true ? "✓ 正确" : q.grading.correct === "partial" ? "△ 部分" : "✗ 错误"
      ctx.fillStyle = q.grading.correct === true ? "#16a34a" : q.grading.correct === "partial" ? "#d97706" : "#dc2626"
      ctx.fillText(`批改：${status}${typeof q.grading.score === "number" ? `  得分：${q.grading.score}` : ""}`, 40, y)
      y += 18
    }
    y += 20
  }
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.92),
    width: imgW,
    height: totalH,
  }
}
