"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Loader2, Save, Pen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Whiteboard, type Stroke, type WhiteboardData } from "@/components/question-detector/Whiteboard"
import { authFetch } from "@/lib/auth-fetch"
import { toast } from "sonner"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"

interface WhiteboardDetail {
  id: string
  title: string
  strokes: Stroke[]
  backgroundImage: string
  width: number
  height: number
  sessionId: string
  thumbnail: string
  createdAt: number
  updatedAt: number
}

export default function WhiteboardEditorPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id || ""
  const [wb, setWb] = useState<WhiteboardDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState("")
  const currentStrokesRef = useRef<Stroke[]>([])
  const bgImageRef = useRef("")
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await authFetch(`/api/tutor/whiteboards/${id}`, { cache: "no-store" })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) {
        setWb(data.whiteboard)
        setTitle(data.whiteboard.title)
        currentStrokesRef.current = data.whiteboard.strokes
        bgImageRef.current = data.whiteboard.backgroundImage
      } else {
        toast.error(`加载失败：${data?.error || "白板不存在"}`)
        setTimeout(() => router.push("/tutor/whiteboards"), 2000)
      }
    } catch (e) {
      toast.error(`加载失败：${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  // 自动保存（防抖 2 秒）
  const autoSave = useCallback((strokes: Stroke[], bgImage: string) => {
    currentStrokesRef.current = strokes
    bgImageRef.current = bgImage
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        await authFetch(`/api/tutor/whiteboards/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            strokes: currentStrokesRef.current,
            backgroundImage: bgImageRef.current,
            title,
          }),
        })
      } catch (e) {
        console.warn("[whiteboard] auto-save failed:", e)
      } finally {
        setSaving(false)
      }
    }, 2000)
  }, [id, title])

  const manualSave = useCallback(async () => {
    setSaving(true)
    try {
      // 生成缩略图
      let thumbnail = ""
      try {
        thumbnail = await generateThumbnail()
      } catch (e) {
        console.warn("[whiteboard] thumbnail failed:", e)
      }
      await authFetch(`/api/tutor/whiteboards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strokes: currentStrokesRef.current,
          backgroundImage: bgImageRef.current,
          title,
          thumbnail,
        }),
      })
      toast.success("已保存")
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }, [id, title])

  // 生成缩略图
  const generateThumbnail = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const svg = document.querySelector("svg[data-whiteboard-svg]") as SVGSVGElement | null
      if (!svg) return reject(new Error("SVG not found"))
      const svgData = new XMLSerializer().serializeToString(svg)
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
      const url = URL.createObjectURL(svgBlob)
      const img = new Image()
      img.onload = () => {
        const MAX = 400
        const w = wb?.width || 1200, h = wb?.height || 800
        const scale = Math.max(w, h) > MAX ? MAX / Math.max(w, h) : 1
        const tw = Math.round(w * scale), th = Math.round(h * scale)
        const canvas = document.createElement("canvas")
        canvas.width = tw; canvas.height = th
        const ctx = canvas.getContext("2d")
        if (!ctx) return reject(new Error("Canvas context failed"))
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, tw, th)
        ctx.drawImage(img, 0, 0, tw, th)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL("image/jpeg", 0.7))
      }
      img.onerror = () => reject(new Error("Image load failed"))
      img.src = url
    })
  }

  if (loading || !wb) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[100dvh]">
      <SonnerToaster />
      {/* Header */}
      <header className="flex items-center gap-2 px-3 py-2 border-b bg-background shrink-0">
        <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => router.push("/tutor/whiteboards")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="size-7 rounded-md bg-cyan-500 text-white flex items-center justify-center shrink-0">
          <Pen className="size-4" />
        </div>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-8 max-w-xs text-sm"
          onBlur={() => autoSave(currentStrokesRef.current, bgImageRef.current)}
        />
        {saving && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> 保存中…</span>}
        <div className="ml-auto">
          <Button size="sm" onClick={manualSave} disabled={saving}>
            <Save className="size-4" />
            保存
          </Button>
        </div>
      </header>

      {/* 画板 */}
      <Whiteboard
        initialStrokes={wb.strokes}
        backgroundImage={wb.backgroundImage}
        width={wb.width}
        height={wb.height}
        onChange={(strokes) => autoSave(strokes, bgImageRef.current)}
        onSave={(data: WhiteboardData) => autoSave(data.strokes, data.backgroundImage)}
        className="flex-1"
      />
    </div>
  )
}
