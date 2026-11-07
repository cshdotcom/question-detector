"use client"

import type { BBox, ImageAdjustments, ImageItem, Question, SubImage } from "./types"
import { uid } from "./utils"

/** 加载图片 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** 根据 bbox 裁剪原图为 dataURL
 * @param enhance 是否启用高清增强（2x 放大 + 强锐化 + 对比度拉伸）
 */
export async function cropToDataUrl(
  img: ImageItem,
  bbox: BBox,
  maxSide = 800,
  enhance: boolean = true
): Promise<string> {
  const image = await loadImage(img.dataUrl)
  const sx = bbox.x * img.width
  const sy = bbox.y * img.height
  const sw = bbox.width * img.width
  const sh = bbox.height * img.height
  const canvas = document.createElement("canvas")
  // 高清：默认 2.5x 放大，再限制到 maxSide
  const upscale = enhance ? 2.5 : 1
  let cw = sw * upscale
  let ch = sh * upscale
  if (Math.max(cw, ch) > maxSide) {
    if (cw >= ch) {
      const ratio = maxSide / cw
      cw = maxSide
      ch = ch * ratio
    } else {
      const ratio = maxSide / ch
      ch = maxSide
      cw = cw * ratio
    }
  }
  canvas.width = Math.max(1, Math.round(cw))
  canvas.height = Math.max(1, Math.round(ch))
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""
  // 高清增强：高质量插值
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  if (enhance) {
    try {
      // 1. 对比度拉伸（自动色阶）
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const stretched = autoContrastStretch(imgData)
      // 2. 锐化（强）
      const sharpened = applySharpen(stretched, 1.2)
      ctx.putImageData(sharpened, 0, 0)
    } catch {
      // 跨域或大图忽略
    }
  }
  return canvas.toDataURL("image/png")
}

/** 自动对比度拉伸（把 5%~95% 分位映射到 0~255，让文字更黑、背景更白） */
function autoContrastStretch(imageData: ImageData): ImageData {
  const data = imageData.data
  // 建灰度直方图
  const hist = new Array(256).fill(0)
  const n = data.length / 4
  for (let i = 0; i < n; i++) {
    const gray = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) | 0
    hist[gray]++
  }
  // 找 2% 和 98% 分位
  const lowTarget = n * 0.02
  const highTarget = n * 0.98
  let low = 0
  let high = 255
  let acc = 0
  for (let i = 0; i < 256; i++) {
    acc += hist[i]
    if (acc >= lowTarget) { low = i; break }
  }
  acc = 0
  for (let i = 255; i >= 0; i--) {
    acc += hist[i]
    if (acc >= n - highTarget) { high = i; break }
  }
  if (high - low < 20) return imageData
  // 映射
  const range = high - low
  const lut = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.max(0, Math.min(255, ((i - low) / range) * 255))
  }
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    out[i] = lut[data[i]]
    out[i + 1] = lut[data[i + 1]]
    out[i + 2] = lut[data[i + 2]]
    out[i + 3] = data[i + 3]
  }
  return new ImageData(out, imageData.width, imageData.height)
}

/** 简单锐化卷积（amount 越大越锐） */
function applySharpen(imageData: ImageData, amount: number = 0.5): ImageData {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data
  const dst = new Uint8ClampedArray(src.length)
  // 锐化核
  // [ 0, -amount, 0 ]
  // [-amount, 1+4*amount, -amount]
  // [ 0, -amount, 0 ]
  const center = 1 + 4 * amount
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        const i = idx + c
        const up = y > 0 ? src[i - w * 4] : src[i]
        const down = y < h - 1 ? src[i + w * 4] : src[i]
        const left = x > 0 ? src[i - 4] : src[i]
        const right = x < w - 1 ? src[i + 4] : src[i]
        let val = center * src[i] - amount * (up + down + left + right)
        dst[i] = Math.max(0, Math.min(255, val))
      }
      dst[idx + 3] = src[idx + 3]
    }
  }
  return new ImageData(dst, w, h)
}

