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
  Trash2,
  ChevronUp,
  ChevronDown,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Maximize,
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
  // 跨页模式：用 ref 存图片 ID，state 触发重渲染
  const crossPageIdsRef = useRef<string[]>([])
  const [crossPageIds, setCrossPageIds] = useState<string[]>([])
  const [showCrossPagePanel, setShowCrossPagePanel] = useState(true)
  // 数码变焦（zoom）：1.0~5.0，用 CSS transform 实现，不改变视频流
  const [zoom, setZoom] = useState(1.0)
  // pinch zoom 手势
  const pinchStartRef = useRef<{ dist: number; zoom: number } | null>(null)

  const addImage = useDetectorStore((s) => s.addImage)
  const setCurrentImage = useDetectorStore((s) => s.setCurrentImage)
  const images = useDetectorStore((s) => s.images)

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
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
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
      crossPageIdsRef.current = []
      setCrossPageIds([])
      startStream()
    } else {
      stopStream()
    }
    return () => stopStream()
  }, [open, startStream, stopStream])

  // 切换摄像头
  const switchCamera = useCallback(async () => {
    const next = facingRef.current === "environment" ? "user" : "environment"
    facingRef.current = next
    setFacingDisplay(next)
    stopStream()
    setStreaming(false)
    await new Promise((r) => setTimeout(r, 200))
    await startStream()
  }, [startStream, stopStream])

  // 抓取当前帧为 dataUrl（应用当前 zoom：从中心裁剪 zoom 倍区域）
  const grabFrame = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.videoWidth) {
      toast.error("视频流尚未就绪，请稍候再试")
      return null
    }
    const vw = video.videoWidth
    const vh = video.videoHeight
    // zoom > 1 时：从中心裁剪 1/zoom 区域，再放大到原尺寸
    const cropW = Math.round(vw / zoom)
    const cropH = Math.round(vh / zoom)
    const sx = Math.round((vw - cropW) / 2)
    const sy = Math.round((vh - cropH) / 2)

    const canvas = document.createElement("canvas")
    const maxSide = 2000
    const outW = Math.min(cropW, maxSide)
    const outH = Math.round(outW * (cropH / cropW))
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext("2d")
    if (!ctx) {
      toast.error("无法创建画布上下文")
      return null
    }
    const fm = facingRef.current
    if (fm === "user") {
      ctx.translate(outW, 0)
      ctx.scale(-1, 1)
    }
    // 从视频中心裁剪 zoom 倍区域，绘制到 canvas
    ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, outW, outH)
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.92), width: outW, height: outH }
  }, [zoom])

  // 拍照
  const capture = useCallback(async () => {
    const frame = grabFrame()
    if (!frame) return
    const { dataUrl, width, height } = frame

    if (mode === "crosspage") {
      // 跨页模式：累积图片，标记为 detected 避免被 useAutoDetect 处理
      const newId = addImage({
        name: `[待合并] 跨页第 ${crossPageIdsRef.current.length + 1} 页`,
        dataUrl,
        width,
        height,
        source: "camera",
      })
      const setDetected = useDetectorStore.getState().setDetected
      setDetected(newId, true)
      crossPageIdsRef.current = [...crossPageIdsRef.current, newId]
      setCrossPageIds(crossPageIdsRef.current)
      toast.success(`已拍第 ${crossPageIdsRef.current.length} 页`)
      // 不要切换模式，让用户继续拍下一页
      return
    }

    const newId = addImage({
      name: `拍照 ${new Date().toLocaleString("zh-CN", { hour12: false })}`,
      dataUrl,
      width,
      height,
      source: "camera",
    })
    setCurrentImage(newId)
    const c = shotCount + 1
    setShotCount(c)
    toast.success(`已拍第 ${c} 张`)
  }, [grabFrame, addImage, mode, setCurrentImage, shotCount])

  // 跨页模式：替换某页
  const replaceCrossPage = useCallback(
    async (index: number) => {
      const frame = grabFrame()
      if (!frame) return
      const { dataUrl, width, height } = frame
      const newId = addImage({
        name: `[待合并] 跨页第 ${index + 1} 页（替换）`,
        dataUrl,
        width,
        height,
        source: "camera",
      })
      const setDetected = useDetectorStore.getState().setDetected
      setDetected(newId, true)
      // 删除被替换的旧图
      const oldId = crossPageIdsRef.current[index]
      if (oldId) {
        const removeImage = useDetectorStore.getState().removeImage
        removeImage(oldId)
      }
      crossPageIdsRef.current = crossPageIdsRef.current.map((id, i) => (i === index ? newId : id))
      setCrossPageIds([...crossPageIdsRef.current])
      toast.success(`已替换第 ${index + 1} 页`)
    },
    [grabFrame, addImage]
  )

  // 跨页模式：删除某页
  const deleteCrossPage = useCallback((index: number) => {
    const oldId = crossPageIdsRef.current[index]
    if (oldId) {
      const removeImage = useDetectorStore.getState().removeImage
      removeImage(oldId)
    }
    crossPageIdsRef.current = crossPageIdsRef.current.filter((_, i) => i !== index)
    setCrossPageIds([...crossPageIdsRef.current])
    toast.success(`已删除第 ${index + 1} 页`)
  }, [])

  // 跨页模式：调整顺序（上移/下移）
  const moveCrossPage = useCallback((index: number, direction: "up" | "down") => {
    const arr = crossPageIdsRef.current
    const target = direction === "up" ? index - 1 : index + 1
    if (target < 0 || target >= arr.length) return
    ;[arr[index], arr[target]] = [arr[target], arr[index]]
    crossPageIdsRef.current = [...arr]
    setCrossPageIds([...arr])
  }, [])

  // 完成跨页拍摄，合并图片并触发识别
  const finishCrossPage = useCallback(async () => {
    const ids = crossPageIdsRef.current
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
        crossPageIdsRef.current = []
        setCrossPageIds([])
        return
      }
      // 单页直接重置
      if (imgs.length === 1) {
        const id = imgs[0].id
        const setDetected = useDetectorStore.getState().setDetected
        setDetected(id, false)
        // 重命名
        const updateImg = useDetectorStore.getState().updateQuestion
        void updateImg
        crossPageIdsRef.current = []
        setCrossPageIds([])
        setCurrentImage(id)
        toast.success("单页已保留")
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
      crossPageIdsRef.current = []
      setCrossPageIds([])
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

  // 切换模式时不要自动删除已拍内容，让用户主动决定
  const switchMode = useCallback(
    (nextMode: ShootMode) => {
      if (nextMode === mode) return
      // 跨页模式有未合并的图：让用户确认
      if (mode === "crosspage" && crossPageIdsRef.current.length > 0) {
        const ok = confirm(`跨页模式下已有 ${crossPageIdsRef.current.length} 页未合并，切换到单题模式会丢弃这些图。是否继续？`)
        if (!ok) return
        const removeImage = useDetectorStore.getState().removeImage
        crossPageIdsRef.current.forEach((id) => removeImage(id))
        crossPageIdsRef.current = []
        setCrossPageIds([])
      }
      setMode(nextMode)
    },
    [mode]
  )

  // 取跨页图当前信息
  const crossPageImages = crossPageIds
    .map((id) => images.find((im) => im.id === id))
    .filter(Boolean) as typeof images

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-3 text-white safe-top shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Camera className="size-5 shrink-0" />
          <span className="font-medium truncate">浏览器相机</span>
          {streaming && mode === "single" && (
            <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
              <CheckCircle2 className="size-3 text-emerald-400" />
              已拍 {shotCount}
            </span>
          )}
          {streaming && mode === "crosspage" && (
            <span className="text-xs bg-amber-500/30 text-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
              <Layers className="size-3" />
              跨页 {crossPageIds.length} 页
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
      <div className="flex items-center justify-center gap-2 px-4 pb-2 shrink-0">
        {([
          { key: "single" as const, label: "单题/多题", icon: Square },
          { key: "crosspage" as const, label: "跨页题", icon: Layers },
        ]).map((m) => {
          const Icon = m.icon
          return (
            <button
              key={m.key}
              onClick={() => switchMode(m.key)}
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
      <div
        className="flex-1 relative flex items-center justify-center min-h-0 overflow-hidden touch-none"
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX
            const dy = e.touches[0].clientY - e.touches[1].clientY
            pinchStartRef.current = { dist: Math.hypot(dx, dy), zoom }
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinchStartRef.current) {
            e.preventDefault()
            const dx = e.touches[0].clientX - e.touches[1].clientX
            const dy = e.touches[0].clientY - e.touches[1].clientY
            const dist = Math.hypot(dx, dy)
            const ratio = dist / pinchStartRef.current.dist
            const newZoom = Math.max(1.0, Math.min(5.0, pinchStartRef.current.zoom * ratio))
            setZoom(newZoom)
          }
        }}
        onTouchEnd={() => { pinchStartRef.current = null }}
        onWheel={(e) => {
          // 鼠标滚轮缩放（桌面端）
          if (!streaming) return
          const delta = e.deltaY > 0 ? -0.2 : 0.2
          setZoom((z) => Math.max(1.0, Math.min(5.0, z + delta)))
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover"
          style={{
            transform: `${facingDisplay === "user" ? "scaleX(-1) " : ""}scale(${zoom})`,
            transformOrigin: "center center",
            transition: "transform 0.15s ease-out",
          }}
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
        {/* 缩放控制条（右上角） */}
        {streaming && (
          <div className="absolute top-3 right-3 flex flex-col gap-1 bg-black/40 backdrop-blur rounded-lg p-1.5">
            <button
              onClick={() => setZoom((z) => Math.min(5.0, z + 0.5))}
              disabled={zoom >= 5.0}
              className="size-9 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center text-white disabled:opacity-30"
              title="放大"
            >
              <ZoomIn className="size-4" />
            </button>
            <div className="text-center text-[10px] text-white/90 tabular-nums">{zoom.toFixed(1)}x</div>
            <button
              onClick={() => setZoom((z) => Math.max(1.0, z - 0.5))}
              disabled={zoom <= 1.0}
              className="size-9 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center text-white disabled:opacity-30"
              title="缩小"
            >
              <ZoomOut className="size-4" />
            </button>
            <button
              onClick={() => setZoom(1.0)}
              disabled={zoom === 1.0}
              className="size-9 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center text-white disabled:opacity-30"
              title="重置缩放"
            >
              <Maximize className="size-4" />
            </button>
          </div>
        )}
      </div>

      {/* 跨页模式：已拍页面列表 */}
      {mode === "crosspage" && crossPageImages.length > 0 && (
        <div className="bg-black/80 backdrop-blur text-white shrink-0 border-t border-white/10">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-xs flex items-center gap-1">
              <ImageIcon className="size-3" />
              已拍 {crossPageImages.length} 页
            </span>
            <button
              onClick={() => setShowCrossPagePanel((v) => !v)}
              className="text-xs text-white/70 hover:text-white"
            >
              {showCrossPagePanel ? "收起" : "展开"}
            </button>
          </div>
          {showCrossPagePanel && (
            <div className="px-3 pb-3 overflow-x-auto">
              <div className="flex gap-2">
                {crossPageImages.map((im, idx) => (
                  <div
                    key={im.id}
                    className="relative shrink-0 w-20 rounded-md overflow-hidden border border-white/20 group"
                  >
                    <img
                      src={im.dataUrl}
                      alt={`第 ${idx + 1} 页`}
                      className="w-full h-24 object-cover"
                      draggable={false}
                    />
                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent text-[10px] px-1 py-0.5 flex items-center justify-between">
                      <span>P{idx + 1}</span>
                    </div>
                    {/* 操作按钮 */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60">
                      <button
                        onClick={() => replaceCrossPage(idx)}
                        className="text-[10px] px-1.5 py-0.5 bg-white/20 rounded hover:bg-white/30"
                        title="重新拍摄替换此页"
                      >
                        <RefreshCw className="size-3" />
                      </button>
                      <div className="flex gap-0.5">
                        <button
                          onClick={() => moveCrossPage(idx, "up")}
                          disabled={idx === 0}
                          className="text-[10px] px-1 py-0.5 bg-white/20 rounded hover:bg-white/30 disabled:opacity-30"
                          title="上移"
                        >
                          <ChevronUp className="size-3" />
                        </button>
                        <button
                          onClick={() => moveCrossPage(idx, "down")}
                          disabled={idx === crossPageImages.length - 1}
                          className="text-[10px] px-1 py-0.5 bg-white/20 rounded hover:bg-white/30 disabled:opacity-30"
                          title="下移"
                        >
                          <ChevronDown className="size-3" />
                        </button>
                      </div>
                      <button
                        onClick={() => deleteCrossPage(idx)}
                        className="text-[10px] px-1.5 py-0.5 bg-red-500/80 rounded hover:bg-red-500"
                        title="删除此页"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 底部控制 */}
      <div className="flex items-center justify-between px-6 py-4 text-white safe-bottom shrink-0">
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

        {/* 拍照按钮：跨页模式下也始终显示，让用户继续拍下一页 */}
        <button
          onClick={capture}
          disabled={!streaming || busy}
          className="size-20 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-40"
          aria-label="拍照"
        >
          <div className="size-14 rounded-full bg-white" />
        </button>

        {/* 右侧按钮：跨页模式下显示"完成合并"，否则显示"完成" */}
        {mode === "crosspage" && crossPageIds.length > 0 ? (
          <button
            onClick={finishCrossPage}
            disabled={busy}
            className="flex flex-col items-center gap-1 disabled:opacity-40 shrink-0"
            title="合并并识别"
          >
            <div className="size-12 rounded-full bg-amber-400 hover:bg-amber-300 flex items-center justify-center">
              <CheckCircle2 className="size-5 text-white" />
            </div>
            <span className="text-xs">合并</span>
          </button>
        ) : (
          <button
            onClick={onClose}
            className="flex flex-col items-center gap-1 shrink-0"
          >
            <div className="size-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
              <CheckCircle2 className="size-5" />
            </div>
            <span className="text-xs">完成</span>
          </button>
        )}
      </div>
    </div>
  )
}
