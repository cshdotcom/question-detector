"use client"

import { useState, useEffect } from "react"
import { Settings2, Eye, EyeOff, ExternalLink, Zap, Loader2, CheckCircle2, XCircle, Volume2, Mic } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { useDetectorStore } from "@/lib/store"
import type { AIProviderConfig } from "@/lib/types"

interface TTSConfig {
  engine: "browser" | "ai" | "thirdparty"
  browserVoice: string
  browserRate: number
  aiVoice: string
  aiSpeed: number
  autoPlay: boolean
  // 第三方 TTS
  thirdpartyTTSUrl: string
  thirdpartyTTSKey: string
  thirdpartyTTSModel: string
}

interface ASRConfig {
  engine: "browser" | "ai" | "thirdparty"
  browserLang: string
  autoAppend: boolean
  // 第三方 ASR
  thirdpartyASRUrl: string
  thirdpartyASRKey: string
  thirdpartyASRModel: string
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

const ASR_LANGS = [
  { id: "zh-CN", name: "中文（简体）" },
  { id: "en-US", name: "English (US)" },
  { id: "en-GB", name: "English (UK)" },
  { id: "ja-JP", name: "日本語" },
  { id: "ko-KR", name: "한국어" },
]

const TTS_STORAGE_KEY = "tutor-tts-config"
const ASR_STORAGE_KEY = "tutor-asr-config"

function loadTTSConfig(): TTSConfig {
  if (typeof window === "undefined") return { engine: "browser", browserVoice: "", browserRate: 1.0, aiVoice: "tongtong", aiSpeed: 1.0, autoPlay: false, thirdpartyTTSUrl: "", thirdpartyTTSKey: "", thirdpartyTTSModel: "" }
  try {
    const raw = localStorage.getItem(TTS_STORAGE_KEY)
    if (raw) return { ...{ engine: "browser", browserVoice: "", browserRate: 1.0, aiVoice: "tongtong", aiSpeed: 1.0, autoPlay: false, thirdpartyTTSUrl: "", thirdpartyTTSKey: "", thirdpartyTTSModel: "" }, ...JSON.parse(raw) }
  } catch {}
  return { engine: "browser", browserVoice: "", browserRate: 1.0, aiVoice: "tongtong", aiSpeed: 1.0, autoPlay: false, thirdpartyTTSUrl: "", thirdpartyTTSKey: "", thirdpartyTTSModel: "" }
}

function saveTTSConfig(cfg: TTSConfig) {
  try { localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify(cfg)) } catch {}
}

function loadASRConfig(): ASRConfig {
  if (typeof window === "undefined") return { engine: "ai", browserLang: "zh-CN", autoAppend: true, thirdpartyASRUrl: "", thirdpartyASRKey: "", thirdpartyASRModel: "" }
  try {
    const raw = localStorage.getItem(ASR_STORAGE_KEY)
    if (raw) return { ...{ engine: "ai", browserLang: "zh-CN", autoAppend: true, thirdpartyASRUrl: "", thirdpartyASRKey: "", thirdpartyASRModel: "" }, ...JSON.parse(raw) }
  } catch {}
  return { engine: "ai", browserLang: "zh-CN", autoAppend: true, thirdpartyASRUrl: "", thirdpartyASRKey: "", thirdpartyASRModel: "" }
}

