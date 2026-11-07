// 共享类型定义

/** 题目在图片中的相对坐标（0~1），与分辨率无关 */
export interface BBox {
  x: number
  y: number
  width: number
  height: number
}

/** 题目内嵌的配图（图形、表格、几何图等） */
export interface SubImage {
  id: string
  bbox: BBox
  dataUrl?: string
  caption?: string
}

/** 跨页题标记：题目可能跨多张图片 */
export interface CrossPageLink {
  /** 跨页组的 ID（同一道跨页题的图片共享一个 groupId） */
  groupId: string
  /** 当前题目在跨页中的顺序（0, 1, 2...） */
  order: number
  /** 是否为该跨页题的起始页 */
  isStart: boolean
  /** 是否为该跨页题的结束页 */
  isEnd: boolean
}

/** 一道题目 */
export interface Question {
  id: string
  number: string
  content: string
  bbox: BBox
  images: SubImage[]
  /** 题目类型：普通题、阅读理解的文章、阅读理解的题目 */
  kind?: "normal" | "passage" | "passage_question"
  /** 关联的阅读理解文章的 ID（如果是 passage_question） */
  passageId?: string
  /** 跨页题标记 */
  crossPage?: CrossPageLink
  /** AI 批改结果 */
  grading?: GradingResult
}

/** 批改结果 */
export interface GradingResult {
  /** 是否正确 */
  correct: boolean | "partial"
  /** 得分（0~100，可选） */
  score?: number
  /** 正确答案 */
  correctAnswer?: string
  /** 学生答案（如果是题目已作答） */
  studentAnswer?: string
  /** 解析（含步骤、知识点） */
  explanation: string
  /** 涉及知识点 */
  knowledgePoints?: string[]
}

/** 图像调整参数 */
export interface ImageAdjustments {
  rotation: number
  brightness: number
  contrast: number
  saturate: number
}

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  rotation: 0,
  brightness: 1,
  contrast: 1,
  saturate: 1,
}

/** 一张待识别的图片 */
export interface ImageItem {
  id: string
  name: string
  dataUrl: string
  /** 缩略图（云端存储模式下列表加载用，长边 320） */
  thumbnail?: string
  width: number
  height: number
  source: "camera" | "upload" | "merged"
  createdAt: number
  questions: Question[]
  detected: boolean
  detecting: boolean
  detectMethod?: "ai" | "offline" | null
  adjustments: ImageAdjustments
  /** 如果是合并图，记录原始图片 ID */
  mergedFrom?: string[]
  /** 运行时标记：原图 dataUrl 是否已从云端加载（列表接口不含原图） */
  dataLoaded?: boolean
}

/** 后端 VLM 返回的单道题目 */
export interface DetectedQuestionDTO {
  number: string
  content: string
  bbox: BBox
  kind?: "normal" | "passage" | "passage_question"
  images?: { bbox: BBox; caption?: string }[]
  /** 跨页标识：题目在当前页是否未结束（继续到下一页） */
  crossPageContinues?: boolean
  /** 跨页标识：题目是否为上一页的延续 */
  crossPageContinued?: boolean
}

/** 阅读理解（一篇文章 + 多道题） */
export interface ReadingPassage {
  id: string
  title?: string
  content: string
  bbox: BBox
  images?: SubImage[]
  questions: string[] // 关联的 Question ID
}

/** 第三方 OpenAI 兼容 API 配置 */
export interface AIProviderConfig {
  /** API 端点，例如 https://api.openai.com/v1 或第三方兼容端点 */
  baseURL: string
  /** API Key */
  apiKey: string
  /** 模型名称，例如 gpt-4o、glm-4v 等 */
  model: string
  /** 是否启用第三方（false 时使用内置 Z.ai SDK） */
  enabled: boolean
}
