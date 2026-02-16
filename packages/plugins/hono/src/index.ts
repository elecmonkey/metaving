import fs from "node:fs"
import path from "node:path"
import type { Hono } from "hono"

const walkDir = (dir: string, entries: string[] = []) => {
  if (!fs.existsSync(dir)) return entries
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      walkDir(fullPath, entries)
      continue
    }
    if (stat.isFile()) entries.push(fullPath)
  }
  return entries
}

const toRoutePath = (baseDir: string, filePath: string) => {
  const relative = path.relative(baseDir, filePath)
  const withoutExt = relative.replace(/\.(ts|js)$/, "")
  const segments = withoutExt.split(path.sep).map((segment) => {
    if (segment === "index") return ""
    return segment.replace(/\[(.+?)\]/g, ":$1")
  })
  const joined = segments.filter((segment) => segment.length > 0).join("/")
  return "/api/" + joined
}

const isApiFile = (filePath: string) => filePath.endsWith(".ts") || filePath.endsWith(".js")

const toModulePath = (root: string, filePath: string) => "/" + path.relative(root, filePath).split(path.sep).join("/")

export type ModuleLoader = (modulePath: string) => Promise<any>

export type ApiRouteRecord = {
  path: string
  modulePath: string
}

export const scanApiRoutes = (root: string): ApiRouteRecord[] => {
  const apiDir = path.join(root, "server/routes/api")
  const files = walkDir(apiDir).filter(isApiFile)
  return files.map((filePath) => ({
    path: toRoutePath(apiDir, filePath),
    modulePath: toModulePath(root, filePath)
  }))
}

export const registerApiRoutes = async (root: string, app: Hono, loadModule: ModuleLoader) => {
  const routes = scanApiRoutes(root)
  for (const route of routes) {
    const urlPath = route.path
    const modulePath = route.modulePath
    const mod = await loadModule(modulePath)
    const handler = mod.default
    if (handler && typeof handler === "object" && "routes" in handler) {
      app.route(urlPath, handler)
      continue
    }
    if (typeof handler === "function") {
      app.all(urlPath, handler)
    }
  }
}

export const handleHonoRequest = async (app: Hono, req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => {
  const origin = `http://${req.headers.host ?? "localhost"}`
  const url = new URL(req.url ?? "/", origin)
  const init: RequestInit = {
    method: req.method,
    headers: req.headers as Record<string, string>
  }
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    init.body = req as unknown as BodyInit
  }
  const response = await app.fetch(new Request(url, init))
  res.statusCode = response.status
  response.headers.forEach((value: string, key: string) => {
    res.setHeader(key, value)
  })
  if (!response.body) {
    res.end()
    return
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  res.end(buffer)
}
