"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Mic, Square, Loader2, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { authFetch } from "@/lib/auth-fetch"
import { toast } from "sonner"

interface VoiceInputProps {
  onText: (text: string) => void
  className?: string
}

type ASREngine = "browser" | "ai" | "thirdparty"

const STORAGE_KEY = "tutor-asr-config"

interface ASRConfig {
  engine: ASREngine
  browserLang: string  // "zh-CN" | "en-US" | ...
  autoAppend: boolean  // true: 追加到现有文本，false: 替换
  // 第三方 ASR
  thirdpartyASRUrl: string
  thirdpartyASRKey: string
  thirdpartyASRModel: string
}

function loadConfig(): ASRConfig {
  if (typeof window === "undefined") {
    return defaultConfig()
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultConfig(), ...JSON.parse(raw) }
  } catch {}
  return defaultConfig()
}

function defaultConfig(): ASRConfig {
  return { engine: "ai", browserLang: "zh-CN", autoAppend: true, thirdpartyASRUrl: "", thirdpartyASRKey: "", thirdpartyASRModel: "" }
}

function saveConfig(cfg: ASRConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) } catch {}
}

// 浏览器 SpeechRecognition 类型（非标准，需要 cast）
interface SpeechRecognitionResult {
  0: { transcript: string }
  isFinal: boolean
}
interface SpeechRecognitionEvent {
  results: { length: number; [i: number]: SpeechRecognitionResult }
  resultIndex: number
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: unknown) => void) | null
  onend: (() => void) | null
}

function getBrowserSpeechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
  if (!Ctor) return null
  return new Ctor()
}

