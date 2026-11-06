"use client"

import { useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"

interface MarkdownProps {
  children: string
  className?: string
}

/** 支持 KaTeX 公式的 Markdown 渲染组件 */
export function Markdown({ children, className }: MarkdownProps) {
  const content = useMemo(() => children || "", [children])
  return (
    <div className={`markdown-body text-sm leading-relaxed ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={{
          // 处理代码块
          code({ inline, className, children: codeChildren, ...props }: any) {
            return (
              <code
                className={`${inline ? "bg-muted px-1.5 py-0.5 rounded text-xs" : "block bg-muted p-3 rounded text-xs overflow-x-auto"} ${className ?? ""}`}
                {...props}
              >
                {codeChildren}
              </code>
            )
          },
          // 表格
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3">
                <table className="min-w-full border-collapse text-xs">{children}</table>
              </div>
            )
          },
          th({ children }) {
            return <th className="border px-2 py-1 bg-muted font-medium text-left">{children}</th>
          },
          td({ children }) {
            return <td className="border px-2 py-1 align-top">{children}</td>
          },
          // 链接
          a({ children, href }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-rose-600 underline">
                {children}
              </a>
            )
          },
          // 段落
          p({ children }) {
            return <p className="my-2 first:mt-0 last:mb-0">{children}</p>
          },
          // 标题
          h1: ({ children }) => <h1 className="text-lg font-bold my-3">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold my-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-bold my-2">{children}</h3>,
          // 列表
          ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
          // 引用
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-rose-300 pl-3 my-2 text-muted-foreground">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
