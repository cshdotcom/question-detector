import { NextResponse } from "next/server"

export const runtime = "nodejs"

/** 返回后端是否配置了默认 AI（不暴露具体 key/url/model，只暴露布尔值）
 *  - hasDefaultAI: 是否配置了 AI_BASE_URL + AI_API_KEY + AI_MODEL
 *  - hasPassword: 是否设置了访问密码
 */
export async function GET() {
  const baseURL = process.env.AI_BASE_URL?.trim()
  const apiKey = process.env.AI_API_KEY?.trim()
  const model = process.env.AI_MODEL?.trim()
  const hasDefaultAI = !!(baseURL && apiKey && model)
  const hasPassword = !!(process.env.APP_PASSWORD?.trim())
  return NextResponse.json({ hasDefaultAI, hasPassword })
}
