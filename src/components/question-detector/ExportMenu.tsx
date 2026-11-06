"use client"

import { useState } from "react"
import { Download, FileJson, FileText, Copy, FileType, FileSpreadsheet, Printer, Loader2, Images } from "lucide-react"
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
import {
  cropToDataUrl,
  dataUrlToBlob,
  downloadBlob,
  buildExportData,
} from "@/lib/image-utils"

export function ExportMenu() {
  const images = useDetectorStore((s) => s.images)
  const [busy, setBusy] = useState(false)

  const exportJson = () => {
    const data = buildExportData(images)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    downloadBlob(blob, `questions-${Date.now()}.json`)
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
            if (q.images.length > 0) {
              lines.push(`> 配图 ${q.images.length} 张`)
              lines.push("")
            }
          })
        }
        lines.push("")
      })
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" })
    downloadBlob(blob, `questions-${Date.now()}.md`)
    toast.success("已导出 Markdown")
  }

  const copyAll = async () => {
    const text = images
      .flatMap((img, i) =>
        img.questions.length === 0
          ? []
          : [
              `==== 图片 ${i + 1}：${img.name} ====`,
              ...img.questions.map(
                (q) => `\n第 ${q.number || "?"} 题\n${q.content || "(无内容)"}\n`
              ),
              "",
            ]
      )
      .join("\n")
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
    setBusy(true)
    toast.info("开始导出题目截图…")
    let count = 0
    for (let i = 0; i < images.length; i++) {
      const img = images[i]
      for (let j = 0; j < img.questions.length; j++) {
        const q = img.questions[j]
        try {
          const dataUrl = await cropToDataUrl(img, q.bbox, 1600)
          // 加题号水印
          const withLabel = await addLabelWatermark(dataUrl, q.number)
          const blob = dataUrlToBlob(withLabel)
          downloadBlob(blob, `img${i + 1}_q${j + 1}_${q.number || "no-num"}.png`)
          count += 1
          // 让浏览器有时间处理下载
          await new Promise((r) => setTimeout(r, 100))
        } catch {
          // 忽略单张失败
        }
      }
    }
    setBusy(false)
    toast.success(`已导出 ${count} 张题目截图`)
  }

  const exportWord = async () => {
    if (images.length === 0) {
      toast.error("没有图片")
      return
    }
    setBusy(true)
    try {
      const docx = await import("docx")
      const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType } = docx
      const sections = await Promise.all(
        images.map(async (img, i) => {
          const children: any[] = []
          children.push(
            new Paragraph({
              text: `图片 ${i + 1}：${img.name}`,
              heading: HeadingLevel.HEADING_1,
            })
          )
          if (img.questions.length === 0) {
            children.push(new Paragraph({ text: "未识别到题目" }))
          } else {
            for (const q of img.questions) {
              const numText = q.number ? `第 ${q.number} 题` : "未编号题"
              children.push(
                new Paragraph({
                  heading: HeadingLevel.HEADING_2,
                  children: [new TextRun({ text: numText, bold: true })],
                })
              )
              q.content.split("\n").forEach((line) =>
                children.push(new Paragraph({ text: line || " " }))
              )
              // 添加配图
              for (const si of q.images) {
                if (si.dataUrl) {
                  try {
                    const base64 = si.dataUrl.split(",")[1]
                    children.push(
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new ImageRun({
                            data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
                            transformation: { width: 320, height: 200 },
                          }),
                        ],
                      })
                    )
                  } catch {
                    // 忽略
                  }
                }
              }
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
              } catch {
                // 忽略
              }
            }
          }
          return { children }
        })
      )
      const doc = new Document({ sections })
      const blob = await Packer.toBlob(doc)
      downloadBlob(blob, `questions-${Date.now()}.docx`)
      toast.success("已导出 Word 文档")
    } catch (e) {
      toast.error(`Word 导出失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

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
        pdf.text(`Image ${i + 1}: ${img.name}`, margin, y)
        y += 18
        if (img.questions.length === 0) {
          pdf.setFontSize(11)
          pdf.setFont("helvetica", "normal")
          pdf.text("(no questions detected)", margin, y)
          y += 16
        } else {
          for (const q of img.questions) {
            if (y > pageH - 60) {
              pdf.addPage()
              y = margin
            }
            pdf.setFontSize(12)
            pdf.setFont("helvetica", "bold")
            pdf.text(`Q ${q.number || "?"}`, margin, y)
            y += 16
            pdf.setFontSize(10)
            pdf.setFont("helvetica", "normal")
            // 题目内容
            const lines = pdf.splitTextToSize(q.content || "(no content)", pageW - margin * 2)
            for (const line of lines) {
              if (y > pageH - 40) {
                pdf.addPage()
                y = margin
              }
              pdf.text(line, margin, y)
              y += 12
            }
            y += 4
            // 题目截图
            try {
              const dataUrl = await cropToDataUrl(img, q.bbox, 800)
              const base64 = dataUrl.split(",")[1]
              const imgW = pageW - margin * 2
              const imgH = imgW * (q.bbox.height / q.bbox.width)
              const maxH = pageH - y - margin
              const finalH = Math.min(imgH, maxH)
              const finalW = (finalH / imgH) * imgW
              if (finalH < 30) {
                pdf.addPage()
                y = margin
                pdf.addImage(base64, "PNG", margin, y, imgW, Math.min(imgH, pageH - margin * 2))
                y += Math.min(imgH, pageH - margin * 2) + 10
              } else {
                pdf.addImage(base64, "PNG", margin, y, finalW, finalH)
                y += finalH + 10
              }
            } catch {
              // 忽略
            }
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
            图片序号: i + 1,
            图片名: img.name,
            来源: img.source === "camera" ? "拍照" : "上传",
            题号: "",
            题目内容: "（未识别到题目）",
            配图数: 0,
          })
        } else {
          img.questions.forEach((q, qi) => {
            rows.push({
              图片序号: i + 1,
              图片名: img.name,
              来源: img.source === "camera" ? "拍照" : "上传",
              题号: q.number || String(qi + 1),
              题目内容: q.content,
              配图数: q.images.length,
            })
          })
        }
      })
      const ws = XLSX.utils.json_to_sheet(rows)
      // 列宽
      ws["!cols"] = [
        { wch: 8 },
        { wch: 24 },
        { wch: 8 },
        { wch: 10 },
        { wch: 60 },
        { wch: 8 },
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
        <Button variant="outline" size="sm" disabled={busy}>
          {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Download className="size-4 mr-1" />}
          导出
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>导出当前所有图片</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={exportCroppedImages}>
          <Images className="size-4 mr-2" /> 题目截图（PNG 多文件）
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportWord}>
          <FileType className="size-4 mr-2" /> Word 文档（.docx）
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
          <FileText className="size-4 mr-2" /> Markdown
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

async function addLabelWatermark(dataUrl: string, label: string): Promise<string> {
  if (!label) return dataUrl
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
  const text = `第 ${label} 题`
  ctx.font = "bold 24px sans-serif"
  const tw = ctx.measureText(text).width
  ctx.fillStyle = "rgba(225, 29, 72, 0.95)"
  ctx.fillRect(8, 8, tw + 20, 32)
  ctx.fillStyle = "white"
  ctx.textBaseline = "middle"
  ctx.fillText(text, 18, 24)
  return canvas.toDataURL("image/png")
}
