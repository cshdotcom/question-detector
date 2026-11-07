"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Send,
  Square,
  RefreshCw,
  ArrowLeft,
  Loader2,
  Brain,
  Lightbulb,
  ImagePlus,
  X,
  MoreVertical,
  Trash2,
  Pencil,
  Archive,
  ChevronDown,
  Pen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { authFetch } from "@/lib/auth-fetch"
import { sendTutorChat, type TutorMessageMeta } from "@/lib/tutor-chat-client"
import { TTSPlayer } from "./TTSPlayer"
import { VoiceInput } from "./VoiceInput"
import { Whiteboard, type Stroke as WBStroke, type WhiteboardData } from "./Whiteboard"
import type { Question, AIProviderConfig } from "@/lib/types"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
  timestamp: number
  stage?: number
  meta?: TutorMessageMeta
  images?: string[] // 用户上传的图片 dataUrl
}

export interface KnowledgeCard {
  title: string
  svg: string
  summary: string
}

export interface VisualBoard {
  html: string
  width: number
  height: number
  caption?: string
}

interface TutorSessionDetail {
  id: string
  type: string
  title: string
  imageId: string
  questionIdx: number
  questionSnapshot: Question
  imageCrop: string
  messages: ChatMessage[]
  stage: number
  knowledgeCards: KnowledgeCard[]
  visualBoards: VisualBoard[]
  status: string
  createdAt: number
  updatedAt: number
}

interface TutorChatProps {
  sessionId: string
  onBack: () => void
}

