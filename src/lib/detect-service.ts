"use client"

import type { ImageItem, Question, BBox } from "./types"
import { sanitizeBBox } from "./store"
import { uid } from "./utils"
import { fillAllQuestionImages } from "./image-utils"
import { detectQuestionsOffline } from "./offline-detect"

export type DetectMethod = "ai" | "offline"

interface DetectAIDTO {
  number: string
  content: string
  bbox: { x: number; y: number; width: number; height: number }
  kind?: "normal" | "passage" | "passage_question"
  images?: { bbox: { x: number; y: number; width: number; height: number }; caption?: string }[]
  crossPageContinues?: boolean
  crossPageContinued?: boolean
}

/** 调用后端 API 进行 AI 识别 */
export async function detectWithAI(
  img: ImageItem,
  config?: import("./types").AIProviderConfig
): Promise<Question[]> {
  const resp = await fetch("/api/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: img.dataUrl, config }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.ok) {
    throw new Error(data?.error || `HTTP ${resp.status}`)
  }
  const list = (data.questions ?? []) as DetectAIDTO[]
  if (list.length === 0) return []

  // 先找 passage，建立关联
  const passages = list.filter((q) => q.kind === "passage")
  const passageIdMap = new Map<number, string>() // 索引 -> passageId
  passages.forEach((p, i) => {
    passageIdMap.set(i, uid("passage"))
  })

  const qs: Question[] = list.map((q, i) => {
    let passageId: string | undefined
    if (q.kind === "passage_question") {
      // 找到上方最近的 passage
      for (let j = i - 1; j >= 0; j--) {
        if (list[j].kind === "passage") {
          const pIdx = passages.indexOf(list[j])
          passageId = passageIdMap.get(pIdx)
          break
        }
      }
    }
    return {
      id: uid("q"),
      number: q.number || (q.kind === "passage" ? "阅读" : String(i + 1)),
      content: q.content || "",
      bbox: sanitizeBBox(q.bbox),
      kind: q.kind ?? "normal",
      passageId,
      images: (q.images ?? []).map((si) => ({
        id: uid("sub"),
        bbox: sanitizeBBox(si.bbox),
        caption: si.caption || "",
      })),
      crossPage: q.crossPageContinues || q.crossPageContinued
        ? {
            groupId: uid("cross"),
            order: q.crossPageContinued ? 1 : 0,
            isStart: !q.crossPageContinued,
            isEnd: !q.crossPageContinues,
          }
        : undefined,
    }
  })
  return qs
}

/** 离线识别 */
export async function detectOffline(img: ImageItem): Promise<Question[]> {
  return detectQuestionsOffline(img)
}

/** 统一入口：识别并填充配图 */
export async function detectQuestions(
  img: ImageItem,
  method: DetectMethod = "ai",
  config?: import("./types").AIProviderConfig
): Promise<Question[]> {
  const qs = method === "ai" ? await detectWithAI(img, config) : await detectOffline(img)
  const imgWithQs: ImageItem = { ...img, questions: qs }
  return fillAllQuestionImages(imgWithQs)
}

/** 重新为所有题目填充配图 */
export async function refillSubImages(img: ImageItem): Promise<Question[]> {
  return fillAllQuestionImages(img)
}

/** 调用后端 OCR 接口识别一个 bbox 内的题目文字 */
export async function ocrQuestion(
  img: ImageItem,
  bbox: BBox,
  config?: import("./types").AIProviderConfig
): Promise<{ number: string; content: string; kind: "normal" | "passage" | "passage_question" }> {
  const resp = await fetch("/api/ocr-question", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: img.dataUrl, bbox, config }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.ok) {
    throw new Error(data?.error || `HTTP ${resp.status}`)
  }
  return {
    number: data.number || "",
    content: data.content || "",
    kind: data.kind || "normal",
  }
}

/** 调用后端批改接口 */
export async function gradeQuestion(
  img: ImageItem,
  q: Question,
  passageContent?: string,
  config?: import("./types").AIProviderConfig
): Promise<import("./types").GradingResult> {
  const resp = await fetch("/api/grade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: img.dataUrl,
      questionContent: q.content,
      questionNumber: q.number,
      kind: q.kind,
      passageContent,
      config,
    }),
  })
  const data = await resp.json()
  if (!resp.ok || !data.ok) {
    throw new Error(data?.error || `HTTP ${resp.status}`)
  }
  return data.grading as import("./types").GradingResult
}
