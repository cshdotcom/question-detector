"use client"

/**
 * IndexedDB 图片持久化模块
 *
 * 用于把拍摄的图片保存到浏览器，下次打开网站时自动恢复。
 * - 每张图片存为一个 record，包含 dataUrl、宽高、题目列表、调整参数
 * - 题目的配图（sub.dataUrl）也一起序列化
 * - store 改动时通过 saveImages 防抖写入
 * - 应用启动时通过 loadImages 恢复
 */

import type { ImageItem } from "./types"

const DB_NAME = "question-detector-db"
const STORE_NAME = "images"
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB 不可用"))
  }
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

/** 保存一张图片（含题目与配图） */
export async function saveImage(img: ImageItem): Promise<void> {
  try {
    const db = await openDB()
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      // 序列化题目里的 sub.dataUrl（可能体积较大）
      const serializable = {
        ...img,
        questions: img.questions.map((q) => ({
          ...q,
          images: q.images.map((si) => ({ ...si })),
        })),
      }
      store.put(serializable)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn("[IndexedDB] saveImage failed:", e)
  }
}

/** 批量保存多张图片 */
export async function saveImages(images: ImageItem[]): Promise<void> {
  try {
    const db = await openDB()
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      for (const img of images) {
        const serializable = {
          ...img,
          questions: img.questions.map((q) => ({
            ...q,
            images: q.images.map((si) => ({ ...si })),
          })),
        }
        store.put(serializable)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn("[IndexedDB] saveImages failed:", e)
  }
}

/** 删除一张图片 */
export async function deleteImage(id: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      tx.objectStore(STORE_NAME).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn("[IndexedDB] deleteImage failed:", e)
  }
}

/** 删除多张图片 */
export async function deleteImages(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  try {
    const db = await openDB()
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      for (const id of ids) store.delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn("[IndexedDB] deleteImages failed:", e)
  }
}

/** 清空所有图片 */
export async function clearAllImages(): Promise<void> {
  try {
    const db = await openDB()
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite")
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn("[IndexedDB] clearAllImages failed:", e)
  }
}

/** 加载所有已保存图片 */
export async function loadAllImages(): Promise<ImageItem[]> {
  try {
    const db = await openDB()
    return new Promise<ImageItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly")
      const req = tx.objectStore(STORE_NAME).getAll()
      req.onsuccess = () => {
        const list = (req.result || []) as ImageItem[]
        // 按 createdAt 排序
        list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        resolve(list)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn("[IndexedDB] loadAllImages failed:", e)
    return []
  }
}