export function TutorChat({ sessionId, onBack }: TutorChatProps) {
  const [session, setSession] = useState<TutorSessionDetail | null>(null)
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [aiConfig, setAIConfig] = useState<AIProviderConfig | undefined>(undefined)
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const [showWhiteboard, setShowWhiteboard] = useState(false) // 交互白板开关
  const [wbStrokes, setWbStrokes] = useState<WBStroke[]>([]) // 临时白板笔迹
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // 加载会话详情
  const loadSession = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await authFetch(`/api/tutor/sessions/${sessionId}`, { cache: "no-store" })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) {
        setSession(data.session)
        setTitleDraft(data.session.title)
      } else {
        toast.error(`加载失败：${data?.error || `HTTP ${resp.status}`}`)
      }
    } catch (e) {
      toast.error(`加载失败：${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { loadSession() }, [loadSession])

  // 加载 AI 配置（localStorage）
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ai-config")
      if (raw) setAIConfig(JSON.parse(raw))
    } catch {}
  }, [])

  // 粘贴图片支持
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imgs: string[] = []
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile()
          if (!file) continue
          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = reader.result as string
            // 缩到 ≤800px
            resizeImage(dataUrl, 800).then((resized) => {
              setPendingImages((prev) => [...prev, resized])
            })
          }
          reader.readAsDataURL(file)
        }
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [session?.messages, streamContent, pendingImages])

  // 图片文件选择
  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return
      const reader = new FileReader()
      reader.onload = async () => {
        const dataUrl = reader.result as string
        const resized = await resizeImage(dataUrl, 800)
        setPendingImages((prev) => [...prev, resized])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = "" // reset
  }, [])

  // 删除待发送图片
  const removePendingImage = useCallback((idx: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  // 删除单条消息
  const deleteMessage = useCallback(async (msgIdx: number) => {
    if (!session) return
    if (!confirm("确定删除这条消息？")) return
    const newMessages = session.messages.filter((_, i) => i !== msgIdx)
    try {
      await authFetch(`/api/tutor/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      })
      setSession((prev) => prev ? { ...prev, messages: newMessages } : prev)
      toast.success("已删除")
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`)
    }
  }, [session, sessionId])

  // 删除单张知识卡片
  const deleteKnowledgeCard = useCallback(async (cardIdx: number) => {
    if (!session) return
    if (!confirm("确定删除这张知识卡片？")) return
    const newCards = session.knowledgeCards.filter((_, i) => i !== cardIdx)
    try {
      await authFetch(`/api/tutor/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgeCards: newCards }),
      })
      setSession((prev) => prev ? { ...prev, knowledgeCards: newCards } : prev)
      toast.success("已删除")
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`)
    }
  }, [session, sessionId])

  // 删除单张画板
  const deleteVisualBoard = useCallback(async (boardIdx: number) => {
    if (!session) return
    if (!confirm("确定删除这张画板？")) return
    const newBoards = session.visualBoards.filter((_, i) => i !== boardIdx)
    try {
      await authFetch(`/api/tutor/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visualBoards: newBoards }),
      })
      setSession((prev) => prev ? { ...prev, visualBoards: newBoards } : prev)
      toast.success("已删除")
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`)
    }
  }, [session, sessionId])

  // 重命名会话
  const saveRename = useCallback(async () => {
    if (!session) return
    const newTitle = titleDraft.trim()
    if (!newTitle || newTitle === session.title) {
      setRenaming(false)
      return
    }
    try {
      await authFetch(`/api/tutor/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      })
      setSession((prev) => prev ? { ...prev, title: newTitle } : prev)
      setRenaming(false)
      toast.success("已重命名")
    } catch (e) {
      toast.error(`重命名失败：${(e as Error).message}`)
    }
  }, [session, sessionId, titleDraft])

  // 归档会话
  const archiveSession = useCallback(async () => {
    if (!session) return
    if (!confirm("归档后会话将从列表隐藏，确定？")) return
    try {
      await authFetch(`/api/tutor/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      })
      toast.success("已归档")
      onBack()
    } catch (e) {
      toast.error(`归档失败：${(e as Error).message}`)
    }
  }, [session, sessionId, onBack])

  // 临时白板另存为独立白板
  const saveWhiteboardAsNew = useCallback(async (data: WhiteboardData) => {
    try {
      // 生成缩略图
      let thumbnail = ""
      try {
        const svg = document.querySelector("svg[data-whiteboard-svg]") as SVGSVGElement | null
        if (svg) {
          const svgData = new XMLSerializer().serializeToString(svg)
          const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
          const url = URL.createObjectURL(svgBlob)
          await new Promise<void>((resolve, reject) => {
            const img = new Image()
            img.onload = () => {
              const MAX = 400
              const w = data.width, h = data.height
              const scale = Math.max(w, h) > MAX ? MAX / Math.max(w, h) : 1
              const tw = Math.round(w * scale), th = Math.round(h * scale)
              const canvas = document.createElement("canvas")
              canvas.width = tw; canvas.height = th
              const ctx = canvas.getContext("2d")
              if (!ctx) return reject(new Error("ctx"))
              ctx.fillStyle = "#ffffff"
              ctx.fillRect(0, 0, tw, th)
              ctx.drawImage(img, 0, 0, tw, th)
              URL.revokeObjectURL(url)
              thumbnail = canvas.toDataURL("image/jpeg", 0.7)
              resolve()
            }
            img.onerror = () => reject(new Error("img load"))
            img.src = url
          })
        }
      } catch (e) {
        console.warn("thumbnail failed:", e)
      }
      const resp = await authFetch("/api/tutor/whiteboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${session?.title || "辅导"} 的画板`,
          strokes: data.strokes,
          backgroundImage: data.backgroundImage,
          width: data.width,
          height: data.height,
          sessionId,
          thumbnail,
        }),
      })
      const result = await resp.json().catch(() => ({}))
      if (resp.ok && result.ok) {
        toast.success("已保存为独立白板")
      } else {
        throw new Error(result?.error || `HTTP ${resp.status}`)
      }
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`)
    }
  }, [session, sessionId])

  const send = async (msg?: string, regenerate = false) => {
    const message = (msg ?? input).trim()
    const images = pendingImages
    if (!message && !images.length && !regenerate) return
    if (streaming) return
    setInput("")
    setPendingImages([])
    setStreaming(true)
    setStreamContent("")
    const ctrl = new AbortController()
    abortRef.current = ctrl

    // 乐观更新：在 UI 中追加用户消息（regenerate 模式不追加）
    if (!regenerate && (message || images.length > 0)) {
      setSession((prev) => prev ? {
        ...prev,
        messages: [...prev.messages, {
          role: "user",
          content: message || "（上传了图片）",
          timestamp: Date.now(),
          images: images.length > 0 ? images : undefined,
        }],
      } : prev)
    }

    await sendTutorChat({
      sessionId,
      message,
      config: aiConfig,
      regenerate,
      images: images.length > 0 ? images : undefined,
      signal: ctrl.signal,
    }, {
      onToken: (token) => setStreamContent((c) => c + token),
      onDone: (fullContent, meta, stage) => {
        setStreamContent("")
        setSession((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            messages: [...prev.messages, {
              role: "assistant" as const,
              content: fullContent,
              timestamp: Date.now(),
              stage,
              meta,
            }],
            stage,
            knowledgeCards: meta.knowledgeCards && meta.knowledgeCards.length > 0
              ? [...prev.knowledgeCards, ...meta.knowledgeCards as KnowledgeCard[]]
              : prev.knowledgeCards,
            visualBoards: meta.visualBoard?.html
              ? [...prev.visualBoards, meta.visualBoard as VisualBoard]
              : prev.visualBoards,
          }
        })
        setStreaming(false)
        abortRef.current = null
      },
      onError: (err) => {
        setStreamContent("")
        setStreaming(false)
        abortRef.current = null
        toast.error(`AI 失败：${err}`)
      },
    })
  }

  const stop = () => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setStreaming(false)
    setStreamContent("")
  }

  if (loading || !session) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const isSolve = session.type === "solve"
  const Icon = isSolve ? Brain : Lightbulb
  const accentColor = isSolve ? "violet" : "amber"

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="flex items-center gap-2 px-3 py-2 border-b shrink-0 bg-background">
        <Button variant="ghost" size="sm" className="size-8 p-0" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className={`size-7 rounded-md bg-${accentColor}-500 text-white flex items-center justify-center shrink-0`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              type="text"
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); saveRename() }
                if (e.key === "Escape") { setRenaming(false); setTitleDraft(session.title) }
              }}
              className="text-sm font-semibold w-full outline-none border-b border-primary bg-transparent"
            />
          ) : (
            <div className="text-sm font-semibold truncate">{session.title}</div>
          )}
          <div className="text-xs text-muted-foreground">
            {isSolve ? "解题模式" : "讲题模式"}
            {isSolve && session.stage > 0 && ` · 阶段 ${session.stage}/6`}
          </div>
        </div>
        {session.questionSnapshot?.number && (
          <div className="text-xs px-2 py-1 rounded bg-muted shrink-0">
            第 {session.questionSnapshot.number} 题
          </div>
        )}
        {/* 更多操作菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="size-8 p-0 shrink-0">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => { setRenaming(true); setTitleDraft(session.title) }}>
              <Pencil className="size-4 mr-2" /> 重命名
            </DropdownMenuItem>
            <DropdownMenuItem onClick={archiveSession}>
              <Archive className="size-4 mr-2" /> 归档
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* 题目图（如果有） */}
      {session.imageCrop && (
        <div className="border-b shrink-0 bg-muted/30 p-2">
          <details>
            <summary className="text-xs text-muted-foreground cursor-pointer select-none">题目截图</summary>
            <div className="mt-2 max-h-60 overflow-auto rounded bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={session.imageCrop} alt="题目" className="max-h-56 mx-auto" />
            </div>
          </details>
        </div>
      )}

      {/* 阶段指示器（解题模式） */}
      {isSolve && (
        <StageIndicator stage={session.stage} />
      )}

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {session.messages.length === 0 && !streaming && (
          <div className="text-center text-muted-foreground py-12">
            <Icon className="size-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              {isSolve ? "点击「开始」按钮，AI 老师会引导你提交作答过程" : "点击「开始讲解」按钮，AI 老师会用画板为你讲解"}
            </p>
          </div>
        )}
        {session.messages.map((m, i) => (
          <MessageBubble key={i} message={m} isSolve={isSolve} onDelete={() => deleteMessage(i)} />
        ))}
        {/* 流式响应 */}
        {streaming && streamContent && (
          <div className="flex gap-2">
            <div className={`size-7 rounded-md bg-${accentColor}-500 text-white flex items-center justify-center shrink-0 mt-0.5`}>
              <Icon className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground mb-1">AI 正在回复…</div>
              <div className="text-sm whitespace-pre-wrap break-words">{streamContent}</div>
            </div>
          </div>
        )}
        {streaming && !streamContent && (
          <div className="flex gap-2">
            <div className={`size-7 rounded-md bg-${accentColor}-500 text-white flex items-center justify-center shrink-0 mt-0.5`}>
              <Icon className="size-4" />
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">思考中…</span>
            </div>
          </div>
        )}
      </div>

      {/* 知识卡片 + 画板（横向滚动条） */}
      {(session.knowledgeCards.length > 0 || session.visualBoards.length > 0) && (
        <div className="border-t shrink-0 p-2 bg-muted/20">
          <div className="text-xs text-muted-foreground mb-1.5">
            知识卡片（{session.knowledgeCards.length}） · 画板（{session.visualBoards.length}）
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {session.knowledgeCards.map((c, i) => (
              <KnowledgeCardItem key={`k${i}`} card={c} onDelete={() => deleteKnowledgeCard(i)} />
            ))}
            {session.visualBoards.map((b, i) => (
              <VisualBoardItem key={`v${i}`} board={b} onDelete={() => deleteVisualBoard(i)} />
            ))}
          </div>
        </div>
      )}

      {/* 输入区 */}
      <div className="border-t shrink-0 p-3 bg-background">
        {/* 待发送图片预览 */}
        {pendingImages.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {pendingImages.map((img, i) => (
              <div key={i} className="relative size-16 rounded-md overflow-hidden border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={`待发送 ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => removePendingImage(i)}
                  className="absolute top-0 right-0 size-5 bg-destructive text-destructive-foreground rounded-bl-md flex items-center justify-center"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          {/* 图片上传按钮 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onFileSelect}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-11 w-11 p-0 shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming}
            title="上传图片（也支持 Ctrl+V 粘贴）"
          >
            <ImagePlus className="size-4" />
          </Button>
          {/* 语音输入 */}
          <VoiceInput
            onText={(text) => setInput((prev) => prev + text)}
            className="shrink-0"
          />
          {/* 交互白板切换 */}
          <Button
            variant={showWhiteboard ? "default" : "ghost"}
            size="sm"
            className="h-11 w-11 p-0 shrink-0"
            onClick={() => setShowWhiteboard((v) => !v)}
            title="交互白板（可在解题/讲题时画画）"
          >
            <Pen className="size-4" />
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isSolve ? "在这里写你的解题过程或回复 AI 老师…（可粘贴图片）" : "在这里提问…（可粘贴图片）"}
            className="min-h-[44px] max-h-32 resize-none text-sm flex-1"
            rows={1}
            disabled={streaming}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          {streaming ? (
            <Button variant="destructive" size="sm" className="h-11 shrink-0" onClick={stop}>
              <Square className="size-4" />
            </Button>
          ) : (
            <>
              {session.messages.length === 0 && (
                <Button
                  variant="default"
                  size="sm"
                  className={`h-11 shrink-0 bg-${accentColor}-500 hover:bg-${accentColor}-600`}
                  onClick={() => send(isSolve ? "请开始第 1 阶段。" : "请开始讲题。")}
                >
                  {isSolve ? "开始" : "开始讲解"}
                </Button>
              )}
              {session.messages.length > 0 && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-11 shrink-0"
                    onClick={() => send("", true)}
                    title="重新生成最后一条 AI 回复"
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className={`h-11 shrink-0 bg-${accentColor}-500 hover:bg-${accentColor}-600`}
                    onClick={() => send()}
                    disabled={!input.trim() && pendingImages.length === 0}
                  >
                    <Send className="size-4" />
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 交互白板（弹出全屏覆盖） */}
      {showWhiteboard && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <header className="flex items-center gap-2 px-3 py-2 border-b shrink-0 bg-background">
            <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => setShowWhiteboard(false)}>
              <ChevronDown className="size-4" />
            </Button>
            <div className="size-7 rounded-md bg-cyan-500 text-white flex items-center justify-center shrink-0">
              <Pen className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">交互白板</div>
              <div className="text-xs text-muted-foreground">画完后可「另存」为独立白板</div>
            </div>
          </header>
          <Whiteboard
            initialStrokes={wbStrokes}
            width={1200}
            height={800}
            onChange={setWbStrokes}
            onSaveAsNew={saveWhiteboardAsNew}
            className="flex-1"
          />
        </div>
      )}
    </div>
  )
}

