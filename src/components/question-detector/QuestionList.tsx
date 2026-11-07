"use client"

import { useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Trash2,
  Plus,
  ListChecks,
  Loader2,
  Copy,
  Download,
  Image as ImageIcon,
  RefreshCw,
  Wand2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  Brain,
  Lightbulb,
} from "lucide-react"
import { toast } from "sonner"
import { useDetectorStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { cropToDataUrl, dataUrlToBlob, downloadBlob, fillQuestionImages } from "@/lib/image-utils"
import { gradeQuestion } from "@/lib/detect-service"
import { Markdown } from "@/components/markdown/Markdown"
import type { Question } from "@/lib/types"

export function QuestionList() {
  const router = useRouter()
  const currentImage = useDetectorStore((s) => s.images.find((x) => x.id === s.currentImageId))
  const selectedQuestionId = useDetectorStore((s) => s.selectedQuestionId)
  const selectQuestion = useDetectorStore((s) => s.selectQuestion)
  const addQuestion = useDetectorStore((s) => s.addQuestion)
  const updateQuestion = useDetectorStore((s) => s.updateQuestion)
  const removeQuestion = useDetectorStore((s) => s.removeQuestion)
  const setQuestions = useDetectorStore((s) => s.setQuestions)
  const setGrading = useDetectorStore((s) => s.setGrading)
  const aiConfig = useDetectorStore((s) => s.aiConfig)

  const [refreshing, setRefreshing] = useState<string | null>(null)
  const [gradingQid, setGradingQid] = useState<string | null>(null)
  const [expandedGrading, setExpandedGrading] = useState<string | null>(null)
  const [checkedQids, setCheckedQids] = useState<Set<string>>(new Set())

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

  // 批改题目
  const onGrade = useCallback(
    async (q: Question) => {
      if (!currentImage) return
      setGradingQid(q.id)
      try {
        // 找关联的文章内容
        let passageContent: string | undefined
        if (q.kind === "passage_question" && q.passageId) {
          const passage = currentImage.questions.find((x) => x.id === q.passageId)
          if (passage) passageContent = passage.content
        }
        const grading = await gradeQuestion(currentImage, q, passageContent, aiConfig)
        setGrading(currentImage.id, q.id, grading)
        setExpandedGrading(q.id)
        toast.success("已批改完成")
      } catch (e) {
        toast.error(`批改失败：${(e as Error).message}`)
      } finally {
        setGradingQid(null)
      }
    },
    [currentImage, setGrading, aiConfig]
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

  // 批量下载勾选的题目（含可选配图）
  const downloadChecked = useCallback(async (includeSubImages: boolean = false) => {
    if (!currentImage) return
    if (checkedQids.size === 0) {
      toast.error("请先勾选要下载的题目")
      return
    }
    toast.info(`开始下载 ${checkedQids.size} 道题目截图`)
    let count = 0
    for (const qid of Array.from(checkedQids)) {
      const q = currentImage.questions.find((x) => x.id === qid)
      if (!q) continue
      try {
        const dataUrl = await cropToDataUrl(currentImage, q.bbox, 1600)
        // 加题号水印 + 批改结果颜色
        const { addLabelWatermarkLocal } = await import("./QuestionList.watermark")
        const withLabel = await addLabelWatermarkLocal(dataUrl, q.number, q.grading?.correct)
        const blob = dataUrlToBlob(withLabel)
        const name = `第${q.number || "?"}题_${currentImage.name.replace(/\.[^.]+$/, "")}.png`
        downloadBlob(blob, name)
        count += 1
        if (includeSubImages) {
          for (let k = 0; k < q.images.length; k++) {
            const si = q.images[k]
            const subDataUrl = si.dataUrl ?? (await cropToDataUrl(currentImage, si.bbox, 800))
            if (subDataUrl) {
              const subBlob = dataUrlToBlob(subDataUrl)
              downloadBlob(subBlob, `第${q.number || "?"}题_配图${k + 1}.png`)
              count += 1
            }
          }
        }
        await new Promise((r) => setTimeout(r, 200))
      } catch {
        // 忽略单张失败
      }
    }
    toast.success(`已下载 ${count} 张图片`)
  }, [currentImage, checkedQids])

  // 批量批改勾选的题目
  const gradeChecked = useCallback(async () => {
    if (!currentImage) return
    if (checkedQids.size === 0) {
      toast.error("请先勾选要批改的题目")
      return
    }
    toast.info(`开始批改 ${checkedQids.size} 道题目`)
    let ok = 0
    let fail = 0
    for (const qid of Array.from(checkedQids)) {
      const q = currentImage.questions.find((x) => x.id === qid)
      if (!q) continue
      if (q.kind === "passage") continue
      setGradingQid(q.id)
      try {
        let passageContent: string | undefined
        if (q.kind === "passage_question" && q.passageId) {
          const passage = currentImage.questions.find((x) => x.id === q.passageId)
          if (passage) passageContent = passage.content
        }
        const grading = await gradeQuestion(currentImage, q, passageContent, aiConfig)
        setGrading(currentImage.id, q.id, grading)
        ok += 1
      } catch (e) {
        fail += 1
        console.error(`批改失败 ${q.number}:`, e)
      } finally {
        setGradingQid(null)
      }
    }
    toast.success(`批量批改完成：成功 ${ok} 道${fail > 0 ? `，失败 ${fail} 道` : ""}`)
  }, [currentImage, checkedQids, aiConfig, setGrading])

  // 全选 / 全不选
  const selectAll = useCallback(() => {
    if (!currentImage) return
    setCheckedQids(new Set(currentImage.questions.filter((q) => q.kind !== "passage").map((q) => q.id)))
  }, [currentImage])

  const selectNone = useCallback(() => {
    setCheckedQids(new Set())
  }, [])

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

  const toggleCheck = useCallback((qid: string) => {
    setCheckedQids((prev) => {
      const next = new Set(prev)
      if (next.has(qid)) next.delete(qid)
      else next.add(qid)
      return next
    })
  }, [])

  // 当前图片的关联文章内容（用于显示）
  const passages = useMemo(
    () => currentImage?.questions.filter((q) => q.kind === "passage") ?? [],
    [currentImage]
  )

  if (!currentImage) return null

  const questions = currentImage.questions

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b space-y-1.5">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 text-sm font-medium shrink-0">
            <ListChecks className="size-4" />
            题目
            <span className="text-xs text-muted-foreground">({questions.length})</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
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
        </div>
        {/* 多选操作工具栏 */}
        {questions.some((q) => q.kind !== "passage") && (
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={selectAll}
              className="px-1.5 py-0.5 rounded hover:bg-accent"
            >
              全选
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              onClick={selectNone}
              className="px-1.5 py-0.5 rounded hover:bg-accent"
            >
              取消
            </button>
            <span className="text-muted-foreground ml-1">已选 {checkedQids.size}</span>
            <div className="ml-auto flex items-center gap-1">
              {checkedQids.size > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={gradeChecked}
                    disabled={!!gradingQid}
                    title="批量批改勾选的题目"
                  >
                    {gradingQid ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Wand2 className="size-3 mr-1" />}
                    批改
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-6 text-xs px-2">
                        <Download className="size-3 mr-1" /> 下载
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => downloadChecked(false)}>
                        仅题目截图
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => downloadChecked(true)}>
                        题目截图 + 配图
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          {questions.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-8 space-y-1">
              <p>当前图片还没有题目框。</p>
              <p>点「AI 识别」自动识别，或「添加框」手动创建后再「AI 识别该框」。</p>
            </div>
          )}

          {questions.map((q, idx) => {
            const isSel = q.id === selectedQuestionId
            const isPassage = q.kind === "passage"
            const isPassageQ = q.kind === "passage_question"
            return (
              <div
                key={q.id}
                onClick={() => selectQuestion(q.id)}
                className={cn(
                  "rounded-md border p-2.5 cursor-pointer transition-colors",
                  isSel
                    ? "border-rose-500 bg-rose-50/50 dark:bg-rose-950/20"
                    : isPassage
                    ? "border-blue-200 dark:border-blue-900 hover:bg-accent/50"
                    : isPassageQ
                    ? "border-purple-200 dark:border-purple-900 hover:bg-accent/50"
                    : "border-border hover:border-foreground/30 hover:bg-accent/50"
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Checkbox
                    checked={checkedQids.has(q.id)}
                    onCheckedChange={() => toggleCheck(q.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">#{idx + 1}</span>
                  {isPassage && (
                    <Badge variant="outline" className="text-[10px] h-5 px-1 shrink-0 border-blue-400 text-blue-600">
                      文章
                    </Badge>
                  )}
                  {isPassageQ && (
                    <Badge variant="outline" className="text-[10px] h-5 px-1 shrink-0 border-purple-400 text-purple-600">
                      阅读题
                    </Badge>
                  )}
                  {q.crossPage && (
                    <Badge variant="outline" className="text-[10px] h-5 px-1 shrink-0">
                      跨页
                    </Badge>
                  )}
                  <Input
                    value={q.number}
                    placeholder="题号"
                    onChange={(e) => updateQuestion(currentImage.id, q.id, { number: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="h-7 text-sm w-20"
                  />
                  <div className="ml-auto flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-violet-600 dark:text-violet-400" title="解题模式：6 阶段溯源诊断" onClick={(e) => { e.stopPropagation(); router.push(`/tutor/new?type=solve&imageId=${currentImage.id}&questionIdx=${idx}`) }}>
                      <Brain className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-600 dark:text-amber-400" title="讲题模式：HTML 画板 + SVG" onClick={(e) => { e.stopPropagation(); router.push(`/tutor/new?type=lecture&imageId=${currentImage.id}&questionIdx=${idx}`) }}>
                      <Lightbulb className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="复制题文" onClick={(e) => { e.stopPropagation(); copyQuestionText(q) }}>
                      <Copy className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="复制题目截图" onClick={(e) => { e.stopPropagation(); copyQuestionImage(q) }}>
                      <ImageIcon className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="下载题目截图" onClick={(e) => { e.stopPropagation(); downloadQuestion(q) }}>
                      <Download className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn("h-7 w-7 p-0", q.grading && "text-emerald-600")}
                      title="AI 批改 + 解析"
                      disabled={gradingQid === q.id}
                      onClick={(e) => { e.stopPropagation(); onGrade(q) }}
                    >
                      {gradingQid === q.id ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                    </Button>
                    {refreshing === q.id ? (
                      <Loader2 className="size-3.5 animate-spin mx-1" />
                    ) : (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="重新裁剪配图" onClick={(e) => { e.stopPropagation(); refreshSubImages(q.id) }}>
                        <RefreshCw className="size-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); removeQuestion(currentImage.id, q.id) }}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={q.content}
                  placeholder="题目内容（可手动编辑，或点「AI 识别该框」让 AI 识别）"
                  onChange={(e) => updateQuestion(currentImage.id, q.id, { content: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "text-xs min-h-[60px] resize-y",
                    isPassage && "bg-blue-50/30 dark:bg-blue-950/10",
                    isPassageQ && "bg-purple-50/30 dark:bg-purple-950/10"
                  )}
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
                            <img src={si.dataUrl} alt={si.caption || "配图"} className="w-full h-auto max-h-32 object-contain bg-white" onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
                          ) : (
                            <div className="aspect-video flex items-center justify-center text-xs text-muted-foreground">
                              <ImageIcon className="size-4 opacity-50" />
                            </div>
                          )}
                          {si.caption && (
                            <div className="text-[10px] px-1 py-0.5 bg-black/60 text-white truncate">{si.caption}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 批改结果 */}
                {q.grading && (
                  <div className="mt-2 border rounded p-2 space-y-1.5 bg-muted/30">
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      {q.grading.correct === true && (
                        <Badge className="bg-emerald-500 hover:bg-emerald-500">
                          <CheckCircle2 className="size-3 mr-1" /> 正确
                        </Badge>
                      )}
                      {q.grading.correct === "partial" && (
                        <Badge className="bg-amber-500 hover:bg-amber-500">
                          <AlertCircle className="size-3 mr-1" /> 部分正确
                        </Badge>
                      )}
                      {q.grading.correct === false && (
                        <Badge className="bg-rose-500 hover:bg-rose-500">
                          <XCircle className="size-3 mr-1" /> 错误
                        </Badge>
                      )}
                      {typeof q.grading.score === "number" && (
                        <Badge variant="outline" className="text-xs">
                          得分 {q.grading.score}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 ml-auto p-0 px-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedGrading(expandedGrading === q.id ? null : q.id)
                        }}
                      >
                        {expandedGrading === q.id ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                        解析
                      </Button>
                    </div>
                    {q.grading.correctAnswer && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">正确答案：</span>
                        <span className="font-medium">{q.grading.correctAnswer}</span>
                      </div>
                    )}
                    {q.grading.knowledgePoints && q.grading.knowledgePoints.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {q.grading.knowledgePoints.map((k, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] h-4 px-1">
                            {k}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {expandedGrading === q.id && (
                      <div className="border-t pt-2 mt-1">
                        <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                          <FileText className="size-3" /> 详细解析
                        </div>
                        <Markdown>{q.grading.explanation || "（无解析）"}</Markdown>
                      </div>
                    )}
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
