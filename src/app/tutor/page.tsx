"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  GraduationCap,
  Brain,
  Lightbulb,
  History,
  Trash2,
  ArrowRight,
  Loader2,
  Plus,
  ScanText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { authFetch } from "@/lib/auth-fetch"
import { toast } from "sonner"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"

interface SessionItem {
  id: string
  type: string
  title: string
  imageId: string
  questionIdx: number
  stage: number
  status: string
  createdAt: number
  updatedAt: number
  thumbnail: string
}

export default function TutorHubPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await authFetch("/api/tutor/sessions", { cache: "no-store" })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) {
        setSessions(data.sessions || [])
      } else {
        toast.error("加载历史会话失败：", data?.error || `HTTP ${resp.status}`)
      }
    } catch (e) {
      toast.error(`加载失败：${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])

  const onDelete = async (id: string) => {
    if (!confirm("确定删除这个会话？")) return
    try {
      await authFetch(`/api/tutor/sessions/${id}`, { method: "DELETE" })
      setSessions((prev) => prev.filter((s) => s.id !== id))
      toast.success("已删除")
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`)
    }
  }

  const onClearAll = async () => {
    if (!confirm("确定清空所有辅导会话？此操作不可撤销。")) return
    try {
      await authFetch("/api/tutor/sessions", { method: "DELETE" })
      setSessions([])
      toast.success("已清空")
    } catch (e) {
      toast.error(`清空失败：${(e as Error).message}`)
    }
  }

  // 按日期分组
  const grouped = groupByDate(sessions)

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-violet-50 via-background to-amber-50 dark:from-violet-950/20 dark:via-background dark:to-amber-950/20">
      <SonnerToaster />
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <div className="size-8 rounded-lg bg-violet-500 text-white flex items-center justify-center">
            <GraduationCap className="size-5" />
          </div>
          <h1 className="text-lg font-bold">AI 辅导</h1>
          <span className="text-xs text-muted-foreground ml-1">解题模式 · 讲题模式 · 历史记录</span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
              <ScanText className="size-4 mr-1" /> 返回识别
            </Button>
            {sessions.length > 0 && (
              <Button variant="ghost" size="sm" onClick={onClearAll} className="text-destructive">
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-8 pb-6">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2">让 AI 老师陪你逐题突破</h2>
        <p className="text-sm text-muted-foreground mb-6">
          两种模式覆盖错题诊断与重点讲解：解题模式按 6 阶段溯源错因，讲题模式用动态板书+SVG 把抽象概念可视化。
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <button
            onClick={() => router.push("/tutor/new?type=solve")}
            className="text-left p-5 rounded-2xl border bg-violet-50/50 dark:bg-violet-950/20 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-xl bg-violet-500 text-white flex items-center justify-center shrink-0">
                <Brain className="size-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-base mb-1">解题模式</div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  6 阶段溯源诊断：提交作答 → 推测思路 → 评析错因 → 反例辨误 → 拓展知识 → 自检变式
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground shrink-0 mt-2" />
            </div>
          </button>

          <button
            onClick={() => router.push("/tutor/new?type=lecture")}
            className="text-left p-5 rounded-2xl border bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <Lightbulb className="size-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-base mb-1">讲题模式</div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  AI 用 HTML 动态板书 + SVG 知识卡片讲解题目，支持追问
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground shrink-0 mt-2" />
            </div>
          </button>
        </div>
      </section>

      {/* History */}
      <section className="max-w-6xl mx-auto px-4 pb-12">
        <div className="flex items-center gap-2 mb-3">
          <History className="size-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">历史会话</h3>
          {sessions.length > 0 && (
            <span className="text-xs text-muted-foreground">（共 {sessions.length} 个）</span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin mr-2" /> 加载中…
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className="size-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
              <Plus className="size-6" />
            </div>
            <p className="text-sm">还没有辅导记录</p>
            <p className="text-xs mt-1">从顶部"解题模式"或"讲题模式"开始一次新会话</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ label, items }) => (
              <div key={label}>
                <div className="text-xs text-muted-foreground mb-2 sticky top-[57px] bg-background/80 backdrop-blur py-1">
                  {label}
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map((s) => (
                    <SessionCard key={s.id} session={s} onOpen={() => router.push(`/tutor/${s.type}/${s.id}`)} onDelete={() => onDelete(s.id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function SessionCard({ session, onOpen, onDelete }: {
  session: SessionItem
  onOpen: () => void
  onDelete: () => void
}) {
  const type = session.type === "solve" ? "解题" : "讲题"
  const typeColor = session.type === "solve" ? "bg-violet-500" : "bg-amber-500"
  return (
    <div className="group relative rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="aspect-[4/3] bg-muted relative">
          {session.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.thumbnail} alt={session.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <ScanText className="size-8" />
            </div>
          )}
          <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] text-white font-medium ${typeColor}`}>
            {type}
          </div>
          {session.type === "solve" && session.stage > 0 && (
            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] bg-black/70 text-white font-medium">
              阶段 {session.stage}/6
            </div>
          )}
        </div>
        <div className="p-3">
          <div className="text-sm font-medium line-clamp-2 mb-1">{session.title}</div>
          <div className="text-xs text-muted-foreground">
            {new Date(session.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })}
          </div>
        </div>
      </button>
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity size-7 rounded-md bg-destructive/90 text-destructive-foreground flex items-center justify-center"
        title="删除"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

function groupByDate(items: SessionItem[]): { label: string; items: SessionItem[] }[] {
  const now = new Date()
  const groups: { label: string; items: SessionItem[] }[] = []
  const today: SessionItem[] = []
  const yesterday: SessionItem[] = []
  const week: SessionItem[] = []
  const older: SessionItem[] = []
  for (const it of items) {
    const d = new Date(it.updatedAt)
    const diff = Math.floor((now.getTime() - d.getTime()) / (24 * 3600 * 1000))
    if (diff === 0) today.push(it)
    else if (diff === 1) yesterday.push(it)
    else if (diff < 7) week.push(it)
    else older.push(it)
  }
  if (today.length) groups.push({ label: "今天", items: today })
  if (yesterday.length) groups.push({ label: "昨天", items: yesterday })
  if (week.length) groups.push({ label: "本周", items: week })
  if (older.length) groups.push({ label: "更早", items: older })
  return groups
}
