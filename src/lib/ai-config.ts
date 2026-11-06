"use client"

import type { AIProviderConfig } from "./types"

const STORAGE_KEY = "ai-provider-config"

const DEFAULT_CONFIG: AIProviderConfig = {
  baseURL: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o",
  enabled: false,
}

/** 加载配置（仅客户端调用） */
export function loadAIConfig(): AIProviderConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_CONFIG
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_CONFIG
  }
}

/** 保存配置 */
export function saveAIConfig(cfg: AIProviderConfig) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
  } catch {
    // ignore
  }
}

export const DEFAULT_AI_CONFIG = DEFAULT_CONFIG
