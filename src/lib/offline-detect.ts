"use client"

import type { ImageItem, BBox, Question } from "./types"
import { sanitizeBBox } from "./store"
import { uid } from "./utils"
import { loadImage } from "./image-utils"

interface DetectOptions {
  /** 二值化阈值（0~255） */
  threshold?: number
  /** 题目之间的最小间距（相对值，0~1），大于此值的间隔作为题目分界 */
  questionGap?: number
  /** 最小题目高度（相对值，0~1），小于此值的题目被丢弃 */
  minQuestionHeight?: number
  /** 行内合并间距（相对值，0~1），小于此值的相邻行合并 */
  lineMergeGap?: number
}

/**
 * 离线识别：基于水平投影的行分割算法
 *
 * 思路：
 * 1. 转灰度 → 二值化 → 每行求墨水密度
 * 2. 计算墨水密度的"显著阈值"——比平均密度高一定比例
 * 3. 用 lineMergeGap 合并连续的内容行为"小段"
 * 4. 用 questionGap 把相邻的小段合并为"题目"
 * 5. 过滤过小的题目
 *
 * 不依赖 AI，纯前端运行。适用于：
 * - 文字密度均匀的试卷/作业
 * - 题目之间有明显空白行
 */
export async function detectQuestionsOffline(
  img: ImageItem,
  options: DetectOptions = {}
): Promise<Question[]> {
  // 默认值更稳健：阈值高一些（区分文字与背景），间距更明确
  const threshold = options.threshold ?? 200
  const lineMergeGap = options.lineMergeGap ?? 0.01
  const questionGap = options.questionGap ?? 0.03
  const minQuestionHeight = options.minQuestionHeight ?? 0.03

  const image = await loadImage(img.dataUrl)
  // 限制处理尺寸
  const maxSide = 1200
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

  // 2. 行判定阈值：墨水量大于 max(2, w * 0.003)（即 0.3% 的像素是墨水）
  //    小图（如 400px 宽）也要至少 2 像素才算有内容
  const rowThreshold = Math.max(2, Math.floor(w * 0.003))

  // 3. 找连续的内容块（先用 lineMergeGap 合并相邻行）
  const lineMergeGapPx = Math.max(2, Math.floor(lineMergeGap * h))
  const blocks: { startY: number; endY: number }[] = []
  let inBlock = false
  let blockStart = 0
  let gapLen = 0
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
        if (gapLen > lineMergeGapPx) {
          blocks.push({ startY: blockStart, endY: y - gapLen })
          inBlock = false
        }
      }
    }
  }
  if (inBlock) {
    blocks.push({ startY: blockStart, endY: h - 1 })
  }

  if (blocks.length === 0) {
    canvas.width = 0
    canvas.height = 0
    return []
  }

  // 4. 把相邻的块按 questionGap 合并为题目
  const questionGapPx = Math.floor(questionGap * h)
  const mergedBlocks: { startY: number; endY: number }[] = []
  for (const b of blocks) {
    const last = mergedBlocks[mergedBlocks.length - 1]
    if (last && b.startY - last.endY < questionGapPx) {
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
      kind: "normal",
    })
  }

  // 清理
  canvas.width = 0
  canvas.height = 0

  return questions
}
