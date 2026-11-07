"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  ArrowLeft, Loader2, Mic, Square, CheckCircle2, XCircle, Brain, Lightbulb,
  Volume2, RefreshCw, BookOpen, ImagePlus, X, Send, MessageCircle,
  Pen, PenLine, Map, Headphones, Copy, Shuffle, Camera,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { authFetch } from "@/lib/auth-fetch"
import { TTSPlayer } from "@/components/question-detector/TTSPlayer"
import { VoiceInput } from "@/components/question-detector/VoiceInput"
import { CameraCapture } from "@/components/question-detector/CameraCapture"
import { toast } from "sonner"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

interface FillBlank {
  blankId: string
  context: string
  answer: string
}

interface RecitationDetail {
  id: string
  title: string
  content: string
  imageData: string
  mode: string
  fillBlanks: FillBlank[]
  memoryAids: string
  answers: unknown[]
  progress: number
  status: string
  createdAt: number
  updatedAt: number
}

interface AIEvaluation {
  score: number
  errors: { type: string; original: string; userSaid: string; correction: string }[]
  feedback: string
}

// 背书工具栏：1:1 还原截图
const TOOLS = [
  { id: "tts", icon: Volume2, name: "朗读文本", color: "text-blue-500" },
  { id: "quiz", icon: Brain, name: "AI 出题", color: "text-violet-500" },
  { id: "supervised", icon: Mic, name: "AI 督背", color: "text-rose-500" },
  { id: "record", icon: Mic, name: "录音背书", color: "text-amber-500" },
  { id: "mindmap", icon: Map, name: "思维导图", color: "text-emerald-500" },
  { id: "ask", icon: MessageCircle, name: "AI 问问", color: "text-cyan-500" },
  { id: "listen", icon: Headphones, name: "耳返背书", color: "text-indigo-500" },
  { id: "copy", icon: Copy, name: "摹写", color: "text-pink-500" },
  { id: "shuffle", icon: Shuffle, name: "轮盘抽背", color: "text-orange-500" },
]

