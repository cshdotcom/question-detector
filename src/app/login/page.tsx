"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ScanText, Lock, Loader2, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = searchParams.get("from") || "/"
  const reason = searchParams.get("reason")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [requiresPassword, setRequiresPassword] = useState(true)
  const [usingCustomPassword, setUsingCustomPassword] = useState(false)

  useEffect(() => {
    if (reason === "session-expired") {
      toast.error("登录已失效，请重新登录", { id: "session-expired" })
    } else if (reason === "unauthorized") {
      toast.error("请先登录", { id: "unauthorized" })
    }
  }, [reason])

  useEffect(() => {
    // 查询是否需要密码；若不需要直接跳转
    fetch("/api/auth/status", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        setRequiresPassword(!!data.requiresPassword)
        setUsingCustomPassword(!!data.usingCustomPassword)
        if (!data.requiresPassword) {
          router.replace(from)
        } else if (data.loggedIn) {
          router.replace(from)
        }
      })
      .catch(() => setRequiresPassword(true))
  }, [from, router])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.ok) {
        toast.error(data?.error || `登录失败：HTTP ${resp.status}`)
        return
      }
      toast.success("登录成功")
      router.replace(from)
      router.refresh()
    } catch (e) {
      toast.error(`登录失败：${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  if (!requiresPassword) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-rose-50 via-background to-amber-50 dark:from-rose-950/20 dark:via-background dark:to-amber-950/20 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="size-14 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/30">
            <ScanText className="size-8" />
          </div>
          <h1 className="text-2xl font-bold">题目智能框选</h1>
          <p className="text-xs text-muted-foreground text-center">
            需要访问密码
            <br />
            请输入密码继续
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="relative">
            <Lock className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="访问密码"
              className="pl-9 pr-3 h-11"
              disabled={loading}
            />
          </div>
          <Button
            type="submit"
            disabled={loading || !password}
            className="w-full h-11 bg-rose-500 hover:bg-rose-600"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <ArrowRight className="size-4 mr-2" />
            )}
            {loading ? "登录中…" : "进入"}
          </Button>
        </form>

        <p className="text-[10px] text-muted-foreground text-center mt-6">
          {usingCustomPassword
            ? "密码已由管理员修改，请联系管理员"
            : "默认密码 123456（登录后可在「修改密码」中更改）"}
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] flex items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
      <LoginPageInner />
    </Suspense>
  )
}