/** 对整张原图应用高清增强（对比度拉伸 + 锐化），返回新的 dataURL */
export async function enhanceFullImage(dataUrl: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl)
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return { dataUrl, width: img.naturalWidth, height: img.naturalHeight }
  ctx.drawImage(img, 0, 0)
  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const stretched = autoContrastStretch(imgData)
    const sharpened = applySharpen(stretched, 0.8)
    ctx.putImageData(sharpened, 0, 0)
  } catch {
    // 忽略
  }
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.94),
    width: canvas.width,
    height: canvas.height,
  }
}

/** 给一道题目填充配图 dataUrl */
export async function fillQuestionImages(img: ImageItem, q: Question): Promise<Question> {
  if (!q.images || q.images.length === 0) return q
  const filled: SubImage[] = []
  for (const sub of q.images) {
    const dataUrl = sub.dataUrl ?? (await cropToDataUrl(img, sub.bbox))
    filled.push({ ...sub, dataUrl })
  }
  return { ...q, images: filled }
}

/** 给整张图所有题目填充配图 */
export async function fillAllQuestionImages(img: ImageItem): Promise<Question[]> {
  const out: Question[] = []
  for (const q of img.questions) {
    out.push(await fillQuestionImages(img, q))
  }
  return out
}

/** 把图片按调整参数渲染到 canvas（旋转 + 滤镜） */
export async function renderImageWithAdjustments(
  img: ImageItem
): Promise<string> {
  const image = await loadImage(img.dataUrl)
  const adj = img.adjustments
  const rotation = ((adj.rotation % 360) + 360) % 360
  let w = image.naturalWidth
  let h = image.naturalHeight
  if (rotation === 90 || rotation === 270) {
    ;[w, h] = [h, w]
  }
  // 限制最大边到 2000 避免过大
  const maxSide = 2000
  let scale = 1
  if (Math.max(w, h) > maxSide) scale = maxSide / Math.max(w, h)
  const cw = Math.round(w * scale)
  const ch = Math.round(h * scale)
  const canvas = document.createElement("canvas")
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext("2d")
  if (!ctx) return img.dataUrl
  ctx.save()
  ctx.translate(cw / 2, ch / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.filter = `brightness(${adj.brightness}) contrast(${adj.contrast}) saturate(${adj.saturate})`
  ctx.drawImage(image, -image.naturalWidth * scale / 2, -image.naturalHeight * scale / 2, image.naturalWidth * scale, image.naturalHeight * scale)
  ctx.restore()
  return canvas.toDataURL("image/jpeg", 0.9)
}

/** 把 base64 dataUrl 转 Blob */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",")
  const mime = meta.match(/data:([^;]+)/)?.[1] ?? "image/png"
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** 把题目数据导出为简单的 JSON */
export function buildExportData(images: ImageItem[]) {
  return images.map((img, i) => ({
    imageIndex: i + 1,
    imageName: img.name,
    source: img.source,
    width: img.width,
    height: img.height,
    detectMethod: img.detectMethod,
    questions: img.questions.map((q) => ({
      number: q.number,
      content: q.content,
      bbox: q.bbox,
      images: q.images.map((si) => ({
        bbox: si.bbox,
        caption: si.caption,
        hasData: !!si.dataUrl,
      })),
    })),
  }))
}

/** 生成新 SubImage（无 dataUrl） */
export function makeSubImage(bbox: BBox, caption?: string): SubImage {
  return { id: uid("sub"), bbox, caption }
}

/** 上传图片归一化：经 canvas 重绘以剥离 EXIF 方向信息（避免"显示是正的、AI 识别却是横的"导致框错位），
 *  同时限制最大边长 2000，统一转为 JPEG */
export async function normalizeUploadImage(
  dataUrl: string
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl)
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return { dataUrl, width: w || 1, height: h || 1 }
  const MAX = 2000
  const scale = Math.max(w, h) > MAX ? MAX / Math.max(w, h) : 1
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement("canvas")
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext("2d")
  if (!ctx) return { dataUrl, width: w, height: h }
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, cw, ch)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, 0, 0, cw, ch)
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), width: cw, height: ch }
}

/** 把图片旋转指定角度（0/90/180/270）并烘焙为新 dataUrl。
 *  旋转直接写进像素，保证 AI 识别 / 批改 / 裁剪 / 导出看到的都是同一方向 */
