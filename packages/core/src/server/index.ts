import fs from "node:fs"
import path from "node:path"
import http from "node:http"
import { pathToFileURL } from "node:url"
import { build as viteBuild, createServer as createViteServer, mergeConfig } from "vite"
import type { UserConfig } from "vite"
import chalk from "chalk"
import { Hono } from "hono"
import ora from "ora"
import { ensureMetavingFiles } from "../conventions/generate.js"
import { loadMetavingConfig, type MetavingConfigEnv, type MetavingStaticConfig } from "../config/loadConfig.js"
import { renderHtml } from "../runtime/renderHtml.js"
import { handleHonoRequest, registerApiRoutes } from "@metaving/plugin-hono"
import { getVuePlugins, renderDevHtml } from "@metaving/plugin-vue"

const brand = chalk.cyan("metaving")
const logInfo = (message: string) => console.log(`${chalk.blue("ℹ")} ${message}`)
const logSuccess = (message: string) => console.log(`${chalk.green("✔")} ${message}`)
const logWarn = (message: string) => console.log(`${chalk.yellow("⚠")} ${message}`)
const logError = (message: string) => console.error(`${chalk.red("✖")} ${message}`)

const resolveViteConfig = (baseConfig: UserConfig, userConfig: UserConfig | null) => {
  return userConfig ? mergeConfig(baseConfig, userConfig) : baseConfig
}

const getContentType = (filePath: string) => {
  if (filePath.endsWith(".js")) return "text/javascript"
  if (filePath.endsWith(".mjs")) return "text/javascript"
  if (filePath.endsWith(".cjs")) return "text/javascript"
  if (filePath.endsWith(".ts")) return "text/plain"
  if (filePath.endsWith(".css")) return "text/css"
  if (filePath.endsWith(".html")) return "text/html"
  if (filePath.endsWith(".json")) return "application/json"
  if (filePath.endsWith(".map")) return "application/json"
  if (filePath.endsWith(".svg")) return "image/svg+xml"
  if (filePath.endsWith(".png")) return "image/png"
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg"
  if (filePath.endsWith(".gif")) return "image/gif"
  if (filePath.endsWith(".webp")) return "image/webp"
  if (filePath.endsWith(".ico")) return "image/x-icon"
  if (filePath.endsWith(".txt")) return "text/plain"
  if (filePath.endsWith(".wasm")) return "application/wasm"
  if (filePath.endsWith(".woff")) return "font/woff"
  if (filePath.endsWith(".woff2")) return "font/woff2"
  if (filePath.endsWith(".ttf")) return "font/ttf"
  if (filePath.endsWith(".otf")) return "font/otf"
  return "application/octet-stream"
}

const ensureCharset = (contentType: string) => {
  if (contentType.startsWith("text/") || contentType === "application/json") {
    return `${contentType}; charset=utf-8`
  }
  return contentType
}

const isHashedAsset = (filePath: string) => /[.-][a-f0-9]{8,}\./i.test(path.basename(filePath))

const resolveCacheControl = (config: MetavingStaticConfig | undefined, filePath: string) => {
  const ext = path.extname(filePath).slice(1)
  const isHashed = isHashedAsset(filePath)
  const cacheControl = config?.cacheControl
  if (typeof cacheControl === "string") return cacheControl
  if (typeof cacheControl === "function") {
    const result = cacheControl({ filePath, ext, isHashed })
    if (typeof result === "string") return result
  }
  return isHashed ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate"
}

const resolveEncoding = (filePath: string, acceptEncoding: string | string[] | undefined) => {
  const header = Array.isArray(acceptEncoding) ? acceptEncoding.join(",") : acceptEncoding ?? ""
  if (header.includes("br") && fs.existsSync(filePath + ".br")) {
    return { filePath: filePath + ".br", encoding: "br" as const }
  }
  if (header.includes("gzip") && fs.existsSync(filePath + ".gz")) {
    return { filePath: filePath + ".gz", encoding: "gzip" as const }
  }
  return { filePath, encoding: null }
}

