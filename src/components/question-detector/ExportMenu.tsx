"use client"

import { Download, FileJson, FileText, Copy } from "lucide-react"
import { toast } from "sonner"
import { useDetectorStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import type { ImageItem, Question } from "@/lib/types"

export function ExportMenu() {
  const images = useDetectorStore((s) => s.images)

  const allQuestions = () => {
    const out: { image: string; index: number; question: Question }[] = []
    images.forEach((img, i) => {
      img.questions.forEach((q) => {
        out.push({ image: `图片 ${i + 1} · ${img.name}`, index: i + 1, question: q })
      })
    })
    return out
  }

  const exportJson = () => {
    const data = images.map((img, i) => ({
      imageIndex: i + 1,
      imageName: img.name,
      source: img.source,
      width: img.width,
      height: img.height,
      questions: img.questions.map((q) => ({
        number: q.number,
        content: q.content,
        bbox: q.bbox,
      })),
    }))
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    download(blob, `questions-${Date.now()}.json`)
    toast.success("已导出 JSON")
  }

  const exportMarkdown = () => {
    const lines: string[] = ["# 题目识别结果", ""]
    if (images.length === 0) {
      lines.push("（暂无图片）")
    } else {
      images.forEach((img, i) => {
        lines.push(`## 图片 ${i + 1}：${img.name}`)
        lines.push("")
        if (img.questions.length === 0) {
          lines.push("_未识别到题目_")
        } else {
          img.questions.forEach((q, qi) => {
            const num = q.number ? `（${q.number}）` : `（${qi + 1}）`
            lines.push(`### 第 ${qi + 1} 题 ${num}`)
            lines.push("")
            lines.push(q.content || "_（无内容）_")
            lines.push("")
          })
        }
        lines.push("")
      })
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" })
    download(blob, `questions-${Date.now()}.md`)
    toast.success("已导出 Markdown")
  }

  const copyAll = async () => {
    const text = allQuestions()
      .map(
        (it) =>
          `图片${it.index} ${it.image} · 第 ${it.question.number || "?"} 题\n${it.question.content || "(无内容)"}`
      )
      .join("\n\n----\n\n")
    try {
      await navigator.clipboard.writeText(text)
      toast.success("已复制到剪贴板")
    } catch {
      toast.error("复制失败")
    }
  }

  const exportCroppedImages = async () => {
    if (images.length === 0) {
      toast.error("没有图片可导出")
      return
    }
    toast.info("开始导出题目截图…")
    let count = 0
    for (let i = 0; i < images.length; i++) {
      const img = images[i]
      for (let j = 0; j < img.questions.length; j++) {
        const q = img.questions[j]
        try {
          const blob = await cropImage(img, q)
          if (blob) {
            download(blob, `img${i + 1}_q${j + 1}_${q.number || "no-num"}.png`)
            count += 1
          }
        } catch {
          // 忽略单张失败
        }
      }
    }
    toast.success(`已导出 ${count} 张题目截图`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="size-4 mr-1" /> 导出
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>导出当前所有图片</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={exportCroppedImages}>
          <FileText className="size-4 mr-2" /> 导出题目截图（PNG）
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportJson}>
          <FileJson className="size-4 mr-2" /> 导出 JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportMarkdown}>
          <FileText className="size-4 mr-2" /> 导出 Markdown
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={copyAll}>
          <Copy className="size-4 mr-2" /> 复制全部题文
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function cropImage(img: ImageItem, q: Question): Promise<Blob | null> {
  const image = await loadImage(img.dataUrl)
  const sx = q.bbox.x * img.width
  const sy = q.bbox.y * img.height
  const sw = q.bbox.width * img.width
  const sh = q.bbox.height * img.height
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(sw))
  canvas.height = Math.max(1, Math.round(sh))
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  // 顶部加题号水印
  if (q.number) {
    ctx.fillStyle = "rgba(255,255,255,0.85)"
    const labelW = Math.min(canvas.width, ctx.measureText(`第 ${q.number} 题`).width + 24)
    ctx.fillRect(0, 0, labelW, 28)
    ctx.fillStyle = "#e11d48"
    ctx.font = "bold 16px sans-serif"
    ctx.textBaseline = "middle"
    ctx.fillText(`第 ${q.number} 题`, 8, 14)
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"))
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
