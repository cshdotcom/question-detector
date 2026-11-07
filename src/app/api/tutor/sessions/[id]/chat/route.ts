import { db } from "@/lib/db"
import { callVisionChatStream, type ChatMessage as AIChatMessage } from "@/lib/ai-service"
import {
  buildSolveSystemPrompt,
  buildLectureSystemPrompt,
  extractTutorJSON,
  SOLVE_STAGES,
} from "@/lib/tutor-prompt"
import type { Question, AIProviderConfig } from "@/lib/types"

export const runtime = "nodejs"
export const maxDuration = 120

interface RouteCtx {
  params: Promise<{ id: string }>
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  timestamp: number
  stage?: number
  meta?: Record<string, unknown>
  images?: string[] // dataUrl 数组：用户在聊天中上传的图片附件
}

interface ChatBody {
  message: string
  config?: AIProviderConfig
  regenerate?: boolean  // 重新生成最后一条 assistant 消息
  images?: string[]  // 本次消息附带的新图片 dataUrl
}

/** 把会话历史转换为 AI 消息格式（截断到最近 20 条避免上下文过长） */
function buildHistory(session: { type: string; questionSnapshot: string; messages: string; imageCrop: string }): { messages: AIChatMessage[]; q: Question | null } {
  let q: Question | null = null
  try {
    q = JSON.parse(session.questionSnapshot || "{}") as Question
    if (!q || !q.content && !q.number) q = null
  } catch {}
  const sysPrompt = session.type === "solve"
    ? buildSolveSystemPrompt(q, session.imageCrop || undefined)
    : buildLectureSystemPrompt(q, session.imageCrop || undefined)

  const historyMsgs: ChatMessage[] = (() => {
    try { return JSON.parse(session.messages || "[]") } catch { return [] }
  })()

  const aiMessages: AIChatMessage[] = [{ role: "system", content: sysPrompt }]

  // 首次对话且题目图存在 → 第一条 user 消息附图
  if (historyMsgs.length === 0 && session.imageCrop) {
    aiMessages.push({
      role: "user",
      content: [
        { type: "text", text: "请开始第 1 阶段。" },
        { type: "image_url", image_url: { url: session.imageCrop } },
      ],
    })
  } else {
    // 转换历史
    const recent = historyMsgs.slice(-20)
    for (const m of recent) {
      if (m.role === "user") {
        // 如果用户消息有附图，用 multimodal 格式
        if (m.images && m.images.length > 0) {
          aiMessages.push({
            role: "user",
            content: [
              { type: "text", text: m.content },
              ...m.images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
            ],
          })
        } else {
          aiMessages.push({ role: "user", content: m.content })
        }
      } else {
        aiMessages.push({ role: "assistant", content: m.content })
      }
    }
  }
  return { messages: aiMessages, q }
}

/** POST /api/tutor/sessions/[id]/chat — 流式聊天
 *  返回 SSE：每个 token 发一行 data: {"type":"token","text":"..."}
 *  最终发 data: {"type":"done","content":"...","meta":{...}}
 */
