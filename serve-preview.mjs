import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('./dist/', import.meta.url)))
const host = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? 4173)
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
}

if (!existsSync(root)) {
  console.error('Missing dist/. Run `pnpm build` before using this preview server.')
  process.exit(1)
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end()
    return
  }
  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname)
  } catch {
    response.writeHead(400).end('Bad request')
    return
  }
  const requestPath = pathname.split('/').filter(Boolean).join(sep) || 'index.html'
  const file = resolve(root, requestPath)
  const rel = relative(root, file)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    response.writeHead(403).end('Forbidden')
    return
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
    return
  }
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': statSync(file).size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  })
  if (request.method === 'HEAD') response.end()
  else createReadStream(file).pipe(response)
})

server.listen(port, host, () => console.log(`Two Eyes Stage 3: http://${host}:${port}/`))
