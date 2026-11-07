"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  ArrowLeft, Loader2, Plus, Trash2, Camera, X, Save, Mic,
  Sparkles, BookOpen, RefreshCw, Brain, Lightbulb, ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { authFetch } from "@/lib/auth-fetch"
import { toast } from "sonner"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { VoiceInput } from "@/components/question-detector/VoiceInput"

interface MistakeItem {
  id: string
  question: string
  questionImage: string
  answer: string
  analysis: string
  tags: string[]
  knowledgePoint: string
  createdAt: number
}

interface MistakeBookDetail {
  id: string
  title: string
  subject: string
  cover: string
  items: MistakeItem[]
  count: number
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

const SUBJECT_NAMES: Record<string, string> = {
  math: "数学", chinese: "语文", english: "英语",
  physics: "物理", chemistry: "化学", biology: "生物", other: "综合",
}

export default function MistakeBookDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id || ""
  const [book, setBook] = useState<MistakeBookDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [adding, setAdding] = useState(false)
  const [aiImporting, setAiImporting] = useState(false)
  const [newItem, setNewItem] = useState<Partial<MistakeItem>>({
    question: "", questionImage: "", answer: "", analysis: "", tags: [], knowledgePoint: "",
  })
  const [newTag, setNewTag] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  // 智能复习
  const [showReviewPanel, setShowReviewPanel] = useState(false)
  const [reviewTimeRange, setReviewTimeRange] = useState("week")
  const [reviewDuration, setReviewDuration] = useState(15)
  const [generatingReview, setGeneratingReview] = useState(false)
  const [reviewItems, setReviewItems] = useState<unknown[] | null>(null)
  // 举一反三
  const [similarItems, setSimilarItems] = useState<{ itemId: string; items: unknown[] } | null>(null)
  const [generatingSimilar, setGeneratingSimilar] = useState<string | null>(null)

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

