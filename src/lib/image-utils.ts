"use client"

import type { BBox, ImageAdjustments, ImageItem, Question, SubImage } from "./types"
import { uid } from "./utils"
import { authFetch } from "./auth-fetch"

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
  //    使用与 eraseRegions 相同的 v2 算法（8 邻域 + 多次迭代 + 羽化）
  const filled = new Uint8Array(n) // 1 = 已填充
  const queue: number[] = []
  // 初始化：掩膜外像素都是有效的
  for (let i = 0; i < n; i++) if (!mask2[i]) filled[i] = 1
  // 找掩膜中与有效像素相邻的作为第一层（8 邻域）
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!mask2[i]) continue
      if (hasValidNeighbor8(x, y, w, h, filled)) {
        queue.push(i)
      }
    }
  }
  let head = 0
  while (head < queue.length) {
    const i = queue[head++]
    if (filled[i]) continue
    const x = i % w
    const y = (i / w) | 0
    const sum = sampleNeighbors8(x, y, w, h, data, filled)
    if (sum.cnt > 0) {
      data[i * 4] = sum.r / sum.w
      data[i * 4 + 1] = sum.g / sum.w
      data[i * 4 + 2] = sum.b / sum.w
      data[i * 4 + 3] = 255
      filled[i] = 1
      pushUnfilledMask8(x, y, w, h, mask2, filled, queue, i)
    }
  }
  // 兜底：BFS 没填上的用最近有效像素填充
  for (let i = 0; i < n; i++) {
    if (mask2[i] && !filled[i]) {
      const x = i % w
      const y = (i / w) | 0
      const color = findNearestValidColor(x, y, w, h, filled, data)
      data[i * 4] = color[0]
      data[i * 4 + 1] = color[1]
      data[i * 4 + 2] = color[2]
      data[i * 4 + 3] = 255
      filled[i] = 1
    }
  }
  // 多次迭代平滑（3 轮），消除方向性条纹
  for (let pass = 0; pass < 3; pass++) {
    const snapshot = new Uint8ClampedArray(data.length)
    snapshot.set(data)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (!mask2[i]) continue
        const sum = sampleNeighbors8FromSnapshot(x, y, w, h, snapshot)
        if (sum.cnt > 0) {
          data[i * 4] = sum.r / sum.w
          data[i * 4 + 1] = sum.g / sum.w
          data[i * 4 + 2] = sum.b / sum.w
        }
      }
    }
  }
  // 边界羽化
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!mask2[i]) continue
      let neighborValid = 0
      let neighborCount = 0
      let r = 0, g = 0, b = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const ni = ny * w + nx
          neighborCount++
          if (!mask2[ni]) {
            neighborValid++
            r += data[ni * 4]
            g += data[ni * 4 + 1]
            b += data[ni * 4 + 2]
          }
        }
      }
      if (neighborValid > 0 && neighborValid < neighborCount) {
        data[i * 4] = (data[i * 4] + r / neighborValid) / 2
        data[i * 4 + 1] = (data[i * 4 + 1] + g / neighborValid) / 2
        data[i * 4 + 2] = (data[i * 4 + 2] + b / neighborValid) / 2
      }
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return { dataUrl: canvas.toDataURL("image/png"), width: w, height: h }
}

/** AI 去除手写：用 VLM（文字模型）识别手写笔迹区域 → 本地按 bbox 做洋葱皮局部擦除
 *  不再使用绘图模型（images.generations.edit），因为绘图模型会破坏印刷题目。
 *  VLM 文字模型擅长区分印刷 vs 手写，配合本地擦除可保证印刷内容字节级一致。
 *
 *  流程：
 *  1. 把调整(旋转/滤镜)烘焙进图，缩到 ≤1440 上传
 *  2. POST /api/remove-handwriting，VLM 返回手写区域 bbox 列表
 *  3. 本地对每个 bbox 做擦除：把手写像素用周围纸张色填充（onion-peel inpainting）
 *  4. 印刷题目像素完全不动
 */