export async function rotateImage(
  dataUrl: string,
  rotation: number
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl)
  const r = (((rotation % 360) + 360) % 360) / 90 // 0~3
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (r === 0) return { dataUrl, width: w, height: h }
  const swap = r === 1 || r === 3
  const cw = swap ? h : w
  const ch = swap ? w : h
  const canvas = document.createElement("canvas")
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext("2d")
  if (!ctx) return { dataUrl, width: w, height: h }
  ctx.translate(cw / 2, ch / 2)
  ctx.rotate((r * 90 * Math.PI) / 180)
  ctx.drawImage(img, -w / 2, -h / 2)
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), width: cw, height: ch }
}

/** 本地快速去除彩色笔迹（红/蓝/绿笔的批改、勾叉、圈画、手写答案）：
 *  HSV 颜色分割出彩色笔画 → 掩膜膨胀（带走抗锯齿边）→ 从周边背景扩散修补。
 *  纯本地处理，不调用 AI，绝不改动印刷内容 */
export async function removeColoredMarksFromImage(
  img: ImageItem
): Promise<{ dataUrl: string; width: number; height: number }> {
  const image = await loadImage(img.dataUrl)
  const w = image.naturalWidth
  const h = image.naturalHeight
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("画布初始化失败")
  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data
  const n = w * h

  // 1. 构建彩色笔迹掩膜：印刷文字接近黑/灰（低饱和度），纸张背景高亮度低饱和度，
  //    彩色笔（红/蓝/绿/橙）饱和度高
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const v = max / 255
    const s = max === 0 ? 0 : (max - min) / max
    // 饱和度较高的彩色像素（排除黑字与白纸），且不是过暗（接近印刷黑）或过亮泛白
    const isColored = s > 0.28 && v > 0.18 && v < 0.97
    // 深红笔（暗但很红）
    const isDeepRed = r > 100 && r - g > 60 && r - b > 60
    if (isColored || isDeepRed) mask[i] = 1
  }

  // 2. 掩膜膨胀 2 圈（半径约 2px），带走抗锯齿边缘
  let mask2 = mask
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8Array(n)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (mask2[i]) {
          next[i] = 1
          continue
        }
        let hit = 0
        for (let dy = -1; dy <= 1 && !hit; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            if (mask2[ny * w + nx]) {
              hit = 1
              break
            }
          }
        }
        if (hit) next[i] = 1
      }
    }
    mask2 = next
  }

  let markedCount = 0
  for (let i = 0; i < n; i++) if (mask2[i]) markedCount++
  if (markedCount === 0) {
    // 没有检测到彩色笔迹
    return { dataUrl: img.dataUrl, width: w, height: h }
  }

  // 3. 扩散修补（onion-peel BFS）：从掩膜边界向内逐层用有效邻居均值填充
  const filled = new Uint8Array(n) // 1 = 已填充
  const queue: number[] = []
  // 初始化：掩膜外像素都是有效的
  for (let i = 0; i < n; i++) if (!mask2[i]) filled[i] = 1
  // 找掩膜中与有效像素相邻的作为第一层
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!mask2[i]) continue
      if (
        (x > 0 && filled[i - 1]) ||
        (x < w - 1 && filled[i + 1]) ||
        (y > 0 && filled[i - w]) ||
        (y < h - 1 && filled[i + w])
      ) {
        queue.push(i)
      }
    }
  }
  let head = 0
  while (head < queue.length) {
    const i = queue[head++]
    if (filled[i]) continue
    let rs = 0
    let gs = 0
    let bs = 0
    let cnt = 0
    const x = i % w
    const y = (i / w) | 0
    if (x > 0 && filled[i - 1]) { rs += data[(i - 1) * 4]; gs += data[(i - 1) * 4 + 1]; bs += data[(i - 1) * 4 + 2]; cnt++ }
    if (x < w - 1 && filled[i + 1]) { rs += data[(i + 1) * 4]; gs += data[(i + 1) * 4 + 1]; bs += data[(i + 1) * 4 + 2]; cnt++ }
    if (y > 0 && filled[i - w]) { rs += data[(i - w) * 4]; gs += data[(i - w) * 4 + 1]; bs += data[(i - w) * 4 + 2]; cnt++ }
    if (y < h - 1 && filled[i + w]) { rs += data[(i + w) * 4]; gs += data[(i + w) * 4 + 1]; bs += data[(i + w) * 4 + 2]; cnt++ }
    if (cnt > 0) {
      data[i * 4] = rs / cnt
      data[i * 4 + 1] = gs / cnt
      data[i * 4 + 2] = bs / cnt
      data[i * 4 + 3] = 255
      filled[i] = 1
      // 把未填充邻居入队
      if (x > 0 && mask2[i - 1] && !filled[i - 1]) queue.push(i - 1)
      if (x < w - 1 && mask2[i + 1] && !filled[i + 1]) queue.push(i + 1)
      if (y > 0 && mask2[i - w] && !filled[i - w]) queue.push(i - w)
      if (y < h - 1 && mask2[i + w] && !filled[i + w]) queue.push(i + w)
    }
  }
  // 兜底：仍没填上的（理论上不会有）填白色
  for (let i = 0; i < n; i++) {
    if (mask2[i] && !filled[i]) {
      data[i * 4] = 255
      data[i * 4 + 1] = 255
      data[i * 4 + 2] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.94), width: w, height: h }
}

