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
 * @param enhance 是否启用高清增强（锐化 + 对比度提升）
 */
export async function cropToDataUrl(
  img: ImageItem,
  bbox: BBox,
  maxSide = 800,
  enhance: boolean = false
): Promise<string> {
  const image = await loadImage(img.dataUrl)
  const sx = bbox.x * img.width
  const sy = bbox.y * img.height
  const sw = bbox.width * img.width
  const sh = bbox.height * img.height
  const canvas = document.createElement("canvas")
  // 高清：默认 2x 放大，再限制到 maxSide
  const upscale = enhance ? 2 : 1
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
  // 高清增强：使用 imageSmoothingQuality high
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  if (enhance) {
    // 简单锐化：用卷积核
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const sharpened = applySharpen(imgData, 0.6)
      ctx.putImageData(sharpened, 0, 0)
    } catch {
      // 跨域或大图忽略
    }
  }
  return canvas.toDataURL("image/png")
}

/** 简单锐化卷积 */
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
