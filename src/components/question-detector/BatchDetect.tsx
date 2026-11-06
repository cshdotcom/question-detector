"use client"

import { useCallback, useState } from "react"
import { Sparkles, Loader2, Layers } from "lucide-react"
import { toast } from "sonner"
import { useDetectorStore } from "@/lib/store"
import { detectQuestions } from "@/lib/detect-service"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

export function BatchDetect() {
  const images = useDetectorStore((s) => s.images)
  const setDetecting = useDetectorStore((s) => s.setDetecting)
  const setQuestions = useDetectorStore((s) => s.setQuestions)
  const setCurrentImage = useDetectorStore((s) => s.setCurrentImage)
  const [busy, setBusy] = useState(false)

  const runBatch = useCallback(
    async (method: "ai" | "offline") => {
      const pending = images.filter((x) => !x.detected || x.detectMethod !== method)
      if (pending.length === 0) {
        toast.info("没有待识别的图片")
        return
      }
      setBusy(true)
      let ok = 0
      let fail = 0
      for (let i = 0; i < pending.length; i++) {
        const img = pending[i]
        setCurrentImage(img.id)
        setDetecting(img.id, true)
        try {
          // 取最新状态
          const fresh = useDetectorStore.getState().images.find((x) => x.id === img.id) ?? img
          const qs = await detectQuestions(fresh, method)
          setQuestions(img.id, qs, method)
          ok += 1
        } catch (e) {
          fail += 1
          setDetecting(img.id, false)
          toast.error(`「${img.name}」识别失败：${(e as Error).message}`)
        }
      }
      setBusy(false)
      toast.success(`批量识别完成：成功 ${ok} 张${fail > 0 ? `，失败 ${fail} 张` : ""}`)
    },
    [images, setDetecting, setQuestions, setCurrentImage]
  )

  if (images.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy}>
          {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Layers className="size-4 mr-1" />}
          批量识别
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>批量识别所有图片</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => runBatch("ai")}>
          <Sparkles className="size-4 mr-2" /> 用 AI 识别（{images.filter((x) => !x.detected || x.detectMethod !== "ai").length}）
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => runBatch("offline")}>
          <Layers className="size-4 mr-2" /> 用算法识别（{images.filter((x) => !x.detected || x.detectMethod !== "offline").length}）
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