/** AI 去除手写：把调整(旋转/滤镜)烘焙进图 → 发送到后端图像编辑 API →
 *  结果等比缩放回发送尺寸（保证题目框坐标不乱） */
export async function removeHandwritingFromImage(
  img: ImageItem
): Promise<{ dataUrl: string; width: number; height: number }> {
  const adj = img.adjustments
  const hasAdjustments =
    adj.rotation !== 0 || adj.brightness !== 1 || adj.contrast !== 1 || adj.saturate !== 1
  let src = img.dataUrl
  if (hasAdjustments) src = await renderImageWithAdjustments(img)

  // 缩小到 ≤1440（编辑 API 的最大输出档），降低上传体积与耗时
  const image = await loadImage(src)
  const MAX = 1440
  const scale = Math.max(image.naturalWidth, image.naturalHeight) > MAX
    ? MAX / Math.max(image.naturalWidth, image.naturalHeight)
    : 1
  const cw = Math.max(1, Math.round(image.naturalWidth * scale))
  const ch = Math.max(1, Math.round(image.naturalHeight * scale))
  const sendCanvas = document.createElement("canvas")
  sendCanvas.width = cw
  sendCanvas.height = ch
  const sctx = sendCanvas.getContext("2d")
  if (!sctx) throw new Error("画布初始化失败")
  sctx.fillStyle = "#ffffff"
  sctx.fillRect(0, 0, cw, ch)
  sctx.imageSmoothingQuality = "high"
  sctx.drawImage(image, 0, 0, cw, ch)
  const sendDataUrl = sendCanvas.toDataURL("image/jpeg", 0.9)

  const resp = await fetch("/api/remove-handwriting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: sendDataUrl, width: cw, height: ch }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || !data?.ok) {
    throw new Error(data?.error || `HTTP ${resp.status}`)
  }
  if (typeof data.dataUrl !== "string" || !data.dataUrl.startsWith("data:")) {
    throw new Error("图像编辑 API 返回异常")
  }

  // 结果缩放回发送时的尺寸：题目框、配图框的相对坐标保持有效
  // 关键：与原图做差异检测兜底，只接受 AI 把像素"擦白"的部分（手写被擦除），
  //       拒绝 AI "改写/添加"的部分（印刷题目被破坏），还原为原图，避免题目出问题。
  const merged = await mergeHandwritingResult(src, data.dataUrl, cw, ch)
  return merged
}

/** AI 去手写后的差异检测兜底：
 *  - 只接受 AI 把原图像素"擦白"的修改（手写答案/批改被擦除）
 *  - 拒绝 AI "改写"或"凭空添加"的修改（印刷题目被重写、变模糊、移位）
 *  - 这样即使 z-ai image-edit API 重绘整图，印刷题目也保持原样不破坏。
 *
 *  策略（按像素灰度比较，原图 vs cleaned）：
 *  - 原图白 + cleaned 白   → 白色（背景）
 *  - 原图白 + cleaned 内容 → 还原原图白色（拒绝 AI 凭空添加）
 *  - 原图内容 + cleaned 白 → 接受擦除（手写/批改被擦掉，符合预期）
 *  - 原图内容 + cleaned 内容但显著更白 → 接受 cleaned（部分擦除，如铅笔淡痕）
 *  - 原图内容 + cleaned 内容差异不大或反向变化 → 还原原图（拒绝改写）
 */
