// 共享类型定义

/** 题目在图片中的相对坐标（0~1），与分辨率无关 */
export interface BBox {
  x: number; // 左上角 X，相对值 0-1
  y: number; // 左上角 Y，相对值 0-1
  width: number; // 宽，相对值 0-1
  height: number; // 高，相对值 0-1
}

/** 题目内嵌的配图（图形、表格、几何图等） */
export interface SubImage {
  id: string;
  bbox: BBox; // 在原图中的相对位置
  dataUrl?: string; // 前端裁剪后填充的 base64 dataURL
  caption?: string; // 配图说明
}

/** 一道题目 */
export interface Question {
  id: string;
  number: string;
  content: string;
  bbox: BBox;
  images: SubImage[]; // 题目内嵌的配图
}

/** 图像调整参数 */
export interface ImageAdjustments {
  rotation: number; // 0/90/180/270
  brightness: number; // 0.5~1.5，1 = 原图
  contrast: number; // 0.5~1.5
  saturate: number; // 0~2，1 = 原图
}

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  rotation: 0,
  brightness: 1,
  contrast: 1,
  saturate: 1,
}

/** 一张待识别的图片 */
export interface ImageItem {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  source: "camera" | "upload";
  createdAt: number;
  questions: Question[];
  detected: boolean;
  detecting: boolean;
  /** 检测方式：AI / 离线算法 / 未识别 */
  detectMethod?: "ai" | "offline" | null;
  /** 图像调整 */
  adjustments: ImageAdjustments;
}

/** 后端 VLM 返回的单道题目 */
export interface DetectedQuestionDTO {
  number: string;
  content: string;
  bbox: BBox;
  /** 题目内嵌的配图区域 */
  images?: { bbox: BBox; caption?: string }[];
}
