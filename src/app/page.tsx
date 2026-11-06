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

export default function Home() {
  useAutoDetect()
  const [cameraOpen, setCameraOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false)

  const imagesCount = useDetectorStore((s) => s.images.length)
  const autoDetect = useDetectorStore((s) => s.autoDetect)
  const setAutoDetect = useDetectorStore((s) => s.setAutoDetect)
  const clearAll = useDetectorStore((s) => s.clearAll)
  const sidebarOpen = useDetectorStore((s) => s.sidebarOpen)
  const rightPanelOpen = useDetectorStore((s) => s.rightPanelOpen)
  const toggleSidebar = useDetectorStore((s) => s.toggleSidebar)
  const toggleRightPanel = useDetectorStore((s) => s.toggleRightPanel)

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="flex flex-col h-[100dvh] w-screen overflow-hidden bg-background text-foreground">
      {/* 顶部 Header - 可换行 + 可滚动 */}
      <header className="flex items-center gap-2 px-3 py-2 border-b bg-background z-10 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <div className="size-8 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0">
            <ScanText className="size-5" />
          </div>
          <div className="leading-tight min-w-0 hidden sm:block">
            <h1 className="text-sm font-semibold truncate">题目智能框选</h1>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-auto">
          {/* 自动识别开关 */}
          <div className="flex items-center gap-1 px-1.5 py-1 rounded-md border text-xs">
            {autoDetect ? (
              <Zap className="size-3.5 text-amber-500" />
            ) : (
              <ZapOff className="size-3.5 text-muted-foreground" />
            )}
            <span className="hidden md:inline">自动识别</span>
            <Switch checked={autoDetect} onCheckedChange={setAutoDetect} className="scale-75" />
          </div>

          {/* 侧边栏切换 */}
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

          <Button variant="ghost" size="sm" className="size-8 p-0 shrink-0" onClick={() => setHelpOpen(true)} title="使用说明">
            <Info className="size-4" />
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

          <BatchDetect />
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

      {/* 主内容：左画廊 + 中画布 + 右题目列表 */}
      <main className="flex-1 flex min-h-0">
        {/* 左侧：画廊 */}
        {sidebarOpen && (
          <aside className="w-[180px] sm:w-[200px] shrink-0 border-r flex flex-col">
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

        {/* 中间：画布 */}
        <section className="flex-1 min-w-0 flex flex-col bg-muted/30">
          <QuestionCanvas />
        </section>

        {/* 右侧：题目列表 */}
        {rightPanelOpen && (
          <aside className="w-[300px] sm:w-[340px] shrink-0 border-l flex flex-col">
            <QuestionList />
          </aside>
        )}
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
            <DialogDescription>
              可一次选择多张图片，支持 JPG / PNG / WebP。{autoDetect && "上传后自动识别。"}
            </DialogDescription>
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
            <DialogDescription>完整功能介绍</DialogDescription>
          </DialogHeader>
          <div className="text-sm space-y-3 leading-relaxed">
            <p>
              <span className="font-semibold text-rose-600">1. 获取图片</span>
              ：点「拍照」直接调用浏览器相机（不经过系统选择器），有「单题/多题」和「跨页题」两种模式；
              或「上传」一次选多张图。开启「自动识别」开关后，新图自动识别。
            </p>
            <p>
              <span className="font-semibold text-rose-600">2. 跨页题</span>
              ：选「跨页题」模式后连续拍多页，点完成按钮会自动合并为一张长图后识别。
              也可以在画廊中勾选多张图，点「合并选中」进行合并。
            </p>
            <p>
              <span className="font-semibold text-rose-600">3. AI 识别</span>
              ：点「AI 识别」让视觉大模型定位题目、识别题号、题文和题目内嵌的配图；
              阅读理解会被拆分为「文章」和「题目」并自动关联。
            </p>
            <p>
              <span className="font-semibold text-rose-600">4. 离线识别</span>
              ：用纯 JS 水平投影分割算法，不调用 API，适合快速分割简单题目。
            </p>
            <p>
              <span className="font-semibold text-rose-600">5. 手动框 + AI 识别</span>
              ：点「添加框」画一个框，选中后点「AI 识别该框」让 AI 仅识别该框内的题目文字。
            </p>
            <p>
              <span className="font-semibold text-rose-600">6. 批改 + 解析</span>
              ：在题目列表点「批改」按钮，AI 给出对错、得分、正确答案和详细解析（支持 LaTeX 公式）。
            </p>
            <p>
              <span className="font-semibold text-rose-600">7. 导出</span>
              ：支持 Word / PDF / Excel / PNG / Markdown / JSON，可选择性导出题目或整张带框图。
            </p>
            <p className="text-xs text-muted-foreground pt-2 border-t">
              提示：点右上「齿轮」可配置第三方 OpenAI 兼容 API（如 DeepSeek、智谱、月之暗面等）。
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

      {/* AI 设置 */}
      <AISettingsDialog open={aiSettingsOpen} onOpenChange={setAiSettingsOpen} />

      <SonnerToaster richColors position="top-center" />
    </div>
  )
}
