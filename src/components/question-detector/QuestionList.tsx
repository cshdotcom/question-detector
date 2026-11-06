"use client"

import { useState, useCallback } from "react"
import { Trash2, Plus, ListChecks, Loader2, Copy, Download, Image as ImageIcon, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { useDetectorStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { cropToDataUrl, dataUrlToBlob, downloadBlob, fillQuestionImages } from "@/lib/image-utils"
import type { Question } from "@/lib/types"

export function QuestionList() {
  const currentImage = useDetectorStore((s) => s.images.find((x) => x.id === s.currentImageId))
  const selectedQuestionId = useDetectorStore((s) => s.selectedQuestionId)
  const selectQuestion = useDetectorStore((s) => s.selectQuestion)
  const addQuestion = useDetectorStore((s) => s.addQuestion)
  const updateQuestion = useDetectorStore((s) => s.updateQuestion)
  const removeQuestion = useDetectorStore((s) => s.removeQuestion)
  const setQuestions = useDetectorStore((s) => s.setQuestions)

  const [refreshing, setRefreshing] = useState<string | null>(null)

  // 重新裁剪配图
  const refreshSubImages = useCallback(
    async (qid: string) => {
      if (!currentImage) return
      const q = currentImage.questions.find((x) => x.id === qid)
      if (!q) return
      setRefreshing(qid)
      try {
        const fresh = await fillQuestionImages(currentImage, q)
        const newQuestions = currentImage.questions.map((x) => (x.id === qid ? fresh : x))
        setQuestions(currentImage.id, newQuestions, currentImage.detectMethod ?? "ai")
        toast.success("已重新裁剪配图")
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setRefreshing(null)
      }
    },
    [currentImage, setQuestions]
  )

  // 复制题目截图到剪贴板
  const copyQuestionImage = useCallback(async (q: Question) => {
    if (!currentImage) return
    try {
      const dataUrl = await cropToDataUrl(currentImage, q.bbox, 1200)
      const blob = dataUrlToBlob(dataUrl)
      if (navigator.clipboard && (window as any).ClipboardItem) {
        await (navigator.clipboard as any).write([new (window as any).ClipboardItem({ [blob.type]: blob })])
        toast.success("题目截图已复制到剪贴板")
      } else {
        throw new Error("浏览器不支持剪贴板写入图片")
      }
    } catch (e) {
      toast.error(`复制失败：${(e as Error).message}`)
    }
  }, [currentImage])

  // 下载题目截图
  const downloadQuestion = useCallback(async (q: Question) => {
    if (!currentImage) return
    try {
      const dataUrl = await cropToDataUrl(currentImage, q.bbox, 1600)
      const blob = dataUrlToBlob(dataUrl)
      const name = `第${q.number || "?"}题_${currentImage.name.replace(/\.[^.]+$/, "")}.png`
      downloadBlob(blob, name)
      toast.success("已下载题目截图")
    } catch (e) {
      toast.error(`下载失败：${(e as Error).message}`)
    }
  }, [currentImage])

  // 复制题目文字
  const copyQuestionText = useCallback(async (q: Question) => {
    const text = `${q.number ? `第 ${q.number} 题\n` : ""}${q.content}`
    try {
      await navigator.clipboard.writeText(text)
      toast.success("已复制题文")
    } catch {
      toast.error("复制失败")
    }
  }, [])

  if (!currentImage) return null

  const questions = currentImage.questions

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <ListChecks className="size-4" />
          题目列表
          <span className="text-xs text-muted-foreground">({questions.length})</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() =>
            addQuestion(currentImage.id, {
              number: String(questions.length + 1),
              content: "",
              bbox: { x: 0.1, y: 0.4, width: 0.8, height: 0.15 },
            })
          }
        >
          <Plus className="size-3.5 mr-1" /> 添加
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          {questions.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-8 space-y-1">
              <p>当前图片还没有题目框。</p>
              <p>点击「AI 识别」让 AI 识别，或「离线识别」用算法分割，或「添加框」手动创建。</p>
            </div>
          )}

          {questions.map((q, idx) => {
            const isSel = q.id === selectedQuestionId
            return (
              <div
                key={q.id}
                onClick={() => selectQuestion(q.id)}
                className={cn(
                  "rounded-md border p-2.5 cursor-pointer transition-colors",
                  isSel
                    ? "border-rose-500 bg-rose-50/50 dark:bg-rose-950/20"
                    : "border-border hover:border-foreground/30 hover:bg-accent/50"
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-muted-foreground shrink-0">#{idx + 1}</span>
                  <Input
                    value={q.number}
                    placeholder="题号"
                    onChange={(e) => updateQuestion(currentImage.id, q.id, { number: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="h-7 text-sm w-24"
                  />
                  <div className="ml-auto flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title="复制题文"
                      onClick={(e) => {
                        e.stopPropagation()
                        copyQuestionText(q)
                      }}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title="复制题目截图"
                      onClick={(e) => {
                        e.stopPropagation()
                        copyQuestionImage(q)
                      }}
                    >
                      <ImageIcon className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title="下载题目截图"
                      onClick={(e) => {
                        e.stopPropagation()
                        downloadQuestion(q)
                      }}
                    >
                      <Download className="size-3.5" />
                    </Button>
                    {refreshing === q.id ? (
                      <Loader2 className="size-3.5 animate-spin mx-1" />
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="重新裁剪配图"
                        onClick={(e) => {
                          e.stopPropagation()
                          refreshSubImages(q.id)
                        }}
                      >
                        <RefreshCw className="size-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeQuestion(currentImage.id, q.id)
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={q.content}
                  placeholder="题目内容（可手动编辑）"
                  onChange={(e) => updateQuestion(currentImage.id, q.id, { content: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs min-h-[60px] resize-y"
                  rows={3}
                />

                {/* 题目内嵌配图 */}
                {q.images.length > 0 && (
                  <div className="mt-2 space-y-2">
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <ImageIcon className="size-3" />
                      题目配图（{q.images.length}）
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {q.images.map((si) => (
                        <div key={si.id} className="relative border rounded overflow-hidden bg-muted group">
                          {si.dataUrl ? (
                            <SubImagePreview src={si.dataUrl} alt={si.caption || "配图"} />
                          ) : (
                            <div className="aspect-video flex items-center justify-center text-xs text-muted-foreground">
                              <ImageIcon className="size-4 opacity-50" />
                            </div>
                          )}
                          {si.caption && (
                            <div className="text-[10px] px-1 py-0.5 bg-black/60 text-white truncate">
                              {si.caption}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
                  <span>位置：{(q.bbox.x * 100).toFixed(0)}, {(q.bbox.y * 100).toFixed(0)}</span>
                  <span>尺寸：{(q.bbox.width * 100).toFixed(0)}×{(q.bbox.height * 100).toFixed(0)}</span>
                </div>
              </div>
            )
          })}

          {currentImage.detecting && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
              <Loader2 className="size-3.5 animate-spin" />
              {currentImage.detectMethod === "offline" ? "离线算法识别中…" : "AI 识别中…"}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function SubImagePreview({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-auto max-h-32 object-contain bg-white"
      onError={(e) => {
        ;(e.target as HTMLImageElement).style.display = "none"
      }}
    />
  )
}
