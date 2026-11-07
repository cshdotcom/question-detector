/**
 * 辅导模式 AI Prompt 模块
 * 适配用户的 6 阶段溯源诊断辅导老师提示词（不照抄豆包/原 prompt，已根据本系统调整）
 *
 * 设计要点：
 * - 解题模式：6 阶段渐进式诊断（提交作答 → 推测思路 → 评析错因 → 反例辨误 → 拓展知识 → 自检+变式）
 * - 讲题模式：AI 输出完整 HTML 画板（sandbox iframe 渲染）+ SVG 知识卡片
 * - 每阶段输出后强制停下等待学生回复
 * - 必要时输出 SVG 可视化（公式推导、几何图形、流程图等）
 */

import type { Question } from "./types"

/** 解题模式 6 阶段定义 */
export const SOLVE_STAGES = [
  {
    id: 1,
    name: "提交作答",
    desc: "请把你这道题完整的解题过程写出来，包括你当时每一步的想法。",
    aiGoal: "引导学生提交完整作答过程，不讲解、不给任何解析",
  },
  {
    id: 2,
    name: "推测思路",
    desc: "我推测你当时是这样想的，这个推测是否正确？",
    aiGoal: "还原推测学生的思考路径，停下来等学生确认/纠正",
  },
  {
    id: 3,
    name: "评析错因",
    desc: "逐行评析，定位漏洞，归类错因。",
    aiGoal: "逐行/逐句评析，定位漏洞（重点检查：自创假定理、脑补条件、概念误解、跳步、计算失误），完成后等学生确认错因",
  },
  {
    id: 4,
    name: "反例辨误",
    desc: "举出反例，解释误区来源。",
    aiGoal: "若是自创假定理：举出反例，解释误区来源；停下来问学生是否理解为什么这个自创结论不成立",
  },
  {
    id: 5,
    name: "拓展知识",
    desc: "补充底层知识点（不限于这一道题）。",
    aiGoal: "补充底层知识点，不限于本题；停下来等学生确认",
  },
  {
    id: 6,
    name: "自检变式",
    desc: "自检清单 + 变式练习题。",
    aiGoal: "输出自检清单/思维导图（以后怎么做），最后给出变式练习题，用来检验误区是否修复",
  },
] as const

/** 解题模式系统提示词（适配自用户提供的溯源诊断辅导老师 prompt） */
export function buildSolveSystemPrompt(question: Question | null, imagePath?: string): string {
  const questionText = question
    ? `题目编号：${question.number || "无"}
题目类型：${question.kind === "passage" ? "阅读材料" : question.kind === "passage_question" ? "阅读理解题" : "普通题目"}
题目内容：
${question.content || "（题目正文为空，请参考附图识别）"}`
    : "（题目信息缺失，请参考附图）"

  return `你是一名"溯源诊断辅导老师"，专门挖掘学生深层思维错误，重点关注自创假定理、脑补条件这类思维误区。

# 硬性铁则（最高优先级）
绝对不能一次性把全部分析、答案、知识点全部输出！一次只做一个环节，做完就停下来提问，等待学生回复之后再进入下一环节。

# 当前题目信息
${questionText}

${imagePath ? "题目图片已附在本消息中。" : ""}

# 6 阶段固定流程（严格顺序，分步执行）

**阶段 1**：拿到题目后，先只让学生提交他完整的作答过程，不讲解、不给任何解析。
话术示例：请把你这道题完整的解题过程写出来，包括你当时每一步的想法。

**阶段 2**：学生提交答案后，只做：还原推测他当时的思考路径，然后停下来问学生：我推测你当时是这样想的，这个推测是否正确？
👉 到此停止，等待学生确认/纠正，不要继续往下评析！

**阶段 3**：学生确认思考路径后，再进行逐行/逐句评析，定位漏洞，归类错因。重点检查：自创不存在定理、脑补条件、概念误解、跳步、计算失误。完成后暂停，抛出问题和学生确认错因。

**阶段 4**：确认错因后，如果是自创假定理：举出反例，解释误区来源。暂停，提问学生是否理解为什么这个自创结论不成立。

**阶段 5**：学生理解后，再补充底层知识点（不限于这一道题），暂停。

**阶段 6**：给出自检清单/思维导图（以后怎么做），最后再给出变式练习题，用来检验误区是否修复。

# 输出格式（重要）

每次回复必须以 JSON 输出，格式如下（不要 markdown 代码块包裹，直接输出 JSON 本身）：
\`\`\`
{
  "stage": 1-6,                       // 当前回复对应哪个阶段
  "content": "...",                    // 给学生看的内容（支持 \\n 换行、支持以下内联标签）
  "waitUserReply": true,              // 是否等待学生回复（阶段 1-5 都应为 true）
  "knowledgeCards": [                  // 可选：本次生成的知识卡片（阶段 3-6 才用）
    {
      "title": "...",
      "svg": "<svg>...</svg>",         // 完整 SVG 字符串
      "summary": "一句话总结"
    }
  ],
  "visualization": {                   // 可选：SVG 可视化（公式推导/几何图/流程图等）
    "type": "geometry|flowchart|formula|comparison|timeline",
    "svg": "<svg>...</svg>",
    "caption": "..."
  }
}
\`\`\`

content 内联标签支持：
- <b>...</b> 加粗
- <i>...</i> 斜体
- <u>...</u> 下划线
- <br> 换行
- <code>...</code> 行内代码
- <math>x^2 + 1</math> 数学公式（前端用 KaTeX 渲染）

# 额外要求
1. 全程不要直接抢先给出标准答案，引导学生自己发现漏洞
2. 数学逐行看推导，语文逐句评析答题内容
3. 每完成一个阶段，必须停下来等待学生回复，严禁一口气走完全部流程
4. 在有必要时使用 visualization 输出 SVG 图（几何图形、流程图、公式推导等）直观展示
5. 阶段 3-6 可以同时输出 knowledgeCards 知识卡片（带 SVG），帮助记忆
6. 严格遵守 stage 字段，不要跳阶段

# 当前阶段
首次回复从阶段 1 开始。后续根据学生回复推进。`
}

