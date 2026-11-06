"use client"

import { useRef, useState, useCallback } from "react"
import { Upload, FileImage, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useDetectorStore } from "@/lib/store"

interface UploadAreaProps {
  /** 是否紧凑显示（用作按钮而不是大块拖放区） */
  compact?: boolean
}

export function UploadArea({ compact }: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const addImage = useDetectorStore((s) => s.addImage)

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length) return
      setBusy(true)
      let ok = 0
      let fail = 0
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          fail += 1
          continue
        }
        try {
          const dataUrl = await readAsDataURL(file)
          const dim = await getImageSize(dataUrl)
          // 限制最大边 1600，过大的话压缩
          const { dataUrl: finalDataUrl, width, height } = await maybeCompress(dataUrl, dim.width, dim.height)
          addImage({
            name: file.name,
            dataUrl: finalDataUrl,
            width,
            height,
            source: "upload",
          })
          ok += 1
        } catch {
          fail += 1
        }
      }
      if (ok > 0) toast.success(`已上传 ${ok} 张图片${fail > 0 ? `，${fail} 张失败` : ""}`)
      else if (fail > 0) toast.error(`${fail} 张图片加载失败`)
      setBusy(false)
    },
    [addImage]
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm hover:bg-accent transition-colors"
          disabled={busy}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          上传图片
        </button>
      </>
    )
  }

  return (
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

function getImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error("图片解码失败"))
    img.src = dataUrl
  })
}

async function maybeCompress(
  dataUrl: string,
  w: number,
  h: number
): Promise<{ dataUrl: string; width: number; height: number }> {
  const maxSide = 1600
  if (Math.max(w, h) <= maxSide) return { dataUrl, width: w, height: h }
  const ratio = w / h
  let nw = w
  let nh = h
  if (w >= h) {
    nw = maxSide
    nh = Math.round(maxSide / ratio)
  } else {
    nh = maxSide
    nw = Math.round(maxSide * ratio)
  }
  const canvas = document.createElement("canvas")
  canvas.width = nw
  canvas.height = nh
  const ctx = canvas.getContext("2d")
  if (!ctx) return { dataUrl, width: w, height: h }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = dataUrl
  })
  ctx.drawImage(img, 0, 0, nw, nh)
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), width: nw, height: nh }
}
