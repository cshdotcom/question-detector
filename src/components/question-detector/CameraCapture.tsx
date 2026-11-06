"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Camera,
  CameraOff,
  RefreshCw,
  X,
  SwitchCamera,
  CheckCircle2,
  Loader2,
  Layers,
  Square,
} from "lucide-react"
import { toast } from "sonner"
import { useDetectorStore } from "@/lib/store"
import { mergeImagesVertically } from "@/lib/merge-images"
import { cn } from "@/lib/utils"

interface CameraCaptureProps {
  open: boolean
  onClose: () => void
}

type ShootMode = "single" | "crosspage"

export function CameraCapture({ open, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const facingRef = useRef<"environment" | "user">("environment")
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [facingDisplay, setFacingDisplay] = useState<"environment" | "user">("environment")
  const [shotCount, setShotCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<ShootMode>("single")
  const crossPagePendingRef = useRef<string[]>([])
  const [crossPageCount, setCrossPageCount] = useState(0)

  const addImage = useDetectorStore((s) => s.addImage)
  const setCurrentImage = useDetectorStore((s) => s.setCurrentImage)

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
      const fm = facingRef.current
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: fm },
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
        // 切换失败时回退到不指定 facingMode
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          })
          streamRef.current = fallbackStream
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream
            await videoRef.current.play().catch(() => {})
          }
          setStreaming(true)
          setBusy(false)
          return
        } catch {
          // 用原错误信息
        }
        msg = "当前摄像头不满足请求的分辨率，可尝试切换摄像头。"
      }
      setError(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setShotCount(0)
      crossPagePendingRef.current = []
      setCrossPageCount(0)
      startStream()
    } else {
      stopStream()
    }
    return () => stopStream()
  }, [open, startStream, stopStream])

  // 关键修复：切换摄像头时先更新 ref，再停止旧流并重新启动
  const switchCamera = useCallback(async () => {
    const next = facingRef.current === "environment" ? "user" : "environment"
    facingRef.current = next
    setFacingDisplay(next)
    stopStream()
    setStreaming(false)
    // 等待流停止
    await new Promise((r) => setTimeout(r, 200))
    await startStream()
  }, [startStream, stopStream])

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
    const fm = facingRef.current
    if (fm === "user") {
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, w, h)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92)

    if (mode === "crosspage") {
      // 跨页模式：累积图片，但用一个特殊标记让 useAutoDetect 跳过
      const newId = addImage({
        name: `[待合并] 跨页第 ${crossPageCount + 1} 页`,
        dataUrl,
        width: w,
        height: h,
        source: "camera",
      })
      // 立即标记为 detected，避免被 useAutoDetect 处理
      const setDetected = useDetectorStore.getState().setDetected
      setDetected(newId, true)
      crossPagePendingRef.current.push(newId)
      setCrossPageCount(crossPagePendingRef.current.length)
      toast.success(`已拍第 ${crossPageCount + 1} 页，可继续拍下一页`)
      return
    }

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
    toast.success(`已拍第 ${c} 张`)
  }, [addImage, shotCount, mode, setCurrentImage, crossPageCount])

  // 跨页模式：完成拍摄，合并图片并触发识别
  const finishCrossPage = useCallback(async () => {
    const ids = crossPagePendingRef.current
    if (ids.length === 0) {
      toast.error("还没有拍摄任何页面")
      return
    }
    setBusy(true)
    try {
      const imgs = useDetectorStore
        .getState()
        .images.filter((im) => ids.includes(im.id))
      if (imgs.length === 0) {
        crossPagePendingRef.current = []
        setCrossPageCount(0)
        setMode("single")
        return
      }
      // 单页直接重置
      if (imgs.length === 1) {
        const id = imgs[0].id
        const setDetected = useDetectorStore.getState().setDetected
        setDetected(id, false)
        crossPagePendingRef.current = []
        setCrossPageCount(0)
        setMode("single")
        setCurrentImage(id)
        return
      }
      const { dataUrl, width, height } = await mergeImagesVertically(imgs)
      const mergedId = addImage({
        name: `跨页合并 ${imgs.length} 页`,
        dataUrl,
        width,
        height,
        source: "merged",
      })
      // 删除原始单页
      const removeImage = useDetectorStore.getState().removeImage
      ids.forEach((id) => removeImage(id))
      crossPagePendingRef.current = []
      setCrossPageCount(0)
      setMode("single")
      setCurrentImage(mergedId)
      toast.success(`已合并 ${imgs.length} 页为一张图，正在识别…`)
      // 主动触发识别（合并图不会被 useAutoDetect 自动处理，因为 knownIdsRef 已经包含它）
      const setDetecting = useDetectorStore.getState().setDetecting
      const setQuestions = useDetectorStore.getState().setQuestions
      const autoDetectOn = useDetectorStore.getState().autoDetect
      const cfg = useDetectorStore.getState().aiConfig
      if (autoDetectOn) {
        setDetecting(mergedId, true)
        try {
          // 异步加载
          const { detectQuestions } = await import("@/lib/detect-service")
          const fresh = useDetectorStore.getState().images.find((x) => x.id === mergedId)
          if (fresh) {
            const qs = await detectQuestions(fresh, "ai", cfg)
            setQuestions(mergedId, qs, "ai")
            toast.success(`已识别 ${qs.length} 道题目`)
          }
        } catch (e) {
          toast.error(`识别失败：${(e as Error).message}`)
          setDetecting(mergedId, false)
        }
      }
    } catch (e) {
      toast.error(`合并失败：${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }, [addImage, setCurrentImage])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 text-white safe-top">
        <div className="flex items-center gap-2 min-w-0">
          <Camera className="size-5 shrink-0" />
          <span className="font-medium truncate">浏览器相机</span>
          {streaming && mode !== "crosspage" && (
            <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
              <CheckCircle2 className="size-3 text-emerald-400" />
              已拍 {shotCount}
            </span>
          )}
          {streaming && mode === "crosspage" && (
            <span className="text-xs bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
              <Layers className="size-3" />
              跨页 {crossPageCount} 页
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-full shrink-0"
          aria-label="关闭"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* 模式选择 */}
      <div className="flex items-center justify-center gap-2 px-4 pb-2">
        {([
          { key: "single", label: "单题/多题", icon: Square },
          { key: "crosspage", label: "跨页题", icon: Layers },
        ] as const).map((m) => {
          const Icon = m.icon
          return (
            <button
              key={m.key}
              onClick={() => {
                if (mode === "crosspage" && m.key !== "crosspage" && crossPagePendingRef.current.length > 0) {
                  if (!confirm("跨页模式下已拍内容会被丢弃，确认切换吗？")) return
                  const removeImage = useDetectorStore.getState().removeImage
                  crossPagePendingRef.current.forEach((id) => removeImage(id))
                  crossPagePendingRef.current = []
                  setCrossPageCount(0)
                }
                setMode(m.key)
              }}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 transition-colors",
                mode === m.key
                  ? "bg-rose-500 text-white"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              )}
            >
              <Icon className="size-3.5" />
              {m.label}
            </button>
          )
        })}
      </div>

      {/* 视频区 */}
      <div className="flex-1 relative flex items-center justify-center min-h-0">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-contain"
          style={{ transform: facingDisplay === "user" ? "scaleX(-1)" : undefined }}
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
      <div className="flex items-center justify-between px-6 py-4 text-white safe-bottom">
        <button
          onClick={switchCamera}
          disabled={!streaming || busy}
          className="flex flex-col items-center gap-1 disabled:opacity-40 shrink-0"
        >
          <div className="size-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
            <SwitchCamera className="size-5" />
          </div>
          <span className="text-xs">切换</span>
        </button>

        {mode === "crosspage" && crossPageCount > 0 ? (
          <button
            onClick={finishCrossPage}
            disabled={busy}
            className="size-20 rounded-full border-4 border-amber-400 flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50"
            aria-label="完成跨页拍摄"
          >
            <div className="size-14 rounded-full bg-amber-400 flex items-center justify-center">
              <CheckCircle2 className="size-7 text-white" />
            </div>
          </button>
        ) : (
          <button
            onClick={capture}
            disabled={!streaming || busy}
            className="size-20 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-40"
            aria-label="拍照"
          >
            <div className="size-14 rounded-full bg-white" />
          </button>
        )}

        <button
          onClick={onClose}
          className="flex flex-col items-center gap-1 shrink-0"
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
