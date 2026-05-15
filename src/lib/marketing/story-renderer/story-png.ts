import type { StoryData } from "@/lib/marketing/copy-generator"
import { renderStoryToSVG } from "./story-svg"
import { W, H } from "./story-layout"

/**
 * Converts an SVG string to a PNG Blob via HTMLCanvasElement.
 * Browser-only — do not import from server components or API routes.
 *
 * Flow:
 *   SVG string → Blob → Object URL → HTMLImageElement → canvas.drawImage → toBlob(PNG)
 *
 * Font note: the SVG uses font-family="Arial, Helvetica, sans-serif" because
 * SVG loaded via object URL cannot access the page's @font-face declarations.
 * Embedding a base64 font is a future enhancement if brand typography becomes required.
 */
export async function svgToPngBlob(svg: string): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(svgBlob)

  try {
    const img = new Image()
    img.src = url

    await img.decode()

    const canvas = document.createElement("canvas")
    canvas.width = W
    canvas.height = H

    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas 2D context not available")

    ctx.drawImage(img, 0, 0, W, H)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error("canvas.toBlob returned null"))
        },
        "image/png",
        1
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export interface StoryPngResult {
  blob: Blob
  url: string  // revocable object URL — caller must call URL.revokeObjectURL(url) when done
}

/**
 * Renders a StoryData to PNG 1080×1920.
 * Returns a blob and a pre-created object URL for direct use in <img src>.
 */
export async function renderStoryToPng(story: StoryData): Promise<StoryPngResult> {
  const svg = renderStoryToSVG(story)
  const blob = await svgToPngBlob(svg)
  const url = URL.createObjectURL(blob)
  return { blob, url }
}

/**
 * Renders an array of stories to PNG concurrently.
 * Returns parallel arrays of results (null if individual render fails).
 */
export async function renderStoriesToPng(stories: StoryData[]): Promise<(StoryPngResult | null)[]> {
  return Promise.all(
    stories.map((story) =>
      renderStoryToPng(story).catch((err) => {
        console.error("[story-png] render failed for", story.label, err)
        return null
      })
    )
  )
}