function StageIndicator({ stage }: { stage: number }) {
  const stages = [
    { id: 1, name: "提交作答" },
    { id: 2, name: "推测思路" },
    { id: 3, name: "评析错因" },
    { id: 4, name: "反例辨误" },
    { id: 5, name: "拓展知识" },
    { id: 6, name: "自检变式" },
  ]
  return (
    <div className="border-b shrink-0 px-3 py-2 bg-muted/30 overflow-x-auto">
      <div className="flex items-center gap-1 min-w-max">
        {stages.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
              s.id < stage ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
              : s.id === stage ? "bg-violet-500 text-white"
              : "bg-muted text-muted-foreground"
            }`}>
              <span className="font-medium">{s.id}</span>
              <span className="hidden sm:inline">{s.name}</span>
            </div>
            {i < stages.length - 1 && (
              <div className={`w-3 h-px ${s.id < stage ? "bg-emerald-400" : "bg-muted-foreground/30"}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function MessageBubble({ message, isSolve, onDelete }: { message: ChatMessage; isSolve: boolean; onDelete?: () => void }) {
  const isUser = message.role === "user"
  const accentColor = isSolve ? "violet" : "amber"
  const Icon = isUser ? null : (isSolve ? Brain : Lightbulb)
  // 提取纯文本（剥离 JSON 包装）
  const displayContent = (() => {
    if (isUser) return message.content
    // assistant：可能内容是 JSON 包装
    const txt = message.content
    if (txt.trim().startsWith("{")) {
      try {
        const obj = JSON.parse(txt)
        return obj.content || obj.summary || txt
      } catch {}
    }
    return txt
  })()
  return (
    <div className={`group flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      {!isUser && (
        <div className={`size-7 rounded-md bg-${accentColor}-500 text-white flex items-center justify-center shrink-0 mt-0.5`}>
          {Icon && <Icon className="size-4" />}
        </div>
      )}
      <div className={`flex-1 min-w-0 ${isUser ? "max-w-[80%]" : ""}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-muted-foreground">
            {isUser ? "你" : "AI 老师"}
            {!isUser && message.stage && ` · 阶段 ${message.stage}`}
          </span>
          {/* 删除消息按钮（hover 显示） */}
          {onDelete && (
            <button
              onClick={onDelete}
              className="opacity-0 group-hover:opacity-100 transition-opacity size-5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center"
              title="删除这条消息"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
        {/* 用户上传的图片 */}
        {isUser && message.images && message.images.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {message.images.map((img, i) => (
              <div key={i} className="size-24 rounded-md overflow-hidden border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={`附件 ${i + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
        <div className={`text-sm whitespace-pre-wrap break-words ${isUser ? "bg-muted rounded-lg p-2.5" : ""}`}>
          {renderInlineContent(displayContent)}
        </div>
        {/* SVG 可视化（如有） */}
        {!isUser && message.meta?.visualization?.svg && (
          <div className="mt-2 p-2 rounded-lg bg-muted/50">
            <div className="text-xs text-muted-foreground mb-1">{message.meta.visualization.caption || "示意图"}</div>
            <div
              className="w-full overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: message.meta.visualization.svg }}
            />
          </div>
        )}
        {/* 讲题模式 visualBoard（直接渲染） */}
        {!isUser && message.meta?.visualBoard?.html && (
          <div className="mt-2 rounded-lg border overflow-hidden">
            <VisualBoardItem
              board={message.meta.visualBoard as VisualBoard}
              expanded
            />
          </div>
        )}
        {/* TTS */}
        {!isUser && displayContent && (
          <TTSPlayer
            text={stripInline(displayContent)}
            className="mt-1 -ml-2"
          />
        )}
      </div>
    </div>
  )
}

/** 渲染内联标签（<b> <i> <u> <br> <code> <math>） */
function renderInlineContent(text: string): React.ReactNode {
  if (!text) return null
  // 简易处理：把 <br> 转换为 \n，<b>/<i>/<u>/<code> 转换为对应元素
  // 注：完整方案需要 HTML parser，这里用正则做最简实现
  const parts: React.ReactNode[] = []
  const tokens = text.split(/(<[^>]+>)/g)
  let key = 0
  let bold = false, italic = false, underline = false, code = false
  for (const t of tokens) {
    if (t === "<b>" || t === "<strong>") { bold = true; continue }
    if (t === "</b>" || t === "</strong>") { bold = false; continue }
    if (t === "<i>" || t === "<em>") { italic = true; continue }
    if (t === "</i>" || t === "</em>") { italic = false; continue }
    if (t === "<u>") { underline = true; continue }
    if (t === "</u>") { underline = false; continue }
    if (t === "<code>") { code = true; continue }
    if (t === "</code>") { code = false; continue }
    if (t === "<br>" || t === "<br/>") { parts.push(<br key={key++} />); continue }
    if (t.startsWith("<") && t.endsWith(">")) continue  // 跳过未知标签
    if (!t) continue
    let node: React.ReactNode = t
    if (code) node = <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">{t}</code>
    else if (bold) node = <strong>{t}</strong>
    else if (italic) node = <em>{t}</em>
    if (underline) node = <u>{node}</u>
    parts.push(<span key={key++}>{node}</span>)
  }
  return parts
}

function stripInline(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim()
}

function KnowledgeCardItem({ card, onDelete }: { card: KnowledgeCard; onDelete?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="group shrink-0 w-64 rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center">
        <button onClick={() => setOpen((o) => !o)} className="flex-1 text-left p-2 min-w-0">
          <div className="text-xs font-medium truncate">{card.title}</div>
          {card.summary && (
            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{card.summary}</div>
          )}
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 transition-opacity mr-1 size-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center shrink-0"
            title="删除卡片"
          >
            <Trash2 className="size-3" />
          </button>
        )}
      </div>
      {open && card.svg && (
        <div className="border-t p-1 bg-muted/30 overflow-x-auto">
          <div dangerouslySetInnerHTML={{ __html: card.svg }} />
        </div>
      )}
    </div>
  )
}

function VisualBoardItem({ board, expanded = false, onDelete }: { board: VisualBoard; expanded?: boolean; onDelete?: () => void }) {
  const [open, setOpen] = useState(expanded)
  // 包装 HTML：加 charset meta 防止中文乱码 + 基础样式
  const fullHtml = board.html
    ? `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif;background:transparent}</style></head><body>${board.html}</body></html>`
    : ""
  return (
    <div className="group shrink-0 w-80 rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center">
        <button onClick={() => setOpen((o) => !o)} className="flex-1 text-left p-2 min-w-0">
          <div className="text-xs font-medium truncate">{board.caption || "动态画板"}</div>
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 transition-opacity mr-1 size-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center shrink-0"
            title="删除画板"
          >
            <Trash2 className="size-3" />
          </button>
        )}
      </div>
      {open && fullHtml && (
        <div className="border-t bg-white">
          <iframe
            srcDoc={fullHtml}
            className="w-full border-0"
            style={{ height: board.height || 300, maxWidth: board.width || "100%" }}
            sandbox="allow-scripts"
            title={board.caption || "画板"}
          />
        </div>
      )}
    </div>
  )
}

/** 缩放图片到指定最大边长，返回 dataUrl */
async function resizeImage(dataUrl: string, maxSide: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight
      const scale = Math.max(w, h) > maxSide ? maxSide / Math.max(w, h) : 1
      const sw = Math.round(w * scale), sh = Math.round(h * scale)
      const canvas = document.createElement("canvas")
      canvas.width = sw; canvas.height = sh
      const ctx = canvas.getContext("2d")
      if (!ctx) return reject(new Error("画布初始化失败"))
      ctx.drawImage(img, 0, 0, sw, sh)
      resolve(canvas.toDataURL("image/jpeg", 0.9))
    }
    img.onerror = () => reject(new Error("图片加载失败"))
    img.src = dataUrl
  })
}
