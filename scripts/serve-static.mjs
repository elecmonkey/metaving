import http from "node:http"
import fs from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const rootArg = args[0] ?? "dist"
const portArg = args[1]
const rootDir = path.resolve(process.cwd(), rootArg)
const port = Number(portArg ?? process.env.PORT ?? 4173)

const mimeTypes = new Map([
  [".html", "text/html"],
  [".js", "text/javascript"],
  [".mjs", "text/javascript"],
  [".css", "text/css"],
  [".json", "application/json"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
  [".wasm", "application/wasm"]
])

const ensureCharset = (contentType) => {
  if (contentType.startsWith("text/") || contentType === "application/json") {
    return `${contentType}; charset=utf-8`
  }
  return contentType
}

const resolveFilePath = (pathname) => {
  const resolved = path.resolve(rootDir, "." + pathname)
  if (!resolved.startsWith(rootDir + path.sep) && resolved !== rootDir) return null
  if (!fs.existsSync(resolved)) return null
  const stat = fs.statSync(resolved)
  if (stat.isDirectory()) {
    const indexPath = path.join(resolved, "index.html")
    if (!fs.existsSync(indexPath)) return null
    return indexPath
  }
  if (stat.isFile()) return resolved
  return null
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405
    res.end()
    return
  }
  const origin = `http://${req.headers.host ?? "localhost"}`
  const url = new URL(req.url ?? "/", origin)
  const pathname = decodeURIComponent(url.pathname)
  const filePath = resolveFilePath(pathname)
  if (!filePath) {
    res.statusCode = 404
    res.end("Not Found")
    return
  }
  const ext = path.extname(filePath)
  const contentType = ensureCharset(mimeTypes.get(ext) ?? "application/octet-stream")
  res.setHeader("Content-Type", contentType)
  const stream = fs.createReadStream(filePath)
  stream.on("error", () => {
    res.statusCode = 500
    res.end("Internal Server Error")
  })
  if (req.method === "HEAD") {
    res.end()
    stream.destroy()
    return
  }
  stream.pipe(res)
})

server.listen(port, () => {
  console.log(`static server at http://localhost:${port}`)
})
