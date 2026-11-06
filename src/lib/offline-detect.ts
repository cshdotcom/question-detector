"use client"

import type { ImageItem, BBox, Question } from "./types"
import { sanitizeBBox } from "./store"
import { uid } from "./utils"
import { loadImage } from "./image-utils"

interface DetectOptions {
  /** 二值化阈值（0~255） */
  threshold?: number
  /** 最小行间距（相对值，0~1），小于此值的相邻块合并 */
  minGapHeight?: number
  /** 最小题目高度（相对值，0~1），小于此值的题目被丢弃 */
  minQuestionHeight?: number
}

/**
 * 离线识别：基于水平投影的行分割算法
 * 思路：把图片转灰度 → 二值化 → 对每行求黑色像素数 → 找到连续的"低密度行"作为题目分界
 * 然后：合并相邻较近的块（可能是同一道题的多行）
 *
 * 这是一种简单但有效的算法，适用于：
 * - 文字密度均匀的试卷/作业
 * - 题目之间有明显空白行
 *
 * 不依赖 AI，纯前端运行。
 */
export async function detectQuestionsOffline(
  img: ImageItem,
  options: DetectOptions = {}
): Promise<Question[]> {
  const threshold = options.threshold ?? 180
  // 默认合并间距：相对图高 3%（足够合并题目内的多行，但保留题目间的明显空白）
  const minGapHeight = options.minGapHeight ?? 0.03
  // 默认最小题目高度：相对图高 3%
  const minQuestionHeight = options.minQuestionHeight ?? 0.03

  const image = await loadImage(img.dataUrl)
  const maxSide = 1000
  let scale = 1
  if (Math.max(img.width, img.height) > maxSide) {
    scale = maxSide / Math.max(img.width, img.height)
  }
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return []
  ctx.drawImage(image, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data

  // 1. 转灰度 + 二值化，得到每行的"墨水密度"
  const rowInk: number[] = new Array(h).fill(0)
  for (let y = 0; y < h; y++) {
    let ink = 0
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      const r = data[idx]
      const g = data[idx + 1]
      const b = data[idx + 2]
      const gray = (r * 0.299 + g * 0.587 + b * 0.114) | 0
      if (gray < threshold) ink++
    }
    rowInk[y] = ink
  }

  // 2. 行判定阈值：墨水量大于 5 像素即认为有内容
  const rowThreshold = 5

  // 3. 找连续的内容块（行）
  const blocks: { startY: number; endY: number }[] = []
  let inBlock = false
  let blockStart = 0
  let gapLen = 0
  // 第一步先找小段，间距阈值很小（1像素），即任何有内容的连续行
  const smallGap = 2
  for (let y = 0; y < h; y++) {
    const hasInk = rowInk[y] > rowThreshold
    if (hasInk) {
      if (!inBlock) {
        inBlock = true
        blockStart = y
      }
      gapLen = 0
    } else {
      if (inBlock) {
        gapLen++
        if (gapLen > smallGap) {
          blocks.push({ startY: blockStart, endY: y - gapLen })
          inBlock = false
        }
      }
    }
  }
  if (inBlock) {
    blocks.push({ startY: blockStart, endY: h - 1 })
  }

  // 4. 合并相邻较近的块（间距小于 minGapHeight * h 的合并为同一道题）
  const mergedBlocks: { startY: number; endY: number }[] = []
  for (const b of blocks) {
    const last = mergedBlocks[mergedBlocks.length - 1]
    if (last && b.startY - last.endY < minGapHeight * h) {
      last.endY = b.endY
    } else {
      mergedBlocks.push({ ...b })
    }
  }

  // 5. 过滤过小的块，并转为题目
  const questions: Question[] = []
  let idx = 0
  for (const b of mergedBlocks) {
    const height = (b.endY - b.startY + 1) / h
    if (height < minQuestionHeight) continue
    idx++
    const bbox: BBox = sanitizeBBox({
      x: 0.02,
      y: b.startY / h,
      width: 0.96,
      height: height,
    })
    questions.push({
      id: uid("q"),
      number: String(idx),
      content: "",
      bbox,
      images: [],
    })
  }

  // 6. 清理 canvas
  canvas.width = 0
  canvas.height = 0

  return questions
}