export default function RecitationPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id || ""
  const [rec, setRec] = useState<RecitationDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // 挖空测试
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState(false)

  // AI 监督 / 录音
  const [recording, setRecording] = useState(false)
  const [userSpeech, setUserSpeech] = useState("")
  const [evaluating, setEvaluating] = useState(false)
  const [evaluation, setEvaluation] = useState<AIEvaluation | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // AI 问问（对话）
  const [askMessages, setAskMessages] = useState<{ role: "user" | "assistant"; content: string; image?: string }[]>([])
  const [askInput, setAskInput] = useState("")
  const [askImage, setAskImage] = useState("")
  const [asking, setAsking] = useState(false)
  const askFileRef = useRef<HTMLInputElement>(null)
  const [cameraOpen, setCameraOpen] = useState(false)

  // 当前激活的工具
  const [activeTool, setActiveTool] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await authFetch(`/api/tutor/recitations/${id}`, { cache: "no-store" })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) {
        setRec(data.recitation)
      } else {
        toast.error("加载失败")
        setTimeout(() => router.push("/tutor/recitations"), 2000)
      }
    } catch (e) {
      toast.error(`加载失败：${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  // 挖空测试检查
  const checkAnswers = async () => {
    if (!rec) return
    setChecked(true)
    const results = rec.fillBlanks.map((b) => ({
      blankId: b.blankId,
      userAnswer: userAnswers[b.blankId] || "",
      correct: (userAnswers[b.blankId] || "").trim() === b.answer.trim(),
    }))
    const correctCount = results.filter((r) => r.correct).length
    const progress = Math.round((correctCount / rec.fillBlanks.length) * 100)
    try {
      await authFetch(`/api/tutor/recitations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: results, progress }),
      })
    } catch {}
    toast.success(`答对 ${correctCount}/${rec.fillBlanks.length}（${progress}%）`)
  }

  // 录音
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr
      const chunks: Blob[] = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      mr.onstop = async () => {
        setRecording(false)
        const blob = new Blob(chunks, { type: "audio/webm" })
        const reader = new FileReader()
        reader.onload = async () => {
          const dataUrl = reader.result as string
          const base64 = dataUrl.split(",")[1]
          try {
            const resp = await authFetch("/api/tutor/asr", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audio: base64, format: "webm" }),
            })
            const data = await resp.json().catch(() => ({}))
            if (data.ok) {
              setUserSpeech(data.text || "")
              toast.success("语音识别完成")
            } else {
              toast.error(`ASR 失败：${data.error}`)
            }
          } catch (e) {
            toast.error(`识别失败：${(e as Error).message}`)
          }
        }
        reader.readAsDataURL(blob)
      }
      mr.start()
      setRecording(true)
    } catch (e) {
      toast.error(`无法访问麦克风：${(e as Error).message}`)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
    }
  }

  // AI 监督评价
  const evaluate = async () => {
    if (!userSpeech.trim()) {
      toast.error("请先背诵（录音）或输入文字")
      return
    }
    setEvaluating(true)
    try {
      let config
      try { const raw = localStorage.getItem("ai-config"); if (raw) config = JSON.parse(raw) } catch {}
      const resp = await authFetch(`/api/tutor/recitations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiListen: { userSpeech }, config }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
      setEvaluation(data.evaluation)
      toast.success(`AI 评分：${data.evaluation.score} 分`)
    } catch (e) {
      toast.error(`评价失败：${(e as Error).message}`)
    } finally {
      setEvaluating(false)
    }
  }

  // AI 问问
  const sendAsk = async () => {
    const text = askInput.trim()
    if (!text && !askImage) return
    const userMsg = { role: "user" as const, content: text || "（上传了图片）", image: askImage || undefined }
    setAskMessages((prev) => [...prev, userMsg])
    setAskInput("")
    setAskImage("")
    setAsking(true)
    try {
      let config
      try { const raw = localStorage.getItem("ai-config"); if (raw) config = JSON.parse(raw) } catch {}
      const resp = await authFetch("/api/tutor/custom-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          image: askImage,
          config,
          history: askMessages.slice(-10),
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.ok) throw new Error(data?.error || `HTTP ${resp.status}`)
      setAskMessages((prev) => [...prev, { role: "assistant", content: data.text }])
    } catch (e) {
      toast.error(`AI 失败：${(e as Error).message}`)
    } finally {
      setAsking(false)
    }
  }

  const onAskFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const MAX = 800
        const scale = Math.max(img.naturalWidth, img.naturalHeight) > MAX ? MAX / Math.max(img.naturalWidth, img.naturalHeight) : 1
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(img.naturalWidth * scale)
        canvas.height = Math.round(img.naturalHeight * scale)
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        setAskImage(canvas.toDataURL("image/jpeg", 0.9))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  // 工具点击
  const onToolClick = (toolId: string) => {
    setActiveTool((prev) => prev === toolId ? null : toolId)
  }

  if (loading || !rec) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const memoryAids = (() => {
    try { return JSON.parse(rec.memoryAids || "{}") } catch { return {} }
  })()

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <SonnerToaster />
      {cameraOpen && (
        <div className="fixed inset-0 z-50 bg-black">
          <CameraCapture
            open={cameraOpen}
            onClose={() => setCameraOpen(false)}
          />
        </div>
      )}
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => router.push("/tutor/recitations")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="size-7 rounded-md bg-indigo-500 text-white flex items-center justify-center">
            <BookOpen className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate flex items-center gap-1">
              {rec.title}
              <button className="text-muted-foreground hover:text-foreground" title="AI 生成标题">
                <PenLine className="size-3" />
              </button>
            </div>
            <div className="text-xs text-muted-foreground">进度 {rec.progress}%</div>
          </div>
          <TTSPlayer text={rec.content} />
        </div>
      </header>

      {/* 原文内容 */}
      <div className="max-w-3xl mx-auto w-full px-4 py-4 flex-1 overflow-y-auto">
        <div className="rounded-xl border bg-card p-4 mb-3">
          {rec.imageData && (
            <div className="mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={rec.imageData} alt="原文图片" className="w-full rounded-lg border" />
            </div>
          )}
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{rec.content}</div>
        </div>

        {/* 挖空测试 */}
        {rec.fillBlanks.length > 0 && (
          <div className="rounded-xl border bg-card p-4 mb-3 space-y-2">
            <div className="text-sm font-medium">挖空测试（{rec.fillBlanks.length} 空）</div>
            {rec.fillBlanks.map((b, i) => (
              <div key={b.blankId} className="text-sm">
                <span className="text-muted-foreground mr-1">{i + 1}.</span>
                {b.context?.split("___").map((part, j, arr) => (
                  <span key={j}>
                    {part}
                    {j < arr.length - 1 && (
                      <Input
                        value={userAnswers[b.blankId] || ""}
                        onChange={(e) => setUserAnswers((prev) => ({ ...prev, [b.blankId]: e.target.value }))}
                        disabled={checked}
                        className="inline-block w-32 h-7 mx-1 text-sm"
                        placeholder="?"
                      />
                    )}
                  </span>
                ))}
                {checked && (
                  <span className={cn("ml-2 text-xs", userAnswers[b.blankId]?.trim() === b.answer.trim() ? "text-emerald-600" : "text-destructive")}>
                    {userAnswers[b.blankId]?.trim() === b.answer.trim() ? "✓" : `✗ ${b.answer}`}
                  </span>
                )}
              </div>
            ))}
            <Button onClick={checkAnswers} disabled={checked} size="sm">
              <CheckCircle2 className="size-3.5 mr-1" /> 检查答案
            </Button>
          </div>
        )}

        {/* AI 监督背诵 */}
        {activeTool === "supervised" && (
          <div className="rounded-xl border bg-card p-4 mb-3 space-y-3">
            <div className="text-sm font-medium">AI 督背</div>
            <div className="text-xs text-muted-foreground">点击录音，背诵全文。背完后 AI 会听你的背诵并评分。</div>
            <Button variant={recording ? "destructive" : "default"} onClick={recording ? stopRecording : startRecording} size="sm">
              {recording ? <Square className="size-3.5 mr-1" /> : <Mic className="size-3.5 mr-1" />}
              {recording ? "停止录音" : "开始背诵"}
            </Button>
            {userSpeech && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">你的背诵（可编辑）</div>
                <Textarea value={userSpeech} onChange={(e) => setUserSpeech(e.target.value)} className="min-h-[80px] text-sm" rows={3} />
                <div className="mt-2 flex gap-2">
                  <VoiceInput onText={(t) => setUserSpeech((p) => p + t)} className="shrink-0" />
                  <Button onClick={evaluate} disabled={evaluating} size="sm" className="flex-1">
                    {evaluating ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Brain className="size-3.5 mr-1" />}
                    让 AI 评价
                  </Button>
                </div>
              </div>
            )}
            {evaluation && (
              <div className="rounded-lg bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">AI 评价</span>
                  <span className="text-2xl font-bold text-indigo-500">{evaluation.score}分</span>
                </div>
                {evaluation.errors?.length > 0 && (
                  <div className="space-y-1">
                    {evaluation.errors.map((e, i) => (
                      <div key={i} className="text-xs p-2 rounded bg-destructive/10">
                        <div className="font-medium">{e.type}</div>
                        <div>原文：{e.original}</div>
                        <div>你背的：{e.userSaid}</div>
                        <div className="text-emerald-600">正确：{e.correction}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-sm text-muted-foreground">{evaluation.feedback}</div>
              </div>
            )}
          </div>
        )}

        {/* AI 问问（对话） */}
        {activeTool === "ask" && (
          <div className="rounded-xl border bg-card p-4 mb-3 space-y-2">
            <div className="text-sm font-medium">AI 问问</div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {askMessages.map((m, i) => (
                <div key={i} className={cn("text-sm", m.role === "user" ? "text-right" : "")}>
                  {m.image && <img src={m.image} alt="" className="max-h-20 rounded border mb-1" />}
                  <div className={cn("inline-block p-2 rounded-lg", m.role === "user" ? "bg-muted" : "bg-cyan-50 dark:bg-cyan-950/30")}>
                    {m.content}
                  </div>
                </div>
              ))}
              {asking && <div className="text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin inline mr-1" />思考中…</div>}
            </div>
            {askImage && (
              <div className="relative inline-block">
                <img src={askImage} alt="" className="size-16 object-cover rounded border" />
                <button onClick={() => setAskImage("")} className="absolute top-0 right-0 size-4 bg-destructive text-destructive-foreground rounded-bl flex items-center justify-center">
                  <X className="size-2.5" />
                </button>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <input ref={askFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onAskFileSelect} />
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0" onClick={() => askFileRef.current?.click()} title="上传图片">
                <ImagePlus className="size-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0" onClick={() => setCameraOpen(true)} title="拍照">
                <Camera className="size-4" />
              </Button>
              <VoiceInput onText={(t) => setAskInput((p) => p + t)} className="shrink-0" />
              <Textarea value={askInput} onChange={(e) => setAskInput(e.target.value)} placeholder="问 AI 任何关于这段内容的问题…" className="min-h-[36px] text-sm flex-1" rows={1} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAsk() } }} />
              <Button onClick={sendAsk} disabled={asking} size="sm" className="h-9 shrink-0"><Send className="size-4" /></Button>
            </div>
          </div>
        )}

        {/* AI 帮助记忆 */}
        {activeTool === "mindmap" && memoryAids.mnemonics && (
          <div className="rounded-xl border bg-card p-4 mb-3 space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="size-4 text-amber-500" />
              <div className="text-sm font-medium">AI 帮助记忆</div>
            </div>
            {Array.isArray(memoryAids.mnemonics) && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">记忆口诀</div>
                <ul className="list-disc pl-5 space-y-1 text-sm">{memoryAids.mnemonics.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul>
              </div>
            )}
            {memoryAids.mindmap && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">思维导图</div>
                <div className="p-3 rounded bg-muted/30">
                  <div className="text-sm font-medium mb-2">中心：{memoryAids.mindmap.center}</div>
                  {Array.isArray(memoryAids.mindmap.branches) && (
                    <div className="space-y-2">
                      {memoryAids.mindmap.branches.map((b: { name: string; items?: string[] }, i: number) => (
                        <div key={i} className="ml-4">
                          <div className="text-sm font-medium">├─ {b.name}</div>
                          {Array.isArray(b.items) && <ul className="ml-4 text-sm text-muted-foreground">{b.items.map((it: string, j: number) => <li key={j}>│  ├─ {it}</li>)}</ul>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <TTSPlayer text={Array.isArray(memoryAids.mnemonics) ? memoryAids.mnemonics.join("。") : rec.content} />
          </div>
        )}

        {/* 录音背书 */}
        {activeTool === "record" && (
          <div className="rounded-xl border bg-card p-4 mb-3 space-y-3">
            <div className="text-sm font-medium">录音背书</div>
            <div className="text-xs text-muted-foreground">录音背诵给自己听，对比原文检查。</div>
            <Button variant={recording ? "destructive" : "default"} onClick={recording ? stopRecording : startRecording} size="sm">
              {recording ? <Square className="size-3.5 mr-1" /> : <Mic className="size-3.5 mr-1" />}
              {recording ? "停止" : "开始录音"}
            </Button>
            {userSpeech && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">你背的</div>
                <div className="text-sm p-2 rounded bg-muted/30">{userSpeech}</div>
              </div>
            )}
          </div>
        )}

        {/* 耳返背书 */}
        {activeTool === "listen" && (
          <div className="rounded-xl border bg-card p-4 mb-3 space-y-3">
            <div className="text-sm font-medium">耳返背书</div>
            <div className="text-xs text-muted-foreground">AI 朗读原文 → 你跟读 → 对比。</div>
            <TTSPlayer text={rec.content} />
          </div>
        )}

        {/* 摹写 */}
        {activeTool === "copy" && (
          <div className="rounded-xl border bg-card p-4 mb-3 space-y-3">
            <div className="text-sm font-medium">摹写</div>
            <div className="text-xs text-muted-foreground">在下方文本框中默写原文，完成后对比。</div>
            <Textarea placeholder="在这里默写原文…" className="min-h-[200px] text-sm" />
          </div>
        )}

        {/* 轮盘抽背 */}
        {activeTool === "shuffle" && rec.fillBlanks.length > 0 && (
          <div className="rounded-xl border bg-card p-4 mb-3 space-y-3">
            <div className="text-sm font-medium">轮盘抽背</div>
            <div className="text-xs text-muted-foreground">随机抽一个空让你回答。</div>
            <ShuffleQuiz fillBlanks={rec.fillBlanks} userAnswers={userAnswers} setUserAnswers={setUserAnswers} />
          </div>
        )}
      </div>

      {/* 底部背书工具栏（1:1 还原截图） */}
      <div className="border-t bg-card shrink-0">
        <div className="max-w-3xl mx-auto px-2 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">背书工具</span>
            <button className="text-xs text-indigo-500">自定义编辑</button>
          </div>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-9">
            {TOOLS.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  onClick={() => onToolClick(t.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
                    activeTool === t.id ? "bg-indigo-100 dark:bg-indigo-950/40" : "hover:bg-accent"
                  )}
                >
                  <Icon className={cn("size-5", t.color)} />
                  <span className="text-[10px] text-center leading-tight">{t.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// 轮盘抽背组件
function ShuffleQuiz({ fillBlanks, userAnswers, setUserAnswers }: {
  fillBlanks: FillBlank[]
  userAnswers: Record<string, string>
  setUserAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)

  const next = () => {
    setShowAnswer(false)
    setCurrentIdx((prev) => (prev + 1) % fillBlanks.length)
  }

  if (fillBlanks.length === 0) return null
  const current = fillBlanks[currentIdx]

  return (
    <div className="space-y-2">
      <div className="text-sm p-3 rounded bg-muted/30">
        <span className="text-muted-foreground mr-1">第 {currentIdx + 1} 空：</span>
        {current.context?.split("___").map((part, j, arr) => (
          <span key={j}>
            {part}
            {j < arr.length - 1 && (
              <span className="inline-block w-24 h-7 mx-1 border-b-2 border-dashed border-muted-foreground align-middle" />
            )}
          </span>
        ))}
      </div>
      {showAnswer ? (
        <div className="text-sm text-emerald-600">答案：{current.answer}</div>
      ) : (
        <Button onClick={() => setShowAnswer(true)} size="sm" variant="outline">显示答案</Button>
      )}
      <Button onClick={next} size="sm">下一个 <Shuffle className="size-3.5 ml-1" /></Button>
    </div>
  )
}
