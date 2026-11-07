"use client"

/**
 * 云端图片持久化模块（服务端 SQLite via Prisma）
 * 替代浏览器 IndexedDB：图片与题目数据存云端数据库，任何设备登录后都能看到
 *
 * - 列表接口返回元数据 + 缩略图 + 题目（不含原图 dataUrl，原图懒加载）
 * - 原图 dataUrl 通过 loadImageData(id) 按需拉取
 * - 高频更新（拖拽/编辑）走防抖 PATCH
 */

import type { ImageItem, ImageAdjustments, Question } from "./types"
import { DEFAULT_ADJUSTMENTS } from "./types"

/** 生成缩略图 dataUrl（长边 ≤ 320，JPEG 0.7），用于画廊快速加载 */
export async function makeThumbnail(dataUrl: string): Promise<string> {
  try {
    const img = await loadImageEl(dataUrl)
    const MAX = 320
    const scale = Math.max(img.naturalWidth, img.naturalHeight) > MAX
      ? MAX / Math.max(img.naturalWidth, img.naturalHeight)
      : 1
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return ""
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, w, h)
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL("image/jpeg", 0.7)
  } catch {
    return ""
  }
}

function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

interface ListImageDTO {
  id: string
  name: string
  dataUrl: string
  thumbnail: string
  width: number
  height: number
  source: ImageItem["source"]
  createdAt: number
  questions: Question[]
  detected: boolean
  detecting: boolean
  detectMethod: "ai" | "offline" | null
  adjustments: ImageAdjustments
  dataLoaded: boolean
}

/** 加载所有图片元数据（不含原图） */
export async function loadAllImages(): Promise<ImageItem[]> {
  try {
    const resp = await fetch("/api/images", { cache: "no-store" })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok || !data?.ok) {
      console.warn("[cloud-db] loadAllImages failed:", data?.error)
      return []
    }
    return ((data.images ?? []) as ListImageDTO[]).map((im) => ({
      ...im,
      adjustments: { ...DEFAULT_ADJUSTMENTS, ...im.adjustments },
      questions: (im.questions ?? []).map((q) => ({
        ...q,
        images: (q.images ?? []).map((si) => ({ ...si })),
      })),
    }))
  } catch (e) {
    console.warn("[cloud-db] loadAllImages error:", e)
    return []
  }
}

/** 懒加载单张原图（含 dataUrl） */
export async function loadImageData(id: string): Promise<ImageItem | null> {
  try {
    const resp = await fetch(`/api/images/${encodeURIComponent(id)}`, { cache: "no-store" })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok || !data?.ok) {
      console.warn("[cloud-db] loadImageData failed:", data?.error)
      return null
    }
    const im = data.image as ListImageDTO
    return {
      ...im,
      adjustments: { ...DEFAULT_ADJUSTMENTS, ...im.adjustments },
      questions: (im.questions ?? []).map((q) => ({
        ...q,
        images: (q.images ?? []).map((si) => ({ ...si })),
      })),
    }
  } catch (e) {
    console.warn("[cloud-db] loadImageData error:", e)
    return null
  }
}

/** 新建图片记录（全量字段） */
export async function saveImage(img: ImageItem): Promise<boolean> {
  try {
    const resp = await fetch("/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: img.id,
        name: img.name,
        dataUrl: img.dataUrl,
        thumbnail: img.thumbnail ?? "",
        width: img.width,
        height: img.height,
        source: img.source,
        questions: img.questions,
        adjustments: img.adjustments,
        detectMethod: img.detectMethod ?? "",
        detected: img.detected,
      }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok || !data?.ok) {
      console.warn("[cloud-db] saveImage failed:", data?.error)
      return false
    }
    return true
  } catch (e) {
    console.warn("[cloud-db] saveImage error:", e)
    return false
  }
}

/** 部分更新（不传的字段不动） */
export async function patchImage(
  id: string,
  patch: Partial<{
    name: string
    dataUrl: string
    thumbnail: string
    width: number
    height: number
    questions: Question[]
    adjustments: ImageAdjustments
    detectMethod: string
    detected: boolean
  }>
): Promise<boolean> {
  try {
    const resp = await fetch(`/api/images/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok || !data?.ok) {
      console.warn("[cloud-db] patchImage failed:", data?.error)
      return false
    }
    return true
  } catch (e) {
    console.warn("[cloud-db] patchImage error:", e)
    return false
  }
}

/** 删除单张 */
export async function deleteImage(id: string): Promise<void> {
  try {
    await fetch(`/api/images/${encodeURIComponent(id)}`, { method: "DELETE" })
  } catch (e) {
    console.warn("[cloud-db] deleteImage error:", e)
  }
}

/** 批量删除 */
export async function deleteImages(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  try {
    await fetch("/api/images/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
  } catch (e) {
    console.warn("[cloud-db] deleteImages error:", e)
  }
}

/** 清空全部 */
export async function clearAllImages(): Promise<void> {
  try {
    await fetch("/api/images", { method: "DELETE" })
  } catch (e) {
    console.warn("[cloud-db] clearAllImages error:", e)
  }
}