export function VoiceInput({ onText, className }: VoiceInputProps) {
  const [config, setConfig] = useState<ASRConfig>(loadConfig)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [interimText, setInterimText] = useState("")
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const browserRecognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      stopAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopAll = useCallback(() => {
    if (browserRecognitionRef.current) {
      try { browserRecognitionRef.current.stop() } catch {}
      browserRecognitionRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop() } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setRecording(false)
    setInterimText("")
  }, [])

  // 浏览器 ASR
  const startBrowserASR = useCallback(() => {
    const recognition = getBrowserSpeechRecognition()
    if (!recognition) {
      toast.error("浏览器不支持语音识别，请改用 AI ASR")
      return
    }
    recognition.lang = config.browserLang
    recognition.continuous = true
    recognition.interimResults = true
    let finalText = ""
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) {
          finalText += r[0].transcript
        } else {
          interim += r[0].transcript
        }
      }
      setInterimText(finalText + interim)
    }
    recognition.onerror = (e: unknown) => {
      const err = e as { error?: string }
      toast.error(`浏览器 ASR 错误：${err?.error || "未知"}`)
      stopAll()
    }
    recognition.onend = () => {
      // 识别结束，输出最终文本
      if (finalText) {
        onText(config.autoAppend ? finalText + " " : finalText)
      }
      setRecording(false)
      setInterimText("")
    }
    browserRecognitionRef.current = recognition
    recognition.start()
    setRecording(true)
  }, [config.browserLang, config.autoAppend, onText, stopAll])

  // AI ASR：用 MediaRecorder 录音，发到后端
  const startAIASR = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      audioChunksRef.current = []
      // 选择浏览器支持的格式
      let mimeType = "audio/webm"
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/ogg"
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "audio/wav"
        }
      }
      const mr = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mr
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        setRecording(false)
        setTranscribing(true)
        try {
          const blob = new Blob(audioChunksRef.current, { type: mimeType })
          // 转 base64
          const reader = new FileReader()
          reader.onload = async () => {
            const dataUrl = reader.result as string
            const base64 = dataUrl.split(",")[1]
            const format = mimeType.split("/")[1].split(";")[0]
            const resp = await authFetch("/api/tutor/asr", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audio: base64, format }),
            })
            const data = await resp.json().catch(() => ({}))
            if (!resp.ok || !data.ok) {
              throw new Error(data?.error || `HTTP ${resp.status}`)
            }
            const text = (data.text || "").trim()
            if (text) {
              onText(config.autoAppend ? text + " " : text)
            } else {
              toast.info("未识别到语音内容")
            }
          }
          reader.readAsDataURL(blob)
        } catch (e) {
          toast.error(`AI ASR 失败：${(e as Error).message}`)
        } finally {
          setTranscribing(false)
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop())
            streamRef.current = null
          }
        }
      }
      mr.start()
      setRecording(true)
    } catch (e) {
      toast.error(`无法访问麦克风：${(e as Error).message}`)
    }
  }, [config.autoAppend, onText])

  // 第三方 ASR：用 MediaRecorder 录音，发到第三方 API
  const startThirdpartyASR = useCallback(async () => {
    if (!config.thirdpartyASRUrl || !config.thirdpartyASRKey) {
      toast.error("请先在 AI 设置中配置第三方 ASR API")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      audioChunksRef.current = []
      let mimeType = "audio/webm"
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/ogg"
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "audio/wav"
        }
      }
      const mr = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mr
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        setRecording(false)
        setTranscribing(true)
        try {
          const blob = new Blob(audioChunksRef.current, { type: mimeType })
          const formData = new FormData()
          formData.append("file", blob, "audio.webm")
          formData.append("model", config.thirdpartyASRModel || "whisper-1")
          const resp = await fetch(config.thirdpartyASRUrl, {
            method: "POST",
            headers: { "Authorization": `Bearer ${config.thirdpartyASRKey}` },
            body: formData,
          })
          if (!resp.ok) {
            const txt = await resp.text().catch(() => "")
            throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 200)}`)
          }
          const data = await resp.json()
          const text = (data.text || "").trim()
          if (text) {
            onText(config.autoAppend ? text + " " : text)
          } else {
            toast.info("未识别到语音内容")
          }
        } catch (e) {
          toast.error(`第三方 ASR 失败：${(e as Error).message}`)
        } finally {
          setTranscribing(false)
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop())
            streamRef.current = null
          }
        }
      }
      mr.start()
      setRecording(true)
    } catch (e) {
      toast.error(`无法访问麦克风：${(e as Error).message}`)
    }
  }, [config.thirdpartyASRUrl, config.thirdpartyASRKey, config.thirdpartyASRModel, config.autoAppend, onText])

  const start = useCallback(() => {
    if (recording || transcribing) return
    if (config.engine === "browser") startBrowserASR()
    else if (config.engine === "ai") startAIASR()
    else startThirdpartyASR()
  }, [recording, transcribing, config.engine, startBrowserASR, startAIASR, startThirdpartyASR])

  const stop = useCallback(() => {
    if (config.engine === "browser") {
      if (browserRecognitionRef.current) {
        try { browserRecognitionRef.current.stop() } catch {}
      }
    } else {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop() } catch {}
      }
    }
    setRecording(false)
  }, [config.engine])

  const toggle = () => {
    if (recording) stop()
    else start()
  }

  const updateConfig = (patch: Partial<ASRConfig>) => {
    const newCfg = { ...config, ...patch }
    setConfig(newCfg)
    saveConfig(newCfg)
  }

  return (
    <div className={`flex items-center gap-1 ${className || ""}`}>
      <Button
        variant="ghost"
        size="sm"
        className={`h-11 w-11 p-0 shrink-0 ${recording ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400" : ""}`}
        onClick={toggle}
        disabled={transcribing}
        title={recording ? "停止录音" : "语音输入"}
      >
        {transcribing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : recording ? (
          <Square className="size-4" />
        ) : (
          <Mic className="size-4" />
        )}
      </Button>
      {recording && interimText && (
        <div className="flex-1 text-xs text-muted-foreground italic truncate">
          {interimText}…
        </div>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-11 w-8 p-0 shrink-0" title="ASR 设置">
            <Settings2 className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="end">
          <div className="space-y-3">
            <div className="text-xs font-medium">语音识别引擎</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateConfig({ engine: "browser" })}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs ${config.engine === "browser" ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"}`}
              >
                浏览器 ASR
              </button>
              <button
                onClick={() => updateConfig({ engine: "ai" })}
                className={`flex-1 px-3 py-1.5 rounded-md text-xs ${config.engine === "ai" ? "bg-violet-500 text-white" : "bg-muted text-muted-foreground"}`}
              >
                AI ASR
              </button>
            </div>
            <div className="text-xs text-muted-foreground">
              {config.engine === "browser"
                ? "浏览器 ASR：免费即时，实时显示中间结果。需要 Chrome/Edge。"
                : "AI ASR（z-ai-web-dev-sdk）：音质更好，识别准确，支持中文/英文。需消耗 API 配额。"}
            </div>
            {config.engine === "browser" && (
              <div>
                <div className="text-xs font-medium mb-1.5">识别语言</div>
                <select
                  className="w-full h-8 px-2 rounded border bg-background text-xs"
                  value={config.browserLang}
                  onChange={(e) => updateConfig({ browserLang: e.target.value })}
                >
                  <option value="zh-CN">中文（简体）</option>
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="ja-JP">日本語</option>
                  <option value="ko-KR">한국어</option>
                </select>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs">追加模式（不替换原文本）</span>
              <button
                onClick={() => updateConfig({ autoAppend: !config.autoAppend })}
                className={`w-9 h-5 rounded-full transition-colors relative ${config.autoAppend ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${config.autoAppend ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
