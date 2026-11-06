"use client"

import { useState } from "react"
import { ScanText, Camera, Upload, Github, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { useDetectorStore } from "@/lib/store"

export default function Home() {
  const [cameraOpen, setCameraOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const imagesCount = useDetectorStore((s) => s.images.length)

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      {/* 顶部 Header */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b bg-background z-10">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-rose-500 text-white flex items-center justify-center">
            <ScanText className="size-5" />
          </div>
          <div className="leading-tight">
            <h1 className="text-base font-semibold">题目智能框选</h1>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              拍照 / 上传图片 · AI 自动识别题目 · 手动框选编辑
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)}>
            <Info className="size-4 mr-1" /> 帮助
          </Button>
          <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4 mr-1" /> 上传图片
          </Button>
          <Button size="sm" onClick={() => setCameraOpen(true)}>
            <Camera className="size-4 mr-1" /> 拍照
          </Button>
          <ExportMenu />
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
        <aside className="w-[320px] shrink-0 border-l flex flex-col">
          <QuestionList />
        </aside>
      </main>

      {/* 拍照弹窗 */}
      <CameraCapture open={cameraOpen} onClose={() => setCameraOpen(false)} />

      {/* 上传弹窗 */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="size-5" /> 上传图片
            </DialogTitle>
            <DialogDescription>可一次选择多张图片，支持 JPG / PNG / WebP。</DialogDescription>
          </DialogHeader>
          <UploadArea />
        </DialogContent>
      </Dialog>

      {/* 帮助弹窗 */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="size-5" /> 使用说明
            </DialogTitle>
            <DialogDescription>三步完成题目框选与编辑</DialogDescription>
          </DialogHeader>
          <div className="text-sm space-y-3 leading-relaxed">
            <p>
              <span className="font-semibold text-rose-600">1. 获取图片</span>
              ：点击「拍照」直接调用浏览器相机（需要授权摄像头权限，不会调用系统文件选择器），可连续拍多张；
              或「上传图片」一次选择多张本地图片。
            </p>
            <p>
              <span className="font-semibold text-rose-600">2. 自动识别</span>
              ：选中一张图片后，点击画布上方「自动识别」按钮，AI 会自动定位题目位置、识别题号并提取题文，
              识别结果以彩色框叠加在图上。
            </p>
            <p>
              <span className="font-semibold text-rose-600">3. 手动编辑</span>
              ：在画布上拖动框体可移动，拖动八个角点可缩放；点击「添加框」可新建一个框；
              右侧题目列表中可编辑题号与题文。完成后点击「导出」可保存为截图、JSON 或 Markdown。
            </p>
            <p className="text-xs text-muted-foreground pt-2 border-t">
              提示：所有图片与识别结果均保存在浏览器内存中，不会上传到服务器（除了调用 AI 识别时）。
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <SonnerToaster richColors position="top-center" />

      <footer className="hidden">
        <Github />
      </footer>
    </div>
  )
}
