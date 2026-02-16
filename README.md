# metaving

一个基于 Vite + Vue + Hono 的轻量 SSR 框架，内置文件路由、一体化后端。

## 快速开始

```bash
pnpm --filter @metaving/core build
pnpm --filter @metaving/cli build
pnpm --filter @metaving/playground-basic dev
```

或在业务项目中直接使用：

```bash
pnpm dev
pnpm build
pnpm start
pnpm export
```

## 目录约定

```
app/
  App.vue
  pages/            所有 .vue 会生成路由
  router/
    index.ts        可选自定义路由入口
server/
  index.ts          自定义服务扩展（可选）
  routes/
    api/            API 路由目录
shared/
  utils.ts
.metaving/
  generated/        生成产物
  generated/router.ts  自动路由
```

## 路由规则

- `app/pages` 下所有 `.vue` 文件都会生成路由。
- `index.vue` 会被视为目录路由：`pages/about/index.vue` → `/about`。
- `[id].vue` 会生成动态路由：`pages/user/[id].vue` → `/user/:id`。

## API 路由

`server/routes/api` 下的 `.ts/.js` 文件自动注册为 API。

```
server/routes/api/health.ts  →  /api/health
server/routes/api/user/[id].ts  →  /api/user/:id
```

## 运行流程

- `dev`：Vite middleware + Hono，端口默认 5173。
- `build`：构建 client 与 ssr 产物。
- `start`：运行构建产物，端口默认 4173。
- `export`：静态导出到 dist/export。

## 发布流程

1. 将版本号更新为符合 SemVer 的预发布版本，例如 `1.0.0-alpha.0`。
2. 打标签并推送：`git tag v1.0.0-alpha.0 && git push origin v1.0.0-alpha.0`。
3. GitHub Actions 会根据标签自动选择 npm dist-tag：  
   - `-alpha.x` → `alpha`  
   - `-beta.x` → `beta`  
   - `-rc.x` → `next`  
   - 其他 → `latest`

## 配置

配置文件为 `metaving.config.ts`/`js`/`mjs`/`cjs`，可选；若存在需导出对象。`vite` 字段可选，用于传入 Vite 配置对象或返回 Vite 配置对象的函数。

### 基础结构

```ts
export default {
  vite: {},
  router: {
    custom: false
  },
  server: {
    static: {
      cacheControl: "public, max-age=0, must-revalidate"
    }
  },
  export: {
    routes: ["/", "/about", "/user/1"]
  }
}
```

### vite

```ts
export default {
  vite: (env) => ({})
}
```

### router.custom

- 是否启用 `app/router/index.ts` 作为路由入口，默认 `false`，不启用时仅使用文件路由。

### server.static.cacheControl

支持字符串或函数：

```ts
export default {
  vite: {},
  server: {
    static: {
      cacheControl: ({ filePath, ext, isHashed }) => {
        if (isHashed) return "public, max-age=31536000, immutable"
        if (ext === "html") return "public, max-age=0, must-revalidate"
        return "public, max-age=3600"
      }
    }
  }
}
```

### export.routes

静态导出时额外指定要生成的路由列表，用于补充动态路由或特殊页面：

```ts
export default {
  export: {
    routes: ["/user/1", "/user/2"]
  }
}
```
