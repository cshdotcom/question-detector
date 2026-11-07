"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  ArrowLeft, Loader2, RefreshCw, Pen, Volume2, Save, Mic,
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
      toast.success("已保存")
    } catch {
      toast.error("保存失败")
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
            <TTSPlayer text={editedEssay || essay.essay} />
            {editedEssay !== essay.essay && (
              <Button variant="outline" size="sm" className="h-7" onClick={saveEdit}>
                <Save className="size-3.5 mr-1" /> 保存修改
              </Button>
            )}
          </div>
        </div>
        <Textarea
          value={editedEssay}
          onChange={(e) => setEditedEssay(e.target.value)}
          className="min-h-[400px] text-sm leading-relaxed resize-y"
          placeholder="范文正文..."
        />
        <div className="text-xs text-muted-foreground mt-2 text-right">
          {isChinese ? `${editedEssay.length} 字` : `${editedEssay.split(/\s+/).filter(Boolean).length} 词`}
        </div>

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
