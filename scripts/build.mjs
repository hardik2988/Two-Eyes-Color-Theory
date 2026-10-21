import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const steps = [
  ['TypeScript check', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['Vite production build', ['node_modules/vite/bin/vite.js', 'build']],
  ['Bundle-size check', ['scripts/check-size.mjs']],
]

for (const [label, args] of steps) {
  const entry = resolve(process.cwd(), args[0])
  if (!existsSync(entry)) {
    console.error(`${label}: required project file not found: ${entry}`)
    process.exit(1)
  }
  console.log(`\n> ${label}`)
  const result = spawnSync(process.execPath, [entry, ...args.slice(1)], { stdio: 'inherit', cwd: process.cwd() })
  if (result.error) {
    console.error(`${label} failed to start: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}
