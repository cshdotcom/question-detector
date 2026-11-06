"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, CameraOff, RefreshCw, X, SwitchCamera, CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useDetectorStore } from "@/lib/store"
import { detectQuestions } from "@/lib/detect-service"

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
  const [autoDetectPending, setAutoDetectPending] = useState<string | null>(null)

  const addImage = useDetectorStore((s) => s.addImage)
  const setCurrentImage = useDetectorStore((s) => s.setCurrentImage)
  const setDetecting = useDetectorStore((s) => s.setDetecting)
  const setQuestions = useDetectorStore((s) => s.setQuestions)
  const autoDetect = useDetectorStore((s) => s.autoDetect)

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
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
        msg = "当前摄像头不满足请求的分辨率，可尝试切换摄像头。"
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
    setTimeout(() => startStream(), 50)
  }, [facingMode, startStream, stopStream])

  const capture = useCallback(async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) {
      toast.error("视频流尚未就绪，请稍候再试")
      return
    }
    const canvas = document.createElement("canvas")
    const maxSide = 2000
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
    if (facingMode === "user") {
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, w, h)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92)
    const newId = addImage({
      name: `拍照 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      dataUrl,
      width: w,
      height: h,
      source: "camera",
    })
    setCurrentImage(newId)
    const c = shotCount + 1
    setShotCount(c)
    toast.success(`已拍第 ${c} 张` + (autoDetect ? "，正在自动识别…" : ""))

    // 自动识别
    if (autoDetect) {
      setAutoDetectPending(newId)
    }
  }, [addImage, facingMode, shotCount, autoDetect, setCurrentImage])

  // 拍照后异步自动识别
  useEffect(() => {
    if (!autoDetectPending) return
    const imgId = autoDetectPending
    const img = useDetectorStore.getState().images.find((x) => x.id === imgId)
    if (!img) {
      setAutoDetectPending(null)
      return
    }
    let cancelled = false
    ;(async () => {
      setDetecting(imgId, true)
      try {
        const qs = await detectQuestions(img, "ai")
        if (cancelled) return
        setQuestions(imgId, qs, "ai")
        toast.success(`已识别 ${qs.length} 道题目`)
      } catch (e) {
        if (cancelled) return
        const err = e as Error
        toast.error(`自动识别失败：${err.message}`)
        setDetecting(imgId, false)
      } finally {
        if (!cancelled) setAutoDetectPending(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [autoDetectPending, setDetecting, setQuestions])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <Camera className="size-5" />
          <span className="font-medium">浏览器相机拍照</span>
          {streaming && (
            <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle2 className="size-3 text-emerald-400" />
              已拍 {shotCount} 张
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-full"
          aria-label="关闭"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* 视频区 */}
      <div className="flex-1 relative flex items-center justify-center">
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
            <button
              className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/20 text-sm flex items-center gap-1"
              onClick={startStream}
              disabled={busy}
            >
              <RefreshCw className="size-4" /> 重试
            </button>
          </div>
        )}
      </div>

      {/* 底部控制 */}
      <div className="flex items-center justify-between px-6 py-4 text-white">
        <button
          onClick={switchCamera}
          disabled={!streaming || busy}
          className="flex flex-col items-center gap-1 disabled:opacity-40"
        >
          <div className="size-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
            <SwitchCamera className="size-5" />
          </div>
          <span className="text-xs">切换</span>
        </button>

        <button
          onClick={capture}
          disabled={!streaming || busy}
          className="size-20 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-40"
          aria-label="拍照"
        >
          <div className="size-14 rounded-full bg-white" />
        </button>

        <button
          onClick={onClose}
          className="flex flex-col items-center gap-1"
        >
          <div className="size-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
            <CheckCircle2 className="size-5" />
          </div>
          <span className="text-xs">完成</span>
        </button>
      </div>
    </div>
  )
}