/** 讲题模式系统提示词 */
export function buildLectureSystemPrompt(question: Question | null, imagePath?: string): string {
  const questionText = question
    ? `题目编号：${question.number || "无"}
题目类型：${question.kind === "passage" ? "阅读材料" : question.kind === "passage_question" ? "阅读理解题" : "普通题目"}
题目内容：
${question.content || "（题目正文为空，请参考附图识别）"}`
    : "（题目信息缺失，请参考附图）"

  return `你是一名"AI 讲题老师"，擅长用动态板书和可视化帮助学生理解题目。

# 当前题目信息
${questionText}

${imagePath ? "题目图片已附在本消息中。" : ""}

# 你的核心能力
1. **HTML 动态板书**：可以输出完整的 HTML/CSS/JS 代码，前端会用 sandbox iframe 渲染。支持：
   - 步骤拆解板书（一步步展示推导过程）
   - 流程图（用 SVG 或 CSS 绘制）
   - 对比矩阵（左/右两列对比）
   - 公式与概念展示
   - 时间轴板书
2. **SVG 知识卡片**：用纯 SVG 输出知识卡片，包含标题、要点、示意图
3. **互动问答**：每段讲解后允许学生提问

# 输出格式（重要）

每次回复必须以 JSON 输出，格式如下（不要 markdown 代码块包裹，直接输出 JSON 本身）：
\`\`\`
{
  "title": "...",                       // 本次讲解标题
  "summary": "...",                     // 一句话总结
  "content": "...",                     // 给学生看的讲解正文（支持内联标签）
  "visualBoard": {                      // 可选：HTML 画板
    "html": "...",                      // 完整 HTML（含内联 CSS/JS，可放在 sandbox iframe 中渲染）
    "width": 800,                       // 建议宽度
    "height": 400,                      // 建议高度
    "caption": "..."                    // 画板说明
  },
  "knowledgeCards": [                   // 可选：知识卡片（含 SVG）
    {
      "title": "...",
      "svg": "<svg>...</svg>",
      "summary": "..."
    }
  ],
  "followUpQuestion": "...",            // 可选：抛给学生的思考问题
  "waitUserReply": true                 // 是否等待学生提问/回复
}
\`\`\`

# HTML 画板要求
- 完整的 HTML 文档片段（不需要 <html><body> 包裹，直接写内容）
- 内联 CSS（不要用外部样式表）
- 可内联 JS（用 <script> 标签，会被 sandbox 执行）
- 颜色：建议用柔和的浅色背景（如 #fef3c7 浅黄、#dbeafe 浅蓝、#dcfce7 浅绿）
- 字体：使用 system-ui, sans-serif
- 不要使用外部资源（无 CDN、无图片 URL、无 fetch）
- 步骤拆解：建议用动画展示（CSS transition / animation）
- 流程图：建议用 SVG 或 CSS Grid 实现
- 公式：用 unicode 字符或 HTML 实体（如 x² ∫ ∑ √）

# content 内联标签
- <b>...</b> <i>...</i> <u>...</u> <br> <code>...</code>
- <math>x^2 + 1</math> 数学公式（前端 KaTeX 渲染）

# 讲解流程
1. 首次回复：分析题目，给出整体思路 + 第一段讲解 + HTML 画板
2. 后续：根据学生提问，深入讲解某个点，可追加新画板
3. 最后：总结 + 知识卡片 + 变式练习

# 注意
- 一次只讲一个点，讲完等学生反馈
- 画板要直观，避免长篇大论的文字
- 不要直接给答案，引导学生思考`
}

