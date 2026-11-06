"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { useDetectorStore } from "@/lib/store"
import { detectQuestions } from "@/lib/detect-service"

/**
 * 全局自动识别 Hook
 * 监听 store 中新增的图片，触发自动识别
 * 不依赖任何组件的生命周期，整个应用生命周期都生效
 *
 * 实现思路：
 * 1. 用 ref 记录已知的图片 ID 集合
 * 2. 每次 store 变化时，找出"新增"的图片
 * 3. 对新增图片（除 [待合并] 标记的外）触发识别
 */
export function useAutoDetect() {
  const autoDetect = useDetectorStore((s) => s.autoDetect)
  const aiConfig = useDetectorStore((s) => s.aiConfig)
  const setDetecting = useDetectorStore((s) => s.setDetecting)
  const setQuestions = useDetectorStore((s) => s.setQuestions)
  const knownIdsRef = useRef<Set<string>>(new Set())
  const processingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    // 初始化：把当前所有图片标记为已知（不重复识别）
    const initState = useDetectorStore.getState()
    initState.images.forEach((im) => knownIdsRef.current.add(im.id))

    const unsub = useDetectorStore.subscribe((state) => {
      if (!autoDetect) return
      // 找出新增的、未识别的、未在处理中的图片
      const newImages = state.images.filter((im) => {
        if (knownIdsRef.current.has(im.id)) return false
        knownIdsRef.current.add(im.id)
        if (im.name.startsWith("[待合并]")) return false
        if (processingRef.current.has(im.id)) return false
        return true
      })
      for (const im of newImages) {
        if (!autoDetect) {
          // 自动识别关闭时不处理
          continue
        }
        processingRef.current.add(im.id)
        ;(async () => {
          setDetecting(im.id, true)
          try {
            const fresh = useDetectorStore.getState().images.find((x) => x.id === im.id) ?? im
            const qs = await detectQuestions(fresh, "ai", aiConfig)
            setQuestions(im.id, qs, "ai")
            toast.success(`「${im.name}」识别到 ${qs.length} 道题目`)
          } catch (e) {
            toast.error(`「${im.name}」识别失败：${(e as Error).message}`)
            setDetecting(im.id, false)
          } finally {
            processingRef.current.delete(im.id)
          }
        })()
      }
    })
    return unsub
  }, [autoDetect, aiConfig, setDetecting, setQuestions])
}
