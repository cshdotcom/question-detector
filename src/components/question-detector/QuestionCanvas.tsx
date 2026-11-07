"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Plus,
  Sparkles,
  Loader2,
  Trash2,
  ImageOff,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCw,
  Sun,
  Cpu,
  RefreshCw,
  Undo2,
  Redo2,
  Wand2,
  Download,
  Eraser,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { useDetectorStore, sanitizeBBox } from "@/lib/store"
import { detectQuestions, ocrQuestion } from "@/lib/detect-service"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Markdown } from "@/components/markdown/Markdown"
import { cn, clamp } from "@/lib/utils"
import type { Question, BBox } from "@/lib/types"
import { ExportMenu } from "./ExportMenu"

type DragMode =
  | { kind: "move"; qid: string; startX: number; startY: number; origBBox: Question["bbox"] }
  | {
      kind: "resize"
      qid: string
      handle: ResizeHandle
      startX: number
      startY: number
      origBBox: Question["bbox"]
    }
  | null

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]

export function QuestionCanvas() {
  const currentImage = useDetectorStore((s) => s.images.find((x) => x.id === s.currentImageId))
  const selectedQuestionId = useDetectorStore((s) => s.selectedQuestionId)
  const selectQuestion = useDetectorStore((s) => s.selectQuestion)
  const updateQuestion = useDetectorStore((s) => s.updateQuestion)
  const updateQuestionLive = useDetectorStore((s) => s.updateQuestionLive)
  const pushHistory = useDetectorStore((s) => s.pushHistory)
  const replaceImageData = useDetectorStore((s) => s.replaceImageData)
  const addQuestion = useDetectorStore((s) => s.addQuestion)
  const removeQuestion = useDetectorStore((s) => s.removeQuestion)
  const setQuestions = useDetectorStore((s) => s.setQuestions)
  const setDetecting = useDetectorStore((s) => s.setDetecting)
  const setAdjustments = useDetectorStore((s) => s.setAdjustments)
  const resetAdjustments = useDetectorStore((s) => s.resetAdjustments)
  const aiConfig = useDetectorStore((s) => s.aiConfig)
  const undo = useDetectorStore((s) => s.undo)
  const redo = useDetectorStore((s) => s.redo)
  const canUndo = useDetectorStore((s) => s.past.length > 0)
  const canRedo = useDetectorStore((s) => s.future.length > 0)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgSize, setImgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const [zoom, setZoom] = useState(1)
  const [showAdjust, setShowAdjust] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [enhanceLoading, setEnhanceLoading] = useState(false)
  // 去手写 / 旋转
  const [cleaning, setCleaning] = useState(false)
  const [rotating, setRotating] = useState(false)
  // 自由画框（拖拽空白处）
  const [drawBox, setDrawBox] = useState<BBox | null>(null)
  const drawStartRef = useRef<{ x: number; y: number } | null>(null)
  // 手势辅助：开始时只压一次撤销快照；移动过程实时更新
  const gesturePushedRef = useRef(false)
  const movedRef = useRef(false)
  const startClientRef = useRef({ x: 0, y: 0 })
  // 点击已批改题目框 → 弹出解析
  const [gradingQid, setGradingQid] = useState<string | null>(null)

  // ResizeObserver 监听容器尺寸变化
  useEffect(() => {
    if (!wrapperRef.current) return
    const ro = new ResizeObserver(() => {
      if (imgRef.current) {
        setImgSize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight })
      }
    })
    ro.observe(wrapperRef.current)
    // 窗口尺寸变化兜底（横竖屏切换、地址栏收起）
    window.addEventListener("resize", updateSize)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", updateSize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 关键修复：直接监听主图元素尺寸。
  // 图片显示尺寸由 max-w-full / maxHeight 决定，视口或侧栏开合变化时图片会重新布局，
  // 若只监听外层容器，图层(imgSize)可能与图片实际尺寸不同步 → 题目框错位
  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const ro = new ResizeObserver(() => {
      setImgSize({ w: img.clientWidth, h: img.clientHeight })
    })
    ro.observe(img)
    return () => ro.disconnect()
  }, [currentImage?.id])

  const updateSize = useCallback(() => {
    if (imgRef.current) {
      setImgSize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight })
    }
  }, [])

  useEffect(() => {
    setZoom(1)
  }, [currentImage?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault()
        redo()
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedQuestionId && currentImage) {
          e.preventDefault()
          removeQuestion(currentImage.id, selectedQuestionId)
        }
      } else if (e.key === "+" || e.key === "=") {
        setZoom((z) => clamp(z + 0.2, 1, 4))
      } else if (e.key === "-") {
        setZoom((z) => clamp(z - 0.2, 1, 4))
      } else if (e.key === "0") {
        setZoom(1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [undo, redo, selectedQuestionId, currentImage, removeQuestion])

  const getRelative = useCallback((clientX: number, clientY: number) => {
    const img = imgRef.current
    if (!img) return { x: 0, y: 0 }
    const rect = img.getBoundingClientRect()
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top) / rect.height
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) }
  }, [])

  const onPointerDownMove = useCallback(
    (e: React.PointerEvent, q: Question) => {
      e.preventDefault()
      e.stopPropagation()
      selectQuestion(q.id)
      const start = getRelative(e.clientX, e.clientY)
      startClientRef.current = { x: e.clientX, y: e.clientY }
      movedRef.current = false
      gesturePushedRef.current = false
      setDragMode({ kind: "move", qid: q.id, startX: start.x, startY: start.y, origBBox: { ...q.bbox } })
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    },
    [getRelative, selectQuestion]
  )

  const onPointerDownResize = useCallback(
    (e: React.PointerEvent, q: Question, handle: ResizeHandle) => {
      e.preventDefault()
      e.stopPropagation()
      selectQuestion(q.id)
      const start = getRelative(e.clientX, e.clientY)
      startClientRef.current = { x: e.clientX, y: e.clientY }
      movedRef.current = false
      gesturePushedRef.current = false
      setDragMode({ kind: "resize", qid: q.id, handle, startX: start.x, startY: start.y, origBBox: { ...q.bbox } })
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    },
    [getRelative, selectQuestion]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      // 自由画框模式：拖拽空白处拉出新框
      if (drawStartRef.current) {
        const cur = getRelative(e.clientX, e.clientY)
        const s = drawStartRef.current
        setDrawBox({
          x: Math.min(s.x, cur.x),
          y: Math.min(s.y, cur.y),
          width: Math.abs(cur.x - s.x),
          height: Math.abs(cur.y - s.y),
        })
        return
      }
      if (!dragMode || !currentImage) return
      // 手势真正开始移动时只压入一次撤销快照；移动过程全部走实时更新，避免卡顿
      if (!gesturePushedRef.current) {
        const dist = Math.hypot(
          e.clientX - startClientRef.current.x,
          e.clientY - startClientRef.current.y
        )
        if (dist < 4) return
        pushHistory()
        gesturePushedRef.current = true
        movedRef.current = true
      }
      const cur = getRelative(e.clientX, e.clientY)
      const dx = cur.x - dragMode.startX
      const dy = cur.y - dragMode.startY
      const orig = dragMode.origBBox

      if (dragMode.kind === "move") {
        let nx = orig.x + dx
        let ny = orig.y + dy
        nx = clamp(nx, 0, 1 - orig.width)
        ny = clamp(ny, 0, 1 - orig.height)
        updateQuestionLive(currentImage.id, dragMode.qid, { bbox: sanitizeBBox({ ...orig, x: nx, y: ny }) })
        return
      }

      let { x, y, width, height } = orig
      const right = orig.x + orig.width
      const bottom = orig.y + orig.height
      const h = dragMode.handle
      if (h.includes("w")) {
        x = clamp(orig.x + dx, 0, right - 0.01)
        width = right - x
      }
      if (h.includes("e")) {
        width = clamp(orig.width + dx, 0.01, 1 - orig.x)
      }
      if (h.includes("n")) {
        y = clamp(orig.y + dy, 0, bottom - 0.01)
        height = bottom - y
      }
      if (h.includes("s")) {
        height = clamp(orig.height + dy, 0.01, 1 - orig.y)
      }
      updateQuestionLive(currentImage.id, dragMode.qid, { bbox: sanitizeBBox({ x, y, width, height }) })
    },
    [dragMode, getRelative, updateQuestionLive, currentImage, pushHistory]
  )

  const onPointerUp = useCallback(() => {
    // 结束自由画框：足够大则创建新题目框
    if (drawStartRef.current) {
      if (currentImage && drawBox && drawBox.width > 0.015 && drawBox.height > 0.012) {
        addQuestion(currentImage.id, {
          number: String(currentImage.questions.length + 1),
          content: "",
          bbox: sanitizeBBox(drawBox),
        })
      }
      drawStartRef.current = null
      setDrawBox(null)
      setDragMode(null)
      return
    }
    // 点击（未拖动）已批改的题目框 → 弹出批改解析
    if (dragMode && !movedRef.current && currentImage) {
      const q = currentImage.questions.find((x) => x.id === dragMode.qid)
      if (q?.grading) setGradingQid(q.id)
    }
    setDragMode(null)
  }, [drawBox, currentImage, addQuestion, dragMode])

  // AI 识别整张图
  const onDetectAI = useCallback(async () => {
    if (!currentImage) return
    setDetecting(currentImage.id, true)
    selectQuestion(null)
    try {
      const qs = await detectQuestions(currentImage, "ai", aiConfig)
      setQuestions(currentImage.id, qs, "ai")
      if (qs[0]) selectQuestion(qs[0].id)
      toast.success(`识别到 ${qs.length} 道题目`)
    } catch (e) {
      toast.error(`识别失败：${(e as Error).message}`)
      setDetecting(currentImage.id, false)
    }
  }, [currentImage, selectQuestion, setDetecting, setQuestions, aiConfig])

  // 离线识别
  const onDetectOffline = useCallback(async () => {
    if (!currentImage) return
    setDetecting(currentImage.id, true)
    selectQuestion(null)
    try {
      const qs = await detectQuestions(currentImage, "offline")
      setQuestions(currentImage.id, qs, "offline")
      if (qs[0]) selectQuestion(qs[0].id)
      toast.success(`离线识别到 ${qs.length} 道题目`)
    } catch (e) {
      toast.error(`离线识别失败：${(e as Error).message}`)
      setDetecting(currentImage.id, false)
    }
  }, [currentImage, selectQuestion, setDetecting, setQuestions])

  // AI 识别选中框内的题目文字（手动框 + AI 识别）
  const onOCRSelected = useCallback(async () => {
    if (!currentImage || !selectedQuestionId) return
    const q = currentImage.questions.find((x) => x.id === selectedQuestionId)
    if (!q) return
    setOcrLoading(true)
    try {
      const res = await ocrQuestion(currentImage, q.bbox, aiConfig)
      updateQuestion(currentImage.id, q.id, {
        number: res.number || q.number,
        content: res.content || q.content,
        kind: res.kind,
      })
      toast.success("已识别题目文字")
    } catch (e) {
      toast.error(`识别失败：${(e as Error).message}`)
    } finally {
      setOcrLoading(false)
    }
  }, [currentImage, selectedQuestionId, updateQuestion, aiConfig])

  const onAddBox = useCallback(() => {
    if (!currentImage) return
    const bbox = { x: 0.1, y: 0.4, width: 0.8, height: 0.15 }
    addQuestion(currentImage.id, {
      number: String(currentImage.questions.length + 1),
      content: "",
      bbox,
    })
  }, [currentImage, addQuestion])

  const onRemoveSelected = useCallback(() => {
    if (!currentImage || !selectedQuestionId) return
    removeQuestion(currentImage.id, selectedQuestionId)
  }, [currentImage, selectedQuestionId, removeQuestion])

  // 高清增强整张原图（对比度拉伸 + 锐化），生成新 dataUrl 替换
  const onEnhanceImage = useCallback(async () => {
    if (!currentImage || enhanceLoading) return
    setEnhanceLoading(true)
    try {
      const { enhanceFullImage } = await import("@/lib/image-utils")
      const result = await enhanceFullImage(currentImage.dataUrl)
      replaceImageData(currentImage.id, result)
      toast.success("已完成高清增强（自动色阶 + 锐化）")
    } catch (e) {
      toast.error(`增强失败：${(e as Error).message}`)
    } finally {
      setEnhanceLoading(false)
    }
  }, [currentImage, enhanceLoading, replaceImageData])

  // 旋转 90°：直接烘焙进图片像素，保证 AI 识别 / 批改 / 裁剪方向一致
  const onRotate = useCallback(async () => {
    if (!currentImage || rotating) return
    setRotating(true)
    try {
      const { rotateImage, fillAllQuestionImages } = await import("@/lib/image-utils")
      const fresh = useDetectorStore.getState().images.find((x) => x.id === currentImage.id) ?? currentImage
      const cur = ((fresh.adjustments.rotation % 360) + 360) % 360
      const baked = (cur + 90) % 360
      const result = await rotateImage(fresh.dataUrl, baked)
      replaceImageData(currentImage.id, result)
      setAdjustments(currentImage.id, { rotation: 0 })
      // 图片方向已变，重新裁剪配图
      if (fresh.questions.some((q) => q.images.length > 0)) {
        const after = useDetectorStore.getState().images.find((x) => x.id === currentImage.id)
        if (after) {
          const qs = await fillAllQuestionImages(after)
          setQuestions(currentImage.id, qs, after.detectMethod ?? "ai")
        }
      }
      toast.success("已旋转 90°（已写入图片，识别/裁剪方向一致）")
    } catch (e) {
      toast.error(`旋转失败：${(e as Error).message}`)
    } finally {
      setRotating(false)
    }
  }, [currentImage, rotating, replaceImageData, setAdjustments, setQuestions])

  // 本地快速去彩色笔迹（红/蓝笔批改、勾叉、手写答案），秒出、不伤印刷内容
  const onRemoveColoredMarks = useCallback(async () => {
    if (!currentImage || cleaning) return
    setCleaning(true)
    try {
      const { removeColoredMarksFromImage, fillAllQuestionImages } = await import("@/lib/image-utils")
      const result = await removeColoredMarksFromImage(currentImage)
      const changed = result.dataUrl !== currentImage.dataUrl
      replaceImageData(currentImage.id, result)
      if (currentImage.questions.some((q) => q.images.length > 0)) {
        const fresh = useDetectorStore.getState().images.find((x) => x.id === currentImage.id)
        if (fresh) {
          const qs = await fillAllQuestionImages(fresh)
          setQuestions(currentImage.id, qs, fresh.detectMethod ?? "ai")
        }
      }
      toast.success(changed ? "已去除彩色笔迹（红/蓝笔批改、手写答案）" : "未检测到明显的彩色笔迹")
    } catch (e) {
      toast.error(`去除彩色笔迹失败：${(e as Error).message}`)
    } finally {
      setCleaning(false)
    }
  }, [currentImage, cleaning, replaceImageData, setQuestions])

  // AI 去除手写：去除手写答案/批改痕迹，只保留印刷题目，题目框位置不变
  const onRemoveHandwriting = useCallback(async () => {
    if (!currentImage || cleaning) return
    setCleaning(true)
    toast.info("AI 正在去除手写痕迹，约需 10~40 秒…")
    try {
      const { removeHandwritingFromImage, fillAllQuestionImages } = await import("@/lib/image-utils")
      const result = await removeHandwritingFromImage(currentImage)
      replaceImageData(currentImage.id, result)
      resetAdjustments(currentImage.id) // 旋转/滤镜已烘焙进新图
      if (currentImage.questions.some((q) => q.images.length > 0)) {
        const fresh = useDetectorStore.getState().images.find((x) => x.id === currentImage.id)
        if (fresh) {
          const qs = await fillAllQuestionImages(fresh)
          setQuestions(currentImage.id, qs, fresh.detectMethod ?? "ai")
        }
      }
      toast.success("已去除手写痕迹，印刷题目已保护（差异兜底）")
    } catch (e) {
      toast.error(`去除手写失败：${(e as Error).message}`)
    } finally {
      setCleaning(false)
    }
  }, [currentImage, cleaning, replaceImageData, resetAdjustments, setQuestions])

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!currentImage) return
      const img = imgRef.current
      if (!img) return
      const rect = img.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      if (x < 0 || x > 1 || y < 0 || y > 1) return
      const bbox = sanitizeBBox({ x: x - 0.2, y: y - 0.05, width: 0.4, height: 0.1 })
      addQuestion(currentImage.id, {
        number: String(currentImage.questions.length + 1),
        content: "",
        bbox,
      })
    },
    [currentImage, addQuestion]
  )

  if (!currentImage) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 p-8">
        <ImageOff className="size-12 opacity-30" />
        <p className="text-sm">请先从左侧选择一张图片，或拍照 / 上传新图片</p>
      </div>
    )
  }

  const detecting = currentImage.detecting
  const adj = currentImage.adjustments
  const filter = `brightness(${adj.brightness}) contrast(${adj.contrast}) saturate(${adj.saturate})`
  // 被点击查看解析的题目
  const gradingQ = currentImage.questions.find((q) => q.id === gradingQid)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 工具栏 - 可滚动避免按钮被截断 */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b overflow-x-auto shrink-0">
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={undo} disabled={!canUndo} title="撤销 Ctrl+Z">
            <Undo2 className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={redo} disabled={!canRedo} title="重做 Ctrl+Y">
            <Redo2 className="size-4" />
          </Button>
        </div>
        <div className="h-4 w-px bg-border shrink-0" />
        <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={onAddBox} title="添加框">
          <Plus className="size-4" />
          <span className="ml-1">添加框</span>
        </Button>
        <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={onRemoveSelected} disabled={!selectedQuestionId || detecting} title="删除框">
          <Trash2 className="size-4" />
          <span className="ml-1">删除</span>
        </Button>
        {selectedQuestionId && (
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={onOCRSelected} disabled={ocrLoading || detecting} title="AI 识别该框内题目文字">
            {ocrLoading ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            <span className="ml-1">AI 识别</span>
          </Button>
        )}
        <div className="h-4 w-px bg-border shrink-0" />
        <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={onDetectOffline} disabled={detecting} title="离线算法识别">
          <Cpu className="size-4" />
          <span className="ml-1">离线</span>
        </Button>
        <Button size="sm" className="h-8 shrink-0 bg-rose-500 hover:bg-rose-600" onClick={onDetectAI} disabled={detecting}>
          {detecting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          <span className="ml-1">{detecting ? "识别中…" : "AI 识别"}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
              disabled={cleaning || detecting}
              title="去除手写答案/批改痕迹"
            >
              {cleaning ? <Loader2 className="size-4 animate-spin" /> : <Eraser className="size-4" />}
              <span className="ml-1">{cleaning ? "处理中…" : "去手写"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuItem onClick={onRemoveColoredMarks} className="py-2">
              <Zap className="size-4 mr-2 shrink-0 text-amber-500" />
              <div className="flex flex-col">
                <span className="text-sm">快速去彩色笔迹</span>
                <span className="text-[10px] text-muted-foreground">本地处理·秒出：红/蓝笔批改、勾叉、圈画、手写答案</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRemoveHandwriting} className="py-2">
              <Sparkles className="size-4 mr-2 shrink-0 text-rose-500" />
              <div className="flex flex-col">
                <span className="text-sm">AI 深度去手写</span>
                <span className="text-[10px] text-muted-foreground">10~40 秒：可去铅笔/黑色手写，适合复杂卷面</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="h-4 w-px bg-border shrink-0" />
        <ExportMenu currentImageOnly />
        <div className="h-4 w-px bg-border shrink-0 ml-auto" />
        <div className="flex items-center gap-0.5 shrink-0">
          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setZoom((z) => clamp(z - 0.2, 1, 4))} title="缩小 -">
            <ZoomOut className="size-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setZoom((z) => clamp(z + 0.2, 1, 4))} title="放大 +">
            <ZoomIn className="size-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setZoom(1)} title="重置 0">
            <Maximize2 className="size-3.5" />
          </Button>
        </div>
        <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2" onClick={onRotate} disabled={rotating} title="旋转 90°（直接写入图片）">
          {rotating ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
        </Button>
        <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2" onClick={() => setShowAdjust((v) => !v)} title="图像调整">
          <Sun className="size-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2" onClick={() => resetAdjustments(currentImage.id)} title="重置调整">
          <RefreshCw className="size-3.5" />
        </Button>
      </div>

      {/* 图像调整面板 */}
      {showAdjust && (
        <div className="px-4 py-2 border-b bg-muted/20 space-y-1.5 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs w-12 text-muted-foreground shrink-0">亮度</span>
            <Slider value={[adj.brightness]} min={0.5} max={1.5} step={0.05} onValueChange={([v]) => setAdjustments(currentImage.id, { brightness: v })} className="flex-1 max-w-md" />
            <span className="text-xs w-10 text-right tabular-nums shrink-0">{adj.brightness.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs w-12 text-muted-foreground shrink-0">对比度</span>
            <Slider value={[adj.contrast]} min={0.5} max={1.5} step={0.05} onValueChange={([v]) => setAdjustments(currentImage.id, { contrast: v })} className="flex-1 max-w-md" />
            <span className="text-xs w-10 text-right tabular-nums shrink-0">{adj.contrast.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs w-12 text-muted-foreground shrink-0">饱和度</span>
            <Slider value={[adj.saturate]} min={0} max={2} step={0.05} onValueChange={([v]) => setAdjustments(currentImage.id, { saturate: v })} className="flex-1 max-w-md" />
            <span className="text-xs w-10 text-right tabular-nums shrink-0">{adj.saturate.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t">
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={onEnhanceImage}
              disabled={enhanceLoading}
              title="对整张原图应用自动对比度拉伸 + 锐化，让文字更清晰"
            >
              {enhanceLoading ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Wand2 className="size-3.5 mr-1" />}
              高清增强（原图）
            </Button>
            <span className="text-[10px] text-muted-foreground">自动色阶 + 锐化，文字更清晰</span>
          </div>
        </div>
      )}

      {/* 画布 */}
      <div
        className="flex-1 min-h-0 overflow-auto relative bg-[repeating-conic-gradient(#f5f5f5_0%_25%,#e5e5e5_0%_50%)] dark:bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#222_0%_50%)] bg-[length:20px_20px] p-4"
        ref={wrapperRef}
      >
        <div
          className="relative inline-block select-none touch-none mx-auto"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top center",
            transition: "transform 0.1s ease-out",
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={onDoubleClick}
        >
          {/* 主图片 + 图层容器：旋转应用到容器，确保 img 和图层对齐 */}
          <div
            className="relative inline-block"
            style={{
              transform: `rotate(${adj.rotation}deg)`,
              transformOrigin: "center center",
              transition: "transform 0.2s ease-out",
            }}
          >
          {/* 主图片 */}
          <img
            ref={imgRef}
            src={currentImage.dataUrl}
            alt={currentImage.name}
            onLoad={updateSize}
            className="block max-w-full object-contain pointer-events-none"
            style={{
              filter,
              maxHeight: "calc(100dvh - 220px)",
              maxWidth: "100%",
            }}
            draggable={false}
          />
          {imgSize.w > 0 && imgSize.h > 0 && (
            <div
              className="absolute inset-0 touch-none"
              onPointerDown={(e) => {
                if (e.target !== e.currentTarget) return
                selectQuestion(null)
                // 在空白处按下：进入自由画框模式
                const start = getRelative(e.clientX, e.clientY)
                drawStartRef.current = start
                setDrawBox({ x: start.x, y: start.y, width: 0, height: 0 })
                ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
              }}
              style={{ width: imgSize.w, height: imgSize.h }}
            >
              {currentImage.questions.map((q) => {
                const isSel = q.id === selectedQuestionId
                const left = q.bbox.x * imgSize.w
                const top = q.bbox.y * imgSize.h
                const w = q.bbox.width * imgSize.w
                const h = q.bbox.height * imgSize.h
                // 颜色优先级：选中 > 批改结果 > 题目类型
                // 批改错题红色、部分正确橙色、正确绿色；未批改时按类型：阅读材料蓝、阅读题紫、普通绿
                const gradingCorrect = q.grading?.correct
                const baseColorCls =
                  gradingCorrect === false
                    ? "border-red-600 bg-red-500/15"
                    : gradingCorrect === "partial"
                    ? "border-amber-500 bg-amber-500/15"
                    : gradingCorrect === true
                    ? "border-emerald-600 bg-emerald-500/15"
                    : q.kind === "passage"
                    ? "border-blue-500 bg-blue-500/10"
                    : q.kind === "passage_question"
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-emerald-500 bg-emerald-500/10 hover:border-emerald-600"
                const selColor =
                  gradingCorrect === false
                    ? "border-red-700 bg-red-500/25"
                    : gradingCorrect === "partial"
                    ? "border-amber-600 bg-amber-500/25"
                    : gradingCorrect === true
                    ? "border-emerald-700 bg-emerald-500/25"
                    : q.kind === "passage"
                    ? "border-blue-600 bg-blue-500/20"
                    : q.kind === "passage_question"
                    ? "border-purple-600 bg-purple-500/20"
                    : "border-rose-500 bg-rose-500/10"
                const labelBg =
                  gradingCorrect === false
                    ? "bg-red-600"
                    : gradingCorrect === "partial"
                    ? "bg-amber-500"
                    : gradingCorrect === true
                    ? "bg-emerald-600"
                    : q.kind === "passage"
                    ? "bg-blue-500"
                    : q.kind === "passage_question"
                    ? "bg-purple-500"
                    : isSel
                    ? "bg-rose-500"
                    : "bg-emerald-500"
                return (
                  <div
                    key={q.id}
                    onPointerDown={(e) => onPointerDownMove(e, q)}
                    onClick={(e) => {
                      e.stopPropagation()
                      selectQuestion(q.id)
                    }}
                    className={cn(
                      "absolute cursor-move border-2 transition-colors",
                      isSel ? selColor : baseColorCls,
                      isSel && "z-10"
                    )}
                    style={{ left, top, width: w, height: h }}
                  >
                    <div
                      className={cn(
                        "absolute -top-5 left-0 text-xs px-1.5 py-0.5 rounded-t-md font-medium whitespace-nowrap text-white",
                        labelBg
                      )}
                    >
                      {q.kind === "passage"
                        ? "阅读材料"
                        : q.kind === "passage_question"
                        ? `第 ${q.number} 题`
                        : q.number
                        ? `第 ${q.number} 题`
                        : "未编号"}
                      {q.crossPage && <span className="ml-1 opacity-80">·跨页</span>}
                      {q.images.length > 0 && <span className="ml-1 opacity-80">·{q.images.length}图</span>}
                      {q.grading && (
                        <span className="ml-1 opacity-80">
                          ·{q.grading.correct === true ? "✓" : q.grading.correct === "partial" ? "△" : "✗"}
                        </span>
                      )}
                    </div>
                    {isSel &&
                      HANDLES.map((hh) => (
                        <span
                          key={hh}
                          onPointerDown={(e) => onPointerDownResize(e, q, hh)}
                          className={cn(
                            "absolute bg-white border-2 border-rose-500 rounded-sm",
                            "size-2.5 -m-1.5 hover:bg-rose-100",
                            handleCursor(hh)
                          )}
                          style={{ ...handlePos(hh) }}
                        />
                      ))}
                  </div>
                )
              })}
              {/* 自由画框预览 */}
              {drawBox && (
                <div
                  className="absolute border-2 border-dashed border-rose-500 bg-rose-500/10 pointer-events-none z-20 flex items-end justify-end"
                  style={{
                    left: drawBox.x * imgSize.w,
                    top: drawBox.y * imgSize.h,
                    width: drawBox.width * imgSize.w,
                    height: drawBox.height * imgSize.h,
                  }}
                >
                  <span className="text-[10px] bg-rose-500 text-white px-1 rounded-tl">松开创建框</span>
                </div>
              )}
              {detecting && (
                <div className="absolute inset-0 bg-white/60 dark:bg-black/60 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2 text-foreground">
                    <Loader2 className="size-8 animate-spin" />
                    <p className="text-sm">正在识别题目…</p>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>{/* 旋转容器结束 */}
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="border-t px-3 py-1 text-xs text-muted-foreground flex items-center gap-2 shrink-0 overflow-x-auto">
        <span className="shrink-0 truncate max-w-[40%]">{currentImage.name}</span>
        <span className="shrink-0">·</span>
        <span className="shrink-0">{currentImage.width}×{currentImage.height}</span>
        {currentImage.detectMethod && (
          <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-muted">
            {currentImage.detectMethod === "ai" ? "AI 识别" : "离线识别"}
          </span>
        )}
        {currentImage.questions.length > 0 && (
          <span className="shrink-0">{currentImage.questions.length} 道题</span>
        )}
        <span className="shrink-0 ml-auto text-muted-foreground/60 hidden sm:inline">拖拽空白处自由画框 · 点已批改的框看解析</span>
      </div>

      {/* 去手写处理中遮罩 */}
      {cleaning && (
        <div className="absolute inset-0 z-30 bg-white/70 dark:bg-black/70 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-foreground">
            <Loader2 className="size-8 animate-spin" />
            <p className="text-sm font-medium">AI 去除手写中…</p>
            <p className="text-xs text-muted-foreground">通常需要 10~40 秒，请稍候</p>
          </div>
        </div>
      )}

      {/* 点击已批改题目框 → 查看解析 */}
      <Dialog open={!!gradingQ} onOpenChange={(o) => { if (!o) setGradingQid(null) }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>第 {gradingQ?.number || "?"} 题 · 批改结果</DialogTitle>
          </DialogHeader>
          {gradingQ?.grading && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {gradingQ.grading.correct === true && (
                  <Badge className="bg-emerald-500 hover:bg-emerald-500">✓ 正确</Badge>
                )}
                {gradingQ.grading.correct === "partial" && (
                  <Badge className="bg-amber-500 hover:bg-amber-500">△ 部分正确</Badge>
                )}
                {gradingQ.grading.correct === false && (
                  <Badge className="bg-rose-500 hover:bg-rose-500">✗ 错误</Badge>
                )}
                {typeof gradingQ.grading.score === "number" && (
                  <Badge variant="outline">得分 {gradingQ.grading.score}</Badge>
                )}
              </div>
              {gradingQ.grading.correctAnswer && (
                <div className="text-sm">
                  <span className="text-muted-foreground">正确答案：</span>
                  <span className="font-medium">{gradingQ.grading.correctAnswer}</span>
                </div>
              )}
              {gradingQ.grading.knowledgePoints && gradingQ.grading.knowledgePoints.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {gradingQ.grading.knowledgePoints.map((k, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">{k}</Badge>
                  ))}
                </div>
              )}
              <div className="border-t pt-2">
                <div className="text-xs text-muted-foreground mb-1">详细解析</div>
                <Markdown>{gradingQ.grading.explanation || "（无解析）"}</Markdown>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function handlePos(h: ResizeHandle): React.CSSProperties {
  const pos: Record<ResizeHandle, React.CSSProperties> = {
    nw: { left: 0, top: 0 },
    n: { left: "50%", top: 0, transform: "translateX(-50%)" },
    ne: { right: 0, top: 0 },
    e: { right: 0, top: "50%", transform: "translateY(-50%)" },
    se: { right: 0, bottom: 0 },
    s: { left: "50%", bottom: 0, transform: "translateX(-50%)" },
    sw: { left: 0, bottom: 0 },
    w: { left: 0, top: "50%", transform: "translateY(-50%)" },
  }
  return pos[h]
}

function handleCursor(h: ResizeHandle): string {
  const map: Record<ResizeHandle, string> = {
    nw: "cursor-nwse-resize",
    se: "cursor-nwse-resize",
    ne: "cursor-nesw-resize",
    sw: "cursor-nesw-resize",
    n: "cursor-ns-resize",
    s: "cursor-ns-resize",
    e: "cursor-ew-resize",
    w: "cursor-ew-resize",
  }
  return map[h]
}
