import type { Hono } from "hono"

const setupServer = (app: Hono) => {
  app.get("/api/ping", (c: any) => c.json({ ok: true }))
}

export default setupServer
