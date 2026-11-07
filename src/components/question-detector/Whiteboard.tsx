"use client"

import { useState, useRef, useCallback, useEffect, useMemo, type ReactNode } from "react"
import {
  Pen, Eraser, Undo2, Redo2, Trash2, Type, Minus, Square, Circle,
  ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Highlighter, MousePointer2,
  Grid3x3, Image as ImageIcon, Triangle, Calculator, Sticker, Download,
  Layers, Crosshair, Ruler, Compass, FunctionSquare,
  Move, Copy, Save, ChevronDown, Plus, Sigma, Lightbulb,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// ===== 类型定义 =====

export type StrokeType =
  | "pen" | "line" | "rect" | "circle" | "arrow" | "text" | "highlighter"
  | "polygon" | "ellipse" | "angle" | "function" | "coordinate" | "point" | "parallel"

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
  // 几何属性
  label?: string
  // 函数图属性
  funcExpr?: string  // "x^2", "sin(x)" 等
  funcRange?: [number, number]
  // 测量属性
  measurement?: string
}

export interface WhiteboardData {
  strokes: Stroke[]
  backgroundImage: string
  width: number
  height: number
}

export type ToolType = "select" | StrokeType | "eraser" | "pan"

// 高级工具提示
export interface ToolSuggestion {
  tool: ToolType
  reason: string
}

interface WhiteboardProps {
  initialStrokes?: Stroke[]
  backgroundImage?: string
  width?: number
  height?: number
  onChange?: (strokes: Stroke[]) => void
  onSave?: (data: WhiteboardData) => void
  onSaveAsNew?: (data: WhiteboardData) => void
  className?: string
  compact?: boolean
  // AI 主动推荐工具（讲题模式下根据 AI 输出推荐）
  suggestedTools?: ToolSuggestion[]
}

// ===== 预设 =====

const COLORS = [
  "#1f2937", "#ef4444", "#f97316", "#f59e0b", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#ffffff",
]

const WIDTHS = [1, 2, 4, 6, 10, 16]

const STICKERS = ["✓", "✗", "★", "☆", "→", "←", "↑", "↓", "∴", "∵", "∠", "⊥", "∥", "△", "○", "□", "≠", "≤", "≥", "≈", "∞", "π", "√", "∫", "∑", "℃", "°", "≡", "∝", "∈", "∪", "∩"]

const GRID_STYLES = [
  { id: "none", name: "无网格" },
  { id: "dot", name: "点阵" },
  { id: "small", name: "小格" },
  { id: "large", name: "大格" },
  { id: "coord", name: "坐标系" },
  { id: "iso", name: "等距" },
]

function uid() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// 简易函数表达式求值（支持 + - * / ^ sin cos tan sqrt abs log exp pi e）
function evalFunc(expr: string, x: number): number {
  try {
    // 替换 ^ 为 **
    let s = expr.replace(/\^/g, "**")
    // 替换函数名
    s = s.replace(/\bsin\b/g, "Math.sin")
    s = s.replace(/\bcos\b/g, "Math.cos")
    s = s.replace(/\btan\b/g, "Math.tan")
    s = s.replace(/\basin\b/g, "Math.asin")
    s = s.replace(/\bacos\b/g, "Math.acos")
    s = s.replace(/\batan\b/g, "Math.atan")
    s = s.replace(/\bsqrt\b/g, "Math.sqrt")
    s = s.replace(/\babs\b/g, "Math.abs")
    s = s.replace(/\blog\b/g, "Math.log10")
    s = s.replace(/\bln\b/g, "Math.log")
    s = s.replace(/\bexp\b/g, "Math.exp")
    s = s.replace(/\bpi\b/g, "Math.PI")
    s = s.replace(/\be\b/g, "Math.E")
    // 安全求值
    // eslint-disable-next-line no-new-func
    const fn = new Function("x", `"use strict"; return (${s});`)
    return fn(x)
  } catch {
    return NaN
  }
}

// ===== 主组件 =====

