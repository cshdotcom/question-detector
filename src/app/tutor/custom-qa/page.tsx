"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Loader2, ImagePlus, X, Mic, Send, Sparkles, Pen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { authFetch } from "@/lib/auth-fetch"
import { VoiceInput } from "@/components/question-detector/VoiceInput"
import { TTSPlayer } from "@/components/question-detector/TTSPlayer"
import { toast } from "sonner"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"

interface ChatMsg {
  role: "user" | "assistant"
  content: string
  image?: string
}

export default function CustomQAPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState("")
  const [pendingImage, setPendingImage] = useState<string>("")
  const [streaming, setStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      const img = new Image()
      img.onload = () => {
        const MAX = 1200
        const scale = Math.max(img.naturalWidth, img.naturalHeight) > MAX ? MAX / Math.max(img.naturalWidth, img.naturalHeight) : 1
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(img.naturalWidth * scale)
        canvas.height = Math.round(img.naturalHeight * scale)
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        setPendingImage(canvas.toDataURL("image/jpeg", 0.9))
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  const send = async () => {
    const text = input.trim()
    if (!text && !pendingImage) return
    if (streaming) return

    const userMsg: ChatMsg = {
      role: "user",
      content: text || "（上传了图片）",
      image: pendingImage || undefined,
    }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setPendingImage("")
    setStreaming(true)
    setStreamContent("")

    try {
      let config
      try { const raw = localStorage.getItem("ai-config"); if (raw) config = JSON.parse(raw) } catch {}

      // 直接调后端 AI（不走 tutor session，用临时 API）
      const resp = await authFetch("/api/tutor/custom-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          image: pendingImage,
          config,
          history: messages.slice(-10),  // 最近 10 条
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`)
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.text }])
    } catch (e) {
      toast.error(`AI 失败：${(e as Error).message}`)
    } finally {
      setStreaming(false)
      setStreamContent("")
    }
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-cyan-50 via-background to-violet-50 dark:from-cyan-950/20 dark:via-background dark:to-violet-950/20">
      <SonnerToaster />
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => router.push("/tutor")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="size-7 rounded-md bg-cyan-500 text-white flex items-center justify-center">
            <Sparkles className="size-4" />
          </div>
          <h1 className="text-lg font-bold">自定义问答</h1>
          <span className="text-xs text-muted-foreground">上传图片 + 自定义问题</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col h-[calc(100dvh-60px)]">
        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto space-y-3 pb-3">
          {messages.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Sparkles className="size-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">上传图片 + 输入你的问题</p>
              <p className="text-xs mt-1">AI 会帮你解答、讲解、分析</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`size-7 rounded-md flex items-center justify-center shrink-0 ${m.role === "user" ? "bg-muted" : "bg-cyan-500 text-white"}`}>
                {m.role === "user" ? "你" : <Sparkles className="size-4" />}
              </div>
              <div className={`flex-1 min-w-0 ${m.role === "user" ? "max-w-[80%]" : ""}`}>
                {m.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image} alt="附图" className="max-h-48 mb-2 rounded border" />
                )}
                <div className={`text-sm whitespace-pre-wrap break-words ${m.role === "user" ? "bg-muted rounded-lg p-2.5" : ""}`}>
                  {m.content}
                </div>
                {m.role === "assistant" && (
                  <TTSPlayer text={m.content} className="mt-1 -ml-2" />
                )}
              </div>
            </div>
          ))}
          {streaming && (
            <div className="flex gap-2">
              <div className="size-7 rounded-md bg-cyan-500 text-white flex items-center justify-center shrink-0">
                <Sparkles className="size-4" />
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span className="text-sm">思考中…</span>
              </div>
            </div>
          )}
        </div>

        {/* 输入区 */}
        <div className="border-t pt-3 shrink-0">
          {pendingImage && (
            <div className="mb-2 relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pendingImage} alt="待发送" className="size-20 object-cover rounded-md border" />
              <button
                onClick={() => setPendingImage("")}
                className="absolute top-0 right-0 size-5 bg-destructive text-destructive-foreground rounded-bl-md flex items-center justify-center"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileSelect} />
            <Button variant="ghost" size="sm" className="h-11 w-11 p-0 shrink-0" onClick={() => fileRef.current?.click()} title="上传图片/拍照">
              <ImagePlus className="size-4" />
            </Button>
            <VoiceInput onText={(t) => setInput((p) => p + t)} className="shrink-0" />
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入你的问题（可附图片）..."
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
            <Button onClick={send} disabled={streaming || (!input.trim() && !pendingImage)} className="h-11 shrink-0 bg-cyan-500 hover:bg-cyan-600">
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
