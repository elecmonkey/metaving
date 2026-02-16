#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline/promises"
import { downloadTemplate } from "giget"

const args = process.argv.slice(2)
if (args.includes("-h") || args.includes("--help")) {
  console.log("Usage: create-metaving <project-name>")
  process.exit(0)
}

const askProjectName = async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question("项目名称: ")).trim()
  rl.close()
  if (!answer) {
    console.error("项目名称不能为空")
    process.exit(1)
  }
  return answer
}

const resolveProjectName = async () => {
  if (args[0]) return args[0]
  return await askProjectName()
}

const updatePackageName = (dir: string, name: string) => {
  const pkgPath = path.join(dir, "package.json")
  if (!fs.existsSync(pkgPath)) return
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
  pkg.name = name
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8")
}

const cloneTemplate = async (targetDir: string, projectName: string) => {
  const source = "gh:elecmonkey/metaving/playground/basic"
  await downloadTemplate(source, { dir: targetDir })
  updatePackageName(targetDir, projectName)
}

const ensureDir = (dir: string) => {
  fs.mkdirSync(dir, { recursive: true })
}

const isEmptyDir = (dir: string) => {
  if (!fs.existsSync(dir)) return true
  const items = fs.readdirSync(dir)
  return items.length === 0
}

const main = async () => {
  const projectName = await resolveProjectName()
  const targetDir = path.resolve(process.cwd(), projectName)
  if (!isEmptyDir(targetDir)) {
    console.error(`目录非空：${targetDir}`)
    process.exit(1)
  }
  ensureDir(targetDir)
  try {
    await cloneTemplate(targetDir, projectName)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
  console.log(`已创建项目：${projectName}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
