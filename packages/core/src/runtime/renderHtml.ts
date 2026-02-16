export type RenderHtmlOptions = {
  appHtml: string
  css?: string[]
  scriptSrc?: string
}

export const renderHtml = ({ appHtml, css = [], scriptSrc }: RenderHtmlOptions) => {
  const cssLinks = css.map((href) => `<link rel="stylesheet" href="/${href}">`).join("")
  const scriptTag = scriptSrc ? `<script type="module" src="${scriptSrc}"></script>` : ""
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />${cssLinks}</head><body><div id="app">${appHtml}</div>${scriptTag}</body></html>`
}
