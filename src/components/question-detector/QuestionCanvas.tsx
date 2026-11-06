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
} from "lucide-react"
import { toast } from "sonner"
import { useDetectorStore, sanitizeBBox } from "@/lib/store"
import { detectQuestions, ocrQuestion } from "@/lib/detect-service"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn, clamp } from "@/lib/utils"
import type { Question } from "@/lib/types"

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

  // ResizeObserver 监听容器尺寸变化
  useEffect(() => {
    if (!wrapperRef.current) return
    const ro = new ResizeObserver(() => {
      if (imgRef.current) {
        setImgSize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight })
      }
    })
    ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [])

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
      setDragMode({ kind: "resize", qid: q.id, handle, startX: start.x, startY: start.y, origBBox: { ...q.bbox } })
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    },
    [getRelative, selectQuestion]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragMode || !currentImage) return
      const cur = getRelative(e.clientX, e.clientY)
      const dx = cur.x - dragMode.startX
      const dy = cur.y - dragMode.startY
      const orig = dragMode.origBBox

      if (dragMode.kind === "move") {
        let nx = orig.x + dx
        let ny = orig.y + dy
        nx = clamp(nx, 0, 1 - orig.width)
        ny = clamp(ny, 0, 1 - orig.height)
        updateQuestion(currentImage.id, dragMode.qid, { bbox: sanitizeBBox({ ...orig, x: nx, y: ny }) })
        return
      }

      let { x, y, width, height } = orig
      const right = orig.x + orig.width
      const bottom = orig.y + orig.height
      const h = dragMode.handle
      if (h.includes("w")) {
        x = clamp(orig.x + dx, 0, right - 0.02)
        width = right - x
      }
      if (h.includes("e")) {
        width = clamp(orig.width + dx, 0.02, 1 - orig.x)
      }
      if (h.includes("n")) {
        y = clamp(orig.y + dy, 0, bottom - 0.02)
        height = bottom - y
      }
      if (h.includes("s")) {
        height = clamp(orig.height + dy, 0.02, 1 - orig.y)
      }
      updateQuestion(currentImage.id, dragMode.qid, { bbox: sanitizeBBox({ x, y, width, height }) })
    },
    [dragMode, getRelative, updateQuestion, currentImage]
  )

  const onPointerUp = useCallback(() => {
    setDragMode(null)
  }, [])

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
        <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={onAddBox} disabled={detecting} title="添加框">
          <Plus className="size-4" />
          <span className="hidden md:ml-1 md:inline">添加框</span>
        </Button>
        <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={onRemoveSelected} disabled={!selectedQuestionId || detecting} title="删除框">
          <Trash2 className="size-4" />
          <span className="hidden md:ml-1 md:inline">删除</span>
        </Button>
        {selectedQuestionId && (
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={onOCRSelected} disabled={ocrLoading || detecting} title="AI 识别该框内题目文字">
            {ocrLoading ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            <span className="hidden md:ml-1 md:inline">AI 识别</span>
          </Button>
        )}
        <div className="h-4 w-px bg-border shrink-0" />
        <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={onDetectOffline} disabled={detecting} title="离线算法识别">
          <Cpu className="size-4" />
          <span className="hidden md:ml-1 md:inline">离线</span>
        </Button>
        <Button size="sm" className="h-8 shrink-0 bg-rose-500 hover:bg-rose-600" onClick={onDetectAI} disabled={detecting}>
          {detecting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          <span className="ml-1">{detecting ? "识别中…" : "AI 识别"}</span>
        </Button>
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
        <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2" onClick={() => {
          const cur = useDetectorStore.getState().images.find((x) => x.id === currentImage.id)
          const r = cur?.adjustments.rotation ?? 0
          setAdjustments(currentImage.id, { rotation: (r + 90) % 360 })
        }} title="旋转 90°">
          <RotateCw className="size-3.5" />
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
        </div>
      )}

      {/* 画布 */}
      <div
        className="flex-1 min-h-0 overflow-auto bg-[repeating-conic-gradient(#f5f5f5_0%_25%,#e5e5e5_0%_50%)] dark:bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#222_0%_50%)] bg-[length:20px_20px] p-4"
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
          {/* 主图片 */}
          <img
            ref={imgRef}
            src={currentImage.dataUrl}
            alt={currentImage.name}
            onLoad={updateSize}
            className="block max-w-full object-contain pointer-events-none"
            style={{
              filter,
              transform: `rotate(${adj.rotation}deg)`,
              maxHeight: "calc(100dvh - 220px)",
              maxWidth: "100%",
            }}
            draggable={false}
          />
          {imgSize.w > 0 && imgSize.h > 0 && (
            <div
              className="absolute inset-0"
              onClick={(e) => {
                if (e.target === e.currentTarget) selectQuestion(null)
              }}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) selectQuestion(null)
              }}
              style={{ width: imgSize.w, height: imgSize.h }}
            >
              {currentImage.questions.map((q) => {
                const isSel = q.id === selectedQuestionId
                const left = q.bbox.x * imgSize.w
                const top = q.bbox.y * imgSize.h
                const w = q.bbox.width * imgSize.w
                const h = q.bbox.height * imgSize.h
                // 阅读理解文章用蓝色，阅读理解题目用紫色，普通用绿色
                const colorCls = q.kind === "passage"
                  ? "border-blue-500 bg-blue-500/10"
                  : q.kind === "passage_question"
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-emerald-500 bg-emerald-500/10 hover:border-emerald-600"
                const selColor = q.kind === "passage"
                  ? "border-blue-600 bg-blue-500/20"
                  : q.kind === "passage_question"
                  ? "border-purple-600 bg-purple-500/20"
                  : "border-rose-500 bg-rose-500/10"
                const labelBg = q.kind === "passage"
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
                      isSel ? selColor : colorCls,
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
      </div>
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
