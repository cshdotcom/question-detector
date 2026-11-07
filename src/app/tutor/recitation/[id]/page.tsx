"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter, useParams } from "next/navigation"
import {
  ArrowLeft, Loader2, Mic, Square, CheckCircle2, XCircle, Brain, Lightbulb,
  Volume2, RefreshCw, BookOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { authFetch } from "@/lib/auth-fetch"
import { TTSPlayer } from "@/components/question-detector/TTSPlayer"
import { VoiceInput } from "@/components/question-detector/VoiceInput"
import { toast } from "sonner"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"

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
  answers: { blankId: string; userAnswer: string; correct: boolean }[]
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

export default function RecitationPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id || ""
  const [rec, setRec] = useState<RecitationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  // 挖空测试
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState(false)
  // AI 监督
  const [recording, setRecording] = useState(false)
  const [userSpeech, setUserSpeech] = useState("")
  const [evaluating, setEvaluating] = useState(false)
  const [evaluation, setEvaluation] = useState<AIEvaluation | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

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

  // 挖空测试：检查答案
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
    toast.success(`答对 ${correctCount}/${rec.fillBlanks.length} 题（${progress}%）`)
  }

  // AI 监督：录音
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
        // 转 base64 发给后端 ASR
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

  // AI 监督：评价
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
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`)
      }
      setEvaluation(data.evaluation)
      toast.success(`AI 评分：${data.evaluation.score} 分`)
    } catch (e) {
      toast.error(`评价失败：${(e as Error).message}`)
    } finally {
      setEvaluating(false)
    }
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
    <div className="min-h-[100dvh] bg-background">
      <SonnerToaster />
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => router.push("/tutor/recitations")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="size-7 rounded-md bg-indigo-500 text-white flex items-center justify-center">
            <BookOpen className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{rec.title}</div>
            <div className="text-xs text-muted-foreground">
              {rec.mode === "fillblank" ? "挖空测试" : rec.mode === "supervised" ? "AI 监督背诵" : rec.mode === "selftest" ? "自测模式" : "AI 帮助记忆"}
              · 进度 {rec.progress}%
            </div>
          </div>
          <TTSPlayer text={rec.content} />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* 原文 */}
        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm font-medium mb-2">原文</div>
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{rec.content}</div>
          {rec.imageData && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={rec.imageData} alt="附图" className="mt-2 max-h-60 rounded border" />
          )}
        </div>

        {/* 挖空测试模式 */}
        {rec.mode === "fillblank" && rec.fillBlanks.length > 0 && (
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="text-sm font-medium">挖空测试（{rec.fillBlanks.length} 空）</div>
            {rec.fillBlanks.map((b, i) => (
              <div key={b.blankId} className="space-y-1">
                <div className="text-sm">
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
                </div>
                {checked && (
                  <div className={`text-xs flex items-center gap-1 ${userAnswers[b.blankId]?.trim() === b.answer.trim() ? "text-emerald-600" : "text-destructive"}`}>
                    {userAnswers[b.blankId]?.trim() === b.answer.trim() ? (
                      <><CheckCircle2 className="size-3" /> 正确</>
                    ) : (
                      <><XCircle className="size-3" /> 答案：{b.answer}</>
                    )}
                  </div>
                )}
              </div>
            ))}
            <Button onClick={checkAnswers} disabled={checked} className="w-full">
              <CheckCircle2 className="size-4 mr-1" /> 检查答案
            </Button>
          </div>
        )}

        {/* AI 监督背诵模式 */}
        {rec.mode === "supervised" && (
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="text-sm font-medium">AI 监督背诵</div>
            <div className="text-xs text-muted-foreground">
              点击录音，背诵全文。背完后 AI 会听你的背诵，找出漏背/错背的地方并评分。
            </div>
            <div className="flex gap-2 items-center">
              <Button
                variant={recording ? "destructive" : "default"}
                onClick={recording ? stopRecording : startRecording}
              >
                {recording ? <Square className="size-4 mr-1" /> : <Mic className="size-4 mr-1" />}
                {recording ? "停止录音" : "开始背诵"}
              </Button>
            </div>
            {userSpeech && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">你的背诵（语音转文字）</div>
                <Textarea
                  value={userSpeech}
                  onChange={(e) => setUserSpeech(e.target.value)}
                  className="min-h-[80px] text-sm"
                  rows={3}
                />
                <div className="mt-2 flex gap-2">
                  <VoiceInput onText={(t) => setUserSpeech((p) => p + t)} className="shrink-0" />
                  <Button onClick={evaluate} disabled={evaluating} className="flex-1">
                    {evaluating ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Brain className="size-4 mr-1" />}
                    让 AI 评价
                  </Button>
                </div>
              </div>
            )}
            {/* AI 评价结果 */}
            {evaluation && (
              <div className="rounded-lg bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">AI 评价</span>
                  <span className="text-2xl font-bold text-indigo-500">{evaluation.score}分</span>
                </div>
                {evaluation.errors && evaluation.errors.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">错误（{evaluation.errors.length}处）</div>
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

        {/* AI 帮助记忆模式 */}
        {rec.mode === "aihelp" && memoryAids.mnemonics && (
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="size-4 text-amber-500" />
              <div className="text-sm font-medium">AI 记忆帮助</div>
            </div>
            {memoryAids.mnemonics && Array.isArray(memoryAids.mnemonics) && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">记忆口诀</div>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {memoryAids.mnemonics.map((m: string, i: number) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
            {memoryAids.mindmap && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">思维导图</div>
                <div className="p-3 rounded bg-muted/30">
                  <div className="text-sm font-medium mb-2">中心：{memoryAids.mindmap.center}</div>
                  {memoryAids.mindmap.branches && Array.isArray(memoryAids.mindmap.branches) && (
                    <div className="space-y-2">
                      {memoryAids.mindmap.branches.map((b: { name: string; items?: string[] }, i: number) => (
                        <div key={i} className="ml-4">
                          <div className="text-sm font-medium">├─ {b.name}</div>
                          {b.items && Array.isArray(b.items) && (
                            <ul className="ml-4 list-none text-sm text-muted-foreground">
                              {b.items.map((it: string, j: number) => (
                                <li key={j}>│  ├─ {it}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <TTSPlayer text={memoryAids.mnemonics ? memoryAids.mnemonics.join("。") : rec.content} />
          </div>
        )}

        {/* 自测模式 */}
        {rec.mode === "selftest" && (
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="text-sm font-medium">自测模式</div>
            <div className="text-xs text-muted-foreground">
              先看原文，然后试着不看原文背诵。背完后用 TTS 朗读原文对比。
            </div>
            <details>
              <summary className="text-sm cursor-pointer text-indigo-500">查看原文（背诵时不要看）</summary>
              <div className="mt-2 p-3 rounded bg-muted/30 text-sm whitespace-pre-wrap">{rec.content}</div>
            </details>
            <TTSPlayer text={rec.content} />
          </div>
        )}
      </div>
    </div>
  )
}
