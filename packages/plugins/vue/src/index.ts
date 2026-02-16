import vue from "@vitejs/plugin-vue"

export const getVuePlugins = () => [vue({})]

export const renderDevHtml = (appHtml: string) =>
  `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="app">${appHtml}</div><script type="module" src="/.metaving/generated/entry-client.ts"></script></body></html>`
