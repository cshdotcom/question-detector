// 题目截图水印工具（题号 + 批改结果颜色）

export async function addLabelWatermarkLocal(
  dataUrl: string,
  label: string,
  correct?: boolean | "partial"
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = dataUrl
  })
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)
  // 题号水印
  if (label) {
    const text = `第 ${label} 题`
    ctx.font = "bold 24px sans-serif"
    const tw = ctx.measureText(text).width
    // 错题红色，部分正确橙色，正确绿色，未批改粉色
    const bg =
      correct === false ? "rgba(220, 38, 38, 0.95)" :
      correct === "partial" ? "rgba(217, 119, 6, 0.95)" :
      correct === true ? "rgba(22, 163, 74, 0.95)" :
      "rgba(225, 29, 72, 0.95)"
    ctx.fillStyle = bg
    ctx.fillRect(8, 8, tw + 20, 32)
    ctx.fillStyle = "white"
    ctx.textBaseline = "middle"
    ctx.fillText(text, 18, 24)
  }
  return canvas.toDataURL("image/png")
}
