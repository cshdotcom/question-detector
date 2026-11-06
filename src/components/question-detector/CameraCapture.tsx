"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, CameraOff, RefreshCw, X, SwitchCamera, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { useDetectorStore } from "@/lib/store"
import { uid } from "@/lib/utils"

interface CameraCaptureProps {
  open: boolean
  onClose: () => void
}

export function CameraCapture({ open, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")
  const [shotCount, setShotCount] = useState(0)
  const [busy, setBusy] = useState(false)

  const addImage = useDetectorStore((s) => s.addImage)

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setStreaming(false)
  }, [])

  const startStream = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      // 先尝试请求权限，浏览器会直接弹出权限请求，不经过系统文件选择
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      // 保存以便停止
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setStreaming(true)
    } catch (e) {
      const err = e as Error & { name?: string }
      let msg = err.message || "无法启动相机"
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        msg = "相机权限被拒绝，请在浏览器地址栏的权限设置中允许相机访问后重试。"
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        msg = "未检测到可用的摄像头设备。"
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        msg = "摄像头被其他程序占用，请关闭后重试。"
      } else if (err.name === "OverconstrainedError") {
        msg = "当前摄像头不满足请求的分辨率，请切换摄像头或降低分辨率。"
      }
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }, [facingMode])

  useEffect(() => {
    if (open) {
      setShotCount(0)
      startStream()
    } else {
      stopStream()
    }
    return () => stopStream()
  }, [open, startStream, stopStream])

  const switchCamera = useCallback(async () => {
    stopStream()
    const next = facingMode === "environment" ? "user" : "environment"
    setFacingMode(next)
    // 等一帧再启动
    setTimeout(() => startStream(), 50)
  }, [facingMode, startStream, stopStream])

  const capture = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.videoWidth) {
      toast.error("视频流尚未就绪，请稍候再试")
      return
    }
    const canvas = document.createElement("canvas")
    // 限制最大边到 1600，避免 base64 过大
    const maxSide = 1600
    const ratio = video.videoWidth / video.videoHeight
    let w = video.videoWidth
    let h = video.videoHeight
    if (Math.max(w, h) > maxSide) {
      if (w >= h) {
        w = maxSide
        h = Math.round(maxSide / ratio)
      } else {
        h = maxSide
        w = Math.round(maxSide * ratio)
      }
    }
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      toast.error("无法创建画布上下文")
      return
    }
    // 如果是前置摄像头，水平镜像
    if (facingMode === "user") {
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, w, h)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85)
    addImage({
      name: `拍照 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      dataUrl,
      width: w,
      height: h,
      source: "camera",
    })
    setShotCount((c) => c + 1)
    toast.success(`已拍第 ${shotCount + 1} 张`)
  }, [addImage, facingMode, shotCount])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden gap-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-5" />
            浏览器相机拍照
          </DialogTitle>
        </DialogHeader>

        <div className="relative bg-black aspect-[4/3] flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-contain"
            style={{ transform: facingMode === "user" ? "scaleX(-1)" : undefined }}
          />
          {!streaming && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80">
              <Loader2 className="size-8 animate-spin" />
              <span className="ml-3">正在启动相机…</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90 p-6 text-center gap-3">
              <CameraOff className="size-10" />
              <p className="text-sm leading-relaxed">{error}</p>
              <Button variant="secondary" size="sm" onClick={startStream} disabled={busy}>
                <RefreshCw className="size-4 mr-1" /> 重试
              </Button>
            </div>
          )}
          {streaming && (
            <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1">
              <CheckCircle2 className="size-3.5 text-emerald-400" />
              已拍 {shotCount} 张
            </div>
          )}
        </div>

        <DialogFooter className="p-3 border-t flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={switchCamera}
              disabled={!streaming || busy}
              title="切换摄像头"
            >
              <SwitchCamera className="size-4 mr-1" /> 切换
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="size-4 mr-1" /> 关闭
            </Button>
            <Button size="sm" onClick={capture} disabled={!streaming || busy}>
              <Camera className="size-4 mr-1" /> 拍照
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
