"use client"

import type { ImageItem, Question } from "./types"
import { sanitizeBBox } from "./store"
import { uid } from "./utils"
import { fillAllQuestionImages } from "./image-utils"
import { detectQuestionsOffline } from "./offline-detect"

export type DetectMethod = "ai" | "offline"

interface DetectAIDTO {
  number: string
  content: string
  bbox: { x: number; y: number; width: number; height: number }
  images?: { bbox: { x: number; y: number; width: number; height: number }; caption?: string }[]
}

/** 调用后端 API 进行 AI 识别 */
export async function detectWithAI(img: ImageItem): Promise<Question[]> {
  const resp = await fetch("/api/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: img.dataUrl }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.ok) {
    throw new Error(data?.error || `HTTP ${resp.status}`)
  }
  const list = (data.questions ?? []) as DetectAIDTO[]
  if (list.length === 0) return []
  const qs: Question[] = list.map((q, i) => ({
    id: uid("q"),
    number: q.number || String(i + 1),
    content: q.content || "",
    bbox: sanitizeBBox(q.bbox),
    images: (q.images ?? []).map((si) => ({
      id: uid("sub"),
      bbox: sanitizeBBox(si.bbox),
      caption: si.caption || "",
    })),
  }))
  return qs
}

/** 离线识别 */
export async function detectOffline(img: ImageItem): Promise<Question[]> {
  return detectQuestionsOffline(img)
}

/** 统一入口：识别并填充配图 */
export async function detectQuestions(
  img: ImageItem,
  method: DetectMethod = "ai"
): Promise<Question[]> {
  const qs = method === "ai" ? await detectWithAI(img) : await detectOffline(img)
  // 给配图填入 dataUrl
  const imgWithQs: ImageItem = { ...img, questions: qs }
  return fillAllQuestionImages(imgWithQs)
}

/** 重新为所有题目填充配图（用户调整后用） */
export async function refillSubImages(img: ImageItem): Promise<Question[]> {
  return fillAllQuestionImages(img)
}
