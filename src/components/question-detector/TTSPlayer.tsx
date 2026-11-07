"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Volume2, Square, Loader2, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { authFetch } from "@/lib/auth-fetch"
import { toast } from "sonner"

interface TTSPlayerProps {
  text: string
  /** 当前消息 ID（用于缓存 AI 音频） */
  messageId?: string
  className?: string
}

type TTSEngine = "browser" | "ai" | "thirdparty"

const STORAGE_KEY = "tutor-tts-config"

interface TTSConfig {
  engine: TTSEngine
  browserVoice: string  // 浏览器 voice URI
  browserRate: number  // 0.5-2.0
  aiVoice: string  // tongtong / chuichui / xiaochen / jam / kazi / douji / luodo
  aiSpeed: number
  autoPlay: boolean
  // 第三方 TTS
  thirdpartyTTSUrl: string
  thirdpartyTTSKey: string
  thirdpartyTTSModel: string
}

const AI_VOICES = [
  { id: "tongtong", name: "彤彤（女·温柔）" },
  { id: "chuichui", name: "吹吹（女·活泼）" },
  { id: "xiaochen", name: "小辰（男·沉稳）" },
  { id: "jam", name: "Jam（男·英伦）" },
  { id: "kazi", name: "卡兹（中性）" },
  { id: "douji", name: "豆吉（童声）" },
  { id: "luodo", name: "罗多（男·低沉）" },
]

function loadConfig(): TTSConfig {
  if (typeof window === "undefined") {
    return defaultConfig()
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultConfig(), ...JSON.parse(raw) }
  } catch {}
  return defaultConfig()
}

function defaultConfig(): TTSConfig {
  return {
    engine: "browser",
    browserVoice: "",
    browserRate: 1.0,
    aiVoice: "tongtong",
    aiSpeed: 1.0,
    autoPlay: false,
    thirdpartyTTSUrl: "",
    thirdpartyTTSKey: "",
    thirdpartyTTSModel: "",
  }
}

function saveConfig(cfg: TTSConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)) } catch {}
}

// AI TTS audio cache (messageId → dataUrl)
const aiAudioCache = new Map<string, string>()

