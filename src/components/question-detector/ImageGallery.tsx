"use client"

import { Trash2, ImageIcon, Camera, Upload, Check, X, CheckSquare, Square } from "lucide-react"
import { useDetectorStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { toast } from "sonner"

export function ImageGallery() {
  const images = useDetectorStore((s) => s.images)
  const currentImageId = useDetectorStore((s) => s.currentImageId)
  const setCurrentImage = useDetectorStore((s) => s.setCurrentImage)
  const removeImage = useDetectorStore((s) => s.removeImage)
  const removeImages = useDetectorStore((s) => s.removeImages)
  const clearAll = useDetectorStore((s) => s.clearAll)
  const gallerySelectMode = useDetectorStore((s) => s.gallerySelectMode)
  const setGallerySelectMode = useDetectorStore((s) => s.setGallerySelectMode)
  const selectedImageIds = useDetectorStore((s) => s.selectedImageIds)
  const toggleSelectImage = useDetectorStore((s) => s.toggleSelectImage)
  const clearSelection = useDetectorStore((s) => s.clearSelection)
  const hydrated = useDetectorStore((s) => s.hydrated)

  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (!hydrated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted-foreground gap-2">
        <ImageIcon className="size-8 opacity-30 animate-pulse" />
        <p className="text-xs">加载已保存图片中…</p>
      </div>
    )
  }

  if (images.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted-foreground gap-2">
        <ImageIcon className="size-8 opacity-50" />
        <p className="text-xs leading-relaxed">
          还没有图片。
          <br />
          点击上方「拍照」或「上传图片」开始。
        </p>
      </div>
    )
  }

  const handleBulkDelete = () => {
    if (selectedImageIds.length === 0) return
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      setTimeout(() => setConfirmingDelete(false), 3000)
      return
    }
    const count = selectedImageIds.length
    removeImages([...selectedImageIds])
    setConfirmingDelete(false)
    setGallerySelectMode(false)
    toast.success(`已删除 ${count} 张图片`)
  }

  const isItemSelected = (id: string) => selectedImageIds.includes(id)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b gap-1">
        <span className="text-xs text-muted-foreground shrink-0">
          图片列表（{images.length}）
          {hydrated && <span className="ml-1 opacity-60">·已保存</span>}
        </span>
        <div className="flex items-center gap-1">
          {gallerySelectMode ? (
            <>
              <span className="text-xs text-rose-500 mr-1">
                已选 {selectedImageIds.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => {
                  if (images.length > 0 && selectedImageIds.length === images.length) {
                    clearSelection()
                  } else {
                    images.forEach((im) => {
                      if (!selectedImageIds.includes(im.id)) toggleSelectImage(im.id)
                    })
                  }
                }}
                title="全选 / 取消全选"
              >
                {images.length > 0 && selectedImageIds.length === images.length ? (
                  <>
                    <Square className="size-3 mr-1" /> 取消全选
                  </>
                ) : (
                  <>
                    <CheckSquare className="size-3 mr-1" /> 全选
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setGallerySelectMode(false)}
              >
                取消
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-7 text-xs",
                  selectedImageIds.length > 0
                    ? confirmingDelete
                      ? "bg-red-500 text-white hover:bg-red-600"
                      : "text-destructive hover:bg-red-500/10"
                    : "text-muted-foreground opacity-50"
                )}
                disabled={selectedImageIds.length === 0}
                onClick={handleBulkDelete}
                title={confirmingDelete ? "再次点击确认删除" : "删除选中"}
              >
                <Trash2 className="size-3 mr-1" />
                {confirmingDelete ? `确认删除 ${selectedImageIds.length} 张` : "批量删除"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setGallerySelectMode(true)}
                title="进入多选模式"
              >
                <CheckSquare className="size-3 mr-1" /> 多选
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  if (confirm("确定要清空所有图片吗？此操作不可撤销。")) {
                    clearAll()
                    toast.success("已清空所有图片")
                  }
                }}
              >
                <Trash2 className="size-3" /> 清空
              </Button>
            </>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 grid grid-cols-2 gap-2">
          {images.map((img, idx) => {
            const selected = isItemSelected(img.id)
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => {
                  if (gallerySelectMode) {
                    toggleSelectImage(img.id)
                  } else {
                    setCurrentImage(img.id)
                  }
                }}
                className={cn(
                  "group relative aspect-[4/3] rounded-md overflow-hidden border-2 bg-muted text-left transition-all",
                  gallerySelectMode && selected
                    ? "border-rose-500 ring-2 ring-rose-500/30"
                    : img.id === currentImageId && !gallerySelectMode
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-transparent hover:border-border"
                )}
              >
                {/* 图片缩略图 */}
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
                {/* 多选模式下显示勾选标记 */}
                {gallerySelectMode && (
                  <div
                    className={cn(
                      "absolute top-1 right-1 size-5 rounded-full flex items-center justify-center border-2 transition-colors",
                      selected
                        ? "bg-rose-500 border-rose-500 text-white"
                        : "bg-black/30 border-white/70 text-transparent"
                    )}
                  >
                    {selected && <Check className="size-3" />}
                  </div>
                )}
                <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                  {img.source === "camera" ? <Camera className="size-2.5" /> : <Upload className="size-2.5" />}
                  #{idx + 1}
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-[10px] px-1.5 py-1 truncate">
                  {img.questions.length > 0 ? (
                    <span className="flex items-center gap-1">
                      <Check className="size-2.5 text-emerald-400" />
                      {img.questions.length} 题
                      {img.detectMethod && (
                        <span className="opacity-70">
                          · {img.detectMethod === "ai" ? "AI" : "算法"}
                        </span>
                      )}
                    </span>
                  ) : img.detecting ? (
                    <span className="text-amber-300">
                      {img.detectMethod === "offline" ? "算法识别中…" : "识别中…"}
                    </span>
                  ) : (
                    <span className="opacity-70">未识别</span>
                  )}
                </div>
                {!gallerySelectMode && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeImage(img.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        e.stopPropagation()
                        removeImage(img.id)
                      }
                    }}
                    className="absolute top-1 right-1 bg-black/60 hover:bg-red-500/80 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <X className="size-3" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
