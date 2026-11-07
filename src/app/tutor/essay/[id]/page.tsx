"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  ArrowLeft, Loader2, RefreshCw, Pen, Volume2, Save, Mic,
  Bookmark, BookmarkCheck, Lightbulb, FileText, Edit3,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { authFetch } from "@/lib/auth-fetch"
import { TTSPlayer } from "@/components/question-detector/TTSPlayer"
import { VoiceInput } from "@/components/question-detector/VoiceInput"
import { toast } from "sonner"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"

interface EssayDetail {
  id: string
  type: string
  title: string
  prompt: string
  wordCount: number
  genre: string
  essay: string
  outline: string
  imageData: string
  status: string
  favorited: boolean
  createdAt: number
  updatedAt: number
}

export default function EssayEditorPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id || ""
  const [essay, setEssay] = useState<EssayDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [rewriting, setRewriting] = useState(false)
  const [rewritePrompt, setRewritePrompt] = useState("")
  const [showOutline, setShowOutline] = useState(false)
  const [editedEssay, setEditedEssay] = useState("")
  const [editMode, setEditMode] = useState(false)
  const [generatingOutline, setGeneratingOutline] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await authFetch(`/api/tutor/essays/${id}`, { cache: "no-store" })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) {
        setEssay(data.essay)
        setEditedEssay(data.essay.essay)
      } else {
        toast.error(`加载失败：${data?.error || "不存在"}`)
        setTimeout(() => router.push("/tutor/essay"), 2000)
      }
    } catch (e) {
      toast.error(`加载失败：${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  const rewrite = async (regenerate = false) => {
    if (!essay) return
    setRewriting(true)
    try {
      let config
      try {
        const raw = localStorage.getItem("ai-config")
        if (raw) config = JSON.parse(raw)
      } catch {}
      const resp = await authFetch(`/api/tutor/essays/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: regenerate ? "" : rewritePrompt.trim(),
          config,
          regenerate,
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`)
      }
      setEssay((prev) => prev ? { ...prev, essay: data.essay, outline: data.outline } : prev)
      setEditedEssay(data.essay)
      setRewritePrompt("")
      toast.success("已重写")
    } catch (e) {
      toast.error(`重写失败：${(e as Error).message}`)
    } finally {
      setRewriting(false)
    }
  }

  const saveEdit = async () => {
    if (!essay || editedEssay === essay.essay) return
    try {
      await authFetch(`/api/tutor/essays/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ essay: editedEssay, outline: essay.outline }),
      })
      setEssay((prev) => prev ? { ...prev, essay: editedEssay } : prev)
      toast.success("已保存")
    } catch {
      toast.error("保存失败")
    }
  }

  const toggleFavorite = async () => {
    if (!essay) return
    try {
      const resp = await authFetch(`/api/tutor/essays/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toggleFavorite: true }),
      })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) {
        setEssay((prev) => prev ? { ...prev, favorited: data.favorited } : prev)
        toast.success(data.favorited ? "已收藏" : "已取消收藏")
      }
    } catch (e) {
      toast.error(`操作失败：${(e as Error).message}`)
    }
  }

  const generateOutline = async () => {
    if (!essay) return
    setGeneratingOutline(true)
    try {
      let config
      try { const raw = localStorage.getItem("ai-config"); if (raw) config = JSON.parse(raw) } catch {}
      const resp = await authFetch(`/api/tutor/essays/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generateOutline: true, config }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`)
      }
      setEssay((prev) => prev ? { ...prev, outline: data.outline } : prev)
      toast.success("思路已生成")
    } catch (e) {
      toast.error(`生成失败：${(e as Error).message}`)
    } finally {
      setGeneratingOutline(false)
    }
  }

  if (loading || !essay) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isChinese = essay.type === "chinese"
  const outline = (() => {
    try { return JSON.parse(essay.outline || "{}") } catch { return {} }
  })()

  return (
    <div className="min-h-[100dvh] bg-background">
      <SonnerToaster />
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => router.push("/tutor/essay")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="size-7 rounded-md bg-emerald-500 text-white flex items-center justify-center">
            <Pen className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{essay.title}</div>
            <div className="text-xs text-muted-foreground">
              {isChinese ? "语文作文" : "英语作文"} · {essay.genre} · {essay.wordCount}{isChinese ? "字" : "词"}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="size-8 p-0"
            onClick={() => setShowOutline((v) => !v)}
            title="查看写作思路"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </header>

      {/* 写作思路面板 */}
      {showOutline && (
        <div className="border-b bg-muted/30 p-4 max-w-3xl mx-auto">
          <div className="text-sm font-medium mb-2">写作思路</div>
          {outline.analysis && (
            <div className="mb-2">
              <div className="text-xs font-medium text-muted-foreground">审题分析</div>
              <div className="text-sm">{outline.analysis}</div>
            </div>
          )}
          {outline.material && (
            <div className="mb-2">
              <div className="text-xs font-medium text-muted-foreground">选材建议</div>
              <div className="text-sm">{outline.material}</div>
            </div>
          )}
          {outline.structure && Array.isArray(outline.structure) && (
            <div className="mb-2">
              <div className="text-xs font-medium text-muted-foreground">结构提纲</div>
              <ol className="list-decimal pl-5 text-sm space-y-1">
                {outline.structure.map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          )}
          {!outline.analysis && !outline.material && !outline.structure && (
            <div className="text-sm text-muted-foreground">无写作思路</div>
          )}
        </div>
      )}

      {/* 题目附图 */}
      {essay.imageData && (
        <div className="border-b bg-muted/20 p-3 max-w-3xl mx-auto">
          <div className="text-xs text-muted-foreground mb-1">题目附图</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={essay.imageData} alt="题目附图" className="max-h-60 mx-auto rounded border" />
        </div>
      )}

      {/* 范文 */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">范文</h2>
          <div className="flex items-center gap-1">
            {/* 收藏按钮 */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={toggleFavorite}
              title={essay.favorited ? "取消收藏" : "收藏"}
            >
              {essay.favorited ? (
                <BookmarkCheck className="size-4 text-emerald-500" />
              ) : (
                <Bookmark className="size-4" />
              )}
            </Button>
            {/* 生成思路按钮 */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={generateOutline}
              disabled={generatingOutline}
              title="生成写作思路"
            >
              {generatingOutline ? <Loader2 className="size-4 animate-spin" /> : <Lightbulb className="size-4" />}
              <span className="ml-1 text-xs">思路</span>
            </Button>
            <TTSPlayer text={editedEssay || essay.essay} />
            {/* 编辑/预览切换 */}
            <Button
              variant={editMode ? "default" : "ghost"}
              size="sm"
              className="h-8"
              onClick={() => {
                if (editMode && editedEssay !== essay.essay) saveEdit()
                setEditMode((v) => !v)
              }}
              title={editMode ? "保存并预览" : "编辑"}
            >
              {editMode ? <Save className="size-4" /> : <Edit3 className="size-4" />}
            </Button>
          </div>
        </div>
        {/* 范文渲染：标题居中 + 段落缩进（预览模式）/ Textarea（编辑模式） */}
        {editMode ? (
          <Textarea
            value={editedEssay}
            onChange={(e) => setEditedEssay(e.target.value)}
            className="min-h-[400px] text-sm leading-relaxed resize-y"
            placeholder="范文正文..."
          />
        ) : (
          <div className="min-h-[400px] bg-white rounded-lg p-6 border">
            {/* 标题居中：优先用 AI 生成的标题（范文第一行），否则用用户输入的标题 */}
            {(() => {
              const essayText = editedEssay || essay.essay
              const firstLine = essayText.split(/\n+/)[0]?.trim() || ""
              // 如果第一行短（≤30字）且不含句号，视为标题
              const displayTitle = (firstLine.length <= 30 && !firstLine.includes("。") && !firstLine.includes(".") && firstLine.length > 0)
                ? firstLine
                : essay.title
              return (
                <h1 className="text-xl font-bold text-center mb-1" style={{ fontFamily: isChinese ? "serif" : "inherit" }}>
                  {displayTitle}
                </h1>
              )
            })()}
            {/* 字数居中显示 */}
            <div className="text-center text-xs text-muted-foreground mb-4">
              {isChinese ? `${(editedEssay || essay.essay).length} 字` : `${(editedEssay || essay.essay).split(/\s+/).filter(Boolean).length} 词`} · {essay.genre}
            </div>
            {/* 正文：段落首行缩进 */}
            <div className="text-sm leading-loose" style={{ fontFamily: isChinese ? "serif" : "inherit" }}>
              {(editedEssay || essay.essay).split(/\n+/).map((para, i) => (
                para.trim() ? (
                  <p key={i} className="mb-3" style={{ textIndent: isChinese ? "2em" : "0" }}>
                    {para}
                  </p>
                ) : null
              ))}
            </div>
            <div className="mt-6 pt-4 border-t text-center text-xs text-muted-foreground">
              内容由 AI 生成
            </div>
          </div>
        )}

        {/* 重写区 */}
        <div className="mt-6 border-t pt-4">
          <div className="text-sm font-medium mb-2">按要求重写</div>
          <div className="flex gap-2 items-end">
            <Textarea
              value={rewritePrompt}
              onChange={(e) => setRewritePrompt(e.target.value)}
              placeholder="如：开头再生动一些 / 加强议论 / 缩短到 500 字..."
              className="min-h-[60px] resize-none text-sm flex-1"
              rows={2}
            />
            <VoiceInput onText={(t) => setRewritePrompt((p) => p + t)} className="shrink-0" />
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => rewrite(false)}
              disabled={rewriting || !rewritePrompt.trim()}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              {rewriting ? <Loader2 className="size-4 animate-spin mr-1" /> : <RefreshCw className="size-4 mr-1" />}
              按要求重写
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => rewrite(true)}
              disabled={rewriting}
            >
              {rewriting ? <Loader2 className="size-4 animate-spin mr-1" /> : <RefreshCw className="size-4 mr-1" />}
              随机重写
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
