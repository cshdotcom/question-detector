"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, ArrowLeft, Trash2, Loader2, BookOpen, Mic, Brain, Lightbulb, Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { authFetch } from "@/lib/auth-fetch"
import { VoiceInput } from "@/components/question-detector/VoiceInput"
import { toast } from "sonner"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"

interface RecitationItem {
  id: string
  title: string
  mode: string
  progress: number
  status: string
  createdAt: number
  updatedAt: number
}

const MODES = [
  { id: "fillblank", name: "挖空测试", desc: "AI 自动挖空，填空检验", icon: BookOpen, color: "bg-blue-500" },
  { id: "supervised", name: "AI 监督背诵", desc: "你背 AI 听，实时纠错评分", icon: Mic, color: "bg-rose-500" },
  { id: "selftest", name: "自测模式", desc: "看提示自己背，背给自己听", icon: Brain, color: "bg-violet-500" },
  { id: "aihelp", name: "AI 帮助记忆", desc: "口诀+联想+思维导图", icon: Lightbulb, color: "bg-amber-500" },
]

export default function RecitationsListPage() {
  const router = useRouter()
  const [items, setItems] = useState<RecitationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [mode, setMode] = useState("fillblank")
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await authFetch("/api/tutor/recitations", { cache: "no-store" })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) setItems(data.recitations || [])
    } catch (e) {
      toast.error(`加载失败：${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!content.trim()) {
      toast.error("请输入要背诵的内容")
      return
    }
    setCreating(true)
    try {
      let config
      try { const raw = localStorage.getItem("ai-config"); if (raw) config = JSON.parse(raw) } catch {}
      const resp = await authFetch("/api/tutor/recitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: content.trim(), mode, generate: true, config }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`)
      }
      toast.success("创建成功")
      router.push(`/tutor/recitation/${data.id}`)
    } catch (e) {
      toast.error(`创建失败：${(e as Error).message}`)
    } finally {
      setCreating(false)
    }
  }

  const onDelete = async (id: string) => {
    if (!confirm("确定删除？")) return
    try {
      await authFetch(`/api/tutor/recitations/${id}`, { method: "DELETE" })
      setItems((prev) => prev.filter((i) => i.id !== id))
      toast.success("已删除")
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-indigo-50 via-background to-rose-50 dark:from-indigo-950/20 dark:via-background dark:to-rose-950/20">
      <SonnerToaster />
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => router.push("/tutor")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="size-8 rounded-lg bg-indigo-500 text-white flex items-center justify-center">
            <BookOpen className="size-5" />
          </div>
          <h1 className="text-lg font-bold">AI 背书</h1>
          <Button size="sm" className="ml-auto" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="size-4 mr-1" /> 新建
          </Button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* 创建区 */}
        {showCreate && (
          <div className="rounded-xl border bg-card p-4 mb-6 space-y-3">
            <div className="text-sm font-medium">新建背诵</div>
            {/* 模式选择 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MODES.map((m) => {
                const Icon = m.icon
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`p-3 rounded-lg border text-left transition-colors ${mode === m.id ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" : "border-border hover:bg-accent"}`}
                  >
                    <Icon className={`size-5 mb-1 ${mode === m.id ? "text-indigo-500" : "text-muted-foreground"}`} />
                    <div className="text-xs font-medium">{m.name}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{m.desc}</div>
                  </button>
                )
              })}
            </div>
            {/* 标题 */}
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="标题（可选，自动截取）"
              className="h-9 text-sm"
            />
            {/* 内容 */}
            <div>
              <div className="text-xs text-muted-foreground mb-1">要背诵的内容</div>
              <div className="flex gap-2 items-end">
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="粘贴或输入需要背诵的课文、公式、知识点..."
                  className="min-h-[100px] text-sm flex-1"
                  rows={4}
                />
                <VoiceInput onText={(t) => setContent((p) => p + t)} className="shrink-0" />
              </div>
            </div>
            <Button onClick={create} disabled={creating} className="w-full bg-indigo-500 hover:bg-indigo-600">
              {creating ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Plus className="size-4 mr-2" />}
              创建并生成
            </Button>
          </div>
        )}

        {/* 列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin mr-2" /> 加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="size-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
              <BookOpen className="size-6" />
            </div>
            <p className="text-sm">还没有背诵记录</p>
            <p className="text-xs mt-1">点击右上角「新建」开始</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((r) => {
              const modeMeta = MODES.find((m) => m.id === r.mode) || MODES[0]
              const Icon = modeMeta.icon
              return (
                <div key={r.id} className="group rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
                  <button onClick={() => router.push(`/tutor/recitation/${r.id}`)} className="block w-full text-left">
                    <div className={`aspect-[3/2] ${modeMeta.color} relative flex items-center justify-center`}>
                      <Icon className="size-12 text-white/80" />
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] text-white font-medium bg-black/30">
                        {modeMeta.name}
                      </div>
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
                          <div className="h-full bg-white" style={{ width: `${r.progress}%` }} />
                        </div>
                        <div className="text-[10px] text-white/90 mt-0.5">{r.progress}%</div>
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-medium line-clamp-2">{r.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(r.updatedAt).toLocaleDateString("zh-CN")}
                      </div>
                    </div>
                  </button>
                  <div className="px-3 pb-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 text-destructive"
                      onClick={() => onDelete(r.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
