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
 * 防止报错的措施：
 * 1. 用 Set 跟踪处理中 / 已完成的图片 ID，避免重复触发
 * 2. 加 try/catch，单个图片失败不影响其他图片
 * 3. 加并发限制（同时最多 1 个识别任务，避免 API 限流）
 */
export function useAutoDetect() {
  const autoDetect = useDetectorStore((s) => s.autoDetect)
  const aiConfig = useDetectorStore((s) => s.aiConfig)
  const setDetecting = useDetectorStore((s) => s.setDetecting)
  const setQuestions = useDetectorStore((s) => s.setQuestions)
  const knownIdsRef = useRef<Set<string>>(new Set())
  const processingRef = useRef<Set<string>>(new Set())
  const queueRef = useRef<string[]>([])
  const runningRef = useRef(false)

  useEffect(() => {
    // 初始化：把当前所有图片标记为已知（不重复识别）
    const initState = useDetectorStore.getState()
    initState.images.forEach((im) => {
      knownIdsRef.current.add(im.id)
      // 已经识别过的图片也标记为已完成
      if (im.detected) processingRef.current.add(im.id)
    })

    const unsub = useDetectorStore.subscribe((state) => {
      if (!useDetectorStore.getState().autoDetect) return
      // 找出新增的、未识别的、未在处理中的图片
      const newImages = state.images.filter((im) => {
        if (knownIdsRef.current.has(im.id)) return false
        knownIdsRef.current.add(im.id)
        if (im.name.startsWith("[待合并]")) return false
        if (processingRef.current.has(im.id)) return false
        // 已经识别过的图片（从 IndexedDB 恢复的）不重新识别
        if (im.detected) return false
        return true
      })
      for (const im of newImages) {
        if (queueRef.current.includes(im.id)) continue
        queueRef.current.push(im.id)
      }
      // 触发处理
      void processQueue()
    })

    const processQueue = async () => {
      if (runningRef.current) return
      runningRef.current = true
      try {
        while (queueRef.current.length > 0) {
          // 自动识别可能被关闭，每次循环检查
          if (!useDetectorStore.getState().autoDetect) {
            // 把队列清空
            queueRef.current = []
            break
          }
          const imgId = queueRef.current.shift()!
          if (processingRef.current.has(imgId)) continue
          processingRef.current.add(imgId)
          // 检查图片是否还存在（可能被用户删除）
          const im = useDetectorStore.getState().images.find((x) => x.id === imgId)
          if (!im) {
            processingRef.current.delete(imgId)
            continue
          }
          setDetecting(imgId, true)
          try {
            // 云端存储模式：识别前确保原图 dataUrl 已加载（恢复的图片可能懒加载未完成）
            await useDetectorStore.getState().ensureImageData(imgId)
            const fresh = useDetectorStore.getState().images.find((x) => x.id === imgId) ?? im
            const qs = await detectQuestions(fresh, "ai", useDetectorStore.getState().aiConfig)
            // 再次检查图片是否还存在
            const stillExists = useDetectorStore.getState().images.find((x) => x.id === imgId)
            if (!stillExists) {
              processingRef.current.delete(imgId)
              continue
            }
            setQuestions(imgId, qs, "ai")
            toast.success(`「${im.name}」识别到 ${qs.length} 道题目`)
          } catch (e) {
            const err = e as Error
            console.error(`[autoDetect] 识别失败 ${im.name}:`, err)
            // 不要 spam toast，只在 1 道题时显示
            toast.error(`「${im.name}」识别失败：${err.message.slice(0, 100)}`)
            setDetecting(imgId, false)
          } finally {
            processingRef.current.delete(imgId)
          }
        }
      } finally {
        runningRef.current = false
      }
    }

    return unsub
  }, [autoDetect, aiConfig, setDetecting, setQuestions])
}
