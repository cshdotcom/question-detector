"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Plus, Sparkles, Loader2, Trash2, ImageOff } from "lucide-react"
import { toast } from "sonner"
import { useDetectorStore, sanitizeBBox } from "@/lib/store"
import { Button } from "@/components/ui/button"
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
  const setDetected = useDetectorStore((s) => s.setDetected)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgSize, setImgSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [dragMode, setDragMode] = useState<DragMode>(null)

  // 计算 img 在 wrapper 内的实际显示区域（保持 aspect ratio，object-contain）
  // 这里我们直接用 <img> 自然尺寸即可，因为 wrapper 是 flex center，img 是 max-w-full max-h-full
  const updateSize = useCallback(() => {
    if (imgRef.current) {
      setImgSize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight })
    }
  }, [])

  useEffect(() => {
    updateSize()
    const onResize = () => updateSize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [updateSize])

  // 把鼠标事件坐标（基于 img 左上角）转为相对坐标
  const getRelative = useCallback(
    (clientX: number, clientY: number) => {
      const img = imgRef.current
      if (!img) return { x: 0, y: 0 }
      const rect = img.getBoundingClientRect()
      const x = (clientX - rect.left) / rect.width
      const y = (clientY - rect.top) / rect.height
      return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) }
    },
    []
  )

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
      if (!dragMode) return
      const cur = getRelative(e.clientX, e.clientY)
      const dx = cur.x - dragMode.startX
      const dy = cur.y - dragMode.startY
      const orig = dragMode.origBBox

      if (dragMode.kind === "move") {
        let nx = orig.x + dx
        let ny = orig.y + dy
        // 限制在 0~1 内
        nx = clamp(nx, 0, 1 - orig.width)
        ny = clamp(ny, 0, 1 - orig.height)
        updateQuestion(currentImage!.id, dragMode.qid, { bbox: sanitizeBBox({ ...orig, x: nx, y: ny }) })
        return
      }

      // resize: 根据方向修改 x/y/width/height
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
      updateQuestion(currentImage!.id, dragMode.qid, { bbox: sanitizeBBox({ x, y, width, height }) })
    },
    [dragMode, getRelative, updateQuestion, currentImage]
  )

  const onPointerUp = useCallback(() => {
    setDragMode(null)
  }, [])

  // 自动检测
  const onDetect = useCallback(async () => {
    if (!currentImage) return
    setDetecting(currentImage.id, true)
    selectQuestion(null)
    try {
      const resp = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: currentImage.dataUrl }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`)
      }
      const list = (data.questions ?? []) as {
        number: string
        content: string
        bbox: { x: number; y: number; width: number; height: number }
      }[]
      if (list.length === 0) {
        toast.info("未识别到题目，可手动添加框")
        setDetected(currentImage.id, true)
        return
      }
      const newQs: Question[] = list.map((q, i) => ({
        id: `q_${currentImage.id}_${Date.now()}_${i}`,
        number: q.number || String(i + 1),
        content: q.content || "",
        bbox: sanitizeBBox(q.bbox),
      }))
      setQuestions(currentImage.id, newQs)
      if (newQs[0]) selectQuestion(newQs[0].id)
      toast.success(`识别到 ${newQs.length} 道题目`)
    } catch (e) {
      const err = e as Error
      toast.error(`识别失败：${err.message}`)
      setDetecting(currentImage.id, false)
    }
  }, [currentImage, selectQuestion, setDetecting, setDetected, setQuestions])

  // 添加新框
  const onAddBox = useCallback(() => {
    if (!currentImage) return
    // 在中央放一个默认框
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

  // 点击空白处取消选择
  const onWrapperClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) selectQuestion(null)
    },
    [selectQuestion]
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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b flex-wrap">
        <div className="text-xs text-muted-foreground truncate max-w-[40%]">
          {currentImage.name} · {currentImage.width}×{currentImage.height}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onAddBox}
            disabled={detecting}
            title="手动添加一个题目框"
          >
            <Plus className="size-4 mr-1" /> 添加框
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRemoveSelected}
            disabled={!selectedQuestionId || detecting}
            title="删除当前选中的题目框"
          >
            <Trash2 className="size-4 mr-1" /> 删除框
          </Button>
          <Button size="sm" onClick={onDetect} disabled={detecting}>
            {detecting ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Sparkles className="size-4 mr-1" />}
            {detecting ? "识别中…" : "自动识别"}
          </Button>
        </div>
      </div>

      {/* 画布 */}
      <div className="flex-1 min-h-0 overflow-auto bg-[repeating-conic-gradient(#f5f5f5_0%_25%,#e5e5e5_0%_50%)] dark:bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#222_0%_50%)] bg-[length:20px_20px] p-4 flex items-center justify-center">
        <div
          ref={wrapperRef}
          className="relative inline-block select-none touch-none"
          style={{ maxWidth: "100%", maxHeight: "100%" }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* 主图片 */}
          <img
            ref={imgRef}
            src={currentImage.dataUrl}
            alt={currentImage.name}
            onLoad={updateSize}
            className="block max-w-full max-h-full object-contain pointer-events-none"
            style={{ maxHeight: "calc(100vh - 220px)" }}
            draggable={false}
          />
          {imgSize.w > 0 && imgSize.h > 0 && (
            <div
              className="absolute inset-0"
              onClick={onWrapperClick}
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
                      isSel
                        ? "border-rose-500 bg-rose-500/10 z-10"
                        : "border-emerald-500 bg-emerald-500/10 hover:border-emerald-600"
                    )}
                    style={{ left, top, width: w, height: h }}
                  >
                    {/* 题号标签 */}
                    <div
                      className={cn(
                        "absolute -top-5 left-0 text-xs px-1.5 py-0.5 rounded-t-md font-medium whitespace-nowrap",
                        isSel ? "bg-rose-500 text-white" : "bg-emerald-500 text-white"
                      )}
                    >
                      {q.number ? `第 ${q.number} 题` : "未编号"}
                    </div>
                    {/* 缩放手柄 */}
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
