"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { Upload, FileImage, Loader2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { useDetectorStore } from "@/lib/store"
import { detectQuestions } from "@/lib/detect-service"
import type { ImageItem } from "@/lib/types"

interface UploadAreaProps {
  compact?: boolean
  /** 是否在导入后自动识别 */
  autoDetectOnLoad?: boolean
}

interface QueueItem {
  id: string
  img: ImageItem
  status: "pending" | "detecting" | "done" | "error"
}

export function UploadArea({ compact, autoDetectOnLoad }: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const addImage = useDetectorStore((s) => s.addImage)
  const setCurrentImage = useDetectorStore((s) => s.setCurrentImage)
  const setDetecting = useDetectorStore((s) => s.setDetecting)
  const setQuestions = useDetectorStore((s) => s.setQuestions)
  const autoDetect = useDetectorStore((s) => s.autoDetect)

  const doAutoDetect = autoDetectOnLoad ?? autoDetect

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length) return
      setBusy(true)
      let ok = 0
      let fail = 0
      const items: QueueItem[] = []
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          fail += 1
          continue
        }
        try {
          const dataUrl = await readAsDataURL(file)
          const dim = await getImageSize(dataUrl)
          const { dataUrl: finalDataUrl, width, height } = await maybeCompress(dataUrl, dim.width, dim.height)
          const id = addImage({
            name: file.name,
            dataUrl: finalDataUrl,
            width,
            height,
            source: "upload",
          })
          const img = useDetectorStore.getState().images.find((x) => x.id === id)!
          items.push({ id, img, status: "pending" })
          ok += 1
        } catch {
          fail += 1
        }
      }
      if (ok > 0) {
        toast.success(`已上传 ${ok} 张图片${fail > 0 ? `，${fail} 张失败` : ""}`)
        if (items[0]) setCurrentImage(items[0].id)
      } else if (fail > 0) {
        toast.error(`${fail} 张图片加载失败`)
      }
      setBusy(false)

      // 自动识别队列
      if (doAutoDetect) {
        for (const item of items) {
          setQueue((q) => [...q, item])
        }
      }
    },
    [addImage, setCurrentImage, doAutoDetect]
  )

  // 处理识别队列：用 ref 避免重入
  const processingRef = useRef<string | null>(null)
  useEffect(() => {
    const next = queue.find((q) => q.status === "pending")
    if (!next || processingRef.current) return
    processingRef.current = next.id
    ;(async () => {
      // 标记为 detecting
      setQueue((q) => q.map((it) => (it.id === next.id ? { ...it, status: "detecting" } : it)))
      setDetecting(next.id, true)
      try {
        const freshImg = useDetectorStore.getState().images.find((x) => x.id === next.id) ?? next.img
        const qs = await detectQuestions(freshImg, "ai")
        setQuestions(next.id, qs, "ai")
        setQueue((q) => q.map((it) => (it.id === next.id ? { ...it, status: "done" } : it)))
      } catch (e) {
        const err = e as Error
        toast.error(`「${next.img.name}」识别失败：${err.message}`)
        setDetecting(next.id, false)
        setQueue((q) => q.map((it) => (it.id === next.id ? { ...it, status: "error" } : it)))
      } finally {
        processingRef.current = null
      }
    })()
  }, [queue, setDetecting, setQuestions])

  const hasActiveQueue = queue.some((q) => q.status === "pending" || q.status === "detecting")
  const doneCount = queue.filter((q) => q.status === "done").length
  const totalCount = queue.length

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
          {doAutoDetect && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1 pt-1">
              <CheckCircle2 className="size-3" /> 上传后自动识别
            </p>
          )}
        </div>
      </div>

      {hasActiveQueue && (
        <div className="text-xs text-muted-foreground flex items-center gap-2 px-1">
          <Loader2 className="size-3.5 animate-spin" />
          正在自动识别：{doneCount} / {totalCount}
        </div>
      )}
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
  const maxSide = 2000
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
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), width: nw, height: nh }
}
