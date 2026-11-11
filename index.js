import { Canvas as SkiaCanvas, CanvasRenderingContext2D, Image } from "skia-canvas"
import emojiRegex from "emoji-regex"
import * as twemoji from "./twemoji.js"

export * from "skia-canvas"
export { version as twemojiVersion } from "./twemoji.js"

const native = CanvasRenderingContext2D.prototype
const patched = new WeakSet()
const images = new Map()
let imagesVersion = null

export class Canvas extends SkiaCanvas {
  newPage(...args) {
    return patch(super.newPage(...args))
  }
}

export function patch(ctx) {
  if (patched.has(ctx)) return ctx
  patched.add(ctx)
  ctx.fillText = (text, x, y, maxWidth) => fillText(ctx, text, x, y, maxWidth)
  ctx.strokeText = (text, x, y, maxWidth) => strokeText(ctx, text, x, y, maxWidth)
  ctx.measureText = (text, maxWidth) => measureText(ctx, text, maxWidth)
  return ctx
}

export function splitText(text) {
  const segments = []
  let last = 0
  for (const match of text.matchAll(emojiRegex())) {
    const emoji = match[0]
    if (emoji === "©" || emoji === "®" || emoji === "™") continue
    if (match.index > last) segments.push({ type: "text", text: text.slice(last, match.index) })
    segments.push({ type: "emoji", text: emoji, codepoint: toCodepoint(emoji) })
    last = match.index + emoji.length
  }
  if (last < text.length) segments.push({ type: "text", text: text.slice(last) })
  return segments
}

export function measureText(ctx, text, maxWidth) {
  text = String(text)
  const segments = splitText(text)
  if (!twemoji.version || ctx.textWrap || !segments.some(s => s.type === "emoji")) return native.measureText.call(ctx, text, maxWidth)
  return layout(ctx, segments).metrics
}

export function fillText(ctx, text, x, y, maxWidth) {
  draw(ctx, text, x, y, maxWidth, native.fillText)
}

export function strokeText(ctx, text, x, y, maxWidth) {
  draw(ctx, text, x, y, maxWidth, native.strokeText)
}

function toCodepoint(emoji) {
  if (!emoji.includes("‍")) emoji = emoji.replaceAll("️", "")
  return Array.from(emoji, c => c.codePointAt(0).toString(16)).join("-")
}

function emojiImage(codepoint) {
  if (imagesVersion !== twemoji.version) {
    images.clear()
    imagesVersion = twemoji.version
  }
  if (!images.has(codepoint)) {
    const svg = twemoji.readSvg(codepoint)
    let image = null
    if (svg) {
      image = new Image()
      image.src = svg
    }
    images.set(codepoint, image)
  }
  return images.get(codepoint)
}

function draw(ctx, text, x, y, maxWidth, drawText) {
  text = String(text)
  const segments = splitText(text)
  if (!twemoji.version || ctx.textWrap || !segments.some(s => s.type === "emoji")) {
    if (maxWidth === undefined) drawText.call(ctx, text, x, y)
    else drawText.call(ctx, text, x, y, maxWidth)
    return
  }
  const { items, offset, metrics } = layout(ctx, segments)
  ctx.save()
  ctx.translate(x, y)
  if (maxWidth < metrics.width) ctx.scale(Math.max(maxWidth, 0) / metrics.width, 1)
  ctx.textAlign = "left"
  for (const item of items) {
    if (item.type === "text") {
      drawText.call(ctx, item.text, offset + item.x, 0)
      continue
    }
    const image = emojiImage(item.codepoint)
    if (image) ctx.drawImage(image, offset + item.x, item.y, item.size, item.size)
    else drawText.call(ctx, item.text, offset + item.x + (item.size - native.measureText.call(ctx, item.text).width) / 2, 0)
  }
  ctx.restore()
}

function layout(ctx, segments) {
  const emojiScale = ctx.emojiScale ?? 1
  const emojiSpacing = ctx.emojiSpacing ?? 0.05
  const align = ctx.textAlign
  ctx.textAlign = "left"
  const base = native.measureText.call(ctx, "")
  const em = base.emHeightAscent + base.emHeightDescent
  const size = em * emojiScale
  const spacing = em * emojiSpacing
  const emojiAscent = base.emHeightAscent + (size - em) / 2
  const emojiDescent = size - emojiAscent
  const items = []
  let width = 0
  let left = Infinity
  let right = -Infinity
  let ascent = -Infinity
  let descent = -Infinity
  for (const segment of segments) {
    if (segment.type === "text") {
      const m = native.measureText.call(ctx, segment.text)
      items.push({ ...segment, x: width })
      left = Math.min(left, width - m.actualBoundingBoxLeft)
      right = Math.max(right, width + m.actualBoundingBoxRight)
      ascent = Math.max(ascent, m.actualBoundingBoxAscent)
      descent = Math.max(descent, m.actualBoundingBoxDescent)
      width += m.width
    } else {
      items.push({ ...segment, x: width + spacing, y: -emojiAscent, size })
      left = Math.min(left, width + spacing)
      right = Math.max(right, width + spacing + size)
      ascent = Math.max(ascent, emojiAscent)
      descent = Math.max(descent, emojiDescent)
      width += size + spacing * 2
    }
  }
  ctx.textAlign = align
  const offset = alignOffset(align, ctx.direction, width)
  const metrics = {
    width,
    actualBoundingBoxLeft: -(offset + left),
    actualBoundingBoxRight: offset + right,
    actualBoundingBoxAscent: ascent,
    actualBoundingBoxDescent: descent,
    fontBoundingBoxAscent: Math.max(base.fontBoundingBoxAscent, emojiAscent),
    fontBoundingBoxDescent: Math.max(base.fontBoundingBoxDescent, emojiDescent),
    emHeightAscent: base.emHeightAscent,
    emHeightDescent: base.emHeightDescent,
    alphabeticBaseline: base.alphabeticBaseline,
    hangingBaseline: base.hangingBaseline,
    ideographicBaseline: base.ideographicBaseline
  }
  return { items, offset, metrics }
}

function alignOffset(align, direction, width) {
  const rtl = direction === "rtl"
  if (align === "center") return -width / 2
  if (align === "right" || (align === "end" && !rtl) || (align === "start" && rtl)) return -width
  return 0
}