export async function removeHandwritingFromImage(
  img: ImageItem
): Promise<{ dataUrl: string; width: number; height: number; boxes: { x: number; y: number; width: number; height: number }[]; originalDataUrl: string }> {
  const adj = img.adjustments
  const hasAdjustments =
    adj.rotation !== 0 || adj.brightness !== 1 || adj.contrast !== 1 || adj.saturate !== 1
  let src = img.dataUrl
  if (hasAdjustments) src = await renderImageWithAdjustments(img)

  // 缩小到 ≤1440 上传，降低体积与耗时
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

  // 调用 VLM 识别手写区域（config 由前端传入，浏览器 localStorage 配置优先）
  const { useDetectorStore } = await import("./store")
  const aiConfig = useDetectorStore.getState().aiConfig

  const resp = await authFetch("/api/remove-handwriting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: sendDataUrl, width: cw, height: ch, config: aiConfig }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || !data?.ok) {
    throw new Error(data?.error || `HTTP ${resp.status}`)
  }
  const boxes: { x: number; y: number; width: number; height: number }[] = data.boxes ?? []
  if (boxes.length === 0) {
    // VLM 没检测到手写，原样返回（不破坏图片）
    return { dataUrl: sendCanvas.toDataURL("image/jpeg", 0.94), width: cw, height: ch, boxes: [], originalDataUrl: sendDataUrl }
  }

  // 本地按 bbox 做局部擦除（改进版 onion-peel + 多次迭代平滑）
  const outCanvas = document.createElement("canvas")
  outCanvas.width = cw
  outCanvas.height = ch
  const octx = outCanvas.getContext("2d", { willReadFrequently: true })
  if (!octx) throw new Error("画布初始化失败")
  octx.fillStyle = "#ffffff"
  octx.fillRect(0, 0, cw, ch)
  octx.drawImage(image, 0, 0, cw, ch)

  const imageData = octx.getImageData(0, 0, cw, ch)
  eraseRegions(imageData, boxes)
  octx.putImageData(imageData, 0, 0)

  return { dataUrl: outCanvas.toDataURL("image/png"), width: cw, height: ch, boxes, originalDataUrl: sendDataUrl }
}

/** 按 bbox 列表在 ImageData 上做局部擦除（v3 改进版）：
 *  - 跳过异常大的 bbox（>35% 单边长，VLM 误检保护）
 *  - mask 膨胀 2 圈（覆盖抗锯齿边缘）
 *  - BFS 采样时跳过 mask 内深色像素（亮度<128 的手写笔迹本身）
 *    避免把深色笔迹颜色作为颜色源混入均值，导致灰蓝涂抹晕染
 *  - 8 邻域 BFS 初次填充 + 3 轮迭代平滑 + 边界羽化
 *  - 印刷题目像素完全不动 */
function eraseRegions(
  imageData: ImageData,
  boxes: { x: number; y: number; width: number; height: number }[]
) {
  const w = imageData.width
  const h = imageData.height
  const data = imageData.data
  const n = w * h

  // 1. 构建擦除掩膜（不内缩，依赖 mask 内深色过滤来保护抗锯齿）
  const mask = new Uint8Array(n)
  let validBoxCount = 0
  for (const b of boxes) {
    // 跳过异常大的 bbox（>35% 单边长，VLM 误检保护）
    if (b.width > 0.35 || b.height > 0.35) continue
    const x0 = Math.max(0, Math.floor(b.x * w))
    const y0 = Math.max(0, Math.floor(b.y * h))
    const x1 = Math.min(w, Math.ceil((b.x + b.width) * w))
    const y1 = Math.min(h, Math.ceil((b.y + b.height) * h))
    if (x1 <= x0 || y1 <= y0) continue
    validBoxCount++
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        mask[y * w + x] = 1
      }
    }
  }
  if (validBoxCount === 0) return

  // 2. mask 膨胀 5 圈（覆盖抗锯齿边缘 + VLM bbox 边界外溢的笔迹 + 字体下行）
  let cur = mask
  for (let pass = 0; pass < 5; pass++) {
    const next = new Uint8Array(n)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (cur[i]) { next[i] = 1; continue }
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = x + dx, ny = y + dy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            if (cur[ny * w + nx]) { next[i] = 1; break }
          }
          if (next[i]) break
        }
      }
    }
    cur = next
  }
  const dilated = cur

  // 3. 识别 mask 内的"深色笔迹像素"（亮度<128）—— 这些是手写笔迹本身
  //    BFS 采样时跳过这些像素，只用周围浅色像素（纸张背景）作为颜色源
  //    这样能避免深色笔迹颜色污染填充结果
  const isDarkStroke = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (!dilated[i]) continue
    const lum = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3
    if (lum < 128) isDarkStroke[i] = 1
  }

  // 4. 8 邻域 onion-peel BFS 初次填充
  //    filled[i]=1 表示该像素可作为有效颜色源
  //    mask 外像素 = 1（有效）；mask 内深色笔迹像素 = 0（无效，跳过）；mask 内其他像素 = 0（待填）
  const filled = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (!dilated[i]) filled[i] = 1  // mask 外
    // mask 内：默认 filled=0（待填）
  }

  const queue: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!dilated[i] || isDarkStroke[i]) continue  // 跳过非 mask 和深色笔迹
      if (hasValidNeighbor8(x, y, w, h, filled)) {
        queue.push(i)
      }
    }
  }

  let head = 0
  while (head < queue.length) {
    const i = queue[head++]
    if (filled[i]) continue
    const x = i % w
    const y = (i / w) | 0
    const sum = sampleNeighbors8(x, y, w, h, data, filled)
    if (sum.cnt > 0) {
      data[i * 4] = sum.r / sum.w
      data[i * 4 + 1] = sum.g / sum.w
      data[i * 4 + 2] = sum.b / sum.w
      data[i * 4 + 3] = 255
      filled[i] = 1
      pushUnfilledMask8(x, y, w, h, dilated, filled, queue, i)
    }
  }

  // 5. 兜底：处理深色笔迹像素（BFS 跳过的）+ 任何未填的 mask 像素
  //    用径向搜索找最近的非 mask 有效像素颜色
  for (let i = 0; i < n; i++) {
    if (dilated[i] && !filled[i]) {
      const x = i % w
      const y = (i / w) | 0
      const color = findNearestValidColor(x, y, w, h, filled, data)
      data[i * 4] = color[0]
      data[i * 4 + 1] = color[1]
      data[i * 4 + 2] = color[2]
      data[i * 4 + 3] = 255
      filled[i] = 1
    }
  }

  // 6. 多次迭代平滑（3 轮）：用周围 8 邻域重新加权平均
  for (let pass = 0; pass < 3; pass++) {
    const snapshot = new Uint8ClampedArray(data.length)
    snapshot.set(data)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (!dilated[i]) continue
        // 跳过 mask 内深色笔迹像素（避免被平滑回深色）—— 它们已经被填好了
        // 实际上第 5 步已经把所有 mask 像素填好了，所以这里直接平均
        const sum = sampleNeighbors8FromSnapshot(x, y, w, h, snapshot)
        if (sum.cnt > 0) {
          data[i * 4] = sum.r / sum.w
          data[i * 4 + 1] = sum.g / sum.w
          data[i * 4 + 2] = sum.b / sum.w
        }
      }
    }
  }

  // 7. 边界羽化
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!dilated[i]) continue
      let neighborValid = 0
      let neighborCount = 0
      let r = 0, g = 0, b = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const ni = ny * w + nx
          neighborCount++
          if (!dilated[ni]) {
            neighborValid++
            r += data[ni * 4]
            g += data[ni * 4 + 1]
            b += data[ni * 4 + 2]
          }
        }
      }
      if (neighborValid > 0 && neighborValid < neighborCount) {
        data[i * 4] = (data[i * 4] + r / neighborValid) / 2
        data[i * 4 + 1] = (data[i * 4 + 1] + g / neighborValid) / 2
        data[i * 4 + 2] = (data[i * 4 + 2] + b / neighborValid) / 2
      }
    }
  }
}