export async function mergeHandwritingResult(
  originalSrc: string,
  cleanedSrc: string,
  sendW: number,
  sendH: number
): Promise<{ dataUrl: string; width: number; height: number }> {
  const origImg = await loadImage(originalSrc)
  const cleanedImg = await loadImage(cleanedSrc)

  // 原图缩到 sendW × sendH
  const origCanvas = document.createElement("canvas")
  origCanvas.width = sendW
  origCanvas.height = sendH
  const octx = origCanvas.getContext("2d", { willReadFrequently: true })
  if (!octx) throw new Error("画布初始化失败")
  octx.fillStyle = "#ffffff"
  octx.fillRect(0, 0, sendW, sendH)
  octx.imageSmoothingQuality = "high"
  octx.drawImage(origImg, 0, 0, sendW, sendH)
  const origData = octx.getImageData(0, 0, sendW, sendH)

  // cleaned 缩到 sendW × sendH（API 返回尺寸可能是 1024×1024 等固定档，等比拉伸）
  const cleanedCanvas = document.createElement("canvas")
  cleanedCanvas.width = sendW
  cleanedCanvas.height = sendH
  const cctx = cleanedCanvas.getContext("2d", { willReadFrequently: true })
  if (!cctx) throw new Error("画布初始化失败")
  cctx.fillStyle = "#ffffff"
  cctx.fillRect(0, 0, sendW, sendH)
  cctx.imageSmoothingQuality = "high"
  cctx.drawImage(cleanedImg, 0, 0, sendW, sendH)
  const cleanedData = cctx.getImageData(0, 0, sendW, sendH)

  const ob = origData.data
  const cb = cleanedData.data
  const out = new Uint8ClampedArray(ob.length)

  // 灰度阈值：>WHITE_T 视为白纸背景
  const WHITE_T = 200
  // 显著更白阈值：原图灰度 - cleaned 灰度 > ERASE_T 视为"被擦白"
  const ERASE_T = 30

  for (let i = 0; i < ob.length; i += 4) {
    const oR = ob[i], oG = ob[i + 1], oB = ob[i + 2]
    const cR = cb[i], cG = cb[i + 1], cB = cb[i + 2]
    const oGray = (oR * 0.299 + oG * 0.587 + oB * 0.114) | 0
    const cGray = (cR * 0.299 + cG * 0.587 + cB * 0.114) | 0

    let r: number, g: number, b: number
    if (oGray > WHITE_T && cGray > WHITE_T) {
      // 都白色
      r = 255; g = 255; b = 255
    } else if (oGray > WHITE_T && cGray <= WHITE_T) {
      // 原图白 + cleaned 有内容 → AI 凭空添加，拒绝，用原图（白色）
      r = oR; g = oG; b = oB
    } else if (oGray <= WHITE_T && cGray > WHITE_T) {
      // 原图有内容 + cleaned 白 → AI 擦除，接受
      r = 255; g = 255; b = 255
    } else {
      // 都有内容，看是否"显著更白"
      const diff = oGray - cGray
      if (diff > ERASE_T) {
        // cleaned 显著更白 → 接受 cleaned（部分擦除/淡化）
        r = cR; g = cG; b = cB
      } else {
        // 没有显著擦除效果，或 AI 改写了 → 还原原图
        r = oR; g = oG; b = oB
      }
    }
    out[i] = r
    out[i + 1] = g
    out[i + 2] = b
    out[i + 3] = 255
  }

  const outCanvas = document.createElement("canvas")
  outCanvas.width = sendW
  outCanvas.height = sendH
  const outCtx = outCanvas.getContext("2d")
  if (!outCtx) throw new Error("画布初始化失败")
  outCtx.putImageData(new ImageData(out, sendW, sendH), 0, 0)
  return { dataUrl: outCanvas.toDataURL("image/jpeg", 0.92), width: sendW, height: sendH }
}
