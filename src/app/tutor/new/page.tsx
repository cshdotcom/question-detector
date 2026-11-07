"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { toast } from "sonner"
import type { Question } from "@/lib/types"

function NewSessionInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const type = searchParams.get("type") === "lecture" ? "lecture" : "solve"
  const imageId = searchParams.get("imageId") || ""
  const questionIdx = parseInt(searchParams.get("questionIdx") || "0", 10) || 0

  const [error, setError] = useState<string>("")

  useEffect(() => {
    (async () => {
      // 必须有 imageId 才能创建会话；没有则跳到主页让用户先选图
      if (!imageId) {
        toast.info("请先到主页选一道题，再用「解题」或「讲题」按钮进入")
        router.replace("/")
        return
      }
      try {
        // 1. 取图片的题目快照 + cropped image
        const imgResp = await authFetch(`/api/images/${imageId}`, { cache: "no-store" })
        const imgData = await imgResp.json().catch(() => ({}))
        if (!imgResp.ok || !imgData.ok) {
          throw new Error(imgData?.error || "图片加载失败")
        }
        const img = imgData.image
        const questions: Question[] = Array.isArray(img.questions) ? img.questions : []
        const question = questions[questionIdx]
        if (!question) {
          throw new Error(`未找到第 ${questionIdx + 1} 道题`)
        }
        // 2. 裁剪题目图（用前端 canvas 裁剪后传到后端）
        let imageCrop = ""
        try {
          imageCrop = await cropQuestion(img.dataUrl, question.bbox)
        } catch (e) {
          console.warn("[tutor:new] crop failed:", e)
        }
        // 3. 创建 session
        const resp = await authFetch("/api/tutor/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            imageId,
            questionIdx,
            questionSnapshot: question,
            imageCrop,
            title: question.content?.slice(0, 40) || `第 ${questionIdx + 1} 题`,
          }),
        })
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok || !data.ok) {
          throw new Error(data?.error || `HTTP ${resp.status}`)
        }
        // 4. 跳到对应模式页
        router.replace(`/tutor/${type}/${data.id}`)
      } catch (e) {
        setError((e as Error).message)
        toast.error(`创建会话失败：${(e as Error).message}`)
        setTimeout(() => router.replace("/tutor"), 2000)
      }
    })()
  }, [imageId, questionIdx, type, router])

  if (error) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center text-muted-foreground">
        <p className="text-sm mb-2">{error}</p>
        <p className="text-xs">2 秒后返回…</p>
      </div>
    )
  }
  return (
    <div className="min-h-[100dvh] flex items-center justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin mr-2" />
      <span className="text-sm">正在创建{type === "solve" ? "解题" : "讲题"}会话…</span>
    </div>
  )
}

/** 用前端 canvas 裁剪出题目的子图（带 padding） */
async function cropQuestion(imageDataUrl: string, bbox: { x: number; y: number; width: number; height: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight
      const px = Math.max(20, Math.floor(bbox.x * W) - 30)
      const py = Math.max(20, Math.floor(bbox.y * H) - 30)
      const pw = Math.min(W - px, Math.floor(bbox.width * W) + 60)
      const ph = Math.min(H - py, Math.floor(bbox.height * H) + 60)
      const canvas = document.createElement("canvas")
      canvas.width = pw
      canvas.height = ph
      const ctx = canvas.getContext("2d")
      if (!ctx) return reject(new Error("画布初始化失败"))
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, pw, ph)
      ctx.drawImage(img, px, py, pw, ph, 0, 0, pw, ph)
      // 缩到 ≤800 长边，降低传输/AI 处理负担
      const MAX = 800
      const scale = Math.max(pw, ph) > MAX ? MAX / Math.max(pw, ph) : 1
      if (scale < 1) {
        const sw = Math.round(pw * scale), sh = Math.round(ph * scale)
        const sc = document.createElement("canvas")
        sc.width = sw; sc.height = sh
        const sctx = sc.getContext("2d")
        if (!sctx) return reject(new Error("画布初始化失败"))
        sctx.drawImage(canvas, 0, 0, sw, sh)
        resolve(sc.toDataURL("image/jpeg", 0.9))
      } else {
        resolve(canvas.toDataURL("image/jpeg", 0.9))
      }
    }
    img.onerror = () => reject(new Error("图片加载失败"))
    img.src = imageDataUrl
  })
}

export default function NewSessionPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] flex items-center justify-center"><Loader2 className="size-5 animate-spin" /></div>}>
      <NewSessionInner />
    </Suspense>
  )
}