function saveASRConfig(cfg: ASRConfig) {
  try { localStorage.setItem(ASR_STORAGE_KEY, JSON.stringify(cfg)) } catch {}
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

const PRESETS: { label: string; baseURL: string; model: string }[] = [
  { label: "OpenAI 官方", baseURL: "https://api.openai.com/v1", model: "gpt-4o" },
  { label: "DeepSeek", baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { label: "智谱 GLM", baseURL: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4v" },
  { label: "月之暗面 Kimi", baseURL: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k-vision-preview" },
  { label: "阿里通义千问", baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-vl-max" },
]

export function AISettingsDialog({ open, onOpenChange }: Props) {
  const aiConfig = useDetectorStore((s) => s.aiConfig)
  const setAIConfig = useDetectorStore((s) => s.setAIConfig)
  const [draft, setDraft] = useState<AIProviderConfig>(aiConfig)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latency?: number } | null>(null)
  const [envHasDefault, setEnvHasDefault] = useState(false)
  const [ttsConfig, setTTSConfig] = useState<TTSConfig>(loadTTSConfig)
  const [asrConfig, setASRConfig] = useState<ASRConfig>(loadASRConfig)
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    if (open) {
      setDraft(aiConfig)
      setTestResult(null)
      setTTSConfig(loadTTSConfig())
      setASRConfig(loadASRConfig())
      // 查询后端是否配置了默认 AI
      fetch("/api/env-config", { method: "GET" })
        .then((r) => r.json())
        .then((d) => setEnvHasDefault(!!d.hasDefaultAI))
        .catch(() => setEnvHasDefault(false))
      // 加载浏览器 TTS 声音
      if (typeof window !== "undefined" && window.speechSynthesis) {
        const load = () => {
          const vs = window.speechSynthesis.getVoices()
          setBrowserVoices(vs)
        }
        load()
        window.speechSynthesis.onvoiceschanged = load
      }
    }
  }, [open, aiConfig])

  const updateASR = (patch: Partial<ASRConfig>) => {
    const newCfg = { ...asrConfig, ...patch }
    setASRConfig(newCfg)
    saveASRConfig(newCfg)
  }

  const updateTTS = (patch: Partial<TTSConfig>) => {
    const newCfg = { ...ttsConfig, ...patch }
    setTTSConfig(newCfg)
    saveTTSConfig(newCfg)
  }

  const onSave = () => {
    if (draft.enabled && !draft.apiKey) {
      toast.error("请填写 API Key")
      return
    }
    if (draft.enabled && !draft.baseURL) {
      toast.error("请填写 API 端点")
      return
    }
    setAIConfig(draft)
    toast.success(draft.enabled ? "已启用第三方 API" : "已切换回后端默认 / 内置 Z.ai")
    onOpenChange(false)
  }

  const onTest = async () => {
    if (!draft.enabled) {
      toast.info("请先启用第三方 API")
      return
    }
    if (!draft.apiKey || !draft.baseURL) {
      toast.error("请填写 API Key 和端点")
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const resp = await fetch("/api/test-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.ok) {
        setTestResult({ ok: true, message: data.message || "连接成功", latency: data.latency })
        toast.success(`连接成功（${data.latency ?? "?"}ms）`)
      } else {
        setTestResult({ ok: false, message: data.error || `HTTP ${resp.status}` })
        toast.error(`连接失败：${data.error || resp.status}`)
      }
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message })
      toast.error(`连接失败：${(e as Error).message}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-5" /> AI 模型设置
          </DialogTitle>
          <DialogDescription>
            可接入第三方 OpenAI 兼容 API。优先级：前端配置 &gt; 后端 env 默认 &gt; 内置 Z.ai
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 后端 env 默认配置提示 */}
          {envHasDefault && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
              <Zap className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed text-emerald-700 dark:text-emerald-300">
                <p className="font-medium">后端已配置默认 AI</p>
                <p className="opacity-80 mt-0.5">
                  未启用第三方时，所有调用走后端 env 配置（AI_BASE_URL/AI_API_KEY/AI_MODEL），所有浏览器共享。
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div>
              <Label htmlFor="enable-third" className="text-sm">启用第三方 API（覆盖后端默认）</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                关闭则使用 {envHasDefault ? "后端默认" : "内置 Z.ai"}
              </p>
            </div>
            <Switch
              id="enable-third"
              checked={draft.enabled}
              onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
            />
          </div>

          {draft.enabled && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">预设服务</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setDraft({ ...draft, baseURL: p.baseURL, model: p.model })}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        draft.baseURL === p.baseURL
                          ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
                          : "hover:bg-accent"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="baseurl" className="text-xs">API 端点 (Base URL)</Label>
                <Input
                  id="baseurl"
                  value={draft.baseURL}
                  onChange={(e) => setDraft({ ...draft, baseURL: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="apikey" className="text-xs">API Key</Label>
                <div className="relative">
                  <Input
                    id="apikey"
                    type={showKey ? "text" : "password"}
                    value={draft.apiKey}
                    onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground">仅保存在浏览器本地，不会上传到服务器</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="model" className="text-xs">模型名称</Label>
                <Input
                  id="model"
                  value={draft.model}
                  onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                  placeholder="gpt-4o / glm-4v / qwen-vl-max"
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  需要支持 vision（图像输入）的模型，例如 gpt-4o、glm-4v、qwen-vl-max
                </p>
              </div>

              <a
                href="https://platform.openai.com/docs/models"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-rose-600 inline-flex items-center gap-1 hover:underline"
              >
                查看支持的模型 <ExternalLink className="size-3" />
              </a>

              {/* 测试连接按钮 */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={onTest}
                  disabled={testing || !draft.apiKey || !draft.baseURL}
                >
                  {testing ? (
                    <>
                      <Loader2 className="size-3.5 mr-1.5 animate-spin" /> 测试中…
                    </>
                  ) : (
                    <>
                      <Zap className="size-3.5 mr-1.5" /> 测试连接
                    </>
                  )}
                </Button>
                {testResult && (
                  <span className="text-xs flex items-center gap-1.5">
                    {testResult.ok ? (
                      <>
                        <CheckCircle2 className="size-3.5 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400">
                          成功{testResult.latency ? ` · ${testResult.latency}ms` : ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle className="size-3.5 text-red-500" />
                        <span className="text-red-600 dark:text-red-400 truncate max-w-[200px]" title={testResult.message}>
                          {testResult.message}
                        </span>
                      </>
                    )}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* TTS 语音合成设置 */}
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Volume2 className="size-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">语音合成（TTS）设置</h4>
          </div>

          {/* 默认引擎 */}
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">默认引擎</Label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateTTS({ engine: "browser" })}
                className={`px-3 py-1 rounded-md text-xs ${ttsConfig.engine === "browser" ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"}`}
              >
                浏览器
              </button>
              <button
                onClick={() => updateTTS({ engine: "ai" })}
                className={`px-3 py-1 rounded-md text-xs ${ttsConfig.engine === "ai" ? "bg-violet-500 text-white" : "bg-muted text-muted-foreground"}`}
              >
                AI (z-ai)
              </button>
              <button
                onClick={() => updateTTS({ engine: "thirdparty" })}
                className={`px-3 py-1 rounded-md text-xs ${ttsConfig.engine === "thirdparty" ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}
              >
                第三方
              </button>
            </div>
          </div>

          {/* 浏览器 TTS 设置 */}
          <div className="space-y-2 px-3 py-2 rounded-md bg-muted/30">
            <div className="text-xs font-medium text-muted-foreground">浏览器 TTS（免费即时）</div>
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0 w-16">声音</Label>
              <select
                className="flex-1 h-8 px-2 rounded border bg-background text-xs"
                value={ttsConfig.browserVoice}
                onChange={(e) => updateTTS({ browserVoice: e.target.value })}
              >
                {browserVoices.length === 0 ? (
                  <option value="">（无可用声音）</option>
                ) : (
                  browserVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
                  ))
                )}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0 w-16">语速 {ttsConfig.browserRate.toFixed(1)}x</Label>
              <Slider value={[ttsConfig.browserRate]} onValueChange={(v) => updateTTS({ browserRate: v[0] })} min={0.5} max={2.0} step={0.1} className="flex-1" />
            </div>
          </div>

          {/* AI TTS 设置 */}
          <div className="space-y-2 px-3 py-2 rounded-md bg-muted/30">
            <div className="text-xs font-medium text-muted-foreground">AI TTS（z-ai-web-dev-sdk，音质更好）</div>
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0 w-16">声音</Label>
              <select
                className="flex-1 h-8 px-2 rounded border bg-background text-xs"
                value={ttsConfig.aiVoice}
                onChange={(e) => updateTTS({ aiVoice: e.target.value })}
              >
                {AI_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs shrink-0 w-16">语速 {ttsConfig.aiSpeed.toFixed(1)}x</Label>
              <Slider value={[ttsConfig.aiSpeed]} onValueChange={(v) => updateTTS({ aiSpeed: v[0] })} min={0.5} max={2.0} step={0.1} className="flex-1" />
            </div>
          </div>

          {/* 第三方 TTS 配置 */}
          {ttsConfig.engine === "thirdparty" && (
            <div className="space-y-2 px-3 py-2 rounded-md bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900">
              <div className="text-xs font-medium text-muted-foreground">第三方 TTS API（OpenAI 兼容）</div>
              <div>
                <Label className="text-xs">API 端点 URL</Label>
                <Input
                  value={ttsConfig.thirdpartyTTSUrl}
                  onChange={(e) => updateTTS({ thirdpartyTTSUrl: e.target.value })}
                  placeholder="如 https://api.openai.com/v1/audio/speech"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">API Key</Label>
                <Input
                  type="password"
                  value={ttsConfig.thirdpartyTTSKey}
                  onChange={(e) => updateTTS({ thirdpartyTTSKey: e.target.value })}
                  placeholder="sk-..."
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">模型</Label>
                <Input
                  value={ttsConfig.thirdpartyTTSModel}
                  onChange={(e) => updateTTS({ thirdpartyTTSModel: e.target.value })}
                  placeholder="如 tts-1, tts-1-hd"
                  className="h-8 text-xs"
                />
              </div>
              <div className="text-xs text-muted-foreground">
                调用 OpenAI 兼容的 /audio/speech 接口，返回 mp3 音频。
              </div>
            </div>
          )}
        </div>

        {/* ASR 语音识别设置 */}
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Mic className="size-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">语音识别（ASR）设置</h4>
          </div>

          {/* 默认引擎 */}
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">默认引擎</Label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateASR({ engine: "browser" })}
                className={`px-3 py-1 rounded-md text-xs ${asrConfig.engine === "browser" ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"}`}
              >
                浏览器
              </button>
              <button
                onClick={() => updateASR({ engine: "ai" })}
                className={`px-3 py-1 rounded-md text-xs ${asrConfig.engine === "ai" ? "bg-violet-500 text-white" : "bg-muted text-muted-foreground"}`}
              >
                AI (z-ai)
              </button>
              <button
                onClick={() => updateASR({ engine: "thirdparty" })}
                className={`px-3 py-1 rounded-md text-xs ${asrConfig.engine === "thirdparty" ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}
              >
                第三方
              </button>
            </div>
          </div>

          <div className="px-3 py-2 rounded-md bg-muted/30 space-y-2">
            <div className="text-xs text-muted-foreground">
              {asrConfig.engine === "browser"
                ? "浏览器 ASR：免费、实时显示中间结果。需要 Chrome/Edge 浏览器。"
                : asrConfig.engine === "ai"
                ? "AI ASR（z-ai-web-dev-sdk）：音质好、识别准，支持中/英/日/韩。需消耗 API 配额。"
                : "第三方 ASR：调用 OpenAI 兼容的 /audio/transcriptions 接口。"}
            </div>
            {asrConfig.engine === "browser" && (
              <div className="flex items-center gap-2">
                <Label className="text-xs shrink-0 w-16">识别语言</Label>
                <select
                  className="flex-1 h-8 px-2 rounded border bg-background text-xs"
                  value={asrConfig.browserLang}
                  onChange={(e) => updateASR({ browserLang: e.target.value })}
                >
                  {ASR_LANGS.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
            )}
            {asrConfig.engine === "thirdparty" && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">API 端点 URL</Label>
                  <Input
                    value={asrConfig.thirdpartyASRUrl}
                    onChange={(e) => updateASR({ thirdpartyASRUrl: e.target.value })}
                    placeholder="如 https://api.openai.com/v1/audio/transcriptions"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">API Key</Label>
                  <Input
                    type="password"
                    value={asrConfig.thirdpartyASRKey}
                    onChange={(e) => updateASR({ thirdpartyASRKey: e.target.value })}
                    placeholder="sk-..."
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">模型</Label>
                  <Input
                    value={asrConfig.thirdpartyASRModel}
                    onChange={(e) => updateASR({ thirdpartyASRModel: e.target.value })}
                    placeholder="如 whisper-1"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label className="text-xs">追加模式（不替换原文本）</Label>
              <Switch checked={asrConfig.autoAppend} onCheckedChange={(v) => updateASR({ autoAppend: v })} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={onSave} className="bg-rose-500 hover:bg-rose-600">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