export async function POST(req: Request, ctx: RouteCtx) {
  const { id } = await ctx.params
  const body = (await req.json()) as ChatBody
  const userMessage = (body.message || "").trim()

  if (!userMessage && !body.regenerate) {
    return new Response(JSON.stringify({ ok: false, error: "消息不能为空" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  let session
  try {
    session = await db.tutorSession.findUnique({ where: { id } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    })
  }
  if (!session) {
    return new Response(JSON.stringify({ ok: false, error: "会话不存在" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    })
  }

  // 加载历史
  let history: ChatMessage[] = []
  try { history = JSON.parse(session.messages || "[]") } catch {}

  // 追加用户消息（regenerate 模式不追加）
  if (!body.regenerate && (userMessage || (body.images && body.images.length > 0))) {
    // 首次消息：把题目截图（imageCrop）也附上，作为 AI 的参考
    const isFirstMessage = history.length === 0
    const allImages: string[] = []
    if (isFirstMessage && session.imageCrop) {
      allImages.push(session.imageCrop)
    }
    if (body.images && body.images.length > 0) {
      allImages.push(...body.images)
    }
    history.push({
      role: "user",
      content: userMessage || (isFirstMessage ? "请开始。" : "（上传了图片）"),
      timestamp: Date.now(),
      images: allImages.length > 0 ? allImages : undefined,
    })
  }

  // 构建 AI 消息
  const { messages: aiMessages } = buildHistory({
    type: session.type,
    questionSnapshot: session.questionSnapshot,
    messages: JSON.stringify(history),
    imageCrop: session.imageCrop,
  })

  // 如果是首次（历史为空且 regenerate）→ 加初始提示
  if (body.regenerate && history.length === 0) {
    aiMessages.push({
      role: "user",
      content: session.type === "solve"
        ? "请开始第 1 阶段。"
        : "请开始讲题。",
    })
  } else if (!body.regenerate && history.length === 1 && session.imageCrop) {
    // 已经在 buildHistory 中处理（首条消息带图），不需要再追加
  }

  // 创建 SSE 流
  const encoder = new TextEncoder()
  const abortCtrl = new AbortController()
  // 客户端断开 → 中断 AI 请求
  req.signal?.addEventListener("abort", () => abortCtrl.abort())

  let fullContent = ""

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      }
      try {
        send({ type: "start" })
        const result = await callVisionChatStream(aiMessages, {
          config: body.config,
          maxTokens: 8192,
          signal: abortCtrl.signal,
          onToken: (token) => {
            fullContent += token
            send({ type: "token", text: token })
          },
        })
        // 解析 JSON 结构
        const parsed = extractTutorJSON(result.content)
        let stage = session.stage
        let knowledgeCards: unknown[] = []
        let visualBoards: unknown[] = []
        let meta: Record<string, unknown> = {}
        if (parsed) {
          if (typeof parsed.stage === "number" && parsed.stage >= 1 && parsed.stage <= 6 && session.type === "solve") {
            stage = parsed.stage
            meta.stage = parsed.stage
          }
          if (Array.isArray(parsed.knowledgeCards)) {
            knowledgeCards = parsed.knowledgeCards
            meta.knowledgeCards = parsed.knowledgeCards
          }
          if (parsed.visualBoard && typeof parsed.visualBoard === "object") {
            visualBoards.push(parsed.visualBoard)
            meta.visualBoard = parsed.visualBoard
          }
          if (parsed.visualization && typeof parsed.visualization === "object") {
            meta.visualization = parsed.visualization
          }
          meta.title = parsed.title
          meta.summary = parsed.summary
          meta.waitUserReply = parsed.waitUserReply
          meta.followUpQuestion = parsed.followUpQuestion
        }
        // 追加 assistant 消息
        history.push({
          role: "assistant",
          content: result.content,
          timestamp: Date.now(),
          stage: stage,
          meta,
        })
        // 更新 DB
        await db.tutorSession.update({
          where: { id },
          data: {
            messages: JSON.stringify(history),
            stage,
            knowledgeCards: knowledgeCards.length > 0
              ? JSON.stringify([...(() => { try { return JSON.parse(session.knowledgeCards || "[]") } catch { return [] } })(), ...knowledgeCards])
              : session.knowledgeCards,
            visualBoards: visualBoards.length > 0
              ? JSON.stringify([...(() => { try { return JSON.parse(session.visualBoards || "[]") } catch { return [] } })(), ...visualBoards])
              : session.visualBoards,
          },
        })
        send({
          type: "done",
          content: result.content,
          meta,
          stage,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error("[tutor:chat] error:", message)
        send({ type: "error", error: message })
      } finally {
        controller.close()
      }
    },
    cancel() {
      abortCtrl.abort()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

/** 内部导出（避免 unused 警告） */
export const _SOLVE_STAGES = SOLVE_STAGES
