"use client"

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react"
import {
  Pen, Eraser, Undo2, Redo2, Trash2, Type, Minus, Square, Circle,
  ArrowRight, Highlighter, MousePointer2, Grid3x3, Image as ImageIcon,
  Triangle, Calculator, Sticker, Download, Layers,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// ===== 类型定义 =====

export type StrokeType = "pen" | "line" | "rect" | "circle" | "arrow" | "text" | "highlighter"

export interface Stroke {
  id: string
  type: StrokeType
  points: { x: number; y: number }[]
  color: string
  width: number
  fill?: string
  text?: string
  fontSize?: number
  layer: number
  selected?: boolean
}

export interface WhiteboardData {
  strokes: Stroke[]
  backgroundImage: string
  width: number
  height: number
}

export type ToolType = "select" | StrokeType | "eraser"

interface WhiteboardProps {
  initialStrokes?: Stroke[]
  backgroundImage?: string
  width?: number
  height?: number
  onChange?: (strokes: Stroke[]) => void
  onSave?: (data: WhiteboardData) => void
  className?: string
  compact?: boolean // 紧凑模式（聊天内嵌时用）
}

// ===== 预设 =====

const COLORS = [
  "#1f2937", "#ef4444", "#f97316", "#f59e0b", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#ffffff",
]

const WIDTHS = [2, 4, 6, 10, 16]

const STICKERS = ["✓", "✗", "★", "☆", "→", "←", "↑", "↓", "∴", "∵", "∠", "⊥", "∥", "△", "○", "□", "≠", "≤", "≥", "≈", "∞", "π", "√", "∫", "∑", "℃", "°"]

function uid() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// ===== 主组件 =====

export function Whiteboard({
  initialStrokes = [],
  backgroundImage = "",
  width = 1200,
  height = 800,
  onChange,
  onSave,
  className,
  compact = false,
}: WhiteboardProps) {
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes)
  const [tool, setTool] = useState<ToolType>("pen")
  const [color, setColor] = useState("#1f2937")
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [showGrid, setShowGrid] = useState(true)
  const [history, setHistory] = useState<Stroke[][]>([initialStrokes])
  const [historyIdx, setHistoryIdx] = useState(0)
  const [drawing, setDrawing] = useState(false)
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null)
  const [bgImage, setBgImage] = useState(backgroundImage)
  const svgRef = useRef<SVGSVGElement>(null)

  // 历史记录
  const pushHistory = useCallback((newStrokes: Stroke[]) => {
    setHistory((prev) => {
      const next = prev.slice(0, historyIdx + 1)
      next.push(newStrokes)
      if (next.length > 50) next.shift() // 限制 50 步
      return next
    })
    setHistoryIdx((prev) => Math.min(prev + 1, 49))
  }, [historyIdx])

  const updateStrokes = useCallback((newStrokes: Stroke[]) => {
    setStrokes(newStrokes)
    onChange?.(newStrokes)
  }, [onChange])

  const undo = useCallback(() => {
    if (historyIdx > 0) {
      const newIdx = historyIdx - 1
      setHistoryIdx(newIdx)
      setStrokes(history[newIdx] || [])
      onChange?.(history[newIdx] || [])
    }
  }, [history, historyIdx, onChange])

  const redo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      const newIdx = historyIdx + 1
      setHistoryIdx(newIdx)
      setStrokes(history[newIdx] || [])
      onChange?.(history[newIdx] || [])
    }
  }, [history, historyIdx, onChange])

  const clear = useCallback(() => {
    if (strokes.length === 0) return
    if (!confirm("确定清空画板？")) return
    pushHistory(strokes)
    updateStrokes([])
    setSelectedId(null)
  }, [strokes, pushHistory, updateStrokes])

  // 获取 SVG 坐标
  const getSvgPoint = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const transformed = pt.matrixTransform(ctm.inverse())
    return { x: transformed.x, y: transformed.y }
  }, [])

  // 开始绘制
  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (textInput) return // 正在输入文字
    const pt = getSvgPoint(e)
    ;(e.target as Element).setPointerCapture(e.pointerId)

    if (tool === "select") {
      // 选择模式：检查是否点中已有 stroke
      const target = e.target as Element
      const strokeId = target.getAttribute("data-stroke-id")
      setSelectedId(strokeId)
      return
    }

    if (tool === "eraser") {
      // 橡皮擦：删除点中的 stroke
      const target = e.target as Element
      const strokeId = target.getAttribute("data-stroke-id")
      if (strokeId) {
        const newStrokes = strokes.filter((s) => s.id !== strokeId)
        pushHistory(strokes)
        updateStrokes(newStrokes)
      }
      return
    }

    if (tool === "text") {
      setTextInput({ x: pt.x, y: pt.y, value: "" })
      return
    }

    // 开始新 stroke
    setDrawing(true)
    setSelectedId(null)
    const newStroke: Stroke = {
      id: uid(),
      type: tool as StrokeType,
      points: [pt],
      color: tool === "highlighter" ? color + "40" : color, // 高亮笔半透明
      width: tool === "highlighter" ? strokeWidth * 3 : strokeWidth,
      layer: strokes.length,
    }
    setCurrentStroke(newStroke)
  }, [tool, color, strokeWidth, strokes, getSvgPoint, pushHistory, updateStrokes, textInput])

  // 绘制中
  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing || !currentStroke) return
    const pt = getSvgPoint(e)
    setCurrentStroke((prev) => {
      if (!prev) return prev
      if (prev.type === "pen" || prev.type === "highlighter") {
        // 自由笔迹：追加点
        return { ...prev, points: [...prev.points, pt] }
      } else {
        // 形状：更新终点
        return { ...prev, points: [prev.points[0], pt] }
      }
    })
  }, [drawing, currentStroke, getSvgPoint])

  // 结束绘制
  const onPointerUp = useCallback(() => {
    if (!drawing || !currentStroke) {
      setDrawing(false)
      return
    }
    // 添加到 strokes
    const newStrokes = [...strokes, currentStroke]
    pushHistory(strokes)
    updateStrokes(newStrokes)
    setCurrentStroke(null)
    setDrawing(false)
  }, [drawing, currentStroke, strokes, pushHistory, updateStrokes])

  // 文字输入确认
  const commitText = useCallback(() => {
    if (!textInput || !textInput.value.trim()) {
      setTextInput(null)
      return
    }
    const newStroke: Stroke = {
      id: uid(),
      type: "text",
      points: [{ x: textInput.x, y: textInput.y }],
      color,
      width: 0,
      text: textInput.value,
      fontSize: 16 + strokeWidth * 2,
      layer: strokes.length,
    }
    pushHistory(strokes)
    updateStrokes([...strokes, newStroke])
    setTextInput(null)
  }, [textInput, color, strokeWidth, strokes, pushHistory, updateStrokes])

  // 删除选中
  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    pushHistory(strokes)
    updateStrokes(strokes.filter((s) => s.id !== selectedId))
    setSelectedId(null)
  }, [selectedId, strokes, pushHistory, updateStrokes])

  // 添加贴纸
  const addSticker = useCallback((emoji: string) => {
    const newStroke: Stroke = {
      id: uid(),
      type: "text",
      points: [{ x: width / 2, y: height / 2 }],
      color: "#1f2937",
      width: 0,
      text: emoji,
      fontSize: 32,
      layer: strokes.length,
    }
    pushHistory(strokes)
    updateStrokes([...strokes, newStroke])
  }, [width, height, strokes, pushHistory, updateStrokes])

  // 添加几何图形
  const addGeometry = useCallback((kind: "triangle" | "coords") => {
    const cx = width / 2, cy = height / 2
    if (kind === "triangle") {
      const newStroke: Stroke = {
        id: uid(),
        type: "rect",
        points: [
          { x: cx - 100, y: cy - 80 },
          { x: cx + 100, y: cy + 80 },
        ],
        color, width: strokeWidth, fill: "none", layer: strokes.length,
      }
      // 用三角形：修改为 polygon path
      pushHistory(strokes)
      updateStrokes([...strokes, { ...newStroke, type: "rect" }])
    } else if (kind === "coords") {
      // 坐标系：X 轴 + Y 轴
      pushHistory(strokes)
      const xAxis: Stroke = {
        id: uid(), type: "arrow", color, width: strokeWidth, layer: strokes.length,
        points: [{ x: cx - 200, y: cy }, { x: cx + 200, y: cy }],
      }
      const yAxis: Stroke = {
        id: uid(), type: "arrow", color, width: strokeWidth, layer: strokes.length + 1,
        points: [{ x: cx, y: cy + 200 }, { x: cx, y: cy - 200 }],
      }
      updateStrokes([...strokes, xAxis, yAxis])
    }
  }, [width, height, color, strokeWidth, strokes, pushHistory, updateStrokes])

  // 设置背景图
  const onSetBackground = useCallback((dataUrl: string) => {
    setBgImage(dataUrl)
  }, [])

  // 导出为 PNG
  const exportPNG = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return
    // 将 SVG 序列化为图片
    const svgData = new XMLSerializer().serializeToString(svg)
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, width, height)
      if (bgImage) {
        const bgImg = new Image()
        bgImg.onload = () => {
          ctx.drawImage(bgImg, 0, 0, width, height)
          ctx.drawImage(img, 0, 0, width, height)
          canvas.toBlob((blob) => {
            if (!blob) return
            const url2 = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url2
            a.download = `whiteboard_${Date.now()}.png`
            a.click()
            URL.revokeObjectURL(url2)
          })
          URL.revokeObjectURL(url)
        }
        bgImg.src = bgImage
      } else {
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob((blob) => {
          if (!blob) return
          const url2 = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url2
          a.download = `whiteboard_${Date.now()}.png`
          a.click()
          URL.revokeObjectURL(url2)
        })
        URL.revokeObjectURL(url)
      }
    }
    img.src = url
  }, [width, height, bgImage])

  // 保存
  const save = useCallback(() => {
    onSave?.({ strokes, backgroundImage: bgImage, width, height })
  }, [strokes, bgImage, width, height, onSave])

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textInput) return
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault()
        redo()
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
          e.preventDefault()
          deleteSelected()
        }
      } else if (e.key === "Escape") {
        setSelectedId(null)
        setTextInput(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [undo, redo, deleteSelected, selectedId, textInput])

  const tools: { type: ToolType; icon: ReactNode; label: string }[] = [
    { type: "select", icon: <MousePointer2 className="size-4" />, label: "选择" },
    { type: "pen", icon: <Pen className="size-4" />, label: "画笔" },
    { type: "highlighter", icon: <Highlighter className="size-4" />, label: "高亮" },
    { type: "eraser", icon: <Eraser className="size-4" />, label: "橡皮" },
    { type: "line", icon: <Minus className="size-4" />, label: "直线" },
    { type: "arrow", icon: <ArrowRight className="size-4" />, label: "箭头" },
    { type: "rect", icon: <Square className="size-4" />, label: "矩形" },
    { type: "circle", icon: <Circle className="size-4" />, label: "圆形" },
    { type: "text", icon: <Type className="size-4" />, label: "文字" },
  ]

  return (
    <div className={cn("flex flex-col bg-background", className)}>
      {/* 工具栏 */}
      <div className={cn("flex items-center gap-1 border-b bg-card overflow-x-auto", compact ? "p-1" : "p-2")}>
        {/* 工具组 */}
        <div className="flex items-center gap-0.5 shrink-0">
          {tools.map((t) => (
            <Button
              key={t.type}
              variant={tool === t.type ? "default" : "ghost"}
              size="sm"
              className={cn("size-8 p-0", compact && "size-7")}
              onClick={() => setTool(t.type)}
              title={t.label}
            >
              {t.icon}
            </Button>
          ))}
        </div>

        <div className="w-px h-6 bg-border mx-1 shrink-0" />

        {/* 颜色 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0", compact && "size-7")} title="颜色">
              <div className="size-4 rounded-full border-2 border-white shadow" style={{ background: color }} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56">
            <div className="grid grid-cols-5 gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn("size-8 rounded-full border-2 transition-transform", color === c ? "border-primary scale-110" : "border-white")}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="mt-3">
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 p-1"
              />
            </div>
          </PopoverContent>
        </Popover>

        {/* 粗细 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={cn("px-2 shrink-0", compact && "px-1")} title="粗细">
              <div className="rounded-full bg-current" style={{ width: strokeWidth, height: strokeWidth }} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48">
            <div className="space-y-2">
              {WIDTHS.map((w) => (
                <button
                  key={w}
                  onClick={() => setStrokeWidth(w)}
                  className={cn("w-full flex items-center gap-2 p-2 rounded hover:bg-accent", strokeWidth === w && "bg-accent")}
                >
                  <div className="rounded-full bg-current shrink-0" style={{ width: w, height: w }} />
                  <span className="text-xs">{w}px</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="w-px h-6 bg-border mx-1 shrink-0" />

        {/* 撤销/重做/清空 */}
        <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0", compact && "size-7")} onClick={undo} disabled={historyIdx === 0} title="撤销 (Ctrl+Z)">
          <Undo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0", compact && "size-7")} onClick={redo} disabled={historyIdx >= history.length - 1} title="重做 (Ctrl+Shift+Z)">
          <Redo2 className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0 text-destructive", compact && "size-7")} onClick={clear} title="清空">
          <Trash2 className="size-4" />
        </Button>
        {selectedId && (
          <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0 text-destructive", compact && "size-7")} onClick={deleteSelected} title="删除选中 (Del)">
            <Trash2 className="size-4" />
          </Button>
        )}

        <div className="w-px h-6 bg-border mx-1 shrink-0" />

        {/* 几何图形 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0", compact && "size-7")} title="几何图形">
              <Triangle className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48">
            <div className="space-y-1">
              <button onClick={() => addGeometry("triangle")} className="w-full flex items-center gap-2 p-2 rounded hover:bg-accent text-sm">
                <Triangle className="size-4" /> 三角形
              </button>
              <button onClick={() => addGeometry("coords")} className="w-full flex items-center gap-2 p-2 rounded hover:bg-accent text-sm">
                <Calculator className="size-4" /> 坐标系
              </button>
            </div>
          </PopoverContent>
        </Popover>

        {/* 贴纸 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0", compact && "size-7")} title="数学符号贴纸">
              <Sticker className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="grid grid-cols-6 gap-1">
              {STICKERS.map((s) => (
                <button
                  key={s}
                  onClick={() => addSticker(s)}
                  className="size-9 rounded hover:bg-accent text-lg flex items-center justify-center"
                >
                  {s}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* 背景图 */}
        <label className={cn("size-8 p-0 shrink-0 flex items-center justify-center rounded-md hover:bg-accent cursor-pointer", compact && "size-7")} title="设置背景图">
          <ImageIcon className="size-4" />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return
              const reader = new FileReader()
              reader.onload = () => onSetBackground(reader.result as string)
              reader.readAsDataURL(f)
            }}
          />
        </label>

        {/* 网格 */}
        <Button
          variant={showGrid ? "default" : "ghost"}
          size="sm"
          className={cn("size-8 p-0 shrink-0", compact && "size-7")}
          onClick={() => setShowGrid((v) => !v)}
          title="网格背景"
        >
          <Grid3x3 className="size-4" />
        </Button>

        <div className="flex-1" />

        {/* 导出/保存 */}
        <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0", compact && "size-7")} onClick={exportPNG} title="导出 PNG">
          <Download className="size-4" />
        </Button>
        {onSave && (
          <Button variant="default" size="sm" className="h-8 px-3 shrink-0" onClick={save} title="保存">
            保存
          </Button>
        )}
      </div>

      {/* 画布 */}
      <div className="flex-1 overflow-auto bg-muted/20 relative">
        <svg
          ref={svgRef}
          data-whiteboard-svg="true"
          viewBox={`0 0 ${width} ${height}`}
          className="bg-white shadow-lg mx-auto"
          style={{ width: "100%", maxWidth: width, height: "auto", aspectRatio: `${width}/${height}`, touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* 背景图 */}
          {bgImage && (
            <image href={bgImage} x={0} y={0} width={width} height={height} preserveAspectRatio="xMidYMid meet" opacity={0.5} />
          )}
          {/* 网格 */}
          {showGrid && (
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
              </pattern>
              <pattern id="gridMajor" width="200" height="200" patternUnits="userSpaceOnUse">
                <path d="M 200 0 L 0 0 0 200" fill="none" stroke="#d1d5db" strokeWidth="1" />
              </pattern>
            </defs>
          )}
          {showGrid && (
            <>
              <rect width={width} height={height} fill="url(#grid)" />
              <rect width={width} height={height} fill="url(#gridMajor)" />
            </>
          )}

          {/* 已有 strokes */}
          {strokes.map((s) => (
            <StrokeRenderer key={s.id} stroke={s} selected={s.id === selectedId} />
          ))}

          {/* 正在绘制的 stroke */}
          {currentStroke && <StrokeRenderer stroke={currentStroke} selected={false} />}

          {/* 文字输入框 */}
          {textInput && (
            <foreignObject x={textInput.x} y={textInput.y - 20} width="300" height="40">
              <div className="bg-white border-2 border-primary rounded px-2 py-1 shadow-lg">
                <input
                  type="text"
                  value={textInput.value}
                  autoFocus
                  onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
                  onBlur={commitText}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); commitText() }
                    if (e.key === "Escape") setTextInput(null)
                  }}
                  className="w-full outline-none text-sm bg-transparent"
                  style={{ color }}
                  placeholder="输入文字..."
                />
              </div>
            </foreignObject>
          )}
        </svg>
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center gap-3 px-3 py-1 border-t text-xs text-muted-foreground bg-card">
        <span>工具: {tools.find((t) => t.type === tool)?.label}</span>
        <span>笔迹: {strokes.length}</span>
        {selectedId && <span className="text-primary">已选中 (Del 删除)</span>}
        <span className="ml-auto">{width}×{height}</span>
      </div>
    </div>
  )
}