const createETag = (stat: fs.Stats, encoding: string | null) => {
  const tag = `${stat.size}-${Math.floor(stat.mtimeMs)}${encoding ? `-${encoding}` : ""}`
  return `W/"${tag}"`
}

const parseRange = (rangeHeader: string, size: number) => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)
  if (!match) return null
  const startRaw = match[1]
  const endRaw = match[2]
  if (startRaw === "" && endRaw === "") return null
  let start = startRaw === "" ? 0 : Number(startRaw)
  let end = endRaw === "" ? size - 1 : Number(endRaw)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  if (startRaw === "" && endRaw !== "") {
    const suffix = end
    if (suffix <= 0) return null
    start = Math.max(size - suffix, 0)
    end = size - 1
  }
  if (start > end || start < 0 || end < 0) return null
  if (start >= size) return null
  end = Math.min(end, size - 1)
  return { start, end }
}

const serveStatic = (
  clientDir: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  staticConfig?: MetavingStaticConfig
) => {
  if (req.method !== "GET" && req.method !== "HEAD") return false
  const origin = `http://${req.headers.host ?? "localhost"}`
  const url = new URL(req.url ?? "/", origin)
  const pathname = decodeURIComponent(url.pathname)
  const resolvedClientDir = path.resolve(clientDir)
  const filePath = path.resolve(path.join(resolvedClientDir, pathname))
  if (!filePath.startsWith(resolvedClientDir + path.sep) && filePath !== resolvedClientDir) return false
  if (!fs.existsSync(filePath)) return false
  const encodingResult = resolveEncoding(filePath, req.headers["accept-encoding"])
  const encodedPath = encodingResult.filePath
  const stat = fs.statSync(encodedPath)
  if (!stat.isFile()) return false
  const contentType = ensureCharset(getContentType(filePath))
  const cacheControl = resolveCacheControl(staticConfig, filePath)
  const eTag = createETag(stat, encodingResult.encoding)
  const lastModified = stat.mtime.toUTCString()
  res.setHeader("Content-Type", contentType)
  res.setHeader("Cache-Control", cacheControl)
  res.setHeader("ETag", eTag)
  res.setHeader("Last-Modified", lastModified)
  res.setHeader("Accept-Ranges", "bytes")
  if (encodingResult.encoding) {
    res.setHeader("Content-Encoding", encodingResult.encoding)
    res.setHeader("Vary", "Accept-Encoding")
  }
  const ifNoneMatch = req.headers["if-none-match"]
  if (typeof ifNoneMatch === "string" && ifNoneMatch === eTag) {
    res.statusCode = 304
    res.end()
    return true
  }
  const ifModifiedSince = req.headers["if-modified-since"]
  if (ifNoneMatch === undefined && typeof ifModifiedSince === "string") {
    const sinceTime = Date.parse(ifModifiedSince)
    if (!Number.isNaN(sinceTime) && stat.mtimeMs <= sinceTime) {
      res.statusCode = 304
      res.end()
      return true
    }
  }
  const rangeHeader = typeof req.headers.range === "string" ? req.headers.range : null
  const ifRange = typeof req.headers["if-range"] === "string" ? req.headers["if-range"] : null
  const allowRange = !encodingResult.encoding && rangeHeader && (!ifRange || ifRange === eTag || ifRange === lastModified)
  if (allowRange) {
    const range = parseRange(rangeHeader, stat.size)
    if (!range) {
      res.statusCode = 416
      res.setHeader("Content-Range", `bytes */${stat.size}`)
      res.end()
      return true
    }
    res.statusCode = 206
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`)
    res.setHeader("Content-Length", String(range.end - range.start + 1))
    if (req.method === "HEAD") {
      res.end()
      return true
    }
    fs.createReadStream(encodedPath, { start: range.start, end: range.end }).pipe(res)
    return true
  }
  res.statusCode = 200
  res.setHeader("Content-Length", String(stat.size))
  if (req.method === "HEAD") {
    res.end()
    return true
  }
  fs.createReadStream(encodedPath).pipe(res)
  return true
}

export const startDevServer = async (root: string) => {
  logInfo(`${brand} 准备开发环境`)
  const devEnv: MetavingConfigEnv = { command: "serve", mode: "development" }
  const metavingConfig = await loadMetavingConfig(root, devEnv)
  const devBaseConfig: UserConfig = {
    root,
    appType: "custom",
    server: { middlewareMode: true },
    plugins: getVuePlugins()
  }
  const devConfig = resolveViteConfig(devBaseConfig, metavingConfig.vite)
  const vite = await createViteServer(devConfig)
  let currentApp = new Hono()
  let refreshTimer: NodeJS.Timeout | null = null
  let refreshQueue = Promise.resolve()

  const buildApp = async () => {
    ensureMetavingFiles(root, { router: metavingConfig.router })
    const app = new Hono()
    await registerApiRoutes(root, app, vite.ssrLoadModule)
    const serverEntry = path.join(root, "server/index.ts")
    if (fs.existsSync(serverEntry)) {
      const mod = await vite.ssrLoadModule("/server/index.ts")
      if (typeof mod.default === "function") {
        mod.default(app)
      }
    }
    app.get("*", async (c: any) => {
      const url = c.req.path
      const renderMod = await vite.ssrLoadModule("/.metaving/generated/entry-server.ts")
      const appHtml = await renderMod.render(url)
      const html = await vite.transformIndexHtml(url, renderDevHtml(appHtml))
      return c.html(html)
    })
    return app
  }

  const refreshApp = async () => {
    currentApp = await buildApp()
  }

  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshQueue = refreshQueue.then(refreshApp).catch((error: unknown) => {
        logError(error instanceof Error ? error.message : String(error))
      })
    }, 50)
  }

  const isWatchedFile = (filePath: string) => {
    const resolved = path.resolve(filePath)
    const pagesDir = path.join(root, "app/pages") + path.sep
    const apiDir = path.join(root, "server/routes/api") + path.sep
    if (resolved.startsWith(pagesDir)) return true
    if (resolved.startsWith(apiDir)) return true
    return resolved === path.join(root, "server/index.ts")
  }

  await refreshApp()
  vite.watcher.on("add", (filePath) => {
    if (isWatchedFile(filePath)) scheduleRefresh()
  })
  vite.watcher.on("unlink", (filePath) => {
    if (isWatchedFile(filePath)) scheduleRefresh()
  })
  vite.watcher.on("change", (filePath) => {
    if (isWatchedFile(filePath)) scheduleRefresh()
  })
  const server = http.createServer((req, res) => {
    vite.middlewares(req, res, () => {
      handleHonoRequest(currentApp, req, res).catch((error: unknown) => {
        res.statusCode = 500
        res.end(error instanceof Error ? error.message : "Internal Server Error")
      })
    })
  })
  const port = Number(process.env.PORT ?? 5173)
  server.listen(port, () => {
    logSuccess(`${brand} dev at ${chalk.underline(`http://localhost:${port}`)}`)
  })
}

export const buildProject = async (root: string) => {
  const spinner = ora({ text: `${brand} 构建中`, color: "cyan" }).start()
  try {
    spinner.stopAndPersist({ symbol: chalk.cyan("⠋"), text: `${brand} 构建中` })
    const buildEnv: MetavingConfigEnv = { command: "build", mode: "production" }
    const metavingConfig = await loadMetavingConfig(root, buildEnv)
    ensureMetavingFiles(root, { router: metavingConfig.router })
    const distDir = path.join(root, "dist")
    fs.rmSync(distDir, { recursive: true, force: true })
    const clientEntry = path.join(root, ".metaving/generated/entry-client.ts")
    const serverEntry = path.join(root, ".metaving/generated/server-entry.ts")
    const clientSpinner = ora({ text: `\n${brand} 构建 client`, color: "cyan" }).start()
    const buildBaseConfig: UserConfig = {
      root,
      appType: "custom",
      plugins: getVuePlugins()
    }
    const buildSharedConfig = resolveViteConfig(buildBaseConfig, metavingConfig.vite)
    const clientConfig = mergeConfig(buildSharedConfig, {
      build: {
        outDir: "dist/client",
        manifest: true,
        rollupOptions: {
          input: clientEntry
        }
      }
    })
    await viteBuild(clientConfig)
    clientSpinner.succeed(`${brand} 构建 client 完成`)
    const ssrSpinner = ora({ text: `\n${brand} 构建 ssr`, color: "cyan" }).start()
    const ssrConfig = mergeConfig(buildSharedConfig, {
      build: {
        outDir: "dist/ssr",
        ssr: serverEntry,
        rollupOptions: {
          output: {
            entryFileNames: "server-entry.mjs"
          }
        }
      }
    })
    await viteBuild(ssrConfig)
    ssrSpinner.succeed(`${brand} 构建 ssr 完成`)
    logSuccess(`${brand} build 完成`)
  } catch (error) {
    spinner.fail(`${brand} build 失败`)
    throw error
  }
}

const resolveClientEntry = (manifest: Record<string, any>) => {
  for (const [key, value] of Object.entries(manifest)) {
    if (key.endsWith("entry-client.ts")) return value
  }
  const entries = Object.values(manifest) as any[]
  return entries.find((item) => item?.isEntry && String(item?.src ?? "").endsWith("entry-client.ts")) || null
}

export const startServer = async (root: string) => {
  const serveEnv: MetavingConfigEnv = { command: "serve", mode: "production" }
  const metavingConfig = await loadMetavingConfig(root, serveEnv)
  const clientDir = path.join(root, "dist/client")
  const serverEntry = path.join(root, "dist/ssr/server-entry.mjs")
  if (!fs.existsSync(clientDir) || !fs.existsSync(serverEntry)) {
    logError("未找到构建产物，请先运行 metaving build")
    process.exit(1)
  }
  const manifestCandidates = [path.join(clientDir, ".vite/manifest.json"), path.join(clientDir, "manifest.json")]
  const manifestPath = manifestCandidates.find((candidate) => fs.existsSync(candidate))
  const manifest = manifestPath ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {}
  const clientEntry = resolveClientEntry(manifest)
  const serverMod = await import(pathToFileURL(serverEntry).href)
  const app = new Hono()
  if (typeof serverMod.setupApi === "function") {
    serverMod.setupApi(app)
  }
  app.get("*", async (c: any) => {
    const url = c.req.path
    const appHtml = await serverMod.render(url)
    const html = renderHtml({
      appHtml,
      css: clientEntry?.css ?? [],
      scriptSrc: clientEntry?.file ? `/${clientEntry.file}` : undefined
    })
    return c.html(html)
  })
  const server = http.createServer((req, res) => {
    if (serveStatic(clientDir, req, res, metavingConfig.server.static)) return
    handleHonoRequest(app, req, res).catch((error: unknown) => {
      res.statusCode = 500
      res.end(error instanceof Error ? error.message : "Internal Server Error")
    })
  })
  const port = Number(process.env.PORT ?? 4173)
  server.listen(port, () => {
    logSuccess(`${brand} start at ${chalk.underline(`http://localhost:${port}`)}`)
  })
}

export const showHelp = () => {
  console.log(`${brand} ${chalk.bold("Usage")}: metaving <dev|build|start>`)
  console.log(`${chalk.bold("Commands")}:`)
  console.log(`  ${chalk.cyan("dev")}    启动开发服务`)
  console.log(`  ${chalk.cyan("build")}  构建产物`)
  console.log(`  ${chalk.cyan("start")}  运行构建产物`)
}

export const logCommandWarning = (command: string) => {
  logWarn(`未知命令：${command}`)
}
