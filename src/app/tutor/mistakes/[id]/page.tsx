"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  ArrowLeft, Loader2, Plus, Trash2, Camera, X, Save, Mic,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { authFetch } from "@/lib/auth-fetch"
import { toast } from "sonner"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { CameraCapture } from "@/components/question-detector/CameraCapture"
import { VoiceInput } from "@/components/question-detector/VoiceInput"

interface MistakeItem {
  id: string
  question: string
  questionImage: string
  answer: string
  analysis: string
  tags: string[]
  createdAt: number
}

interface MistakeBookDetail {
  id: string
  title: string
  subject: string
  cover: string
  items: MistakeItem[]
  count: number
  createdAt: number
  updatedAt: number
}

export default function MistakeBookDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id || ""
  const [book, setBook] = useState<MistakeBookDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newItem, setNewItem] = useState<Partial<MistakeItem>>({
    question: "", questionImage: "", answer: "", analysis: "", tags: [],
  })
  const [newTag, setNewTag] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await authFetch(`/api/tutor/mistakes/${id}`, { cache: "no-store" })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) {
        setBook(data.book)
      } else {
        toast.error(`加载失败：${data?.error || "不存在"}`)
        setTimeout(() => router.push("/tutor/mistakes"), 2000)
      }
    } catch (e) {
      toast.error(`加载失败：${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onload = () => {
        const MAX = 1000
        const scale = Math.max(img.naturalWidth, img.naturalHeight) > MAX ? MAX / Math.max(img.naturalWidth, img.naturalHeight) : 1
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(img.naturalWidth * scale)
        canvas.height = Math.round(img.naturalHeight * scale)
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        setNewItem((prev) => ({ ...prev, questionImage: canvas.toDataURL("image/jpeg", 0.9) }))
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  const onCameraCapture = (dataUrl: string) => {
    setNewItem((prev) => ({ ...prev, questionImage: dataUrl }))
    setCameraOpen(false)
  }

  const saveNewItem = async () => {
    if (!book) return
    if (!newItem.question && !newItem.questionImage) {
      toast.error("请填写题目内容或上传图片")
      return
    }
    setAdding(true)
    try {
      const item: MistakeItem = {
        id: `mi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        question: newItem.question || "",
        questionImage: newItem.questionImage || "",
        answer: newItem.answer || "",
        analysis: newItem.analysis || "",
        tags: newItem.tags || [],
        createdAt: Date.now(),
      }
      const newItems = [...book.items, item]
      await authFetch(`/api/tutor/mistakes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: newItems }),
      })
      setBook((prev) => prev ? { ...prev, items: newItems, count: newItems.length } : prev)
      setNewItem({ question: "", questionImage: "", answer: "", analysis: "", tags: [] })
      setNewTag("")
      toast.success("已添加错题")
    } catch (e) {
      toast.error(`添加失败：${(e as Error).message}`)
    } finally {
      setAdding(false)
    }
  }

  const deleteItem = async (itemId: string) => {
    if (!book) return
    if (!confirm("确定删除这道错题？")) return
    const newItems = book.items.filter((i) => i.id !== itemId)
    try {
      await authFetch(`/api/tutor/mistakes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: newItems }),
      })
      setBook((prev) => prev ? { ...prev, items: newItems, count: newItems.length } : prev)
      toast.success("已删除")
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`)
    }
  }

  if (loading || !book) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <SonnerToaster />
      {cameraOpen && (
        <CameraCaptureEnhanced onCapture={onCameraCapture} onClose={() => setCameraOpen(false)} />
      )}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => router.push("/tutor/mistakes")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{book.title}</div>
            <div className="text-xs text-muted-foreground">{book.count} 题 · {new Date(book.updatedAt).toLocaleDateString("zh-CN")}</div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* 添加错题 */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">添加错题</div>
            <div className="flex gap-1">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelect} />
              <Button variant="outline" size="sm" className="h-8" onClick={() => fileInputRef.current?.click()}>
                <Camera className="size-3.5 mr-1" /> 上传图片
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setCameraOpen(true)}>
                <Camera className="size-3.5 mr-1" /> 拍照
              </Button>
            </div>
          </div>
          {newItem.questionImage && (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={newItem.questionImage} alt="错题图" className="max-h-48 rounded border" />
              <button
                onClick={() => setNewItem((prev) => ({ ...prev, questionImage: "" }))}
                className="absolute top-0 right-0 size-5 bg-destructive text-destructive-foreground rounded-bl-md flex items-center justify-center"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
          <div>
            <div className="text-xs text-muted-foreground mb-1">题目内容（可选，与图片二选一或同时填）</div>
            <Textarea
              value={newItem.question}
              onChange={(e) => setNewItem((prev) => ({ ...prev, question: e.target.value }))}
              placeholder="输入题目内容..."
              className="min-h-[60px] text-sm"
              rows={2}
            />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">正确答案</div>
            <Textarea
              value={newItem.answer}
              onChange={(e) => setNewItem((prev) => ({ ...prev, answer: e.target.value }))}
              placeholder="输入答案..."
              className="min-h-[60px] text-sm"
              rows={2}
            />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">解析</div>
            <Textarea
              value={newItem.analysis}
              onChange={(e) => setNewItem((prev) => ({ ...prev, analysis: e.target.value }))}
              placeholder="输入解析..."
              className="min-h-[80px] text-sm"
              rows={3}
            />
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">标签</div>
            <div className="flex gap-1 flex-wrap mb-1.5">
              {(newItem.tags || []).map((t, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full bg-muted text-xs flex items-center gap-1">
                  {t}
                  <button onClick={() => setNewItem((prev) => ({ ...prev, tags: (prev.tags || []).filter((_, j) => j !== i) }))}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTag.trim()) {
                    setNewItem((prev) => ({ ...prev, tags: [...(prev.tags || []), newTag.trim()] }))
                    setNewTag("")
                  }
                }}
                placeholder="输入标签后回车"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <Button onClick={saveNewItem} disabled={adding} className="w-full">
            {adding ? <Loader2 className="size-4 animate-spin mr-1" /> : <Plus className="size-4 mr-1" />}
            添加
          </Button>
        </div>

        {/* 错题列表 */}
        <div className="space-y-3">
          {book.items.map((item, idx) => (
            <div key={item.id} className="group rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="text-xs text-muted-foreground">第 {idx + 1} 题 · {new Date(item.createdAt).toLocaleDateString("zh-CN")}</div>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity size-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              {item.questionImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.questionImage} alt="错题" className="max-h-48 mb-2 rounded border" />
              )}
              {item.question && (
                <div className="text-sm mb-2 whitespace-pre-wrap">{item.question}</div>
              )}
              {item.answer && (
                <div className="mb-2">
                  <div className="text-xs text-muted-foreground mb-0.5">答案</div>
                  <div className="text-sm">{item.answer}</div>
                </div>
              )}
              {item.analysis && (
                <div className="mb-2">
                  <div className="text-xs text-muted-foreground mb-0.5">解析</div>
                  <div className="text-sm text-muted-foreground">{item.analysis}</div>
                </div>
              )}
              {item.tags && item.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {item.tags.map((t, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-muted text-xs">{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {book.items.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              还没有错题，从上方添加
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 简化的拍照组件包装（用现有 CameraCapture，但只接收单张）
function CameraCaptureEnhanced({ onCapture, onClose }: { onCapture: (dataUrl: string) => void; onClose: () => void }) {
  // 复用现有 CameraCapture 的逻辑，通过 dialog 形式打开
  // 为简化，这里直接用 input[type=camera]
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    fileRef.current?.click()
  }, [])
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl p-4 max-w-sm w-full">
        <div className="text-sm font-medium mb-2">拍照录入错题</div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) { onClose(); return }
            const reader = new FileReader()
            reader.onload = () => {
              const dataUrl = reader.result as string
              const img = new Image()
              img.onload = () => {
                const MAX = 1200
                const scale = Math.max(img.naturalWidth, img.naturalHeight) > MAX ? MAX / Math.max(img.naturalWidth, img.naturalHeight) : 1
                const canvas = document.createElement("canvas")
                canvas.width = Math.round(img.naturalWidth * scale)
                canvas.height = Math.round(img.naturalHeight * scale)
                const ctx = canvas.getContext("2d")
                if (!ctx) return
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                onCapture(canvas.toDataURL("image/jpeg", 0.92))
              }
              img.src = dataUrl
            }
            reader.readAsDataURL(file)
          }}
        />
        <p className="text-xs text-muted-foreground mb-3">请选择相机拍照或从相册选择</p>
        <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
      </div>
    </div>
  )
}