/** 提取 AI 回复中的 JSON（容错）
 *  - 优先用严格 JSON.parse
 *  - 失败则用 regex fallback 提取顶层字段（容忍字符串内未转义的引号）
 *  - 这样 AI 在 content 里用 "友好" 这种未转义引号也不会挂 */
export function extractTutorJSON(text: string): Record<string, unknown> | null {
  if (!text) return null
  let s = text.trim()
  s = s.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim()
  const start = s.indexOf("{")
  const end = s.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) return null
  s = s.slice(start, end + 1)
  s = s.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]")
  // 1. 严格解析
  try {
    return JSON.parse(s)
  } catch {
    // 2. 容错 fallback：用 regex 逐字段提取
    return extractFieldsRelaxed(s)
  }
}

/** 用 regex 提取顶层字段（容错版本）
 *  - 处理 AI 在字符串里用未转义双引号（如 "友好"）的情况
 *  - 处理单引号字符串（AI 偶尔输出 'string'） */
function extractFieldsRelaxed(s: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {}
  // 顶层字符串字段："key": "value"（直到下一个 "key" 或 }）
  // 用状态机方式扫描顶层键值对
  const keys = ["title", "summary", "content", "followUpQuestion", "waitUserReply", "stage", "waitUserReply"]
  for (const key of keys) {
    // 匹配 "key" : "value" 或 "key": number 或 "key": true|false
    const re = new RegExp(`"${key}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"|\\d+(?:\\.\\d+)?|true|false|null|\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\})`, "m")
    const m = re.exec(s)
    if (m) {
      const raw = m[1]
      if (raw.startsWith('"')) {
        // 字符串值：尝试 JSON.parse 容错提取
        try {
          result[key] = JSON.parse(raw)
        } catch {
          // 提取 raw 内容（去掉首尾引号，保留中间）
          result[key] = raw.slice(1, -1)
        }
      } else if (raw === "true") {
        result[key] = true
      } else if (raw === "false") {
        result[key] = false
      } else if (raw === "null") {
        result[key] = null
      } else if (raw.startsWith("[")) {
        try { result[key] = JSON.parse(raw) } catch { result[key] = [] }
      } else if (raw.startsWith("{")) {
        try { result[key] = JSON.parse(raw) } catch { result[key] = {} }
      } else {
        const num = Number(raw)
        if (!isNaN(num)) result[key] = num
      }
    }
  }
  // 处理 content 字段：用更宽松的扫描，因为 content 字符串里可能有未转义 "
  // 找到 "content": " 开始，往后扫描直到遇到 "," 或 "} 结尾（行尾或下一个 key）
  const contentMatch = /"content"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:visualBoard|knowledgeCards|stage|waitUserReply|summary|title|followUpQuestion|visualization)/.exec(s)
  if (contentMatch) {
    // 容错：把字符串里的 \n 转成换行
    result["content"] = contentMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\")
  }
  // visualBoard 单独处理（嵌套对象）
  const vbMatch = /"visualBoard"\s*:\s*\{([\s\S]*?)\}\s*,\s*"(?:knowledgeCards|stage|waitUserReply|summary|title|followUpQuestion|visualization)/.exec(s)
  if (vbMatch) {
    try {
      // 尝试解析嵌套对象
      const vbObj = JSON.parse("{" + vbMatch[1] + "}")
      result["visualBoard"] = vbObj
    } catch {
      // fallback: 提取 html 字段
      const htmlMatch = /"html"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:width|height|caption)/.exec(vbMatch[1])
      if (htmlMatch) {
        result["visualBoard"] = {
          html: htmlMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\"),
        }
      }
    }
  }
  return Object.keys(result).length > 0 ? result : null
}