  const resizeImage = (dataUrl: string, maxSide: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.max(img.naturalWidth, img.naturalHeight) > maxSide ? maxSide / Math.max(img.naturalWidth, img.naturalHeight) : 1
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(img.naturalWidth * scale)
        canvas.height = Math.round(img.naturalHeight * scale)
        const ctx = canvas.getContext("2d")
        if (!ctx) return reject(new Error("ctx"))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL("image/jpeg", 0.9))
      }
      img.onerror = () => reject(new Error("img load"))
      img.src = dataUrl
    })
  }

  const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      const resized = await resizeImage(dataUrl, 1200)
      setNewItem((prev) => ({ ...prev, questionImage: resized }))
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  // AI 智能录入：拍照后 AI 识别题目+答案+解析
  const aiImport = async () => {
    if (!newItem.questionImage) {
      toast.error("请先拍照或上传图片")
      return
    }
    setAiImporting(true)
    try {
      let config
      try { const raw = localStorage.getItem("ai-config"); if (raw) config = JSON.parse(raw) } catch {}
      const resp = await authFetch(`/api/tutor/mistakes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiImportImage: newItem.questionImage, config }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`)
      }
      // AI 识别成功，填充表单
      setNewItem({
        question: data.item.question,
        questionImage: data.item.questionImage,
        answer: data.item.answer,
        analysis: data.item.analysis,
        knowledgePoint: data.item.knowledgePoint,
        tags: data.item.tags,
      })
      toast.success("AI 识别完成，请确认后保存")
    } catch (e) {
      toast.error(`AI 识别失败：${(e as Error).message}`)
    } finally {
      setAiImporting(false)
    }
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
        knowledgePoint: newItem.knowledgePoint || "",
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
      setNewItem({ question: "", questionImage: "", answer: "", analysis: "", tags: [], knowledgePoint: "" })
      setNewTag("")
      setShowAddPanel(false)
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

  // 智能复习
  const generateReview = async () => {
    setGeneratingReview(true)
    setReviewItems(null)
    try {
      let config
      try { const raw = localStorage.getItem("ai-config"); if (raw) config = JSON.parse(raw) } catch {}
      const resp = await authFetch(`/api/tutor/mistakes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generateReview: { timeRange: reviewTimeRange, duration: reviewDuration }, config }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`)
      }
      setReviewItems(data.reviewItems || [])
      toast.success(`已生成 ${data.count} 道复习题`)
    } catch (e) {
      toast.error(`生成失败：${(e as Error).message}`)
    } finally {
      setGeneratingReview(false)
    }
  }

  // 举一反三
  const generateSimilar = async (itemId: string) => {
    setGeneratingSimilar(itemId)
    try {
      let config
      try { const raw = localStorage.getItem("ai-config"); if (raw) config = JSON.parse(raw) } catch {}
      const resp = await authFetch(`/api/tutor/mistakes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generateSimilar: { itemId }, config }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`)
      }
      setSimilarItems({ itemId, items: data.similarItems || [] })
      toast.success(`已生成 ${data.count} 道相似题`)
    } catch (e) {
      toast.error(`生成失败：${(e as Error).message}`)
    } finally {
      setGeneratingSimilar(null)
    }
  }

  if (loading || !book) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const subjectName = SUBJECT_NAMES[book.subject] || "综合"

  return (
    <div className="min-h-[100dvh] bg-background">
      <SonnerToaster />
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => router.push("/tutor/mistakes")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{book.title}</div>
            <div className="text-xs text-muted-foreground">{book.count} 题 · {subjectName} · {new Date(book.updatedAt).toLocaleDateString("zh-CN")}</div>
          </div>
          {/* 智能复习按钮 */}
          <Button variant="outline" size="sm" className="h-8" onClick={() => setShowReviewPanel(true)} disabled={book.items.length === 0}>
            <RefreshCw className="size-3.5 mr-1" /> 智能复习
          </Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* 添加错题 */}
        {!showAddPanel ? (
          <div className="flex gap-2">
            <Button onClick={() => setShowAddPanel(true)} className="flex-1 h-11">
              <Plus className="size-4 mr-1" /> 添加错题
            </Button>
            <Button variant="outline" onClick={() => cameraInputRef.current?.click()} className="h-11">
              <Camera className="size-4 mr-1" /> 拍照录入
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">添加错题</div>
              <div className="flex gap-1">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelect} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileSelect} />
                <Button variant="outline" size="sm" className="h-8" onClick={() => fileInputRef.current?.click()}>
                  <Camera className="size-3.5 mr-1" /> 上传
                </Button>
                <Button variant="outline" size="sm" className="h-8" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="size-3.5 mr-1" /> 拍照
                </Button>
                {newItem.questionImage && (
                  <Button variant="default" size="sm" className="h-8 bg-violet-500" onClick={aiImport} disabled={aiImporting}>
                    {aiImporting ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Sparkles className="size-3.5 mr-1" />}
                    AI 识别
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowAddPanel(false)}>
                  <X className="size-4" />
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
              <div className="text-xs text-muted-foreground mb-1">题目内容</div>
              <Textarea
                value={newItem.question}
                onChange={(e) => setNewItem((prev) => ({ ...prev, question: e.target.value }))}
                placeholder="输入题目内容（或上传图片后点 AI 识别自动填充）..."
                className="min-h-[60px] text-sm"
                rows={2}
              />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">知识点</div>
              <Input
                value={newItem.knowledgePoint}
                onChange={(e) => setNewItem((prev) => ({ ...prev, knowledgePoint: e.target.value }))}
                placeholder="如：一元二次方程的因式分解"
                className="h-8 text-sm"
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
            <Button onClick={saveNewItem} disabled={adding} className="w-full">
              {adding ? <Loader2 className="size-4 animate-spin mr-1" /> : <Plus className="size-4 mr-1" />}
              保存错题
            </Button>
          </div>
        )}

        {/* 智能复习结果 */}
        {reviewItems && reviewItems.length > 0 && (
          <div className="rounded-xl border bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="size-4 text-emerald-500" />
                <div className="text-sm font-medium">智能复习题（{reviewItems.length} 题）</div>
              </div>
              <Button variant="ghost" size="sm" className="h-7" onClick={() => setReviewItems(null)}>
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="space-y-2">
              {reviewItems.map((r, i) => {
                const item = r as { question: string; answer: string; analysis: string; knowledgePoint: string; type?: string }
                return (
                  <div key={i} className="rounded-lg bg-card p-3 border">
                    <div className="text-xs text-muted-foreground mb-1">第 {i + 1} 题 · {item.type || "解答题"} · {item.knowledgePoint}</div>
                    <div className="text-sm font-medium mb-1">{item.question}</div>
                    <details className="mt-1">
                      <summary className="text-xs text-muted-foreground cursor-pointer">查看答案</summary>
                      <div className="mt-1 text-sm"><b>答案：</b>{item.answer}</div>
                      <div className="mt-1 text-sm text-muted-foreground"><b>解析：</b>{item.analysis}</div>
                    </details>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 错题列表 */}
        <div className="space-y-3">
          {book.items.map((item, idx) => (
            <div key={item.id} className="group rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="text-xs text-muted-foreground">第 {idx + 1} 题 · {new Date(item.createdAt).toLocaleDateString("zh-CN")}</div>
                <div className="flex gap-1">
                  {item.knowledgePoint && (
                    <span className="px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-xs text-violet-700 dark:text-violet-300">
                      {item.knowledgePoint}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-6 p-0"
                    onClick={() => generateSimilar(item.id)}
                    disabled={generatingSimilar === item.id}
                    title="举一反三（AI 生成相似题）"
                  >
                    {generatingSimilar === item.id ? <Loader2 className="size-3 animate-spin" /> : <Lightbulb className="size-3" />}
                  </Button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity size-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
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
              {/* 举一反三结果 */}
              {similarItems?.itemId === item.id && similarItems.items.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 border border-amber-200 dark:border-amber-900">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="size-3.5 text-amber-500" />
                    <div className="text-xs font-medium">举一反三 · 相似题</div>
                    <Button variant="ghost" size="sm" className="size-5 p-0 ml-auto" onClick={() => setSimilarItems(null)}>
                      <X className="size-3" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {similarItems.items.map((s, i) => {
                      const sim = s as { question: string; answer: string; analysis: string; knowledgePoint: string; difficulty?: string }
                      return (
                        <div key={i} className="rounded bg-card p-2 border text-xs">
                          <div className="font-medium mb-0.5">变式 {i + 1} · {sim.difficulty || "中等"} · {sim.knowledgePoint}</div>
                          <div className="mb-1">{sim.question}</div>
                          <details>
                            <summary className="text-muted-foreground cursor-pointer">查看答案</summary>
                            <div className="mt-1"><b>答案：</b>{sim.answer}</div>
                            <div className="text-muted-foreground"><b>解析：</b>{sim.analysis}</div>
                          </details>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
          {book.items.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <BookOpen className="size-10 mx-auto mb-2 opacity-30" />
              还没有错题，点击上方「添加错题」或「拍照录入」开始
            </div>
          )}
        </div>
      </div>

      {/* 智能复习设置弹窗 */}
      {showReviewPanel && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-xl p-5 max-w-sm w-full">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="size-4 text-emerald-500" />
                <div className="text-sm font-medium">智能复习</div>
              </div>
              <Button variant="ghost" size="sm" className="size-7 p-0" onClick={() => setShowReviewPanel(false)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">收录时间</div>
                <div className="flex gap-1.5 flex-wrap">
                  {[
                    { id: "week", name: "近一周" },
                    { id: "month", name: "近一月" },
                    { id: "semester", name: "本学期" },
                    { id: "all", name: "全部" },
                  ].map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setReviewTimeRange(r.id)}
                      className={`px-3 py-1.5 rounded-md text-xs ${reviewTimeRange === r.id ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">复习时长</div>
                <div className="flex gap-1.5">
                  {[15, 30, 45].map((d) => (
                    <button
                      key={d}
                      onClick={() => setReviewDuration(d)}
                      className={`px-3 py-1.5 rounded-md text-xs ${reviewDuration === d ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}
                    >
                      {d}分钟
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">预计为你生成 4-6 题的复习内容</div>
              <Button onClick={() => { generateReview(); setShowReviewPanel(false) }} className="w-full bg-emerald-500 hover:bg-emerald-600">
                生成复习内容
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
