#!/usr/bin/env node
import { buildProject, logCommandWarning, showHelp, startDevServer, startServer } from "@metaving/core"

const args = process.argv.slice(2)
const command = args[0]

const formatError = (error: unknown) => (error instanceof Error ? error.stack ?? error.message : String(error))

const run = async () => {
  if (!command || command === "-h" || command === "--help") {
    showHelp()
    return
  }
  if (command === "dev") {
    await startDevServer(process.cwd())
    return
  }
  if (command === "build") {
    await buildProject(process.cwd())
    return
  }
  if (command === "start" || command === "preview") {
    await startServer(process.cwd())
    return
  }
  logCommandWarning(command)
  process.exit(1)
}

run().catch((error) => {
  console.error(formatError(error))
  process.exit(1)
})
