import { NextResponse } from "next/server"
import { callVisionChat, type ChatMessage } from "@/lib/ai-service"
import type { AIProviderConfig, GradingResult } from "@/lib/types"
import { loadAIConfig } from "@/lib/ai-config"

export const runtime = "nodejs"
export const maxDuration = 60

interface GradeBody {
  image: string
  questionContent: string
  questionNumber?: string
  kind?: "normal" | "passage" | "passage_question"
  /** 阅读理解的文章内容（如果题目是 passage_question） */
  passageContent?: string
  /** 题目学生已经写的答案（OCR 出来的，可选） */
  studentAnswer?: string
  config?: AIProviderConfig
}

const PROMPT = `你是一个严格的批改老师。下面是一张题目图片，请按以下步骤分析并返回严格的 JSON：

1. 如果题目图中有学生作答，请识别出来作为 studentAnswer
2. 给出标准答案 correctAnswer
3. 判断是否正确：
   - "correct": true（完全正确）
   - "correct": "partial"（部分正确）
   - "correct": false（错误）
4. 给出 score（0-100）
5. 给出详细的解析 explanation，包括：
   - 解题步骤
   - 涉及的知识点
   - 易错点
6. 给出 knowledgePoints 数组

返回 JSON 格式（不要 markdown 代码块、不要其他文字）：
{"correct": true | false | "partial","score": 90,"studentAnswer": "...","correctAnswer": "...","explanation": "...","knowledgePoints": ["知识点1","知识点2"]}

如果题目是阅读理解的题目（kind=passage_question），请结合文章内容来批改。
解析中支持 LaTeX 公式：行内用 $...$，行间用 $$...$$。`

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GradeBody
    if (!body?.image && !body?.questionContent) {
      return NextResponse.json({ error: "缺少 image 或 questionContent" }, { status: 400 })
    }

    let dataUrl = body.image
    if (dataUrl && !dataUrl.startsWith("data:")) {
      dataUrl = `data:image/jpeg;base64,${dataUrl}`
    }

    const parts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = []
    const contextText = `请批改以下题目：${body.questionNumber ? `（第 ${body.questionNumber} 题）` : ""}

题目：${body.questionContent || "（见图）"}
${body.passageContent ? `\n阅读理解文章内容：\n${body.passageContent}\n` : ""}
${body.studentAnswer ? `\n学生已作答（识别自图）：${body.studentAnswer}` : ""}

${PROMPT}`
    parts.push({ type: "text", text: contextText })
    if (dataUrl) {
      parts.push({ type: "image_url", image_url: { url: dataUrl } })
    }

    let config = body.config
    if (!config) {
      config = loadAIConfig() as AIProviderConfig
    }

    const messages: ChatMessage[] = [{ role: "user", content: parts }]
    const result = await callVisionChat(messages, { config, maxTokens: 4096 })

    // 提取 JSON
    let grading: GradingResult
    const txt = result.content.trim()
    const start = txt.indexOf("{")
    const end = txt.lastIndexOf("}")
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const parsed = JSON.parse(txt.slice(start, end + 1))
        grading = {
          correct: parsed.correct === true ? true : parsed.correct === "partial" ? "partial" : false,
          score: typeof parsed.score === "number" ? parsed.score : undefined,
          studentAnswer: parsed.studentAnswer,
          correctAnswer: parsed.correctAnswer,
          explanation: parsed.explanation || "",
          knowledgePoints: Array.isArray(parsed.knowledgePoints) ? parsed.knowledgePoints : undefined,
        }
      } catch {
        grading = { correct: false, explanation: result.content }
      }
    } else {
      grading = { correct: false, explanation: result.content }
    }

    return NextResponse.json({ ok: true, grading, raw: result.content })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
