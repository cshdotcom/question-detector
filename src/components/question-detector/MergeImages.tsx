"use client"

import { useState } from "react"
import { Layers, Loader2, CheckSquare, Square } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { useDetectorStore } from "@/lib/store"
import { mergeImageItems } from "@/lib/merge-images"
import { detectQuestions } from "@/lib/detect-service"

export function MergeImages() {
  const [selectMode, setSelectMode] = useState(false)
  const [busy, setBusy] = useState(false)
  const images = useDetectorStore((s) => s.images)
  const selectedImageIds = useDetectorStore((s) => s.selectedImageIds)
  const toggleSelectImage = useDetectorStore((s) => s.toggleSelectImage)
  const clearSelection = useDetectorStore((s) => s.clearSelection)
  const addImage = useDetectorStore((s) => s.addImage)
  const removeImage = useDetectorStore((s) => s.removeImage)
  const setCurrentImage = useDetectorStore((s) => s.setCurrentImage)
  const setDetecting = useDetectorStore((s) => s.setDetecting)
  const setQuestions = useDetectorStore((s) => s.setQuestions)
  const autoDetect = useDetectorStore((s) => s.autoDetect)
  const ensureImageData = useDetectorStore((s) => s.ensureImageData)

  const doMerge = async () => {
    if (selectedImageIds.length < 2) {
      toast.error("请至少选择 2 张图片")
      return
    }
    setBusy(true)
    try {
      // 云端存储模式：合并前确保原图已加载
      await Promise.all(selectedImageIds.map((id) => ensureImageData(id)))
      const imgs = useDetectorStore.getState().images.filter((im) => selectedImageIds.includes(im.id))
      const merged = await mergeImageItems(imgs)
      const newId = addImage({
        name: `跨页合并 (${imgs.length}张)`,
        dataUrl: merged.dataUrl,
        width: merged.width,
        height: merged.height,
        source: "merged",
      })
      // 删除原始图片
      selectedImageIds.forEach((id) => removeImage(id))
      clearSelection()
      setSelectMode(false)
      setCurrentImage(newId)
      toast.success(`已合并 ${imgs.length} 张图` + (autoDetect ? "，正在识别…" : ""))
      if (autoDetect) {
        setDetecting(newId, true)
        try {
          const qs = await detectQuestions(merged, "ai")
          setQuestions(newId, qs, "ai")
          toast.success(`识别到 ${qs.length} 道题目`)
        } catch (e) {
          toast.error(`识别失败：${(e as Error).message}`)
          setDetecting(newId, false)
        }
      }
    } catch (e) {
      toast.error(`合并失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  if (images.length < 2) return null

  if (!selectMode) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={() => setSelectMode(true)}>
        <Layers className="size-4 mr-1.5" /> 跨页合并
      </Button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Layers className="size-3" />
        已选 {selectedImageIds.length} / {images.length} 张
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1 -mx-1 px-1">
        {images.map((im) => {
          const checked = selectedImageIds.includes(im.id)
          return (
            <button
              key={im.id}
              onClick={() => toggleSelectImage(im.id)}
              className={`w-full flex items-center gap-2 p-1.5 rounded text-xs border transition-colors ${
                checked ? "border-rose-500 bg-rose-50 dark:bg-rose-950/30" : "border-border hover:bg-accent"
              }`}
            >
              {checked ? (
                <CheckSquare className="size-4 text-rose-500 shrink-0" />
              ) : (
                <Square className="size-4 text-muted-foreground shrink-0" />
              )}
              <img src={im.thumbnail || im.dataUrl} alt="" className="size-8 object-cover rounded shrink-0" />
              <span className="truncate flex-1">{im.name}</span>
            </button>
          )
        })}
      </div>
      <div className="flex gap-1.5">
        <Button variant="ghost" size="sm" className="flex-1" onClick={() => { clearSelection(); setSelectMode(false) }}>
          取消
        </Button>
        <Button
          size="sm"
          className="flex-1 bg-rose-500 hover:bg-rose-600"
          onClick={doMerge}
          disabled={busy || selectedImageIds.length < 2}
        >
          {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Layers className="size-4 mr-1" />}
          合并
        </Button>
      </div>
    </div>
  )
}
