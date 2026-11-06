"use client"

import { useState, useEffect } from "react"
import {
  ScanText,
  Camera,
  Upload,
  Info,
  Sun,
  Moon,
  Zap,
  ZapOff,
  Keyboard,
  Trash2,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { CameraCapture } from "@/components/question-detector/CameraCapture"
import { UploadArea } from "@/components/question-detector/UploadArea"
import { ImageGallery } from "@/components/question-detector/ImageGallery"
import { QuestionCanvas } from "@/components/question-detector/QuestionCanvas"
import { QuestionList } from "@/components/question-detector/QuestionList"
import { ExportMenu } from "@/components/question-detector/ExportMenu"
import { BatchDetect } from "@/components/question-detector/BatchDetect"
import { useDetectorStore } from "@/lib/store"

export default function Home() {
  const [cameraOpen, setCameraOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const imagesCount = useDetectorStore((s) => s.images.length)
  const autoDetect = useDetectorStore((s) => s.autoDetect)
  const setAutoDetect = useDetectorStore((s) => s.setAutoDetect)
  const clearAll = useDetectorStore((s) => s.clearAll)

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // 在 effect 内调用 setMounted 是为了 SSR 水合后获取真实主题
    // 这是 next-themes 推荐用法，避免水合不一致
    setMounted(true)
  }, [])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* 顶部 Header */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b bg-background z-10 gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0">
            <ScanText className="size-5" />
          </div>
          <div className="leading-tight min-w-0">
            <h1 className="text-base font-semibold truncate">题目智能框选</h1>
            <p className="text-[11px] text-muted-foreground hidden sm:block truncate">
              拍照/上传图片 · AI 或算法自动识别 · 手动框选编辑 · 多种格式导出
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* 自动识别开关 */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs">
            {autoDetect ? (
              <Zap className="size-3.5 text-amber-500" />
            ) : (
              <ZapOff className="size-3.5 text-muted-foreground" />
            )}
            <span className="hidden sm:inline">自动识别</span>
            <Switch checked={autoDetect} onCheckedChange={setAutoDetect} className="scale-75" />
          </div>

          {mounted && (
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="切换主题"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          )}

          <Button variant="ghost" size="sm" className="h-8" onClick={() => setShortcutsOpen(true)} title="键盘快捷键">
            <Keyboard className="size-4" />
          </Button>

          <Button variant="ghost" size="sm" className="h-8" onClick={() => setHelpOpen(true)} title="使用说明">
            <Info className="size-4" />
          </Button>

          {imagesCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (confirm("确定要清空所有图片和题目吗？此操作不可恢复（但可以撤销）。")) clearAll()
              }}
              title="清空所有"
            >
              <Trash2 className="size-4" />
            </Button>
          )}

          <BatchDetect />
          <ExportMenu />

          <Button variant="outline" size="sm" className="h-8" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4 mr-1" /> 上传
          </Button>
          <Button size="sm" className="h-8 bg-rose-500 hover:bg-rose-600" onClick={() => setCameraOpen(true)}>
            <Camera className="size-4 mr-1" /> 拍照
          </Button>
        </div>
      </header>

      {/* 主内容：左画廊 + 中画布 + 右题目列表 */}
      <main className="flex-1 flex min-h-0">
        {/* 左侧：画廊 */}
        <aside className="w-[200px] shrink-0 border-r flex flex-col">
          <div className="p-2 space-y-2 border-b">
            <Button
              variant="default"
              size="sm"
              className="w-full bg-rose-500 hover:bg-rose-600"
              onClick={() => setCameraOpen(true)}
            >
              <Camera className="size-4 mr-1.5" /> 浏览器拍照
            </Button>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setUploadOpen(true)}>
              <Upload className="size-4 mr-1.5" /> 上传图片
            </Button>
          </div>
          <ImageGallery />
          {imagesCount > 0 && (
            <div className="text-[10px] text-muted-foreground text-center py-1 border-t">
              共 {imagesCount} 张图片
            </div>
          )}
        </aside>

        {/* 中间：画布 */}
        <section className="flex-1 min-w-0 flex flex-col bg-muted/30">
          <QuestionCanvas />
        </section>

        {/* 右侧：题目列表 */}
        <aside className="w-[340px] shrink-0 border-l flex flex-col">
          <QuestionList />
        </aside>
      </main>

      {/* 拍照全屏 */}
      {cameraOpen && <CameraCapture open={cameraOpen} onClose={() => setCameraOpen(false)} />}

      {/* 上传弹窗 */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="size-5" /> 上传图片
            </DialogTitle>
            <DialogDescription>可一次选择多张图片，支持 JPG / PNG / WebP。{autoDetect && "上传后自动识别。"}</DialogDescription>
          </DialogHeader>
          <UploadArea />
        </DialogContent>
      </Dialog>

      {/* 帮助弹窗 */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="size-5" /> 使用说明
            </DialogTitle>
            <DialogDescription>三步完成题目框选与编辑</DialogDescription>
          </DialogHeader>
          <div className="text-sm space-y-3 leading-relaxed">
            <p>
              <span className="font-semibold text-rose-600">1. 获取图片</span>
              ：点击「拍照」直接调用浏览器相机（不经过系统文件选择器），可连续拍多张；
              或「上传」一次选择多张本地图片。开启「自动识别」开关后，新图片会自动识别。
            </p>
            <p>
              <span className="font-semibold text-rose-600">2. 自动识别</span>
              ：选中一张图片后，点击「AI 识别」让视觉大模型定位题目位置、题号、题文和题目内嵌的配图；
              或点击「离线识别」用纯 JS 算法（水平投影分割）切分题目，不调用 AI。
            </p>
            <p>
              <span className="font-semibold text-rose-600">3. 手动编辑</span>
              ：在画布上拖动框体可移动，拖动 8 个角点可缩放，双击空白处可新建框；
              右侧题目列表可编辑题号与题文；点击「添加框」可新建，按 Delete 可删除当前选中。
            </p>
            <p>
              <span className="font-semibold text-rose-600">4. 图像调整</span>
              ：画布工具栏可缩放图片、旋转 90°、调整亮度/对比度/饱和度。
            </p>
            <p>
              <span className="font-semibold text-rose-600">5. 批量与导出</span>
              ：「批量识别」可一次识别所有图片；「导出」支持 PNG 题目截图、Word、PDF、Excel、Markdown、JSON 和打印。
            </p>
            <p className="text-xs text-muted-foreground pt-2 border-t">
              提示：图片与识别结果均保存在浏览器内存中，调用 AI 识别时图片会发送到后端 API。
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* 快捷键弹窗 */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="size-5" /> 键盘快捷键
            </DialogTitle>
            <DialogDescription>仅在画布区域有效（输入框聚焦时无效）</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {[
              ["Ctrl/Cmd + Z", "撤销"],
              ["Ctrl/Cmd + Y 或 Shift+Z", "重做"],
              ["Delete / Backspace", "删除选中题目框"],
              ["+ / =", "放大画布"],
              ["-", "缩小画布"],
              ["0", "重置缩放"],
              ["双击空白处", "在该位置新建框"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-1 border-b last:border-0">
                <span className="text-muted-foreground">{v}</span>
                <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{k}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <SonnerToaster richColors position="top-center" />
    </div>
  )
}
