"use client"

import { useState, useEffect } from "react"
import { KeyRound, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "sonner"

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

/** 修改密码对话框：需输入当前密码 + 新密码两次，改完自动重签 cookie 保持登录 */
export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setShowPwd(false)
    }
  }, [open])

  const onSubmit = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("请填写完整")
      return
    }
    if (newPassword.length < 4) {
      toast.error("新密码至少 4 位")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致")
      return
    }
    if (newPassword === currentPassword) {
      toast.error("新密码不能与当前密码相同")
      return
    }
    setLoading(true)
    try {
      const resp = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.ok) {
        toast.error(data?.error || `修改失败：HTTP ${resp.status}`)
        return
      }
      toast.success("密码修改成功，其他设备已自动退出")
      onOpenChange(false)
    } catch (e) {
      toast.error(`修改失败：${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5" /> 修改密码
          </DialogTitle>
          <DialogDescription>
            修改后本设备保持登录，其他设备需要用新密码重新登录。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="cur-pwd" className="text-xs">当前密码</Label>
            <Input
              id="cur-pwd"
              type={showPwd ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="默认密码 123456"
              className="h-10"
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-pwd" className="text-xs">新密码</Label>
            <div className="relative">
              <Input
                id="new-pwd"
                type={showPwd ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="至少 4 位"
                className="h-10 pr-9"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-pwd" className="text-xs">确认新密码</Label>
            <Input
              id="confirm-pwd"
              type={showPwd ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再输入一次新密码"
              className="h-10"
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void onSubmit()
                }
              }}
            />
          </div>

          <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-muted/60 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0 mt-0.5" />
            <span>密码以 SHA-256 哈希存储在服务端数据库，修改后立即生效。</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            取消
          </Button>
          <Button
            onClick={onSubmit}
            disabled={loading || !currentPassword || !newPassword || !confirmPassword}
            className="bg-rose-500 hover:bg-rose-600"
          >
            {loading && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            {loading ? "修改中…" : "确认修改"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
