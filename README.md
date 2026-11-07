# 题目智能框选系统

> 浏览器直接调用相机拍照 / 上传图片，AI 自动识别题目、题号、题文和题目内嵌配图，支持手动框选编辑、跨页合并、AI 批改解析、多种格式导出。

## 主要功能

### 📷 拍照 & 上传
- **浏览器原生相机**：直接通过 `getUserMedia` 调用相机，不经过系统文件选择器
- **跨页题模式**：连续拍多页，自动垂直拼接为一张长图后统一识别
- **多图上传**：一次选择多张本地图片，拖拽也支持
- **自动识别**：开启开关后，拍照/上传后自动调用 AI 识别

### 🤖 AI 识别
- **题目位置 + 题号 + 题文**：视觉模型定位每个题目框，识别题号和完整文字
- **题目内嵌配图**：几何图、函数图、表格、电路图等自动裁剪并显示
- **阅读理解**：自动区分「阅读材料」和「阅读理解题」并关联
- **跨页题**：标记跨页延续的题目
- **OpenAI 兼容 API**：可接入第三方（OpenAI、DeepSeek、智谱 GLM、Kimi、通义千问等）

### 🧮 离线识别
- 纯 JS 实现的**水平投影分割算法**
- 不调用任何 API，浏览器本地运行
- 适合快速分割文字密度均匀的试卷

### ✏️ 手动编辑
- **拖拽空白处自由画框**：在画布空白区域按住拖动，任意大小框选新题目
- 拖动框体移动（流畅无卡顿，手势级撤销）
- 8 角点缩放（光标自动切换）
- 双击空白处快速新建默认框
- Delete 键删除选中框
- 题号、题文可手动编辑
- **手动框 + AI 识别**：手动画框后，点「AI 识别」让 AI 仅识别该框内文字
- **点已批改的框**：直接弹出批改结果与详细解析

### 🧹 去除手写（新）
- **快速去彩色笔迹**：本地颜色分割 + 扩散修补，秒级去除红/蓝笔批改、勾叉、圈画、手写答案，绝不损伤印刷内容
- **AI 深度去手写**：图像编辑模型整页重绘，可去除铅笔/黑色手写，适合复杂卷面
- 题目框位置不受影响，可撤销

### 🎨 图像调整
- 缩放（100%~400%）
- 旋转 90°（直接写入图片，识别/裁剪方向一致）
- 亮度 / 对比度 / 饱和度调整
- 上传自动归一化：剥离 EXIF 方向、限制最大边 2000，保证框与题目对齐

### 📝 批改 + 解析
- AI 给出对错（正确 / 部分正确 / 错误）
- 给出得分（0~100）
- 提供正确答案
- 详细解析（支持 LaTeX 公式：`$x^2$`、`$$\int x dx$$`）
- 涉及知识点列表
- 阅读理解题目自动关联文章内容批改

### 📤 导出
- **PNG 题目截图**：每道题裁剪为单独 PNG，加题号水印
- **整张带框图**：原图叠加所有题目框，单文件导出
- **Word 文档**（.docx）：含题目内容、截图、批改结果
- **PDF 文档**：含题目内容、截图
- **Excel 表格**（.xlsx）：含题号、类型、内容、配图数、批改结果、解析
- **Markdown**（含 KaTeX 公式）
- **JSON 数据**：完整结构化数据
- **复制全部题文**到剪贴板
- **打印**
- **选择性下载**：勾选特定题目批量下载

### 🎛️ 其他
- 撤销/重做（Ctrl+Z / Ctrl+Y，30 步历史）
- 批量识别（一键识别所有图片）
- 暗黑模式
- 侧边栏可隐藏（适合移动端）
- 完整响应式设计（手机 / 平板 / 桌面）

## 技术栈

- **框架**：Next.js 16 (App Router) + TypeScript 5
- **样式**：Tailwind CSS 4 + shadcn/ui
- **状态管理**：Zustand
- **AI 调用**：z-ai-web-dev-sdk + OpenAI 兼容 API
- **Markdown**：react-markdown + remark-math + rehype-katex
- **导出**：docx (Word)、jspdf (PDF)、xlsx (Excel)
- **图标**：lucide-react

## 本地运行

```bash
bun install
bun run dev
# 访问 http://localhost:3000
```

## 配置第三方 AI

1. 点击右上角「齿轮」按钮
2. 开启「启用第三方 API」
3. 选择预设服务（OpenAI / DeepSeek / 智谱 / Kimi / 通义）或自定义
4. 填入 API Key 和模型名称
5. 保存

配置仅保存在浏览器 localStorage，不会上传到服务器。

## 项目结构

```
src/
├── app/
│   ├── page.tsx                          # 主页面
│   ├── layout.tsx                        # 含 ThemeProvider
│   └── api/
│       ├── detect/route.ts               # AI 识别 API
│       ├── grade/route.ts                # 批改 API
│       └── ocr-question/route.ts         # 单框 OCR API
├── components/
│   ├── markdown/Markdown.tsx             # KaTeX 渲染
│   └── question-detector/
│       ├── CameraCapture.tsx             # 拍照（含跨页模式）
│       ├── UploadArea.tsx                # 上传
│       ├── ImageGallery.tsx              # 左侧画廊
│       ├── QuestionCanvas.tsx            # 主画布
│       ├── QuestionList.tsx              # 右侧题目列表 + 批改
│       ├── ExportMenu.tsx                # 导出菜单
│       ├── BatchDetect.tsx               # 批量识别
│       ├── MergeImages.tsx               # 跨页合并 UI
│       └── AISettingsDialog.tsx         # AI 配置弹窗
└── lib/
    ├── types.ts                          # 共享类型
    ├── store.ts                          # Zustand 全局状态
    ├── ai-service.ts                     # 统一 AI 调用入口
    ├── ai-config.ts                      # AI 配置本地存储
    ├── detect-service.ts                 # 识别 + 批改前端服务
    ├── offline-detect.ts                 # 离线算法
    ├── image-utils.ts                    # 图像工具
    ├── merge-images.ts                   # 多图合并
    └── use-auto-detect.ts                # 自动识别 Hook
```

## License

MIT
