"use client"

import { create } from "zustand"
import { uid } from "./utils"
import type { ImageItem, Question, BBox } from "./types"

interface DetectorState {
  images: ImageItem[]
  currentImageId: string | null
  selectedQuestionId: string | null

  // 图片管理
  addImage: (img: Omit<ImageItem, "id" | "questions" | "detected" | "detecting" | "createdAt">) => string
  removeImage: (id: string) => void
  clearAll: () => void
  setCurrentImage: (id: string | null) => void

  // 题目管理
  setQuestions: (imageId: string, questions: Question[]) => void
  addQuestion: (imageId: string, q?: Partial<Question>) => string
  updateQuestion: (imageId: string, qid: string, patch: Partial<Question>) => void
  removeQuestion: (imageId: string, qid: string) => void
  selectQuestion: (qid: string | null) => void

  // 识别状态
  setDetecting: (imageId: string, v: boolean) => void
  setDetected: (imageId: string, v: boolean) => void

  // 工具
  getCurrentImage: () => ImageItem | undefined
}

export const useDetectorStore = create<DetectorState>((set, get) => ({
  images: [],
  currentImageId: null,
  selectedQuestionId: null,

  addImage: (img) => {
    const id = uid("img")
    const item: ImageItem = {
      id,
      questions: [],
      detected: false,
      detecting: false,
      createdAt: Date.now(),
      ...img,
    }
    set((s) => ({
      images: [...s.images, item],
      currentImageId: s.currentImageId ?? id,
    }))
    return id
  },

  removeImage: (id) =>
    set((s) => {
      const images = s.images.filter((x) => x.id !== id)
      const currentImageId =
        s.currentImageId === id ? images[0]?.id ?? null : s.currentImageId
      return { images, currentImageId }
    }),

  clearAll: () => set({ images: [], currentImageId: null, selectedQuestionId: null }),

  setCurrentImage: (id) => set({ currentImageId: id, selectedQuestionId: null }),

  setQuestions: (imageId, questions) =>
    set((s) => ({
      images: s.images.map((x) =>
        x.id === imageId ? { ...x, questions, detected: true, detecting: false } : x
      ),
    })),

  addQuestion: (imageId, q) => {
    const qid = uid("q")
    const newQ: Question = {
      id: qid,
      number: q?.number ?? "",
      content: q?.content ?? "",
      bbox: q?.bbox ?? { x: 0.1, y: 0.1, width: 0.8, height: 0.15 },
    }
    set((s) => ({
      images: s.images.map((x) =>
        x.id === imageId ? { ...x, questions: [...x.questions, newQ] } : x
      ),
      selectedQuestionId: qid,
    }))
    return qid
  },

  updateQuestion: (imageId, qid, patch) =>
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

  removeQuestion: (imageId, qid) =>
    set((s) => ({
      images: s.images.map((x) =>
        x.id === imageId
          ? { ...x, questions: x.questions.filter((q) => q.id !== qid) }
          : x
      ),
      selectedQuestionId: s.selectedQuestionId === qid ? null : s.selectedQuestionId,
    })),

  selectQuestion: (qid) => set({ selectedQuestionId: qid }),

  setDetecting: (imageId, v) =>
    set((s) => ({
      images: s.images.map((x) => (x.id === imageId ? { ...x, detecting: v } : x)),
    })),

  setDetected: (imageId, v) =>
    set((s) => ({
      images: s.images.map((x) => (x.id === imageId ? { ...x, detected: v } : x)),
    })),

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
