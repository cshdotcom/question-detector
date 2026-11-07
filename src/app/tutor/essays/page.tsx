"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, ArrowLeft, Trash2, Loader2, Pen, FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { authFetch } from "@/lib/auth-fetch"
import { toast } from "sonner"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"

interface EssayItem {
  id: string
  type: string
  title: string
  wordCount: number
  genre: string
  status: string
  createdAt: number
  updatedAt: number
}

export default function EssayListPage() {
  const router = useRouter()
  const [items, setItems] = useState<EssayItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await authFetch("/api/tutor/essays", { cache: "no-store" })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) setItems(data.essays || [])
    } catch (e) {
      toast.error(`加载失败：${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onDelete = async (id: string) => {
    if (!confirm("确定删除这篇作文？")) return
    try {
      await authFetch(`/api/tutor/essays/${id}`, { method: "DELETE" })
      setItems((prev) => prev.filter((i) => i.id !== id))
      toast.success("已删除")
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-emerald-50 via-background to-rose-50 dark:from-emerald-950/20 dark:via-background dark:to-rose-950/20">
      <SonnerToaster />
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => router.push("/tutor")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="size-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center">
            <Pen className="size-5" />
          </div>
          <h1 className="text-lg font-bold">AI 写作文</h1>
          <Button size="sm" className="ml-auto" onClick={() => router.push("/tutor/essay")}>
            <Plus className="size-4 mr-1" /> 新建
          </Button>
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
              <Pen className="size-6" />
            </div>
            <p className="text-sm">还没有作文</p>
            <Button className="mt-4" onClick={() => router.push("/tutor/essay")}>
              <Plus className="size-4 mr-1" /> 写第一篇
            </Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((e) => (
              <div key={e.id} className="group rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
                <button onClick={() => router.push(`/tutor/essay/${e.id}`)} className="block w-full text-left">
                  <div className="aspect-[3/2] bg-gradient-to-br from-emerald-100 to-rose-100 dark:from-emerald-950/40 dark:to-rose-950/40 relative flex items-center justify-center">
                    <FileText className="size-12 text-emerald-500/50" />
                    <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] text-white font-medium ${e.type === "chinese" ? "bg-rose-500" : "bg-blue-500"}`}>
                      {e.type === "chinese" ? "语文" : "英语"}
                    </div>
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] bg-black/40 text-white">
                      {e.genre}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-medium line-clamp-2">{e.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {e.wordCount}{e.type === "chinese" ? "字" : "词"} · {new Date(e.updatedAt).toLocaleDateString("zh-CN")}
                    </div>
                  </div>
                </button>
                <div className="px-3 pb-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-7 p-0 text-destructive"
                    onClick={() => onDelete(e.id)}
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
