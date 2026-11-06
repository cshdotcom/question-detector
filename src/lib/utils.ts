import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 生成短唯一 ID */
export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** 把 0~1 的相对坐标乘以画布像素尺寸，得到绝对像素值 */
export function toPixel(bbox: { x: number; y: number; width: number; height: number }, w: number, h: number) {
  return {
    x: bbox.x * w,
    y: bbox.y * h,
    width: bbox.width * w,
    height: bbox.height * h,
  }
}

/** clamp 一个值到 [min, max] */
export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