// ===== Stroke 渲染器 =====

function StrokeRenderer({ stroke, selected }: { stroke: Stroke; selected: boolean }) {
  const selProps = selected ? { stroke: "#3b82f6", strokeWidth: stroke.width + 4, fill: "none" } : {}
  const dataAttr = { "data-stroke-id": stroke.id }

  if (stroke.type === "pen" || stroke.type === "highlighter") {
    const d = stroke.points.length > 0
      ? stroke.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
      : ""
    return (
      <path
        {...dataAttr}
        d={d}
        fill="none"
        stroke={stroke.color}
        strokeWidth={stroke.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={stroke.type === "highlighter" ? 0.5 : 1}
        style={{ cursor: "pointer" }}
      />
    )
  }

  if (stroke.type === "line" && stroke.points.length >= 2) {
    return (
      <line
        {...dataAttr}
        x1={stroke.points[0].x} y1={stroke.points[0].y}
        x2={stroke.points[1].x} y2={stroke.points[1].y}
        stroke={stroke.color}
        strokeWidth={stroke.width}
        strokeLinecap="round"
        style={{ cursor: "pointer" }}
      />
    )
  }

  if (stroke.type === "arrow" && stroke.points.length >= 2) {
    const [p1, p2] = stroke.points
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
    const arrowLen = Math.max(10, stroke.width * 3)
    const a1 = { x: p2.x - arrowLen * Math.cos(angle - Math.PI / 6), y: p2.y - arrowLen * Math.sin(angle - Math.PI / 6) }
    const a2 = { x: p2.x - arrowLen * Math.cos(angle + Math.PI / 6), y: p2.y - arrowLen * Math.sin(angle + Math.PI / 6) }
    return (
      <g {...dataAttr} style={{ cursor: "pointer" }}>
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" />
        <line x1={p2.x} y1={p2.y} x2={a1.x} y2={a1.y} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" />
        <line x1={p2.x} y1={p2.y} x2={a2.x} y2={a2.y} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" />
      </g>
    )
  }

  if (stroke.type === "rect" && stroke.points.length >= 2) {
    const [p1, p2] = stroke.points
    const x = Math.min(p1.x, p2.x)
    const y = Math.min(p1.y, p2.y)
    const w = Math.abs(p2.x - p1.x)
    const h = Math.abs(p2.y - p1.y)
    return (
      <rect
        {...dataAttr}
        x={x} y={y} width={w} height={h}
        stroke={stroke.color}
        strokeWidth={stroke.width}
        fill={stroke.fill || "none"}
        rx="2"
        style={{ cursor: "pointer" }}
      />
    )
  }

  if (stroke.type === "circle" && stroke.points.length >= 2) {
    const [p1, p2] = stroke.points
    const cx = (p1.x + p2.x) / 2
    const cy = (p1.y + p2.y) / 2
    const rx = Math.abs(p2.x - p1.x) / 2
    const ry = Math.abs(p2.y - p1.y) / 2
    return (
      <ellipse
        {...dataAttr}
        cx={cx} cy={cy} rx={rx} ry={ry}
        stroke={stroke.color}
        strokeWidth={stroke.width}
        fill={stroke.fill || "none"}
        style={{ cursor: "pointer" }}
      />
    )
  }

  if (stroke.type === "text" && stroke.text) {
    return (
      <text
        {...dataAttr}
        x={stroke.points[0]?.x || 0}
        y={stroke.points[0]?.y || 0}
        fill={stroke.color}
        fontSize={stroke.fontSize || 16}
        fontFamily="system-ui, sans-serif"
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        {stroke.text}
      </text>
    )
  }

  return null
}
