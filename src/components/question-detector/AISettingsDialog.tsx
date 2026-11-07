"use client"

import { useState, useEffect } from "react"
import { Settings2, Eye, EyeOff, ExternalLink, Zap, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { useDetectorStore } from "@/lib/store"
import type { AIProviderConfig } from "@/lib/types"

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

  useEffect(() => {
    if (open) {
      setDraft(aiConfig)
      setTestResult(null)
      // 查询后端是否配置了默认 AI
      fetch("/api/env-config", { method: "GET" })
        .then((r) => r.json())
        .then((d) => setEnvHasDefault(!!d.hasDefaultAI))
        .catch(() => setEnvHasDefault(false))
    }
  }, [open, aiConfig])

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
      <DialogContent className="max-w-md">
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={onSave} className="bg-rose-500 hover:bg-rose-600">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
