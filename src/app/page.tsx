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
  PanelLeft,
  PanelRight,
  Settings2,
  Images,
  Frame,
  ListChecks,
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
import { MergeImages } from "@/components/question-detector/MergeImages"
import { AISettingsDialog } from "@/components/question-detector/AISettingsDialog"
import { useDetectorStore } from "@/lib/store"
import { useAutoDetect } from "@/lib/use-auto-detect"
import { loadAIConfig } from "@/lib/ai-config"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

type MobileTab = "gallery" | "canvas" | "questions"

export default function Home() {
  useAutoDetect()
  const isMobile = useIsMobile()
  const setAIConfig = useDetectorStore((s) => s.setAIConfig)
  useEffect(() => {
    setAIConfig(loadAIConfig())
  }, [setAIConfig])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>("canvas")

  const imagesCount = useDetectorStore((s) => s.images.length)
  const questionsCount = useDetectorStore(
    (s) => s.images.find((x) => x.id === s.currentImageId)?.questions.length ?? 0
  )
  const autoDetect = useDetectorStore((s) => s.autoDetect)
  const setAutoDetect = useDetectorStore((s) => s.setAutoDetect)
  const clearAll = useDetectorStore((s) => s.clearAll)
  const sidebarOpen = useDetectorStore((s) => s.sidebarOpen)
  const rightPanelOpen = useDetectorStore((s) => s.rightPanelOpen)
  const toggleSidebar = useDetectorStore((s) => s.toggleSidebar)
  const toggleRightPanel = useDetectorStore((s) => s.toggleRightPanel)
  const currentImageId = useDetectorStore((s) => s.currentImageId)

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  // 移动端：新增图片时自动切到画布标签
  useEffect(() => {
    if (isMobile && currentImageId && imagesCount > 0) {
      setMobileTab((t) => (t === "gallery" ? "canvas" : t))
    }
  }, [currentImageId, imagesCount, isMobile])

  return (
    <div className="flex flex-col h-[100dvh] w-screen overflow-hidden bg-background text-foreground">
      {/* 顶部 Header */}
      <header className="flex items-center gap-2 px-3 py-2 border-b bg-background z-20 overflow-x-auto shrink-0">
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <div className="size-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0">
            <ScanText className="size-5" />
          </div>
          <div className="leading-tight min-w-0 hidden sm:block">
            <h1 className="text-sm font-semibold truncate">题目智能框选</h1>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <div className="flex items-center gap-1 px-1.5 py-1 rounded-md border text-xs">
            {autoDetect ? (
              <Zap className="size-3.5 text-amber-500" />
            ) : (
              <ZapOff className="size-3.5 text-muted-foreground" />
            )}
            <span className="hidden md:inline">自动识别</span>
            <Switch checked={autoDetect} onCheckedChange={setAutoDetect} className="scale-75" />
          </div>

          {!isMobile && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="size-8 p-0 shrink-0"
                onClick={toggleSidebar}
                title="切换左侧画廊"
              >
                <PanelLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="size-8 p-0 shrink-0"
                onClick={toggleRightPanel}
                title="切换右侧题目列表"
              >
                <PanelRight className="size-4" />
              </Button>
            </>
          )}

          {mounted && (
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0 shrink-0"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="切换主题"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          )}

          <Button variant="ghost" size="sm" className="size-8 p-0 shrink-0" onClick={() => setShortcutsOpen(true)} title="键盘快捷键">
            <Keyboard className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" className="size-8 p-0 shrink-0" onClick={() => setAiSettingsOpen(true)} title="AI 设置">
            <Settings2 className="size-4" />
          </Button>

          {imagesCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (confirm("确定要清空所有图片和题目吗？")) clearAll()
              }}
              title="清空所有"
            >
              <Trash2 className="size-4" />
            </Button>
          )}

          {!isMobile && <BatchDetect />}
          <ExportMenu />

          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4" />
            <span className="hidden sm:ml-1 sm:inline">上传</span>
          </Button>
          <Button size="sm" className="h-8 shrink-0 bg-rose-500 hover:bg-rose-600" onClick={() => setCameraOpen(true)}>
            <Camera className="size-4" />
            <span className="hidden sm:ml-1 sm:inline">拍照</span>
          </Button>
        </div>
      </header>

      {isMobile ? (
        <>
          <main className="flex-1 flex min-h-0">
            {/* 画廊标签页 */}
            <div className={cn("flex-1 flex flex-col min-h-0", mobileTab !== "gallery" && "hidden")}>
              <div className="p-2 space-y-2 border-b">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full bg-rose-500 hover:bg-rose-600"
                  onClick={() => setCameraOpen(true)}
                >
                  <Camera className="size-4 mr-1.5" /> 拍照
                </Button>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setUploadOpen(true)}>
                  <Upload className="size-4 mr-1.5" /> 上传图片
                </Button>
                <MergeImages />
              </div>
              <ImageGallery />
              {imagesCount > 0 && (
                <div className="text-[10px] text-muted-foreground text-center py-1 border-t">
                  共 {imagesCount} 张图片 · 点击图片进入画布
                </div>
              )}
            </div>

            {/* 画布标签页 */}
            <div className={cn("flex-1 min-w-0 flex flex-col bg-muted/30", mobileTab !== "canvas" && "hidden")}>
              <QuestionCanvas />
            </div>

            {/* 题目标签页 */}
            <div className={cn("flex-1 flex flex-col min-h-0", mobileTab !== "questions" && "hidden")}>
              <QuestionList />
            </div>
          </main>

          {/* 底部标签栏 */}
          <nav className="flex items-center justify-around border-t bg-background shrink-0 z-20 safe-bottom">
            <button
              onClick={() => setMobileTab("gallery")}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 flex-1 transition-colors",
                mobileTab === "gallery" ? "text-rose-500" : "text-muted-foreground"
              )}
            >
              <Images className="size-5" />
              <span className="text-[10px]">图片{imagesCount > 0 ? ` ${imagesCount}` : ""}</span>
            </button>
            <button
              onClick={() => setMobileTab("canvas")}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 flex-1 transition-colors",
                mobileTab === "canvas" ? "text-rose-500" : "text-muted-foreground"
              )}
            >
              <Frame className="size-5" />
              <span className="text-[10px]">画布</span>
            </button>
            <button
              onClick={() => setMobileTab("questions")}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 flex-1 transition-colors",
                mobileTab === "questions" ? "text-rose-500" : "text-muted-foreground"
              )}
            >
              <ListChecks className="size-5" />
              <span className="text-[10px]">题目{questionsCount > 0 ? ` ${questionsCount}` : ""}</span>
            </button>
          </nav>
        </>
      ) : (
        /* 桌面端：三栏布局 */
        <main className="flex-1 flex min-h-0">
          {sidebarOpen && (
            <aside className="w-[200px] shrink-0 border-r flex flex-col">
              <div className="p-2 space-y-2 border-b">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full bg-rose-500 hover:bg-rose-600"
                  onClick={() => setCameraOpen(true)}
                >
                  <Camera className="size-4 mr-1.5" /> 拍照
                </Button>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setUploadOpen(true)}>
                  <Upload className="size-4 mr-1.5" /> 上传图片
                </Button>
                <MergeImages />
              </div>
              <ImageGallery />
              {imagesCount > 0 && (
                <div className="text-[10px] text-muted-foreground text-center py-1 border-t">
                  共 {imagesCount} 张图片
                </div>
              )}
            </aside>
          )}

          <section className="flex-1 min-w-0 flex flex-col bg-muted/30">
            <QuestionCanvas />
          </section>

          {rightPanelOpen && (
            <aside className="w-[340px] shrink-0 border-l flex flex-col">
              <QuestionList />
            </aside>
          )}
        </main>
      )}

      {/* 拍照全屏 */}
      {cameraOpen && <CameraCapture open={cameraOpen} onClose={() => setCameraOpen(false)} />}

      {/* 上传弹窗 */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="size-5" /> 上传图片
            </DialogTitle>
            <DialogDescription>
              可一次选择多张图片，支持 JPG / PNG / WebP。{autoDetect && "上传后自动识别。"}
            </DialogDescription>
          </DialogHeader>
          <UploadArea />
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

      {/* AI 设置 */}
      <AISettingsDialog open={aiSettingsOpen} onOpenChange={setAiSettingsOpen} />

      <SonnerToaster richColors position="top-center" />
    </div>
  )
}
