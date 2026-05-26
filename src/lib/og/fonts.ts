import { readFile } from "node:fs/promises"
import { join } from "node:path"

let cache: Promise<{
  syne700: Buffer
  syne800: Buffer
  inter400: Buffer
  inter500: Buffer
}> | null = null

export async function loadOgFonts() {
  if (!cache) {
    cache = (async () => {
      const dir = join(process.cwd(), "public", "fonts")
      const [syne700, syne800, inter400, inter500] = await Promise.all([
        readFile(join(dir, "Syne-700.ttf")),
        readFile(join(dir, "Syne-800.ttf")),
        readFile(join(dir, "Inter-400.ttf")),
        readFile(join(dir, "Inter-500.ttf")),
      ])
      return { syne700, syne800, inter400, inter500 }
    })()
  }
  return cache
}
