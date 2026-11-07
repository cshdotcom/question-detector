"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, ArrowLeft, Trash2, Loader2, BookOpen, Pencil, Camera,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authFetch } from "@/lib/auth-fetch"
import { toast } from "sonner"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"

interface MistakeBookItem {
  id: string
  title: string
  subject: string
  cover: string
  count: number
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

const SUBJECTS = [
  { id: "math", name: "数学", color: "bg-blue-500" },
  { id: "chinese", name: "语文", color: "bg-rose-500" },
  { id: "english", name: "英语", color: "bg-emerald-500" },
  { id: "physics", name: "物理", color: "bg-amber-500" },
  { id: "chemistry", name: "化学", color: "bg-violet-500" },
  { id: "biology", name: "生物", color: "bg-teal-500" },
  { id: "other", name: "其他", color: "bg-slate-500" },
]

function getSubjectMeta(id: string) {
  return SUBJECTS.find((s) => s.id === id) || SUBJECTS[SUBJECTS.length - 1]
}

export default function MistakesListPage() {
  const router = useRouter()
  const [books, setBooks] = useState<MistakeBookItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newSubject, setNewSubject] = useState("math")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await authFetch("/api/tutor/mistakes", { cache: "no-store" })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) setBooks(data.books || [])
    } catch (e) {
      toast.error(`加载失败：${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const createNew = async () => {
    setCreating(true)
    try {
      const resp = await authFetch("/api/tutor/mistakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() || "未命名错题本", subject: newSubject }),
      })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) {
        router.push(`/tutor/mistakes/${data.id}`)
      } else {
        throw new Error(data?.error || `HTTP ${resp.status}`)
      }
    } catch (e) {
      toast.error(`创建失败：${(e as Error).message}`)
    } finally {
      setCreating(false)
    }
  }

  const onDelete = async (id: string, isDefault: boolean) => {
    if (isDefault) {
      if (!confirm("这是默认学科错题本，将清空内容但不删除，确定？")) return
    } else {
      if (!confirm("确定删除这个错题本？")) return
    }
    try {
      await authFetch(`/api/tutor/mistakes/${id}`, { method: "DELETE" })
      if (isDefault) {
        // 默认本清空后刷新
        load()
      } else {
        setBooks((prev) => prev.filter((b) => b.id !== id))
      }
      toast.success(isDefault ? "已清空" : "已删除")
    } catch (e) {
      toast.error(`操作失败：${(e as Error).message}`)
    }
  }

  const onRename = async (id: string, title: string) => {
    try {
      await authFetch(`/api/tutor/mistakes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      })
      setBooks((prev) => prev.map((b) => b.id === id ? { ...b, title } : b))
      toast.success("已重命名")
    } catch (e) {
      toast.error(`重命名失败：${(e as Error).message}`)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-rose-50 via-background to-amber-50 dark:from-rose-950/20 dark:via-background dark:to-amber-950/20">
      <SonnerToaster />
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/tutor")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="size-8 rounded-lg bg-rose-500 text-white flex items-center justify-center">
            <BookOpen className="size-5" />
          </div>
          <h1 className="text-lg font-bold">错题本</h1>
          <span className="text-xs text-muted-foreground ml-1">按学科分类 · 拍照录入</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* 新建 */}
        <div className="rounded-xl border bg-card p-4 mb-6 space-y-3">
          <div className="text-sm font-medium">新建错题本</div>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setNewSubject(s.id)}
                className={`px-3 py-1.5 rounded-md text-xs flex items-center gap-1.5 ${newSubject === s.id ? `${s.color} text-white` : "bg-muted text-muted-foreground hover:bg-accent"}`}
              >
                <div className={`size-2 rounded-full ${newSubject === s.id ? "bg-white" : s.color}`} />
                {s.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="错题本名称..."
              className="max-w-xs"
              onKeyDown={(e) => e.key === "Enter" && createNew()}
            />
            <Button onClick={createNew} disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              新建
            </Button>
          </div>
        </div>

        {/* 列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin mr-2" /> 加载中…
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="size-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
              <BookOpen className="size-6" />
            </div>
            <p className="text-sm">还没有错题本</p>
            <p className="text-xs mt-1">从上方新建一个开始整理错题</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {books.map((b) => {
              const meta = getSubjectMeta(b.subject)
              return (
                <div key={b.id} className="group rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
                  <button onClick={() => router.push(`/tutor/mistakes/${b.id}`)} className="block w-full text-left">
                    <div className={`aspect-[3/2] ${meta.color} relative flex items-center justify-center overflow-hidden`}>
                      {b.cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.cover} alt={b.title} className="w-full h-full object-cover" />
                      ) : (
                        <BookOpen className="size-12 text-white/80" />
                      )}
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] bg-black/40 text-white font-medium">
                        {meta.name}
                      </div>
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md text-[10px] bg-black/40 text-white">
                        {b.count} 题
                      </div>
                      {/* 自定义封面按钮 */}
                      <label
                        className="absolute top-2 left-2 size-7 rounded-md bg-black/40 hover:bg-black/60 text-white flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                        title="自定义封面"
                      >
                        <Camera className="size-3.5" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = async () => {
                              const dataUrl = reader.result as string
                              const img = new Image()
                              img.onload = async () => {
                                const MAX = 600
                                const scale = Math.max(img.naturalWidth, img.naturalHeight) > MAX ? MAX / Math.max(img.naturalWidth, img.naturalHeight) : 1
                                const canvas = document.createElement("canvas")
                                canvas.width = Math.round(img.naturalWidth * scale)
                                canvas.height = Math.round(img.naturalHeight * scale)
                                const ctx = canvas.getContext("2d")
                                if (!ctx) return
                                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                                const coverData = canvas.toDataURL("image/jpeg", 0.8)
                                try {
                                  await authFetch(`/api/tutor/mistakes/${b.id}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ cover: coverData }),
                                  })
                                  setBooks((prev) => prev.map((bk) => bk.id === b.id ? { ...bk, cover: coverData } : bk))
                                  toast.success("封面已更新")
                                } catch (err) {
                                  toast.error("封面更新失败")
                                }
                              }
                              img.src = dataUrl
                            }
                            reader.readAsDataURL(file)
                            e.target.value = ""
                          }}
                        />
                      </label>
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-medium truncate">{b.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(b.updatedAt).toLocaleDateString("zh-CN")}
                      </div>
                    </div>
                  </button>
                  <div className="px-3 pb-3 flex items-center gap-1">
                    <Input
                      defaultValue={b.title}
                      className="h-7 text-xs"
                      onBlur={(e) => {
                        if (e.target.value !== b.title) onRename(b.id, e.target.value)
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 text-destructive shrink-0"
                      onClick={() => onDelete(b.id, b.isDefault)}
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
