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
  cropToDataUrl,
  dataUrlToBlob,
  downloadBlob,
  buildExportData,
} from "@/lib/image-utils"
import { renderImageWithBoxes } from "@/lib/merge-images"

export function ExportMenu() {
  const images = useDetectorStore((s) => s.images)
  const [busy, setBusy] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  // ===== JSON =====
  const exportJson = () => {
    const data = buildExportData(images)
    const jsonStr = JSON.stringify(data, null, 2)
    const blob = new Blob(["\uFEFF" + jsonStr], { type: "application/json;charset=utf-8" })
    downloadBlob(blob, `questions-${Date.now()}.json`)
    toast.success("已导出 JSON")
  }

  // ===== Markdown =====
  const exportMarkdown = () => {
    const lines: string[] = ["# 题目识别结果", ""]
    if (images.length === 0) {
      lines.push("（暂无图片）")
    } else {
      images.forEach((img, i) => {
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
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/markdown;charset=utf-8" })
    downloadBlob(blob, `questions-${Date.now()}.md`)
    toast.success("已导出 Markdown")
  }

  // ===== 复制全部题文 =====
  const copyAll = async () => {
    const text = images
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

  // ===== 导出所有题目截图（含配图） =====
  const exportCroppedImages = async (includeSubImages: boolean) => {
    if (images.length === 0) {
      toast.error("没有图片可导出")
      return
    }
    setBusy(true)
    toast.info("开始导出题目截图…")
    let count = 0
    for (let i = 0; i < images.length; i++) {
      const img = images[i]
      for (let j = 0; j < img.questions.length; j++) {
        const q = img.questions[j]
        if (q.kind === "passage") continue
        try {
          const dataUrl = await cropToDataUrl(img, q.bbox, 1600)
          const withLabel = await addLabelWatermark(dataUrl, q.number, q.grading?.correct)
          const blob = dataUrlToBlob(withLabel)
          downloadBlob(blob, `img${i + 1}_q${j + 1}_${q.number || "no-num"}.png`)
          count += 1
          // 导出配图
          if (includeSubImages) {
            for (let k = 0; k < q.images.length; k++) {
              const si = q.images[k]
              const subDataUrl = si.dataUrl ?? (await cropToDataUrl(img, si.bbox, 800))
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
  const exportWithBoxes = async (showGradingColor: boolean) => {
    if (images.length === 0) {
      toast.error("没有图片可导出")
      return
    }
    setBusy(true)
    let count = 0
    for (let i = 0; i < images.length; i++) {
      try {
        const dataUrl = await renderImageWithBoxes(images[i], {
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
  const exportWord = async () => {
    if (images.length === 0) {
      toast.error("没有图片")
      return
    }
    setBusy(true)
    try {
      const docx = await import("docx")
      const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType } = docx
      const children: any[] = []
      for (let i = 0; i < images.length; i++) {
        const img = images[i]
        children.push(
          new Paragraph({
            text: `图片 ${i + 1}：${img.name}`,
            heading: HeadingLevel.HEADING_1,
          })
        )
        // 文章
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
        // 题目
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
          // 题目截图
          try {
            const dataUrl = await cropToDataUrl(img, q.bbox, 800)
            const base64 = dataUrl.split(",")[1]
            children.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
                    transformation: { width: 480, height: 180 },
                  }),
                ],
              })
            )
          } catch (e) {
            console.error(e)
          }
          // 配图
          for (const si of q.images) {
            try {
              const subDataUrl = si.dataUrl ?? (await cropToDataUrl(img, si.bbox, 600))
              if (subDataUrl) {
                const base64 = subDataUrl.split(",")[1]
                children.push(
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new ImageRun({
                        data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
                        transformation: { width: 280, height: 200 },
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
          // 批改
          if (q.grading) {
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
      toast.success("已导出 Word 文档")
    } catch (e) {
      toast.error(`Word 导出失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // ===== PDF（修复 async 截图问题）=====
  const exportPDF = async () => {
    if (images.length === 0) {
      toast.error("没有图片")
      return
    }
    setBusy(true)
    try {
      const { jsPDF } = await import("jspdf")
      const pdf = new jsPDF({ unit: "pt", format: "a4" })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 36
      let y = margin
      for (let i = 0; i < images.length; i++) {
        const img = images[i]
        if (y > pageH - 80) {
          pdf.addPage()
          y = margin
        }
        pdf.setFontSize(14)
        pdf.setFont("helvetica", "bold")
        // 编码中文避免乱码
        try {
          const titleB64 = btoa(unescape(encodeURIComponent(`Image ${i + 1}: ${img.name}`)))
          pdf.text(decodeURIComponent(escape(atob(titleB64))), margin, y)
        } catch {
          pdf.text(`Image ${i + 1}`, margin, y)
        }
        y += 18
        // 文章
        const passages = img.questions.filter((q) => q.kind === "passage")
        for (const p of passages) {
          if (y > pageH - 60) { pdf.addPage(); y = margin }
          pdf.setFontSize(12)
          pdf.setFont("helvetica", "bold")
          pdf.text("Passage:", margin, y)
          y += 14
          pdf.setFontSize(10)
          pdf.setFont("helvetica", "normal")
          const lines = pdf.splitTextToSize(p.content || "(no content)", pageW - margin * 2)
          for (const line of lines) {
            if (y > pageH - 40) { pdf.addPage(); y = margin }
            pdf.text(line, margin, y)
            y += 12
          }
          y += 6
        }
        // 题目
        const questions = img.questions.filter((q) => q.kind !== "passage")
        for (let qi = 0; qi < questions.length; qi++) {
          const q = questions[qi]
          if (y > pageH - 60) { pdf.addPage(); y = margin }
          pdf.setFontSize(12)
          pdf.setFont("helvetica", "bold")
          pdf.text(`Q ${q.number || qi + 1}`, margin, y)
          y += 14
          pdf.setFontSize(10)
          pdf.setFont("helvetica", "normal")
          const lines = pdf.splitTextToSize(q.content || "(no content)", pageW - margin * 2)
          for (const line of lines) {
            if (y > pageH - 40) { pdf.addPage(); y = margin }
            pdf.text(line, margin, y)
            y += 12
          }
          y += 4
          // 题目截图（关键修复：await）
          try {
            const dataUrl = await cropToDataUrl(img, q.bbox, 800)
            const base64 = dataUrl.split(",")[1]
            const imgW = pageW - margin * 2
            const imgH = imgW * (q.bbox.height / q.bbox.width)
            if (y + imgH > pageH - margin) {
              pdf.addPage()
              y = margin
            }
            const finalH = Math.min(imgH, pageH - margin * 2 - y)
            const finalW = (finalH / imgH) * imgW
            pdf.addImage(base64, "PNG", margin, y, finalW, finalH)
            y += finalH + 10
          } catch (e) {
            console.error("PDF 截图失败", e)
          }
          // 配图
          for (const si of q.images) {
            try {
              const subDataUrl = si.dataUrl ?? (await cropToDataUrl(img, si.bbox, 600))
              const subBase64 = subDataUrl.split(",")[1]
              if (y > pageH - 200) { pdf.addPage(); y = margin }
              const subW = (pageW - margin * 2) * 0.6
              const subH = subW * (si.bbox.height / si.bbox.width)
              pdf.addImage(subBase64, "PNG", margin, y, subW, subH)
              y += subH + 8
            } catch (e) {
              console.error(e)
            }
          }
          // 批改
          if (q.grading) {
            const statusText =
              q.grading.correct === true ? "[Correct]" :
              q.grading.correct === "partial" ? "[Partial]" : "[Wrong]"
            pdf.setFont("helvetica", "bold")
            pdf.text(`Grading: ${statusText}`, margin, y)
            y += 14
            if (q.grading.correctAnswer) {
              pdf.setFont("helvetica", "normal")
              const ansLines = pdf.splitTextToSize(`Answer: ${q.grading.correctAnswer}`, pageW - margin * 2)
              for (const line of ansLines) {
                if (y > pageH - 40) { pdf.addPage(); y = margin }
                pdf.text(line, margin, y)
                y += 12
              }
            }
            pdf.setFont("helvetica", "normal")
            const expLines = pdf.splitTextToSize(`Explanation: ${q.grading.explanation}`, pageW - margin * 2)
            for (const line of expLines) {
              if (y > pageH - 40) { pdf.addPage(); y = margin }
              pdf.text(line, margin, y)
              y += 12
            }
            y += 6
          }
        }
        y += 20
      }
      pdf.save(`questions-${Date.now()}.pdf`)
      toast.success("已导出 PDF")
    } catch (e) {
      toast.error(`PDF 导出失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  // ===== Excel =====
  const exportExcel = async () => {
    if (images.length === 0) {
      toast.error("没有图片")
      return
    }
    setBusy(true)
    try {
      const XLSX = await import("xlsx")
      const rows: any[] = []
      images.forEach((img, i) => {
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
      toast.success("已导出 Excel")
    } catch (e) {
      toast.error(`Excel 导出失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const printAll = () => {
    window.print()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={busy} className="shrink-0">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          <span className="hidden sm:ml-1 sm:inline">导出</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 max-h-[80vh] overflow-y-auto">
        <DropdownMenuLabel>导出当前所有图片</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ImageIcon className="size-4 mr-2" /> 整张带框图
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => exportWithBoxes(false)}>
              所有题目框同色
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportWithBoxes(true)}>
              按批改结果分色（错题红色）
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Images className="size-4 mr-2" /> 题目截图
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => exportCroppedImages(false)}>
              仅题目截图
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportCroppedImages(true)}>
              题目截图 + 配图
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onClick={exportWord}>
          <FileType className="size-4 mr-2" /> Word 文档
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportPDF}>
          <FileText className="size-4 mr-2" /> PDF 文档
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportExcel}>
          <FileSpreadsheet className="size-4 mr-2" /> Excel 表格
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={exportJson}>
          <FileJson className="size-4 mr-2" /> JSON 数据
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportMarkdown}>
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
  )
}

async function addLabelWatermark(
  dataUrl: string,
  label: string,
  correct?: boolean | "partial"
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = dataUrl
  })
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)
  // 题号水印
  if (label) {
    const text = `第 ${label} 题`
    ctx.font = "bold 24px sans-serif"
    const tw = ctx.measureText(text).width
    // 错题红色，部分正确黄色，正确绿色，未批改粉色
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

