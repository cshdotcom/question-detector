"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Loader2, Pen, ImagePlus, X, Mic, Lightbulb,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { authFetch } from "@/lib/auth-fetch"
import { VoiceInput } from "@/components/question-detector/VoiceInput"
import { toast } from "sonner"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"

const GENRES_CN = ["议论文", "记叙文", "说明文", "应用文", "散文", "读后感", "随笔"]
const GENRES_EN = ["essay", "narrative", "argumentative", "descriptive", "letter", "report", "story"]
const WORD_COUNTS = [200, 400, 600, 800, 1000, 1200, 1500]

export default function EssayNewPage() {
  const router = useRouter()
  const [type, setType] = useState<"chinese" | "english">("chinese")
  const [title, setTitle] = useState("")
  const [prompt, setPrompt] = useState("")
  const [wordCount, setWordCount] = useState(800)
  const [genre, setGenre] = useState("议论文")
  const [imageData, setImageData] = useState("")
  const [generating, setGenerating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      // 缩到 ≤800
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
        setImageData(canvas.toDataURL("image/jpeg", 0.9))
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  const generate = async (outlineOnly = false) => {
    if (!title.trim()) {
      toast.error("请填写题目")
      return
    }
    setGenerating(true)
    try {
      // 读取 AI 配置
      let config
      try {
        const raw = localStorage.getItem("ai-config")
        if (raw) config = JSON.parse(raw)
      } catch {}
      const resp = await authFetch("/api/tutor/essays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type, title: title.trim(), prompt: prompt.trim(),
          wordCount, genre, imageData, config,
          generate: !outlineOnly,
          generateOutline: outlineOnly,
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.ok) {
        throw new Error(data?.error || `HTTP ${resp.status}`)
      }
      toast.success(outlineOnly ? "写作思路已生成" : "范文生成完成")
      router.push(`/tutor/essay/${data.id}`)
    } catch (e) {
      toast.error(`生成失败：${(e as Error).message}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-emerald-50 via-background to-rose-50 dark:from-emerald-950/20 dark:via-background dark:to-rose-950/20">
      <SonnerToaster />
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => router.push("/tutor")}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="size-7 rounded-md bg-emerald-500 text-white flex items-center justify-center">
            <Pen className="size-4" />
          </div>
          <h1 className="text-lg font-bold">AI 写作文</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* 类型切换 */}
        <div className="flex gap-2">
          <button
            onClick={() => { setType("chinese"); setGenre("议论文") }}
            className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${type === "chinese" ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" : "border-border hover:bg-accent"}`}
          >
            语文作文
          </button>
          <button
            onClick={() => { setType("english"); setGenre("essay") }}
            className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${type === "english" ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300" : "border-border hover:bg-accent"}`}
          >
            英语作文
          </button>
        </div>

        {/* 题目 */}
        <div>
          <Label className="text-sm mb-1.5 block">{type === "chinese" ? "作文题目" : "Essay Topic"}</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === "chinese" ? "如：那一刻，我长大了" : "e.g. The Day I Learned to Face Challenges"}
            className="h-10"
          />
        </div>

        {/* 要求 */}
        <div>
          <Label className="text-sm mb-1.5 block">{type === "chinese" ? "作文要求（可选）" : "Requirements (optional)"}</Label>
          <div className="flex gap-2 items-end">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={type === "chinese" ? "补充要求：立意、选材、特殊限制等" : "Additional requirements: tone, focus, etc."}
              className="min-h-[80px] resize-none text-sm flex-1"
              rows={3}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileSelect}
            />
            <Button variant="outline" size="sm" className="h-10 w-10 p-0 shrink-0" onClick={() => fileInputRef.current?.click()} title="拍题/上传图片">
              <ImagePlus className="size-4" />
            </Button>
            <VoiceInput onText={(t) => setPrompt((p) => p + t)} className="shrink-0" />
          </div>
          {imageData && (
            <div className="mt-2 relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageData} alt="题目附图" className="size-24 object-cover rounded-md border" />
              <button
                onClick={() => setImageData("")}
                className="absolute top-0 right-0 size-5 bg-destructive text-destructive-foreground rounded-bl-md flex items-center justify-center"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
        </div>

        {/* 字数 */}
        <div>
          <Label className="text-sm mb-1.5 block">{type === "chinese" ? "字数" : "Word Count"}</Label>
          <div className="flex flex-wrap gap-2">
            {WORD_COUNTS.map((w) => (
              <button
                key={w}
                onClick={() => setWordCount(w)}
                className={`px-3 py-1.5 rounded-md text-xs ${wordCount === w ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
              >
                {w}{type === "chinese" ? "字" : "词"}
              </button>
            ))}
          </div>
        </div>

        {/* 文体 */}
        <div>
          <Label className="text-sm mb-1.5 block">{type === "chinese" ? "文体" : "Genre"}</Label>
          <div className="flex flex-wrap gap-2">
            {(type === "chinese" ? GENRES_CN : GENRES_EN).map((g) => (
              <button
                key={g}
                onClick={() => setGenre(g)}
                className={`px-3 py-1.5 rounded-md text-xs ${genre === g ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* 生成按钮：写思路 + 写范文 */}
        <div className="flex gap-2">
          <Button
            onClick={() => generate(true)}
            disabled={generating || !title.trim()}
            variant="outline"
            className="flex-1 h-12 text-base"
          >
            {generating ? <Loader2 className="size-5 mr-2 animate-spin" /> : <Lightbulb className="size-5 mr-2" />}
            写思路
          </Button>
          <Button
            onClick={() => generate(false)}
            disabled={generating || !title.trim()}
            className="flex-1 h-12 bg-emerald-500 hover:bg-emerald-600 text-base"
          >
            {generating ? <Loader2 className="size-5 mr-2 animate-spin" /> : <Pen className="size-5 mr-2" />}
            写范文
          </Button>
        </div>
      </div>
    </div>
  )
}
