"use client"

import { useState } from "react"
import {
  Download,
  FileJson,
  FileText,
  Copy,
  FileType,
  FileSpreadsheet,
  Printer,
  Loader2,
  Images,
  ImageIcon,
  CheckSquare,
  Square,
} from "lucide-react"
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import {
  cropToDataUrl,
  dataUrlToBlob,
  downloadBlob,
  buildExportData,
} from "@/lib/image-utils"
import { renderImageWithBoxes } from "@/lib/merge-images"
import { renderQuestionToCanvas, renderImageFullPage } from "@/lib/render-question"

interface ExportMenuProps {
  /** 限制只导出当前图片（当页导出） */
  currentImageOnly?: boolean
}

export function ExportMenu({ currentImageOnly = false }: ExportMenuProps) {
  const images = useDetectorStore((s) => s.images)
  const currentImageId = useDetectorStore((s) => s.currentImageId)
  const [busy, setBusy] = useState(false)
  const [selectImagesOpen, setSelectImagesOpen] = useState(false)
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [pendingAction, setPendingAction] = useState<"pdf" | "word" | "excel" | "markdown" | "json" | "boxes" | "cropped" | null>(null)
  // 导出选项：是否含题目原图截图 / 配图 / 批改结果
  const [optIncludeImage, setOptIncludeImage] = useState(true)
  const [optIncludeSubImages, setOptIncludeSubImages] = useState(true)
  const [optIncludeGrading, setOptIncludeGrading] = useState(true)

  // 当前要导出的图片列表
  const targetImages = currentImageOnly
    ? images.filter((im) => im.id === currentImageId)
    : selectedImageIds.size > 0
    ? images.filter((im) => selectedImageIds.has(im.id))
    : images

  // 打开"选择图片+选项"对话框
  const openSelectImages = (action: "pdf" | "word" | "excel" | "markdown" | "json" | "boxes" | "cropped") => {
    if (images.length === 0) {
      toast.error("没有图片可导出")
      return
    }
    setPendingAction(action)
    setSelectedImageIds(new Set(images.map((im) => im.id)))
    setSelectImagesOpen(true)
  }

  const confirmSelectAndExport = async () => {
    setSelectImagesOpen(false)
    if (selectedImageIds.size === 0) {
      toast.error("请至少选择一张图片")
      return
    }
    const targets = images.filter((im) => selectedImageIds.has(im.id))
    if (pendingAction) {
      await runExport(pendingAction, targets)
    }
    setPendingAction(null)
  }

  const toggleImage = (id: string) => {
    setSelectedImageIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedImageIds(new Set(images.map((im) => im.id)))
  const selectNone = () => setSelectedImageIds(new Set())

  const runExport = async (
    action: "pdf" | "word" | "excel" | "markdown" | "json" | "boxes" | "cropped",
    targets: typeof images
  ) => {
    if (targets.length === 0) {
      toast.error("没有图片可导出")
      return
    }
    // 选项仅对 pdf/word/cropped 有意义；markdown/excel/json 始终含批改文本；boxes 始终含图
    if (action === "json") return exportJson(targets)
    if (action === "markdown") return exportMarkdown(targets)
    if (action === "excel") return exportExcel(targets)
    if (action === "boxes") return exportWithBoxes(targets, true)
    if (action === "cropped") return exportCroppedImages(targets, optIncludeSubImages)
    if (action === "pdf") return exportPDF(targets)
    if (action === "word") return exportWord(targets)
  }

  // ===== JSON =====
  const exportJson = (targets: typeof images) => {
    const data = buildExportData(targets)
    const jsonStr = JSON.stringify(data, null, 2)
    const blob = new Blob(["\uFEFF" + jsonStr], { type: "application/json;charset=utf-8" })
    downloadBlob(blob, `questions-${Date.now()}.json`)
    toast.success(`已导出 ${targets.length} 张图的 JSON`)
  }

  // ===== Markdown =====
  const exportMarkdown = (targets: typeof images) => {
    const lines: string[] = ["# 题目识别结果", ""]
    targets.forEach((img, i) => {
      lines.push(`## 图片 ${i + 1}：${img.name}`)
      lines.push("")
      const passages = img.questions.filter((q) => q.kind === "passage")
      passages.forEach((p) => {
        lines.push(`### 阅读材料`)
        lines.push("")
        lines.push(p.content || "（无内容）")
        lines.push("")
      })
      if (img.questions.length === 0) {
        lines.push("_未识别到题目_")
      } else {
        img.questions
          .filter((q) => q.kind !== "passage")
          .forEach((q, qi) => {
            const num = q.number ? `（${q.number}）` : `（${qi + 1}）`
            lines.push(`### 第 ${qi + 1} 题 ${num}`)
            lines.push("")
            if (q.kind === "passage_question" && q.passageId) {
              const passage = img.questions.find((x) => x.id === q.passageId)
              if (passage) {
                lines.push("> **阅读材料：**")
                lines.push(">")
                lines.push(`> ${passage.content.replace(/\n/g, "\n> ")}`)
                lines.push("")
              }
            }
            lines.push(q.content || "_（无内容）_")
            lines.push("")
            if (q.images.length > 0) {
              lines.push(`> 配图 ${q.images.length} 张`)
              lines.push("")
            }
            if (q.grading) {
              lines.push(`**批改结果：** ${q.grading.correct === true ? "✓ 正确" : q.grading.correct === "partial" ? "△ 部分正确" : "✗ 错误"}`)
              if (q.grading.correctAnswer) {
                lines.push(`**正确答案：** ${q.grading.correctAnswer}`)
              }
              lines.push("")
              lines.push("**解析：**")
              lines.push("")
              lines.push(q.grading.explanation)
              lines.push("")
            }
          })
      }
      lines.push("")
    })
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/markdown;charset=utf-8" })
    downloadBlob(blob, `questions-${Date.now()}.md`)
    toast.success(`已导出 ${targets.length} 张图的 Markdown`)
  }

  // ===== 复制全部题文 =====
  const copyAll = async () => {
    const text = targetImages
      .flatMap((img, i) => {
        const passages = img.questions.filter((q) => q.kind === "passage")
        const out: string[] = []
        if (passages.length > 0) {
          out.push(`==== 图片 ${i + 1} 阅读材料 ====`)
          passages.forEach((p) => out.push(p.content))
          out.push("")
        }
        out.push(`==== 图片 ${i + 1}：${img.name} ====`)
        img.questions
          .filter((q) => q.kind !== "passage")
          .forEach((q) => {
            out.push(`\n第 ${q.number || "?"} 题`)
            out.push(q.content || "(无内容)")
            if (q.grading) {
              out.push(`批改：${q.grading.correct === true ? "正确" : q.grading.correct === "partial" ? "部分正确" : "错误"}`)
              if (q.grading.correctAnswer) out.push(`正确答案：${q.grading.correctAnswer}`)
              out.push(`解析：${q.grading.explanation}`)
            }
            out.push("")
          })
        return out
      })
      .join("\n")
    try {
      await navigator.clipboard.writeText(text)
      toast.success("已复制到剪贴板")
    } catch {
      toast.error("复制失败")
    }
  }

  // ===== 题目截图 + 配图 =====
  const exportCroppedImages = async (targets: typeof images, includeSubImages: boolean) => {
    if (targets.length === 0) {
      toast.error("没有图片可导出")
      return
    }
    setBusy(true)
    toast.info("开始导出题目截图…")
    let count = 0
    for (let i = 0; i < targets.length; i++) {
      const img = targets[i]
      for (let j = 0; j < img.questions.length; j++) {
        const q = img.questions[j]
        if (q.kind === "passage") continue
        try {
          const dataUrl = await cropToDataUrl(img, q.bbox, 1600, true)
          const withLabel = await addLabelWatermark(dataUrl, q.number, q.grading?.correct)
          const blob = dataUrlToBlob(withLabel)
          downloadBlob(blob, `img${i + 1}_q${j + 1}_${q.number || "no-num"}.png`)
          count += 1
          if (includeSubImages) {
            for (let k = 0; k < q.images.length; k++) {
              const si = q.images[k]
              const subDataUrl = si.dataUrl ?? (await cropToDataUrl(img, si.bbox, 800, true))
              if (subDataUrl) {
                const subBlob = dataUrlToBlob(subDataUrl)
                downloadBlob(subBlob, `img${i + 1}_q${j + 1}_sub${k + 1}.png`)
                count += 1
              }
            }
          }
          await new Promise((r) => setTimeout(r, 200))
        } catch (e) {
          console.error(e)
        }
      }
    }
    setBusy(false)
    toast.success(`已导出 ${count} 张图片`)
  }

  // ===== 整张带框图 =====
  const exportWithBoxes = async (targets: typeof images, showGradingColor: boolean) => {
    if (targets.length === 0) {
      toast.error("没有图片可导出")
      return
    }
    setBusy(true)
    let count = 0
    for (let i = 0; i < targets.length; i++) {
      try {
        const dataUrl = await renderImageWithBoxes(targets[i], {
          showLabels: true,
          boxColor: "#10b981",
          selectedColor: "#e11d48",
          showGradingColor: showGradingColor,
        })
        const blob = dataUrlToBlob(dataUrl)
        downloadBlob(blob, `img${i + 1}_with_boxes.png`)
        count += 1
        await new Promise((r) => setTimeout(r, 200))
      } catch (e) {
        console.error(e)
      }
    }
    setBusy(false)
    toast.success(`已导出 ${count} 张带框图`)
  }

  // ===== Word =====
  const exportWord = async (targets: typeof images) => {
    if (targets.length === 0) {
      toast.error("没有图片")
      return
    }
    setBusy(true)
    try {
      const docx = await import("docx")
      const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType } = docx
      const children: any[] = []
      for (let i = 0; i < targets.length; i++) {
        const img = targets[i]
        children.push(
          new Paragraph({
            text: `图片 ${i + 1}：${img.name}`,
            heading: HeadingLevel.HEADING_1,
          })
        )
        const passages = img.questions.filter((q) => q.kind === "passage")
        passages.forEach((p) => {
          children.push(
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              children: [new TextRun({ text: "阅读材料", bold: true })],
            })
          )
          p.content.split("\n").forEach((line) =>
            children.push(new Paragraph({ text: line || " " }))
          )
        })
        const questions = img.questions.filter((q) => q.kind !== "passage")
        for (let qi = 0; qi < questions.length; qi++) {
          const q = questions[qi]
          const numText = q.number ? `第 ${q.number} 题` : `第 ${qi + 1} 题`
          children.push(
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              children: [new TextRun({ text: numText, bold: true })],
            })
          )
          if (q.kind === "passage_question" && q.passageId) {
            children.push(new Paragraph({ text: "（阅读材料见上）", italics: true }))
          }
          q.content.split("\n").forEach((line) =>
            children.push(new Paragraph({ text: line || " " }))
          )
          // 题目截图（可选，不含配图）
          if (optIncludeImage) {
          try {
            const dataUrl = await cropToDataUrl(img, q.bbox, 800, true)
            const base64 = dataUrl.split(",")[1]
            // 按实际裁剪比例计算宽高，避免拉伸变形
            const shot = await loadImageLocal(dataUrl)
            const maxW = 480
            const maxH = 620
            let dw = maxW
            let dh = Math.round(maxW * (shot.naturalHeight / shot.naturalWidth))
            if (dh > maxH) {
              dh = maxH
              dw = Math.round(maxH * (shot.naturalWidth / shot.naturalHeight))
            }
            children.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
                    transformation: { width: dw, height: dh },
                  }),
                ],
              })
            )
          } catch (e) {
            console.error(e)
          }
          }
          // 配图（可选）
          if (optIncludeSubImages) {
          for (const si of q.images) {
            try {
              const subDataUrl = si.dataUrl ?? (await cropToDataUrl(img, si.bbox, 600, true))
              if (subDataUrl) {
                const base64 = subDataUrl.split(",")[1]
                const subShot = await loadImageLocal(subDataUrl)
                const subMaxW = 300
                const subMaxH = 360
                let sdw = subMaxW
                let sdh = Math.round(subMaxW * (subShot.naturalHeight / subShot.naturalWidth))
                if (sdh > subMaxH) {
                  sdh = subMaxH
                  sdw = Math.round(subMaxH * (subShot.naturalWidth / subShot.naturalHeight))
                }
                children.push(
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new ImageRun({
                        data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
                        transformation: { width: sdw, height: sdh },
                      }),
                    ],
                  })
                )
                if (si.caption) {
                  children.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: si.caption, italics: true, size: 18 })],
                  }))
                }
              }
            } catch (e) {
              console.error(e)
            }
          }
          }
          // 批改（可选）
          if (optIncludeGrading && q.grading) {
            const statusText =
              q.grading.correct === true ? "✓ 正确" :
              q.grading.correct === "partial" ? "△ 部分正确" : "✗ 错误"
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `批改结果：${statusText}`,
                    bold: true,
                    color: q.grading.correct === true ? "16A34A" : q.grading.correct === "partial" ? "D97706" : "DC2626",
                  }),
                ],
              })
            )
            if (q.grading.correctAnswer) {
              children.push(new Paragraph({ text: `正确答案：${q.grading.correctAnswer}` }))
            }
            children.push(new Paragraph({ text: "解析：", bold: true }))
            q.grading.explanation.split("\n").forEach((line) =>
              children.push(new Paragraph({ text: line || " " }))
            )
          }
        }
      }
      const doc = new Document({ sections: [{ children }] })
      const blob = await Packer.toBlob(doc)
      downloadBlob(blob, `questions-${Date.now()}.docx`)
      toast.success(`已导出 ${targets.length} 张图的 Word 文档`)
    } catch (e) {
      toast.error(`Word 导出失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // ===== PDF：用 canvas 渲染中文，彻底解决乱码 =====
  const exportPDF = async (targets: typeof images) => {
    if (targets.length === 0) {
      toast.error("没有图片")
      return
    }
    setBusy(true)
    try {
      const { jsPDF } = await import("jspdf")
      const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 24

      for (let i = 0; i < targets.length; i++) {
        const img = targets[i]
        // 1. 第一页（可选）：原图 + 框 + 题号标签
        if (optIncludeImage) {
          const { renderImageWithBoxes } = await import("@/lib/merge-images")
          const boxDataUrl = await renderImageWithBoxes(img, {
            showLabels: true,
            showGradingColor: optIncludeGrading,
          })
          const boxImg = await loadImageLocal(boxDataUrl)
          const drawW = pageW - margin * 2
          const drawH = (boxImg.naturalHeight / boxImg.naturalWidth) * drawW
          const finalDrawH = Math.min(drawH, pageH - margin * 2)
          const finalDrawW = (finalDrawH / drawH) * drawW
          if (i > 0) pdf.addPage()
          pdf.addImage(boxDataUrl, "JPEG", margin, margin, finalDrawW, finalDrawH)
        }

        // 2. 后续页：每道题渲染为图片（含文字 + 截图 + 配图 + 批改）
        const questions = img.questions.filter((q) => q.kind !== "passage")
        for (let qi = 0; qi < questions.length; qi++) {
          const q = questions[qi]
          // 找关联的阅读材料
          let passageContent: string | undefined
          if (q.kind === "passage_question" && q.passageId) {
            const passage = img.questions.find((x) => x.id === q.passageId)
            if (passage) passageContent = passage.content
          }
          try {
            const { dataUrl: qDataUrl } = await renderQuestionToCanvas(img, q, passageContent, {
              showGrading: optIncludeGrading,
              showSubImages: optIncludeSubImages,
              showQuestionImage: optIncludeImage,
            })
            if (qDataUrl) {
              const qImg = await loadImageLocal(qDataUrl)
              const qDrawW = pageW - margin * 2
              const qDrawH = (qImg.naturalHeight / qImg.naturalWidth) * qDrawW
              // 如果一页放不下，分块
              if (qDrawH <= pageH - margin * 2) {
                pdf.addPage()
                pdf.addImage(qDataUrl, "JPEG", margin, margin, qDrawW, qDrawH)
              } else {
                // 分块画
                const sliceCount = Math.ceil(qDrawH / (pageH - margin * 2))
                const slicePxH = Math.floor(qImg.naturalHeight / sliceCount)
                for (let s = 0; s < sliceCount; s++) {
                  const sy = s * slicePxH
                  const sh = s === sliceCount - 1 ? qImg.naturalHeight - sy : slicePxH
                  const c2 = document.createElement("canvas")
                  c2.width = qImg.naturalWidth
                  c2.height = sh
                  const c2ctx = c2.getContext("2d")
                  if (!c2ctx) break
                  c2ctx.drawImage(qImg, 0, sy, qImg.naturalWidth, sh, 0, 0, qImg.naturalWidth, sh)
                  const sliceDataUrl = c2.toDataURL("image/jpeg", 0.85)
                  const sliceDrawH = (sh / qImg.naturalWidth) * qDrawW
                  pdf.addPage()
                  pdf.addImage(sliceDataUrl, "JPEG", margin, margin, qDrawW, sliceDrawH)
                }
              }
            }
          } catch (e) {
            console.error(`PDF 渲染题目 ${qi} 失败`, e)
          }
        }
      }
      pdf.save(`questions-${Date.now()}.pdf`)
      toast.success(`已导出 ${targets.length} 张图的 PDF`)
    } catch (e) {
      toast.error(`PDF 导出失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // ===== Excel =====
  const exportExcel = async (targets: typeof images) => {
    if (targets.length === 0) {
      toast.error("没有图片")
      return
    }
    setBusy(true)
    try {
      const XLSX = await import("xlsx")
      const rows: any[] = []
      targets.forEach((img, i) => {
        if (img.questions.length === 0) {
          rows.push({
            "图片序号": i + 1,
            "图片名": img.name,
            "来源": img.source === "camera" ? "拍照" : img.source === "merged" ? "合并" : "上传",
            "题号": "",
            "类型": "",
            "题目内容": "（未识别到题目）",
            "配图数": 0,
            "批改结果": "",
            "正确答案": "",
            "解析": "",
          })
        } else {
          img.questions.forEach((q, qi) => {
            const gradingStatus =
              q.grading?.correct === true ? "正确" :
              q.grading?.correct === "partial" ? "部分正确" :
              q.grading?.correct === false ? "错误" : ""
            rows.push({
              "图片序号": i + 1,
              "图片名": img.name,
              "来源": img.source === "camera" ? "拍照" : img.source === "merged" ? "合并" : "上传",
              "题号": q.number || String(qi + 1),
              "类型": q.kind === "passage" ? "阅读材料" : q.kind === "passage_question" ? "阅读理解题" : "普通题",
              "题目内容": q.content,
              "配图数": q.images.length,
              "批改结果": gradingStatus,
              "正确答案": q.grading?.correctAnswer || "",
              "解析": q.grading?.explanation || "",
            })
          })
        }
      })
      const ws = XLSX.utils.json_to_sheet(rows)
      ws["!cols"] = [
        { wch: 8 }, { wch: 24 }, { wch: 8 }, { wch: 10 },
        { wch: 12 }, { wch: 50 }, { wch: 8 }, { wch: 10 },
        { wch: 30 }, { wch: 60 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "题目")
      XLSX.writeFile(wb, `questions-${Date.now()}.xlsx`)
      toast.success(`已导出 ${targets.length} 张图的 Excel`)
    } catch (e) {
      toast.error(`Excel 导出失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const printAll = () => window.print()

  const label = currentImageOnly ? "当页导出" : "导出"

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy} className="shrink-0">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            <span className="ml-1">{label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 max-h-[80vh] overflow-y-auto">
          <DropdownMenuLabel>
            {currentImageOnly ? "导出当前图片" : `导出所有图片（${images.length}）`}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ImageIcon className="size-4 mr-2" /> 整张带框图
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => openSelectImages("boxes")}>
                所有题目框同色
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportWithBoxes(targetImages, true)}>
                按批改结果分色（错题红色）
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Images className="size-4 mr-2" /> 题目截图
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => openSelectImages("cropped")}>
                仅题目截图
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCroppedImages(targetImages, true)}>
                题目截图 + 配图（高清）
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => openSelectImages("word")}>
            <FileType className="size-4 mr-2" /> Word 文档
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openSelectImages("pdf")}>
            <FileText className="size-4 mr-2" /> PDF 文档
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openSelectImages("excel")}>
            <FileSpreadsheet className="size-4 mr-2" /> Excel 表格
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openSelectImages("json")}>
            <FileJson className="size-4 mr-2" /> JSON 数据
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openSelectImages("markdown")}>
            <FileText className="size-4 mr-2" /> Markdown（含公式）
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={copyAll}>
            <Copy className="size-4 mr-2" /> 复制全部题文
          </DropdownMenuItem>
          <DropdownMenuItem onClick={printAll}>
            <Printer className="size-4 mr-2" /> 打印
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 选择图片对话框 */}
      <Dialog open={selectImagesOpen} onOpenChange={setSelectImagesOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>导出设置</DialogTitle>
            <DialogDescription>
              选择要导出的图片（已选 {selectedImageIds.size} / {images.length} 张）和导出内容
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* 导出选项 */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">导出内容（PDF / Word / 题目截图）</div>
              <label className="flex items-center gap-2 cursor-pointer" onClick={() => setOptIncludeImage(!optIncludeImage)}>
                <Checkbox checked={optIncludeImage} onCheckedChange={(v) => setOptIncludeImage(!!v)} />
                <span className="text-sm">题目原图截图<span className="text-xs text-muted-foreground">（不含配图）</span></span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer" onClick={() => setOptIncludeSubImages(!optIncludeSubImages)}>
                <Checkbox checked={optIncludeSubImages} onCheckedChange={(v) => setOptIncludeSubImages(!!v)} />
                <span className="text-sm">题目内配图<span className="text-xs text-muted-foreground">（几何图/表格等）</span></span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer" onClick={() => setOptIncludeGrading(!optIncludeGrading)}>
                <Checkbox checked={optIncludeGrading} onCheckedChange={(v) => setOptIncludeGrading(!!v)} />
                <span className="text-sm">包含批改结果和解析</span>
              </label>
            </div>
            {/* 选择图片 */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground font-medium">选择图片：</span>
              <button onClick={selectAll} className="px-2 py-1 rounded hover:bg-accent">全选</button>
              <button onClick={selectNone} className="px-2 py-1 rounded hover:bg-accent">取消全选</button>
            </div>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {images.map((im, i) => {
                const checked = selectedImageIds.has(im.id)
                return (
                  <label
                    key={im.id}
                    className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${
                      checked ? "border-rose-500 bg-rose-50 dark:bg-rose-950/30" : "border-border hover:bg-accent"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleImage(im.id)}
                    />
                    <img src={im.dataUrl} alt="" className="size-10 object-cover rounded shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{im.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {im.questions.length} 题
                        {im.source === "merged" && " · 合并"}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectImagesOpen(false)}>取消</Button>
            <Button onClick={confirmSelectAndExport} className="bg-rose-500 hover:bg-rose-600">
              导出 {selectedImageIds.size} 张
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

async function addLabelWatermark(
  dataUrl: string,
  label: string,
  correct?: boolean | "partial"
): Promise<string> {
  const img = await loadImageLocal(dataUrl)
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)
  if (label) {
    const text = `第 ${label} 题`
    ctx.font = "bold 24px sans-serif"
    const tw = ctx.measureText(text).width
    const bg =
      correct === false ? "rgba(220, 38, 38, 0.95)" :
      correct === "partial" ? "rgba(217, 119, 6, 0.95)" :
      correct === true ? "rgba(22, 163, 74, 0.95)" :
      "rgba(225, 29, 72, 0.95)"
    ctx.fillStyle = bg
    ctx.fillRect(8, 8, tw + 20, 32)
    ctx.fillStyle = "white"
    ctx.textBaseline = "middle"
    ctx.fillText(text, 18, 24)
  }
  return canvas.toDataURL("image/png")
}

function loadImageLocal(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = dataUrl
  })
}

// 防止未使用告警
void CheckSquare
void Square
void renderQuestionToCanvas
void renderImageFullPage
