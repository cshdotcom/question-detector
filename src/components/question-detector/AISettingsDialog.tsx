"use client"

import { useState, useEffect } from "react"
import { Settings2, Eye, EyeOff, ExternalLink } from "lucide-react"
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

  useEffect(() => {
    if (open) setDraft(aiConfig)
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
    toast.success(draft.enabled ? "已启用第三方 API" : "已切换回内置 Z.ai")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-5" /> AI 模型设置
          </DialogTitle>
          <DialogDescription>
            可接入第三方 OpenAI 兼容 API。关闭时使用内置 Z.ai 模型。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label htmlFor="enable-third" className="text-sm">启用第三方 API</Label>
              <p className="text-xs text-muted-foreground mt-0.5">关闭则使用内置 Z.ai</p>
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
