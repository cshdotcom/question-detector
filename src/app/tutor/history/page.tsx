"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Loader2, History, Brain, Lightbulb, Pen, BookOpen,
  Image as ImageIcon, FileText, Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { authFetch } from "@/lib/auth-fetch"
import { toast } from "sonner"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"

interface HistoryItem {
  id: string
  type: "tutor-solve" | "tutor-lecture" | "essay" | "mistake"
  title: string
  subtitle: string
  preview: string  // 内容预览（前 100 字）
  thumbnail: string
  updatedAt: number
  url: string
  deleteUrl?: string  // 删除 API URL
}

const TYPE_META: Record<HistoryItem["type"], { name: string; color: string; icon: typeof Brain }> = {
  "tutor-solve": { name: "解题模式", color: "bg-violet-500", icon: Brain },
  "tutor-lecture": { name: "讲题模式", color: "bg-amber-500", icon: Lightbulb },
  "essay": { name: "AI 写作文", color: "bg-emerald-500", icon: Pen },
  "mistake": { name: "错题本", color: "bg-rose-500", icon: BookOpen },
}

export default function HistoryPage() {
  const router = useRouter()
  const [items, setItems] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<HistoryItem["type"] | "all">("all")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tutorResp, essayResp, mistakeResp] = await Promise.all([
        authFetch("/api/tutor/sessions", { cache: "no-store" }),
        authFetch("/api/tutor/essays", { cache: "no-store" }),
        authFetch("/api/tutor/mistakes", { cache: "no-store" }),
      ])
      const [tutorData, essayData, mistakeData] = await Promise.all([
        tutorResp.json().catch(() => ({})),
        essayResp.json().catch(() => ({})),
        mistakeResp.json().catch(() => ({})),
      ])
      const allItems: HistoryItem[] = []
      if (tutorData.ok) {
        for (const s of (tutorData.sessions || [])) {
          allItems.push({
            id: s.id,
            type: s.type === "solve" ? "tutor-solve" : "tutor-lecture",
            title: s.title,
            subtitle: s.type === "solve" ? `阶段 ${s.stage || 0}/6` : "讲题模式",
            preview: s.title,
            thumbnail: s.thumbnail || "",
            updatedAt: s.updatedAt,
            url: `/tutor/${s.type}/${s.id}`,
            deleteUrl: `/api/tutor/sessions/${s.id}`,
          })
        }
      }
      if (essayData.ok) {
        for (const e of (essayData.essays || [])) {
          allItems.push({
            id: e.id,
            type: "essay",
            title: e.title,
            subtitle: `${e.genre} · ${e.wordCount}${e.type === "chinese" ? "字" : "词"}`,
            preview: e.title,
            thumbnail: "",
            updatedAt: e.updatedAt,
            url: `/tutor/essay/${e.id}`,
            deleteUrl: `/api/tutor/essays/${e.id}`,
          })
        }
      }
      if (mistakeData.ok) {
        for (const m of (mistakeData.books || [])) {
          allItems.push({
            id: m.id,
            type: "mistake",
            title: m.title,
            subtitle: `${m.count} 题`,
            preview: `${m.subject} · ${m.count} 题`,
            thumbnail: m.cover || "",
            updatedAt: m.updatedAt,
            url: `/tutor/mistakes/${m.id}`,
            deleteUrl: m.isDefault ? undefined : `/api/tutor/mistakes/${m.id}`,
          })
        }
      }
      allItems.sort((a, b) => b.updatedAt - a.updatedAt)
      setItems(allItems)
    } catch (e) {
      console.error("history load failed:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onDelete = async (item: HistoryItem) => {
    if (!item.deleteUrl) {
      toast.info("默认错题本不可删除，只能清空内容")
      return
    }
    if (!confirm("确定删除这条记录？")) return
    try {
      await authFetch(item.deleteUrl, { method: "DELETE" })
      setItems((prev) => prev.filter((i) => i.id !== item.id || i.type !== item.type))
      toast.success("已删除")
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`)
    }
  }

  // 按日期分组
  const filtered = filter === "all" ? items : items.filter((i) => i.type === filter)
  const grouped = groupByDate(filtered)

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 via-background to-violet-50 dark:from-slate-950/20 dark:via-background dark:to-violet-950/20">
      <SonnerToaster />
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => router.push("/tutor")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="size-8 rounded-lg bg-slate-600 text-white flex items-center justify-center">
            <History className="size-5" />
          </div>
          <h1 className="text-lg font-bold">全部记录</h1>
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
          {(Object.keys(TYPE_META) as HistoryItem["type"][]).map((t) => {
            const meta = TYPE_META[t]
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
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="size-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
              <History className="size-6" />
            </div>
            <p className="text-sm">还没有记录</p>
            <p className="text-xs mt-1">使用解题/讲题/作文/错题本后会出现在这里</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ label, items: groupItems }) => (
              <div key={label}>
                <div className="text-xs text-muted-foreground mb-2">{label}</div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {groupItems.map((item) => {
                    const meta = TYPE_META[item.type]
                    const Icon = meta.icon
                    return (
                      <div
                        key={`${item.type}-${item.id}`}
                        className="group text-left rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow"
                      >
                        <button onClick={() => router.push(item.url)} className="block w-full text-left">
                          <div className="aspect-[3/2] bg-muted relative flex items-center justify-center p-4">
                            {item.thumbnail ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="text-xs text-muted-foreground/70 line-clamp-4 text-center">
                                {item.preview || "（暂无内容预览）"}
                              </div>
                            )}
                            <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] text-white font-medium ${meta.color}`}>
                              {meta.name}
                            </div>
                            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] bg-black/50 text-white">
                              {new Date(item.updatedAt).toLocaleTimeString("zh-CN", { hour: "numeric", minute: "numeric" })}
                            </div>
                          </div>
                          <div className="p-3">
                            <div className="text-sm font-medium truncate">{item.title}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 truncate">{item.subtitle}</div>
                          </div>
                        </button>
                        <div className="px-3 pb-3 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(item.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })}
                          </span>
                          <button
                            onClick={() => onDelete(item)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity size-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center"
                            title="删除"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function groupByDate(items: HistoryItem[]): { label: string; items: HistoryItem[] }[] {
  const now = new Date()
  const today: HistoryItem[] = []
  const yesterday: HistoryItem[] = []
  const week: HistoryItem[] = []
  const older: HistoryItem[] = []
  for (const it of items) {
    const d = new Date(it.updatedAt)
    const diff = Math.floor((now.getTime() - d.getTime()) / (24 * 3600 * 1000))
    if (diff === 0) today.push(it)
    else if (diff === 1) yesterday.push(it)
    else if (diff < 7) week.push(it)
    else older.push(it)
  }
  const groups: { label: string; items: HistoryItem[] }[] = []
  if (today.length) groups.push({ label: "今天", items: today })
  if (yesterday.length) groups.push({ label: "昨天", items: yesterday })
  if (week.length) groups.push({ label: "本周", items: week })
  if (older.length) groups.push({ label: "更早", items: older })
  return groups
}
