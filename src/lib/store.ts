"use client"

import { create } from "zustand"
import { uid } from "./utils"
import type { ImageItem, Question, BBox, ImageAdjustments, GradingResult, AIProviderConfig } from "./types"
import { DEFAULT_ADJUSTMENTS } from "./types"
import { saveAIConfig, DEFAULT_AI_CONFIG } from "./ai-config"
import { saveImage, deleteImage, deleteImages, clearAllImages, loadAllImages } from "./image-db"

interface HistoryEntry {
  images: ImageItem[]
  currentImageId: string | null
  selectedQuestionId: string | null
}

interface DetectorState {
  images: ImageItem[]
  currentImageId: string | null
  selectedQuestionId: string | null
  // 跨页合并的多选
  selectedImageIds: string[]
  // 画廊多选模式（用于批量删除）
  gallerySelectMode: boolean

  // 全局开关
  autoDetect: boolean
  sidebarOpen: boolean
  rightPanelOpen: boolean
  aiConfig: AIProviderConfig
  // 是否已从 IndexedDB 恢复过
  hydrated: boolean

  // 历史
  past: HistoryEntry[]
  future: HistoryEntry[]
  commit: (fn: (s: DetectorState) => Partial<DetectorState>) => void
  undo: () => void
  redo: () => void

  // 全局开关
  setAutoDetect: (v: boolean) => void
  setSidebarOpen: (v: boolean) => void
  setRightPanelOpen: (v: boolean) => void
  toggleSidebar: () => void
  toggleRightPanel: () => void
  setAIConfig: (cfg: AIProviderConfig) => void
  setGallerySelectMode: (v: boolean) => void

  // 持久化
  hydrate: () => Promise<void>

  // 图片管理
  addImage: (img: Omit<ImageItem, "id" | "questions" | "detected" | "detecting" | "createdAt" | "adjustments">) => string
  removeImage: (id: string) => void
  removeImages: (ids: string[]) => void
  clearAll: () => void
  setCurrentImage: (id: string | null) => void
  toggleSelectImage: (id: string) => void
  clearSelection: () => void

  // 题目管理
  setQuestions: (imageId: string, questions: Question[], method?: "ai" | "offline") => void
  addQuestion: (imageId: string, q?: Partial<Question>) => string
  updateQuestion: (imageId: string, qid: string, patch: Partial<Question>) => void
  /** 实时更新（不写撤销历史，用于拖拽/输入过程） */
  updateQuestionLive: (imageId: string, qid: string, patch: Partial<Question>) => void
  /** 手动压入一次撤销快照（拖拽手势开始时调用一次） */
  pushHistory: () => void
  removeQuestion: (imageId: string, qid: string) => void
  selectQuestion: (qid: string | null) => void

  // 配图管理
  addSubImage: (imageId: string, qid: string, bbox?: BBox) => void
  removeSubImage: (imageId: string, qid: string, subId: string) => void
  setSubImageData: (imageId: string, qid: string, subId: string, dataUrl: string) => void

  // 批改
  setGrading: (imageId: string, qid: string, grading: GradingResult | undefined) => void

  // 识别状态
  setDetecting: (imageId: string, v: boolean) => void
  setDetected: (imageId: string, v: boolean) => void

  // 图像调整
  setAdjustments: (imageId: string, adj: Partial<ImageAdjustments>) => void
  resetAdjustments: (imageId: string) => void

  /** 替换图片数据（旋转/去手写/高清增强后），支持撤销 */
  replaceImageData: (imageId: string, data: { dataUrl: string; width: number; height: number }) => void

  // 工具
  getCurrentImage: () => ImageItem | undefined
}

const MAX_HISTORY = 50

function snapshot(s: DetectorState): HistoryEntry {
  return {
    images: s.images.map((im) => ({
      ...im,
      questions: im.questions.map((q) => ({ ...q, images: q.images.map((si) => ({ ...si })) })),
      adjustments: { ...im.adjustments },
    })),
    currentImageId: s.currentImageId,
    selectedQuestionId: s.selectedQuestionId,
  }
}