export function TTSPlayer({ text, messageId, className }: TTSPlayerProps) {
  const [config, setConfig] = useState<TTSConfig>(loadConfig)
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([])
  const [playingEngine, setPlayingEngine] = useState<TTSEngine | null>(null)
  const [loadingEngine, setLoadingEngine] = useState<TTSEngine | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null)

  // 加载浏览器 TTS 声音列表
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return
    const load = () => {
      const vs = window.speechSynthesis.getVoices()
      setBrowserVoices(vs)
      if (!config.browserVoice && vs.length > 0) {
        // 默认选中文女声
        const zhFemale = vs.find((v) => v.lang.startsWith("zh") && /female|女/i.test(v.name))
        const zh = zhFemale || vs.find((v) => v.lang.startsWith("zh")) || vs[0]
        if (zh) {
          const newCfg = { ...config, browserVoice: zh.voiceURI }
          setConfig(newCfg)
          saveConfig(newCfg)
        }
      }
    }
    load()
    window.speechSynthesis.onvoiceschanged = load
    return () => { window.speechSynthesis.onvoiceschanged = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 清理函数
  useEffect(() => {
    return () => {
      stopAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopAll = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    utterRef.current = null
    setPlayingEngine(null)
    setLoadingEngine(null)
  }, [])

  const playBrowser = useCallback(() => {
    if (!text || typeof window === "undefined" || !window.speechSynthesis) return
    stopAll()
    setLoadingEngine("browser")
    try {
      const u = new SpeechSynthesisUtterance(stripInlineTags(text))
      u.rate = config.browserRate
      const v = browserVoices.find((v) => v.voiceURI === config.browserVoice)
      if (v) u.voice = v
      u.onstart = () => {
        setLoadingEngine(null)
        setPlayingEngine("browser")
      }
      u.onend = () => setPlayingEngine(null)
      u.onerror = () => {
        setLoadingEngine(null)
        setPlayingEngine(null)
        toast.error("浏览器 TTS 失败")
      }
      utterRef.current = u
      window.speechSynthesis.speak(u)
    } catch (e) {
      setLoadingEngine(null)
      toast.error(`TTS 失败：${(e as Error).message}`)
    }
  }, [text, config.browserVoice, config.browserRate, browserVoices, stopAll])

  const playAI = useCallback(async () => {
    if (!text) return
    stopAll()
    setLoadingEngine("ai")
    try {
      // 检查缓存
      const cacheKey = messageId || text.slice(0, 100)
      let dataUrl = aiAudioCache.get(cacheKey)
      if (!dataUrl) {
        const resp = await authFetch("/api/tutor/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: stripInlineTags(text).slice(0, 4000),  // AI TTS 限制单次长度
            voice: config.aiVoice,
            speed: config.aiSpeed,
          }),
        })
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok || !data.ok) {
          throw new Error(data?.error || `HTTP ${resp.status}`)
        }
        const audioUrl: string = data.audioDataUrl
        if (!audioUrl) throw new Error("AI TTS 返回为空")
        dataUrl = audioUrl
        aiAudioCache.set(cacheKey, dataUrl)
      }
      // 播放
      const audio = new Audio(dataUrl)
      audioRef.current = audio
      audio.onplay = () => {
        setLoadingEngine(null)
        setPlayingEngine("ai")
      }
      audio.onended = () => setPlayingEngine(null)
      audio.onerror = () => {
        setLoadingEngine(null)
        setPlayingEngine(null)
        toast.error("AI 音频播放失败")
      }
      await audio.play()
    } catch (e) {
      setLoadingEngine(null)
      toast.error(`AI TTS 失败：${(e as Error).message}`)
    }
  }, [text, config.aiVoice, config.aiSpeed, messageId, stopAll])

  // 第三方 TTS（OpenAI 兼容 /audio/speech）
  const playThirdparty = useCallback(async () => {
    if (!text) return
    if (!config.thirdpartyTTSUrl || !config.thirdpartyTTSKey) {
      toast.error("请先在 AI 设置中配置第三方 TTS API")
      return
    }
    stopAll()
    setLoadingEngine("thirdparty")
    try {
      const resp = await fetch(config.thirdpartyTTSUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.thirdpartyTTSKey}`,
        },
        body: JSON.stringify({
          model: config.thirdpartyTTSModel || "tts-1",
          input: stripInlineTags(text).slice(0, 4000),
          voice: "alloy",
          response_format: "mp3",
        }),
      })
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "")
        throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 200)}`)
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onplay = () => { setLoadingEngine(null); setPlayingEngine("thirdparty") }
      audio.onended = () => { setPlayingEngine(null); URL.revokeObjectURL(url) }
      audio.onerror = () => { setLoadingEngine(null); setPlayingEngine(null); toast.error("第三方音频播放失败") }
      await audio.play()
    } catch (e) {
      setLoadingEngine(null)
      toast.error(`第三方 TTS 失败：${(e as Error).message}`)
    }
  }, [text, config.thirdpartyTTSUrl, config.thirdpartyTTSKey, config.thirdpartyTTSModel, stopAll])

  const togglePlay = (engine: TTSEngine) => {
    if (playingEngine === engine) {
      stopAll()
    } else {
      stopAll()
      if (engine === "browser") playBrowser()
      else if (engine === "ai") playAI()
      else playThirdparty()
    }
  }

  const updateConfig = (patch: Partial<TTSConfig>) => {
    const newCfg = { ...config, ...patch }
    setConfig(newCfg)
    saveConfig(newCfg)
  }

  return (
    <div className={`flex items-center gap-1 ${className || ""}`}>
      {/* 浏览器 TTS */}
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 px-2 gap-1 ${playingEngine === "browser" ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400" : ""}`}
        onClick={() => togglePlay("browser")}
        disabled={loadingEngine !== null && loadingEngine !== "browser"}
        title="浏览器 TTS（免费即时）"
      >
        {loadingEngine === "browser" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : playingEngine === "browser" ? (
          <Square className="size-3.5" />
        ) : (
          <Volume2 className="size-3.5" />
        )}
        <span className="text-xs">浏览器</span>
      </Button>

      {/* AI TTS */}
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 px-2 gap-1 ${playingEngine === "ai" ? "bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400" : ""}`}
        onClick={() => togglePlay("ai")}
        disabled={loadingEngine !== null && loadingEngine !== "ai"}
        title="AI TTS（z-ai-web-dev-sdk，音质更好）"
      >
        {loadingEngine === "ai" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : playingEngine === "ai" ? (
          <Square className="size-3.5" />
        ) : (
          <Volume2 className="size-3.5" />
        )}
        <span className="text-xs">AI</span>
      </Button>

      {/* 第三方 TTS（仅在配置时显示） */}
      {config.thirdpartyTTSUrl && config.thirdpartyTTSKey && (
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 px-2 gap-1 ${playingEngine === "thirdparty" ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" : ""}`}
          onClick={() => togglePlay("thirdparty")}
          disabled={loadingEngine !== null && loadingEngine !== "thirdparty"}
          title="第三方 TTS（OpenAI 兼容）"
        >
          {loadingEngine === "thirdparty" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : playingEngine === "thirdparty" ? (
            <Square className="size-3.5" />
          ) : (
            <Volume2 className="size-3.5" />
          )}
          <span className="text-xs">第三方</span>
        </Button>
      )}

      {/* 设置 */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="TTS 设置">
            <Settings2 className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium mb-1.5">浏览器 TTS 声音</div>
              <select
                className="w-full h-8 px-2 rounded border bg-background text-sm"
                value={config.browserVoice}
                onChange={(e) => updateConfig({ browserVoice: e.target.value })}
              >
                {browserVoices.length === 0 ? (
                  <option value="">（无可用声音）</option>
                ) : (
                  browserVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <div className="text-xs font-medium mb-1.5">浏览器语速：{config.browserRate.toFixed(1)}x</div>
              <Slider
                value={[config.browserRate]}
                onValueChange={(v) => updateConfig({ browserRate: v[0] })}
                min={0.5}
                max={2.0}
                step={0.1}
              />
            </div>
            <div>
              <div className="text-xs font-medium mb-1.5">AI TTS 声音</div>
              <select
                className="w-full h-8 px-2 rounded border bg-background text-sm"
                value={config.aiVoice}
                onChange={(e) => updateConfig({ aiVoice: e.target.value })}
              >
                {AI_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs font-medium mb-1.5">AI 语速：{config.aiSpeed.toFixed(1)}x</div>
              <Slider
                value={[config.aiSpeed]}
                onValueChange={(v) => updateConfig({ aiSpeed: v[0] })}
                min={0.5}
                max={2.0}
                step={0.1}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              浏览器 TTS 免费、即时；AI TTS 音质更好，需消耗后端 API 配额。
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** 去掉内联标签（<b>、<i>、<math> 等），保留纯文本给 TTS 朗读 */
function stripInlineTags(text: string): string {
  return text
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<\/?(?:b|i|u|code|small|strong|em|span)[^>]*>/g, "")
    .replace(/<math>(.*?)<\/math>/g, (_, m) => ` ${m} `)  // 数学公式原样朗读
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim()
}