export function Whiteboard({
  initialStrokes = [],
  backgroundImage = "",
  width = 1200,
  height = 800,
  onChange,
  onSave,
  onSaveAsNew,
  className,
  compact = false,
  suggestedTools = [],
}: WhiteboardProps) {
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes)
  const [tool, setTool] = useState<ToolType>("pen")
  const [color, setColor] = useState("#1f2937")
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [gridStyle, setGridStyle] = useState("small")
  const [history, setHistory] = useState<Stroke[][]>([initialStrokes])
  const [historyIdx, setHistoryIdx] = useState(0)
  const [drawing, setDrawing] = useState(false)
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null)
  const [bgImage, setBgImage] = useState(backgroundImage)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [funcInput, setFuncInput] = useState<string>("x^2")
  const [showSuggestions, setShowSuggestions] = useState(true)
  const svgRef = useRef<SVGSVGElement>(null)
  const polygonPointsRef = useRef<{ x: number; y: number }[]>([])

  // 历史
  const pushHistory = useCallback((newStrokes: Stroke[]) => {
    setHistory((prev) => {
      const next = prev.slice(0, historyIdx + 1)
      next.push(newStrokes)
      if (next.length > 50) next.shift()
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

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (textInput || funcInput) return
    const pt = getSvgPoint(e)
    ;(e.target as Element).setPointerCapture(e.pointerId)

    if (tool === "select" || tool === "pan") {
      const target = e.target as Element
      const strokeId = target.getAttribute("data-stroke-id")
      setSelectedId(strokeId)
      if (tool === "pan") {
        // pan mode handled in move
      }
      return
    }

    if (tool === "eraser") {
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

    if (tool === "function") {
      // 函数图：弹输入框，已在 toolbar 处理
      return
    }

    if (tool === "polygon") {
      // 多边形：累积点，双击结束
      polygonPointsRef.current = [...polygonPointsRef.current, pt]
      // 更新临时 stroke
      if (polygonPointsRef.current.length === 1) {
        setCurrentStroke({
          id: uid(), type: "polygon", points: polygonPointsRef.current,
          color, width: strokeWidth, layer: strokes.length,
        })
      } else {
        setCurrentStroke((prev) => prev ? { ...prev, points: polygonPointsRef.current } : prev)
      }
      setDrawing(true)
      return
    }

    setDrawing(true)
    setSelectedId(null)
    const newStroke: Stroke = {
      id: uid(),
      type: tool as StrokeType,
      points: [pt],
      color: tool === "highlighter" ? color + "40" : color,
      width: tool === "highlighter" ? strokeWidth * 3 : strokeWidth,
      layer: strokes.length,
    }
    setCurrentStroke(newStroke)
  }, [tool, color, strokeWidth, strokes, getSvgPoint, pushHistory, updateStrokes, textInput, funcInput])

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing || !currentStroke) {
      if (tool === "pan" && e.buttons === 1) {
        setPan((p) => ({ x: p.x + e.movementX, y: p.y + e.movementY }))
      }
      return
    }
    const pt = getSvgPoint(e)
    setCurrentStroke((prev) => {
      if (!prev) return prev
      if (prev.type === "pen" || prev.type === "highlighter") {
        return { ...prev, points: [...prev.points, pt] }
      } else if (prev.type === "polygon") {
        // 多边形预览最后一个点
        const pts = [...prev.points]
        if (pts.length > 0) {
          pts[pts.length - 1] = pt
        }
        return { ...prev, points: pts }
      } else {
        return { ...prev, points: [prev.points[0], pt] }
      }
    })
  }, [drawing, currentStroke, getSvgPoint, tool])

  const onPointerUp = useCallback(() => {
    if (tool === "polygon") {
      // 多边形不立即结束，等双击
      return
    }
    if (!drawing || !currentStroke) {
      setDrawing(false)
      return
    }
    const newStrokes = [...strokes, currentStroke]
    pushHistory(strokes)
    updateStrokes(newStrokes)
    setCurrentStroke(null)
    setDrawing(false)
  }, [tool, drawing, currentStroke, strokes, pushHistory, updateStrokes])

  const finishPolygon = useCallback(() => {
    if (tool === "polygon" && currentStroke && polygonPointsRef.current.length >= 3) {
      const newStrokes = [...strokes, currentStroke]
      pushHistory(strokes)
      updateStrokes(newStrokes)
      setCurrentStroke(null)
      polygonPointsRef.current = []
      setDrawing(false)
    }
  }, [tool, currentStroke, strokes, pushHistory, updateStrokes])

  const commitText = useCallback(() => {
    if (!textInput || !textInput.value.trim()) {
      setTextInput(null)
      return
    }
    const newStroke: Stroke = {
      id: uid(), type: "text",
      points: [{ x: textInput.x, y: textInput.y }],
      color, width: 0, text: textInput.value,
      fontSize: 16 + strokeWidth * 2, layer: strokes.length,
    }
    pushHistory(strokes)
    updateStrokes([...strokes, newStroke])
    setTextInput(null)
  }, [textInput, color, strokeWidth, strokes, pushHistory, updateStrokes])

  const commitFunction = useCallback(() => {
    const expr = funcInput.trim()
    if (!expr) return
    // 生成函数曲线 stroke（采样 200 点）
    const pts: { x: number; y: number }[] = []
    const cx = width / 2, cy = height / 2
    const scale = 40  // 1 单位 = 40 px
    for (let i = -10; i <= 10; i += 0.05) {
      const y = evalFunc(expr, i)
      if (!isFinite(y)) continue
      pts.push({ x: cx + i * scale, y: cy - y * scale })
    }
    if (pts.length < 2) {
      return
    }
    const newStroke: Stroke = {
      id: uid(), type: "function", points: pts,
      color, width: strokeWidth, layer: strokes.length,
      funcExpr: expr, label: `y = ${expr}`,
    }
    pushHistory(strokes)
    updateStrokes([...strokes, newStroke])
    setFuncInput("")
  }, [funcInput, color, strokeWidth, strokes, pushHistory, updateStrokes, width, height])

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    pushHistory(strokes)
    updateStrokes(strokes.filter((s) => s.id !== selectedId))
    setSelectedId(null)
  }, [selectedId, strokes, pushHistory, updateStrokes])

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return
    const sel = strokes.find((s) => s.id === selectedId)
    if (!sel) return
    const dup: Stroke = {
      ...sel, id: uid(),
      points: sel.points.map((p) => ({ x: p.x + 20, y: p.y + 20 })),
      layer: strokes.length,
    }
    pushHistory(strokes)
    updateStrokes([...strokes, dup])
    setSelectedId(dup.id)
  }, [selectedId, strokes, pushHistory, updateStrokes])

  // 添加测量（两点距离）
  const addMeasurement = useCallback((start: { x: number; y: number }, end: { x: number; y: number }) => {
    const dist = Math.hypot(end.x - start.x, end.y - start.y)
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    const newStroke: Stroke = {
      id: uid(), type: "text",
      points: [mid],
      color: "#dc2626", width: 0,
      text: `${dist.toFixed(1)}px`,
      fontSize: 14, layer: strokes.length,
      measurement: `${dist.toFixed(1)}`,
    }
    pushHistory(strokes)
    updateStrokes([...strokes, newStroke])
  }, [strokes, pushHistory, updateStrokes])

  const addSticker = useCallback((emoji: string) => {
    const newStroke: Stroke = {
      id: uid(), type: "text",
      points: [{ x: width / 2, y: height / 2 }],
      color, width: 0, text: emoji, fontSize: 32, layer: strokes.length,
    }
    pushHistory(strokes)
    updateStrokes([...strokes, newStroke])
  }, [width, height, color, strokes, pushHistory, updateStrokes])

  // 几何工具：插入预设图形
  const addGeometry = useCallback((kind: "triangle" | "rightTriangle" | "coords" | "circleUnit" | "numberLine") => {
    const cx = width / 2, cy = height / 2
    pushHistory(strokes)
    if (kind === "triangle") {
      const s: Stroke = {
        id: uid(), type: "polygon",
        points: [
          { x: cx, y: cy - 100 },
          { x: cx - 100, y: cy + 60 },
          { x: cx + 100, y: cy + 60 },
        ],
        color, width: strokeWidth, layer: strokes.length,
      }
      updateStrokes([...strokes, s])
    } else if (kind === "rightTriangle") {
      const s: Stroke = {
        id: uid(), type: "polygon",
        points: [
          { x: cx - 100, y: cy + 60 },
          { x: cx + 100, y: cy + 60 },
          { x: cx - 100, y: cy - 80 },
        ],
        color, width: strokeWidth, layer: strokes.length,
      }
      updateStrokes([...strokes, s])
    } else if (kind === "coords") {
      const x: Stroke = {
        id: uid(), type: "arrow", color, width: strokeWidth, layer: strokes.length,
        points: [{ x: cx - 200, y: cy }, { x: cx + 200, y: cy }],
      }
      const y: Stroke = {
        id: uid(), type: "arrow", color, width: strokeWidth, layer: strokes.length + 1,
        points: [{ x: cx, y: cy + 200 }, { x: cx, y: cy - 200 }],
      }
      updateStrokes([...strokes, x, y])
    } else if (kind === "circleUnit") {
      const c: Stroke = {
        id: uid(), type: "circle", color, width: strokeWidth, layer: strokes.length,
        points: [{ x: cx - 100, y: cy - 100 }, { x: cx + 100, y: cy + 100 }],
      }
      updateStrokes([...strokes, c])
    } else if (kind === "numberLine") {
      const line: Stroke = {
        id: uid(), type: "arrow", color, width: strokeWidth, layer: strokes.length,
        points: [{ x: cx - 250, y: cy }, { x: cx + 250, y: cy }],
      }
      updateStrokes([...strokes, line])
    }
  }, [width, height, color, strokeWidth, strokes, pushHistory, updateStrokes])

  // 工具栏定义
  const tools: { type: ToolType; icon: ReactNode; label: string; group: string }[] = [
    { type: "select", icon: <MousePointer2 className="size-4" />, label: "选择", group: "基本" },
    { type: "pan", icon: <Move className="size-4" />, label: "平移", group: "基本" },
    { type: "pen", icon: <Pen className="size-4" />, label: "画笔", group: "基本" },
    { type: "highlighter", icon: <Highlighter className="size-4" />, label: "高亮", group: "基本" },
    { type: "eraser", icon: <Eraser className="size-4" />, label: "橡皮", group: "基本" },
    { type: "line", icon: <Minus className="size-4" />, label: "直线", group: "形状" },
    { type: "arrow", icon: <ArrowRight className="size-4" />, label: "箭头", group: "形状" },
    { type: "rect", icon: <Square className="size-4" />, label: "矩形", group: "形状" },
    { type: "circle", icon: <Circle className="size-4" />, label: "圆形", group: "形状" },
    { type: "ellipse", icon: <Circle className="size-4" />, label: "椭圆", group: "形状" },
    { type: "polygon", icon: <Triangle className="size-4" />, label: "多边形", group: "形状" },
    { type: "text", icon: <Type className="size-4" />, label: "文字", group: "形状" },
  ]

  // 按组分类
  const groupedTools = useMemo(() => {
    const groups: Record<string, typeof tools> = {}
    for (const t of tools) {
      if (!groups[t.group]) groups[t.group] = []
      groups[t.group].push(t)
    }
    return groups
  }, [])

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textInput || funcInput) return
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault()
        redo()
      } else if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault()
        duplicateSelected()
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
          e.preventDefault()
          deleteSelected()
        }
      } else if (e.key === "Escape") {
        setSelectedId(null)
        setTextInput(null)
        if (tool === "polygon") {
          polygonPointsRef.current = []
          setCurrentStroke(null)
          setDrawing(false)
        }
      } else if (e.key === "Enter" && tool === "polygon") {
        e.preventDefault()
        finishPolygon()
      } else {
        // 工具快捷键
        const map: Record<string, ToolType> = {
          v: "select", h: "pan", p: "pen", l: "line", a: "arrow",
          r: "rect", c: "circle", t: "text", e: "eraser",
        }
        const t = map[e.key.toLowerCase()]
        if (t && !e.ctrlKey && !e.metaKey) {
          setTool(t)
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [undo, redo, deleteSelected, duplicateSelected, selectedId, textInput, funcInput, tool, finishPolygon])

  // 导出 PNG
  const exportPNG = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return
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

  const save = useCallback(() => {
    onSave?.({ strokes, backgroundImage: bgImage, width, height })
  }, [strokes, bgImage, width, height, onSave])

  const saveAsNew = useCallback(() => {
    onSaveAsNew?.({ strokes, backgroundImage: bgImage, width, height })
  }, [strokes, bgImage, width, height, onSaveAsNew])

  return (
    <div className={cn("flex flex-col bg-background", className)}>
      {/* 工具栏 */}
      <div className={cn("flex items-center gap-1 border-b bg-card overflow-x-auto", compact ? "p-1" : "p-2")}>
        {/* 基本工具组 */}
        {groupedTools["基本"]?.map((t) => (
          <Button
            key={t.type}
            variant={tool === t.type ? "default" : "ghost"}
            size="sm"
            className={cn("size-8 p-0", compact && "size-7")}
            onClick={() => setTool(t.type)}
            title={`${t.label} (${t.type[0].toUpperCase()})`}
          >
            {t.icon}
          </Button>
        ))}

        <div className="w-px h-6 bg-border mx-1 shrink-0" />

        {/* 形状组 */}
        {groupedTools["形状"]?.map((t) => (
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

        {/* 高级几何工具 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0", compact && "size-7")} title="几何工具">
              <Triangle className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground mb-1">几何图形</div>
              <button onClick={() => addGeometry("triangle")} className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-accent text-xs">
                <Triangle className="size-4" /> 等边三角形
              </button>
              <button onClick={() => addGeometry("rightTriangle")} className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-accent text-xs">
                <Triangle className="size-4" /> 直角三角形
              </button>
              <button onClick={() => addGeometry("circleUnit")} className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-accent text-xs">
                <Circle className="size-4" /> 单位圆
              </button>
              <div className="border-t my-1" />
              <div className="text-xs font-medium text-muted-foreground mb-1">坐标系</div>
              <button onClick={() => addGeometry("coords")} className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-accent text-xs">
                <Crosshair className="size-4" /> 直角坐标系
              </button>
              <button onClick={() => addGeometry("numberLine")} className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-accent text-xs">
                <Minus className="size-4" /> 数轴
              </button>
            </div>
          </PopoverContent>
        </Popover>

        {/* 函数绘图 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={tool === "function" ? "default" : "ghost"}
              size="sm"
              className={cn("size-8 p-0 shrink-0", compact && "size-7")}
              onClick={() => setTool("function")}
              title="函数绘图"
            >
              <FunctionSquare className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72">
            <div className="space-y-2">
              <div className="text-xs font-medium">函数绘图</div>
              <Input
                value={funcInput}
                onChange={(e) => setFuncInput(e.target.value)}
                placeholder="如：x^2, sin(x), 2*x+1, sqrt(x)"
                className="text-sm"
                onKeyDown={(e) => e.key === "Enter" && commitFunction()}
              />
              <div className="text-xs text-muted-foreground">
                支持：+ - * / ^ sin cos tan sqrt abs log ln exp pi e
              </div>
              <div className="flex flex-wrap gap-1">
                {["x^2", "sin(x)", "cos(x)", "x^3", "sqrt(x)", "1/x", "abs(x)", "log(x)"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFuncInput(f)}
                    className="px-2 py-0.5 rounded text-xs bg-muted hover:bg-accent"
                  >
                    {f}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={commitFunction} className="w-full">绘制</Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* 测量工具 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0", compact && "size-7")} title="测量">
              <Ruler className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground mb-1">测量</div>
              <button
                onClick={() => {
                  // 测量所有线段
                  const lines = strokes.filter((s) => s.type === "line" || s.type === "arrow")
                  const newStrokes = [...strokes]
                  for (const l of lines) {
                    if (l.points.length >= 2) {
                      const [p1, p2] = l.points
                      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
                      newStrokes.push({
                        id: uid(), type: "text",
                        points: [{ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 - 10 }],
                        color: "#dc2626", width: 0, text: `${dist.toFixed(0)}`,
                        fontSize: 12, layer: newStrokes.length,
                      })
                    }
                  }
                  pushHistory(strokes)
                  updateStrokes(newStrokes)
                }}
                className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-accent text-xs"
              >
                <Ruler className="size-4" /> 测量所有线段
              </button>
            </div>
          </PopoverContent>
        </Popover>

        {/* 贴纸 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0", compact && "size-7")} title="数学符号">
              <Sticker className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72">
            <div className="grid grid-cols-8 gap-1">
              {STICKERS.map((s) => (
                <button
                  key={s}
                  onClick={() => addSticker(s)}
                  className="size-8 rounded hover:bg-accent text-base flex items-center justify-center"
                >
                  {s}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

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

        {/* 网格 */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0", compact && "size-7")} title="网格样式">
              <Grid3x3 className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-40">
            <div className="space-y-1">
              {GRID_STYLES.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGridStyle(g.id)}
                  className={cn("w-full text-left p-1.5 rounded text-xs hover:bg-accent", gridStyle === g.id && "bg-accent font-medium")}
                >
                  {g.name}
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
        {selectedId && (
          <>
            <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0", compact && "size-7")} onClick={duplicateSelected} title="复制 (Ctrl+D)">
              <Copy className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0 text-destructive", compact && "size-7")} onClick={deleteSelected} title="删除选中 (Del)">
              <Trash2 className="size-4" />
            </Button>
          </>
        )}
        <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0 text-destructive", compact && "size-7")} onClick={clear} title="清空">
          <Trash2 className="size-4" />
        </Button>

        <div className="flex-1" />

        {/* 缩放 */}
        <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0", compact && "size-7")} onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))} title="缩小">
          <Minus className="size-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground w-10 text-center tabular-nums shrink-0">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0", compact && "size-7")} onClick={() => setZoom((z) => Math.min(3, z + 0.2))} title="放大">
          <Plus className="size-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0", compact && "size-7")} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} title="重置视图">
          <Move className="size-3.5" />
        </Button>

        {/* 导出 */}
        <Button variant="ghost" size="sm" className={cn("size-8 p-0 shrink-0", compact && "size-7")} onClick={exportPNG} title="导出 PNG">
          <Download className="size-4" />
        </Button>
        {onSave && (
          <Button variant="default" size="sm" className="h-8 px-3 shrink-0" onClick={save} title="保存">
            <Save className="size-3.5 mr-1" /> 保存
          </Button>
        )}
        {onSaveAsNew && (
          <Button variant="outline" size="sm" className="h-8 px-2 shrink-0" onClick={saveAsNew} title="另存为新白板">
            <Plus className="size-3.5 mr-1" /> 另存
          </Button>
        )}
      </div>

      {/* AI 推荐工具提示条 */}
      {showSuggestions && suggestedTools.length > 0 && (
        <div className="border-b bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 flex items-center gap-2 overflow-x-auto">
          <Lightbulb className="size-3.5 text-amber-500 shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-300 shrink-0">AI 建议：</span>
          {suggestedTools.map((s, i) => (
            <button
              key={i}
              onClick={() => { setTool(s.tool); setShowSuggestions(false) }}
              className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/50 text-xs text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800 shrink-0"
              title={s.reason}
            >
              {s.tool} · {s.reason.slice(0, 20)}
            </button>
          ))}
          <button
            onClick={() => setShowSuggestions(false)}
            className="text-xs text-muted-foreground shrink-0 ml-auto"
          >
            ✕
          </button>
        </div>
      )}

      {/* 画布 */}
      <div className="flex-1 overflow-auto bg-muted/20 relative">
        <svg
          ref={svgRef}
          data-whiteboard-svg="true"
          viewBox={`0 0 ${width} ${height}`}
          className="bg-white shadow-lg mx-auto"
          style={{
            width: "100%", maxWidth: width, height: "auto",
            aspectRatio: `${width}/${height}`,
            touchAction: "none",
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={(e) => {
            if (tool === "polygon") {
              e.preventDefault()
              finishPolygon()
            }
          }}
        >
          {/* 网格背景 */}
          {gridStyle !== "none" && <GridBackground style={gridStyle} width={width} height={height} />}

          {/* 背景图 */}
          {bgImage && (
            <image href={bgImage} x={0} y={0} width={width} height={height} preserveAspectRatio="xMidYMid meet" opacity={0.5} />
          )}

          {/* 已有 strokes */}
          {strokes.map((s) => (
            <StrokeRenderer key={s.id} stroke={s} selected={s.id === selectedId} />
          ))}

          {/* 正在绘制的 stroke */}
          {currentStroke && <StrokeRenderer stroke={currentStroke} selected={false} />}

          {/* 文字输入 */}
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
        <span>工具: {tools.find((t) => t.type === tool)?.label || tool}</span>
        <span>笔迹: {strokes.length}</span>
        {tool === "polygon" && polygonPointsRef.current.length > 0 && (
          <span className="text-amber-600">多边形：{polygonPointsRef.current.length} 点（双击或回车结束）</span>
        )}
        {selectedId && <span className="text-primary">已选中 (Del 删除 · Ctrl+D 复制)</span>}
        <span className="ml-auto">{width}×{height}</span>
      </div>
    </div>
  )
}

// ===== 网格背景 =====

function GridBackground({ style, width, height }: { style: string; width: number; height: number }) {
  if (style === "dot") {
    return (
      <>
        <defs>
          <pattern id="gridDot" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="1" fill="#d1d5db" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#gridDot)" />
      </>
    )
  }
  if (style === "small") {
    return (
      <>
        <defs>
          <pattern id="gridSmall" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#gridSmall)" />
      </>
    )
  }
  if (style === "large") {
    return (
      <>
        <defs>
          <pattern id="gridLarge" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#d1d5db" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#gridLarge)" />
      </>
    )
  }
  if (style === "coord") {
    // 直角坐标系网格：中心十字 + 网格
    const cx = width / 2, cy = height / 2
    return (
      <>
        <defs>
          <pattern id="gridCoord" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform={`translate(${cx % 40}, ${cy % 40})`}>
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#gridCoord)" />
        {/* 坐标轴 */}
        <line x1={0} y1={cy} x2={width} y2={cy} stroke="#9ca3af" strokeWidth="1.5" />
        <line x1={cx} y1={0} x2={cx} y2={height} stroke="#9ca3af" strokeWidth="1.5" />
        {/* 刻度数字 */}
        {Array.from({ length: Math.floor(width / 40) }, (_, i) => (
          <text key={`x${i}`} x={i * 40 + cx} y={cy + 12} fontSize="9" fill="#9ca3af" textAnchor="middle">
            {i - Math.floor(width / 80)}
          </text>
        ))}
        {Array.from({ length: Math.floor(height / 40) }, (_, i) => (
          <text key={`y${i}`} x={cx - 8} y={cy - i * 40 + 4} fontSize="9" fill="#9ca3af" textAnchor="end">
            {i}
          </text>
        ))}
      </>
    )
  }
  if (style === "iso") {
    // 等距网格（30° 斜线）
    return (
      <>
        <defs>
          <pattern id="gridIso" width="34.64" height="40" patternUnits="userSpaceOnUse">
            <path d="M 0 20 L 17.32 0 M 17.32 40 L 34.64 20 M 0 20 L 17.32 40 M 17.32 0 L 34.64 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#gridIso)" />
      </>
    )
  }
  return null
}

// ===== Stroke 渲染器 =====

function StrokeRenderer({ stroke, selected }: { stroke: Stroke; selected: boolean }) {
  const dataAttr = { "data-stroke-id": stroke.id }

  if (stroke.type === "pen" || stroke.type === "highlighter" || stroke.type === "function") {
    const d = stroke.points.length > 0
      ? stroke.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
      : ""
    return (
      <path
        {...dataAttr}
        d={d}
        fill="none"
        stroke={stroke.color}
        strokeWidth={selected ? stroke.width + 2 : stroke.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={stroke.type === "highlighter" ? 0.5 : 1}
        style={{ cursor: "pointer", filter: selected ? "drop-shadow(0 0 4px #3b82f6)" : undefined }}
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
        strokeWidth={selected ? stroke.width + 2 : stroke.width}
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
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={stroke.color} strokeWidth={selected ? stroke.width + 2 : stroke.width} strokeLinecap="round" />
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
        strokeWidth={selected ? stroke.width + 2 : stroke.width}
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
        strokeWidth={selected ? stroke.width + 2 : stroke.width}
        fill={stroke.fill || "none"}
        style={{ cursor: "pointer" }}
      />
    )
  }

  if (stroke.type === "ellipse" && stroke.points.length >= 2) {
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
        strokeWidth={selected ? stroke.width + 2 : stroke.width}
        fill={stroke.fill || "none"}
        style={{ cursor: "pointer" }}
      />
    )
  }

  if (stroke.type === "polygon" && stroke.points.length >= 2) {
    const pts = stroke.points.map((p) => `${p.x},${p.y}`).join(" ")
    return (
      <polygon
        {...dataAttr}
        points={pts}
        stroke={stroke.color}
        strokeWidth={selected ? stroke.width + 2 : stroke.width}
        fill={stroke.fill || "none"}
        strokeLinejoin="round"
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