/** 检查 8 邻域是否有有效（filled）像素 */
function hasValidNeighbor8(x: number, y: number, w: number, h: number, filled: Uint8Array): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      if (filled[ny * w + nx]) return true
    }
  }
  return false
}

/** 8 邻域加权采样（对角线权重 0.7） */
function sampleNeighbors8(
  x: number, y: number, w: number, h: number,
  data: Uint8ClampedArray, filled: Uint8Array
): { r: number; g: number; b: number; cnt: number; w: number } {
  let r = 0, g = 0, b = 0, wSum = 0, cnt = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const ni = ny * w + nx
      if (!filled[ni]) continue
      const weight = (dx !== 0 && dy !== 0) ? 0.7 : 1.0
      r += data[ni * 4] * weight
      g += data[ni * 4 + 1] * weight
      b += data[ni * 4 + 2] * weight
      wSum += weight
      cnt++
    }
  }
  return { r, g, b, cnt, w: wSum }
}

/** 同 sampleNeighbors8，但从 snapshot 读取（用于迭代平滑时防止污染） */
function sampleNeighbors8FromSnapshot(
  x: number, y: number, w: number, h: number,
  snapshot: Uint8ClampedArray
): { r: number; g: number; b: number; cnt: number; w: number } {
  let r = 0, g = 0, b = 0, wSum = 0, cnt = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const ni = ny * w + nx
      const weight = (dx !== 0 && dy !== 0) ? 0.7 : 1.0
      r += snapshot[ni * 4] * weight
      g += snapshot[ni * 4 + 1] * weight
      b += snapshot[ni * 4 + 2] * weight
      wSum += weight
      cnt++
    }
  }
  return { r, g, b, cnt, w: wSum }
}

/** 把未填充的 mask 邻居推入队列（8 邻域） */
function pushUnfilledMask8(
  x: number, y: number, w: number, h: number,
  mask: Uint8Array, filled: Uint8Array,
  queue: number[], currentIdx: number
) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const ni = ny * w + nx
      if (mask[ni] && !filled[ni]) queue.push(ni)
    }
  }
}

/** 找最近的有效像素颜色（径向搜索，最大半径 30） */
function findNearestValidColor(
  x: number, y: number, w: number, h: number,
  filled: Uint8Array, data: Uint8ClampedArray
): [number, number, number] {
  const maxR = 30
  for (let r = 1; r <= maxR; r++) {
    let r_sum = 0, g_sum = 0, b_sum = 0, cnt = 0
    // 在半径 r 的圆周上采样
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue // 只取外圈
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const ni = ny * w + nx
        if (filled[ni]) {
          r_sum += data[ni * 4]
          g_sum += data[ni * 4 + 1]
          b_sum += data[ni * 4 + 2]
          cnt++
        }
      }
    }
    if (cnt > 0) {
      return [r_sum / cnt, g_sum / cnt, b_sum / cnt]
    }
  }
  return [255, 255, 255] // 全白兜底
}
