import fs from "node:fs"
import path from "node:path"

export type RouteRecord = {
  path: string
  filePath: string
}

const isPageFile = (filePath: string) => filePath.endsWith(".vue")

const walkDir = (dir: string, entries: string[] = []) => {
  if (!fs.existsSync(dir)) return entries
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      walkDir(fullPath, entries)
      continue
    }
    if (stat.isFile() && isPageFile(fullPath)) {
      entries.push(fullPath)
    }
  }
  return entries
}

const toRoutePath = (pagesDir: string, filePath: string) => {
  const relative = path.relative(pagesDir, filePath)
  const withoutExt = relative.replace(/\.vue$/, "")
  const segments = withoutExt.split(path.sep).map((segment) => {
    if (segment === "index") return ""
    return segment.replace(/\[(.+?)\]/g, ":$1")
  })
  const joined = segments.filter((segment) => segment.length > 0).join("/")
  return "/" + joined
}

export const scanPages = (pagesDir: string) => {
  const files = walkDir(pagesDir)
  return files
    .map((filePath) => ({
      path: toRoutePath(pagesDir, filePath),
      filePath
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
}
