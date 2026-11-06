"use client"

import { Trash2, Plus, ListChecks, Loader2 } from "lucide-react"
import { useDetectorStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export function QuestionList() {
  const currentImage = useDetectorStore((s) => s.images.find((x) => x.id === s.currentImageId))
  const selectedQuestionId = useDetectorStore((s) => s.selectedQuestionId)
  const selectQuestion = useDetectorStore((s) => s.selectQuestion)
  const addQuestion = useDetectorStore((s) => s.addQuestion)
  const updateQuestion = useDetectorStore((s) => s.updateQuestion)
  const removeQuestion = useDetectorStore((s) => s.removeQuestion)

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
              <p>点击「自动识别」让 AI 识别，或「添加」手动创建。</p>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 ml-auto text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeQuestion(currentImage.id, q.id)
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <Textarea
                  value={q.content}
                  placeholder="题目内容（可手动编辑）"
                  onChange={(e) => updateQuestion(currentImage.id, q.id, { content: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs min-h-[60px] resize-y"
                  rows={3}
                />
                <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
                  <span>位置：{(q.bbox.x * 100).toFixed(0)},{(q.bbox.y * 100).toFixed(0)}</span>
                  <span>尺寸：{(q.bbox.width * 100).toFixed(0)}×{(q.bbox.height * 100).toFixed(0)}</span>
                </div>
              </div>
            )
          })}

          {currentImage.detecting && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
              <Loader2 className="size-3.5 animate-spin" />
              AI 识别中…
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
