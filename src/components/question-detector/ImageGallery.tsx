"use client"

import { Trash2, ImageIcon, Camera, Upload, Check, X } from "lucide-react"
import { useDetectorStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export function ImageGallery() {
  const images = useDetectorStore((s) => s.images)
  const currentImageId = useDetectorStore((s) => s.currentImageId)
  const setCurrentImage = useDetectorStore((s) => s.setCurrentImage)
  const removeImage = useDetectorStore((s) => s.removeImage)
  const clearAll = useDetectorStore((s) => s.clearAll)

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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs text-muted-foreground">图片列表（{images.length}）</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>
          <Trash2 className="size-3 mr-1" /> 清空
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 grid grid-cols-2 gap-2">
          {images.map((img, idx) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setCurrentImage(img.id)}
              className={cn(
                "group relative aspect-[4/3] rounded-md overflow-hidden border-2 bg-muted text-left transition-all",
                img.id === currentImageId
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
              <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                {img.source === "camera" ? <Camera className="size-2.5" /> : <Upload className="size-2.5" />}
                #{idx + 1}
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent text-white text-[10px] px-1.5 py-1 truncate">
                {img.questions.length > 0 ? (
                  <span className="flex items-center gap-1">
                    <Check className="size-2.5 text-emerald-400" />
                    {img.questions.length} 题
                  </span>
                ) : img.detecting ? (
                  <span className="text-amber-300">识别中…</span>
                ) : (
                  <span className="opacity-70">未识别</span>
                )}
              </div>
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
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