export const useDetectorStore = create<DetectorState>((set, get) => ({
  images: [],
  currentImageId: null,
  selectedQuestionId: null,
  selectedImageIds: [],
  gallerySelectMode: false,
  autoDetect: true,
  sidebarOpen: true,
  rightPanelOpen: true,
  aiConfig: { ...DEFAULT_AI_CONFIG },
  hydrated: false,

  past: [],
  future: [],

  commit: (fn) =>
    set((s) => {
      const snap = snapshot(s)
      const patch = fn(s)
      const newPast = [...s.past, snap]
      if (newPast.length > MAX_HISTORY) newPast.shift()
      return { ...patch, past: newPast, future: [] }
    }),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s
      const prev = s.past[s.past.length - 1]
      const cur = snapshot(s)
      return {
        ...prev,
        past: s.past.slice(0, -1),
        future: [cur, ...s.future].slice(0, MAX_HISTORY),
      }
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s
      const next = s.future[0]
      const cur = snapshot(s)
      return {
        ...next,
        past: [...s.past, cur].slice(-MAX_HISTORY),
        future: s.future.slice(1),
      }
    }),

  setAutoDetect: (v) => set({ autoDetect: v }),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setRightPanelOpen: (v) => set({ rightPanelOpen: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setAIConfig: (cfg) => {
    saveAIConfig(cfg)
    set({ aiConfig: cfg })
  },
  setGallerySelectMode: (v) => set({ gallerySelectMode: v, selectedImageIds: [] }),

  // 从 IndexedDB 恢复图片
  hydrate: async () => {
    if (get().hydrated) return
    try {
      const saved = await loadAllImages()
      if (saved.length > 0) {
        // 把 detecting 重置为 false（避免上次中断留下的脏状态）
        const restored = saved.map((im) => ({ ...im, detecting: false }))
        set({
          images: restored,
          currentImageId: restored[0]?.id ?? null,
          hydrated: true,
        })
      } else {
        set({ hydrated: true })
      }
    } catch (e) {
      console.warn("[hydrate] failed:", e)
      set({ hydrated: true })
    }
  },

  addImage: (img) => {
    const id = uid("img")
    const item: ImageItem = {
      id,
      questions: [],
      detected: false,
      detecting: false,
      createdAt: Date.now(),
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      detectMethod: null,
      ...img,
    }
    set((s) => {
      const snap = snapshot(s)
      const newPast = [...s.past, snap]
      if (newPast.length > MAX_HISTORY) newPast.shift()
      return {
        images: [...s.images, item],
        currentImageId: s.currentImageId ?? id,
        past: newPast,
        future: [],
      }
    })
    // 持久化到 IndexedDB
    void saveImage(item)
    return id
  },

  removeImage: (id) => {
    get().commit((s) => {
      const images = s.images.filter((x) => x.id !== id)
      const currentImageId = s.currentImageId === id ? images[0]?.id ?? null : s.currentImageId
      return {
        images,
        currentImageId,
        selectedQuestionId: null,
        selectedImageIds: s.selectedImageIds.filter((x) => x !== id),
      }
    })
    void deleteImage(id)
  },

  removeImages: (ids) => {
    if (!ids || ids.length === 0) return
    const idSet = new Set(ids)
    get().commit((s) => {
      const images = s.images.filter((x) => !idSet.has(x.id))
      const currentImageId = s.currentImageId && idSet.has(s.currentImageId)
        ? images[0]?.id ?? null
        : s.currentImageId
      return {
        images,
        currentImageId,
        selectedQuestionId: null,
        selectedImageIds: s.selectedImageIds.filter((x) => !idSet.has(x)),
      }
    })
    void deleteImages(ids)
  },

  clearAll: () => {
    get().commit(() => ({ images: [], currentImageId: null, selectedQuestionId: null, selectedImageIds: [] }))
    void clearAllImages()
  },

  setCurrentImage: (id) => set({ currentImageId: id, selectedQuestionId: null }),

  toggleSelectImage: (id) =>
    set((s) => ({
      selectedImageIds: s.selectedImageIds.includes(id)
        ? s.selectedImageIds.filter((x) => x !== id)
        : [...s.selectedImageIds, id],
    })),

  clearSelection: () => set({ selectedImageIds: [] }),

  setQuestions: (imageId, questions, method) => {
    set((s) => {
      const snap = snapshot(s)
      const newPast = [...s.past, snap]
      if (newPast.length > MAX_HISTORY) newPast.shift()
      return {
        images: s.images.map((x) =>
          x.id === imageId
            ? { ...x, questions, detected: true, detecting: false, detectMethod: method ?? x.detectMethod ?? "ai" }
            : x
        ),
        past: newPast,
        future: [],
      }
    })
    // 持久化到 IndexedDB
    const updated = get().images.find((x) => x.id === imageId)
    if (updated) void saveImage(updated)
  },

  addQuestion: (imageId, q) => {
    const qid = uid("q")
    get().commit((s) => ({
      images: s.images.map((x) =>
        x.id === imageId
          ? {
              ...x,
              questions: [
                ...x.questions,
                {
                  id: qid,
                  number: q?.number ?? "",
                  content: q?.content ?? "",
                  bbox: q?.bbox ?? { x: 0.1, y: 0.4, width: 0.8, height: 0.15 },
                  images: q?.images ?? [],
                  kind: q?.kind ?? "normal",
                },
              ],
            }
          : x
      ),
      selectedQuestionId: qid,
    }))
    return qid
  },

  updateQuestion: (imageId, qid, patch) => {
    set((s) => {
      const snap = snapshot(s)
      const newPast = [...s.past, snap]
      if (newPast.length > MAX_HISTORY) newPast.shift()
      return {
        images: s.images.map((x) =>
          x.id === imageId
            ? {
                ...x,
                questions: x.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)),
              }
            : x
        ),
        past: newPast,
        future: [],
      }
    })
    persistImageDebounced(imageId)
  },

  updateQuestionLive: (imageId, qid, patch) =>
    set((s) => ({
      images: s.images.map((x) =>
        x.id === imageId
          ? {
              ...x,
              questions: x.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)),
            }
          : x
      ),
    })),

  pushHistory: () =>
    set((s) => {
      const snap = snapshot(s)
      const newPast = [...s.past, snap]
      if (newPast.length > MAX_HISTORY) newPast.shift()
      return { past: newPast, future: [] }
    }),

  removeQuestion: (imageId, qid) => {
    get().commit((s) => ({
      images: s.images.map((x) =>
        x.id === imageId ? { ...x, questions: x.questions.filter((q) => q.id !== qid) } : x
      ),
      selectedQuestionId: s.selectedQuestionId === qid ? null : s.selectedQuestionId,
    }))
    persistImageDebounced(imageId, 200)
  },

  selectQuestion: (qid) => set({ selectedQuestionId: qid }),

  addSubImage: (imageId, qid, bbox) => {
    const subId = uid("sub")
    get().commit((s) => ({
      images: s.images.map((x) =>
        x.id === imageId
          ? {
              ...x,
              questions: x.questions.map((q) =>
                q.id === qid
                  ? {
                      ...q,
                      images: [
                        ...q.images,
                        { id: subId, bbox: bbox ?? { x: 0.1, y: 0.1, width: 0.3, height: 0.3 } },
                      ],
                    }
                  : q
              ),
            }
          : x
      ),
    }))
    persistImageDebounced(imageId, 200)
  },

  removeSubImage: (imageId, qid, subId) => {
    get().commit((s) => ({
      images: s.images.map((x) =>
        x.id === imageId
          ? {
              ...x,
              questions: x.questions.map((q) =>
                q.id === qid ? { ...q, images: q.images.filter((si) => si.id !== subId) } : q
              ),
            }
          : x
      ),
    }))
    persistImageDebounced(imageId, 200)
  },

  setSubImageData: (imageId, qid, subId, dataUrl) =>
    set((s) => ({
      images: s.images.map((x) =>
        x.id === imageId
          ? {
              ...x,
              questions: x.questions.map((q) =>
                q.id === qid
                  ? {
                      ...q,
                      images: q.images.map((si) => (si.id === subId ? { ...si, dataUrl } : si)),
                    }
                  : q
              ),
            }
          : x
      ),
    })),

  setGrading: (imageId, qid, grading) => {
    set((s) => ({
      images: s.images.map((x) =>
        x.id === imageId
          ? {
              ...x,
              questions: x.questions.map((q) => (q.id === qid ? { ...q, grading } : q)),
            }
          : x
      ),
    }))
    persistImageDebounced(imageId, 300)
  },

  setDetecting: (imageId, v) =>
    set((s) => ({
      images: s.images.map((x) => (x.id === imageId ? { ...x, detecting: v } : x)),
    })),

  setDetected: (imageId, v) =>
    set((s) => ({
      images: s.images.map((x) => (x.id === imageId ? { ...x, detected: v } : x)),
    })),

  setAdjustments: (imageId, adj) =>
    set((s) => ({
      images: s.images.map((x) =>
        x.id === imageId ? { ...x, adjustments: { ...x.adjustments, ...adj } } : x
      ),
    })),

  resetAdjustments: (imageId) =>
    set((s) => ({
      images: s.images.map((x) =>
        x.id === imageId ? { ...x, adjustments: { ...DEFAULT_ADJUSTMENTS } } : x
      ),
    })),

  replaceImageData: (imageId, data) => {
    get().commit((s) => ({
      images: s.images.map((x) => (x.id === imageId ? { ...x, ...data } : x)),
    }))
    // 持久化到 IndexedDB
    const updated = get().images.find((x) => x.id === imageId)
    if (updated) void saveImage(updated)
  },

  getCurrentImage: () => {
    const { images, currentImageId } = get()
    return images.find((x) => x.id === currentImageId)
  },
}))

/** 校验 bbox 是否合法（在 0~1 之内，且宽高合理） */
export function sanitizeBBox(b: Partial<BBox>): BBox {
  const x = Math.max(0, Math.min(1, b.x ?? 0))
  const y = Math.max(0, Math.min(1, b.y ?? 0))
  const w = Math.max(0.02, Math.min(1 - x, b.width ?? 0.1))
  const h = Math.max(0.02, Math.min(1 - y, b.height ?? 0.1))
  return { x, y, width: w, height: h }
}

/** 防抖持久化某张图片到 IndexedDB（用于拖拽/编辑等高频更新场景） */
const persistDebounce = new Map<string, ReturnType<typeof setTimeout>>()
export function persistImageDebounced(imageId: string, delay = 800) {
  const existing = persistDebounce.get(imageId)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    persistDebounce.delete(imageId)
    const img = useDetectorStore.getState().images.find((x) => x.id === imageId)
    if (img) void saveImage(img)
  }, delay)
  persistDebounce.set(imageId, timer)
}
