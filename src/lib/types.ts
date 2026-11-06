// 共享类型定义

/** 题目在图片中的相对坐标（0~1），与分辨率无关 */
export interface BBox {
  x: number; // 左上角 X，相对值 0-1
  y: number; // 左上角 Y，相对值 0-1
  width: number; // 宽，相对值 0-1
  height: number; // 高，相对值 0-1
}

/** 一道题目 */
export interface Question {
  id: string; // 前端生成，唯一 ID
  number: string; // 题号，例如 "1"、"2(1)"、"三"
  content: string; // 题目文本
  bbox: BBox; // 在图中的相对位置
}

/** 一张待识别的图片 */
export interface ImageItem {
  id: string; // 唯一 ID
  name: string; // 文件名 / 拍照序号
  dataUrl: string; // base64 dataURL
  width: number; // 图片像素宽
  height: number; // 图片像素高
  source: "camera" | "upload"; // 来源
  createdAt: number; // 创建时间戳
  questions: Question[]; // 该图上的题目
  detected: boolean; // 是否已自动识别
  detecting: boolean; // 正在识别中
}

/** 后端 VLM 返回的单道题目 */
export interface DetectedQuestionDTO {
  number: string;
  content: string;
  bbox: BBox;
}
