"use client"

import { useRef, useState, useCallback } from "react"
import { Upload, FileImage, Loader2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { useDetectorStore } from "@/lib/store"
import { normalizeUploadImage } from "@/lib/image-utils"

interface UploadAreaProps {
  compact?: boolean
}

export function UploadArea({ compact }: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const addImage = useDetectorStore((s) => s.addImage)
  const setCurrentImage = useDetectorStore((s) => s.setCurrentImage)

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length) return
      setBusy(true)
      let ok = 0
      let fail = 0
      let firstId: string | null = null
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          fail += 1
          continue
        }
        try {
          const dataUrl = await readAsDataURL(file)
          // 归一化：剥离 EXIF 方向（避免显示与 AI 识别方向不一致导致框错位），限制最大边 2000
          const { dataUrl: finalDataUrl, width, height } = await normalizeUploadImage(dataUrl)
          const id = addImage({
            name: file.name,
            dataUrl: finalDataUrl,
            width,
            height,
            source: "upload",
          })
          if (!firstId) firstId = id
          ok += 1
        } catch {
          fail += 1
        }
      }
      if (ok > 0) {
        toast.success(`已上传 ${ok} 张图片${fail > 0 ? `，${fail} 张失败` : ""}`)
        if (firstId) setCurrentImage(firstId)
      } else if (fail > 0) {
        toast.error(`${fail} 张图片加载失败`)
      }
      setBusy(false)
    },
    [addImage, setCurrentImage]
  )

  if (compact) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ""
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm hover:bg-accent transition-colors disabled:opacity-50"
          disabled={busy}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          上传图片
        </button>
      </>
    )
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-accent/50 transition-colors flex flex-col items-center gap-3"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ""
          }}
        />
        {busy ? (
          <Loader2 className="size-10 animate-spin text-muted-foreground" />
        ) : (
          <FileImage className="size-10 text-muted-foreground" />
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium">点击选择或拖入图片</p>
          <p className="text-xs text-muted-foreground">支持 JPG / PNG / WebP，可一次选择多张</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1 pt-1">
            <CheckCircle2 className="size-3" /> 上传后自动识别
          </p>
        </div>
      </div>
    </div>
  )
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("读取文件失败"))
    reader.readAsDataURL(file)
  })
}
