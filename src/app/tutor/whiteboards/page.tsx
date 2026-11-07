"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, ArrowLeft, Trash2, Pen, Loader2, Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authFetch } from "@/lib/auth-fetch"
import { toast } from "sonner"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"

interface WhiteboardItem {
  id: string
  title: string
  thumbnail: string
  width: number
  height: number
  sessionId: string
  createdAt: number
  updatedAt: number
}

export default function WhiteboardsListPage() {
  const router = useRouter()
  const [items, setItems] = useState<WhiteboardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await authFetch("/api/tutor/whiteboards", { cache: "no-store" })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) setItems(data.whiteboards || [])
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
      const resp = await authFetch("/api/tutor/whiteboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() || "未命名画板" }),
      })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) {
        router.push(`/tutor/whiteboard/${data.id}`)
      } else {
        throw new Error(data?.error || `HTTP ${resp.status}`)
      }
    } catch (e) {
      toast.error(`创建失败：${(e as Error).message}`)
    } finally {
      setCreating(false)
    }
  }

  const onDelete = async (id: string) => {
    if (!confirm("确定删除这个白板？")) return
    try {
      await authFetch(`/api/tutor/whiteboards/${id}`, { method: "DELETE" })
      setItems((prev) => prev.filter((i) => i.id !== id))
      toast.success("已删除")
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`)
    }
  }

  const onRename = async (id: string, title: string) => {
    try {
      await authFetch(`/api/tutor/whiteboards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      })
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, title } : i))
      toast.success("已重命名")
    } catch (e) {
      toast.error(`重命名失败：${(e as Error).message}`)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-cyan-50 via-background to-violet-50 dark:from-cyan-950/20 dark:via-background dark:to-violet-950/20">
      <SonnerToaster />
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/tutor")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="size-8 rounded-lg bg-cyan-500 text-white flex items-center justify-center">
            <Pen className="size-5" />
          </div>
          <h1 className="text-lg font-bold">画板</h1>
          <span className="text-xs text-muted-foreground ml-1">独立白板 · 自由画图</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* 新建 */}
        <div className="flex items-center gap-2 mb-6">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="画板名称..."
            className="max-w-xs"
            onKeyDown={(e) => e.key === "Enter" && createNew()}
          />
          <Button onClick={createNew} disabled={creating}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            新建画板
          </Button>
        </div>

        {/* 列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin mr-2" /> 加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="size-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
              <Pen className="size-6" />
            </div>
            <p className="text-sm">还没有画板</p>
            <p className="text-xs mt-1">点击上方「新建画板」开始</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((wb) => (
              <div key={wb.id} className="group rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
                <button onClick={() => router.push(`/tutor/whiteboard/${wb.id}`)} className="block w-full text-left">
                  <div className="aspect-[3/2] bg-muted relative">
                    {wb.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={wb.thumbnail} alt={wb.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Pen className="size-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-medium truncate">{wb.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {wb.width}×{wb.height} · {new Date(wb.updatedAt).toLocaleDateString("zh-CN")}
                    </div>
                  </div>
                </button>
                <div className="px-3 pb-3 flex items-center gap-1">
                  <Input
                    defaultValue={wb.title}
                    className="h-7 text-xs"
                    onBlur={(e) => {
                      if (e.target.value !== wb.title) onRename(wb.id, e.target.value)
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 text-destructive shrink-0"
                    onClick={() => onDelete(wb.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
