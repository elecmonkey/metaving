import fs from "node:fs"
import path from "node:path"
import { unrun } from "unrun"

export type MetavingConfigEnv = {
  command: "serve" | "build"
  mode: string
}

export type MetavingUserConfig = Record<string, any>

export type MetavingRouterConfig = {
  custom?: boolean
}

export type MetavingStaticConfig = {
  cacheControl?: string | ((context: { filePath: string; ext: string; isHashed: boolean }) => string | undefined)
}

export type MetavingServerConfig = {
  static?: MetavingStaticConfig
}

export type MetavingConfig = {
  vite?: MetavingUserConfig | ((env: MetavingConfigEnv) => MetavingUserConfig | Promise<MetavingUserConfig>)
  router?: MetavingRouterConfig
  server?: MetavingServerConfig
}

export type LoadedMetavingConfig = {
  vite: MetavingUserConfig | null
  router: MetavingRouterConfig
  server: MetavingServerConfig
}

const configCandidates = [
  "metaving.config.ts",
  "metaving.config.mts",
  "metaving.config.cts",
  "metaving.config.js",
  "metaving.config.mjs",
  "metaving.config.cjs"
]

const resolveConfigPath = (root: string) => {
  for (const candidate of configCandidates) {
    const fullPath = path.join(root, candidate)
    if (fs.existsSync(fullPath)) return fullPath
  }
  return null
}

const isPlainObject = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const formatConfigPath = (segments: string[]) => (segments.length ? segments.join(".") : "config")

const throwConfigError = (segments: string[], message: string): never => {
  const error = new Error(`[metaving.config] ${formatConfigPath(segments)} ${message}`)
  throw error
}

const resolveViteConfigValue = async (
  configValue: unknown,
  env: MetavingConfigEnv,
  pathSegments: string[]
): Promise<MetavingUserConfig | null> => {
  if (configValue === undefined || configValue === null) {
    return null
  }
  if (typeof configValue === "function") {
    const resolved = await (configValue as (env: MetavingConfigEnv) => any)(env)
    if (!isPlainObject(resolved)) {
      throwConfigError(pathSegments, "必须返回对象")
    }
    return resolved
  }
  if (!isPlainObject(configValue)) {
    throwConfigError(pathSegments, "必须是对象或函数")
  }
  return configValue as MetavingUserConfig
}

export const loadMetavingConfig = async (root: string, env: MetavingConfigEnv): Promise<LoadedMetavingConfig> => {
  const configPath = resolveConfigPath(root)
  if (!configPath) {
    return { vite: null, router: {}, server: {} }
  }
  const { module } = await unrun({ path: configPath })
  const rawConfig = (module as any)?.default ?? module
  const resolvedConfig = typeof rawConfig === "function" ? await rawConfig(env) : rawConfig
  if (resolvedConfig === undefined || resolvedConfig === null) {
    throwConfigError([], "必须导出对象")
  }
  if (!isPlainObject(resolvedConfig)) {
    throwConfigError([], "必须导出对象")
  }
  const allowedKeys = new Set(["vite", "router", "server"])
  for (const key of Object.keys(resolvedConfig)) {
    if (!allowedKeys.has(key)) {
      throwConfigError([key], "不是允许的配置项")
    }
  }
  const routerValue = (resolvedConfig as MetavingConfig).router
  const serverValue = (resolvedConfig as MetavingConfig).server
  const viteValue = (resolvedConfig as MetavingConfig).vite
  const router: MetavingRouterConfig = {}
  const server: MetavingServerConfig = {}
  if (routerValue !== undefined) {
    if (!isPlainObject(routerValue)) {
      throwConfigError(["router"], "必须是对象")
    }
    if ("custom" in routerValue && typeof routerValue.custom !== "boolean") {
      throwConfigError(["router", "custom"], "必须是布尔值")
    }
    router.custom = (routerValue as MetavingRouterConfig).custom
  }
  if (serverValue !== undefined) {
    if (!isPlainObject(serverValue)) {
      throwConfigError(["server"], "必须是对象")
    }
    const staticValue = (serverValue as MetavingServerConfig).static
    if (staticValue !== undefined) {
      if (!isPlainObject(staticValue)) {
        throwConfigError(["server", "static"], "必须是对象")
      }
      const cacheControl = (staticValue as MetavingStaticConfig).cacheControl
      if (cacheControl !== undefined && typeof cacheControl !== "string" && typeof cacheControl !== "function") {
        throwConfigError(["server", "static", "cacheControl"], "必须是字符串或函数")
      }
      server.static = { cacheControl }
    }
  }
  const vite = await resolveViteConfigValue(viteValue, env, ["vite"])
  return { vite, router, server }
}
