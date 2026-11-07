"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Loader2, Trash2, Bookmark, FileText, Brain, Lightbulb,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { authFetch } from "@/lib/auth-fetch"
import { toast } from "sonner"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"

interface FavoriteItem {
  id: string
  type: string
  refId: string
  title: string
  summary: string
  thumbnail: string
  content: string
  tags: string[]
  source: string
  createdAt: number
}

const TYPE_META: Record<string, { name: string; color: string; icon: typeof Brain }> = {
  "essay": { name: "作文", color: "bg-emerald-500", icon: FileText },
  "message": { name: "对话", color: "bg-violet-500", icon: Brain },
  "mistake": { name: "错题", color: "bg-rose-500", icon: Bookmark },
  "whiteboard": { name: "画板", color: "bg-cyan-500", icon: Lightbulb },
}

export default function FavoritesPage() {
  const router = useRouter()
  const [items, setItems] = useState<FavoriteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("all")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await authFetch(`/api/tutor/favorites${filter !== "all" ? `?type=${filter}` : ""}`, { cache: "no-store" })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) setItems(data.favorites || [])
    } catch (e) {
      toast.error(`加载失败：${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const onDelete = async (id: string) => {
    if (!confirm("确定取消收藏？")) return
    try {
      await authFetch(`/api/tutor/favorites/${id}`, { method: "DELETE" })
      setItems((prev) => prev.filter((i) => i.id !== id))
      toast.success("已取消收藏")
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`)
    }
  }

  const onOpen = (item: FavoriteItem) => {
    if (item.type === "essay") {
      router.push(`/tutor/essay/${item.refId}`)
    }
    // message/mistake/whiteboard 暂时只在原地查看
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-emerald-50 via-background to-violet-50 dark:from-emerald-950/20 dark:via-background dark:to-violet-950/20">
      <SonnerToaster />
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => router.push("/tutor")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="size-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center">
            <Bookmark className="size-5" />
          </div>
          <h1 className="text-lg font-bold">收藏夹</h1>
          <span className="text-xs text-muted-foreground ml-1">{items.length} 条</span>
        </div>
        {/* 筛选 */}
        <div className="max-w-6xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-md text-xs shrink-0 ${filter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            全部
          </button>
          {Object.entries(TYPE_META).map(([t, meta]) => {
            const Icon = meta.icon
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-3 py-1.5 rounded-md text-xs shrink-0 flex items-center gap-1 ${filter === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                <Icon className="size-3" />
                {meta.name}
              </button>
            )
          })}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin mr-2" /> 加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="size-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
              <Bookmark className="size-6" />
            </div>
            <p className="text-sm">还没有收藏</p>
            <p className="text-xs mt-1">在作文页或对话中点收藏按钮，内容会出现在这里</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => {
              const meta = TYPE_META[item.type] || TYPE_META["message"]
              const Icon = meta.icon
              return (
                <div key={item.id} className="group rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
                  <button onClick={() => onOpen(item)} className="block w-full text-left">
                    <div className="aspect-[3/2] bg-muted relative flex items-center justify-center p-4">
                      <div className="text-sm line-clamp-4 text-muted-foreground">{item.summary || "（无摘要）"}</div>
                      <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] text-white font-medium ${meta.color}`}>
                        {meta.name}
                      </div>
                      {item.source && (
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] bg-black/40 text-white">
                          {item.source}
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-medium line-clamp-2">{item.title || "（无标题）"}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {new Date(item.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })}
                      </div>
                    </div>
                  </button>
                  <div className="px-3 pb-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-7 p-0 text-destructive"
                      onClick={() => onDelete(item.id)}
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
