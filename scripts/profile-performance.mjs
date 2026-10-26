import { chromium } from 'playwright'

const targetUrl = process.argv[2] || 'http://localhost:4173'

async function profileUrl(url) {
  console.log(`\n======================================================`)
  console.log(`PROFILING TARGET: ${url}`)
  console.log(`======================================================`)

  const launchArgs = [
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--enable-gpu-rasterization',
    '--enable-zero-copy',
    '--enable-features=Vulkan,DefaultANGLEVulkan',
  ]
  const browser = await chromium.launch({ args: launchArgs }).catch(async () =>
    chromium.launch({ args: launchArgs, channel: 'msedge' }).catch(() =>
      chromium.launch({ args: launchArgs, channel: 'chrome' })
    )
  )

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`   [PAGE ERROR] ${msg.text()}`)
  })
  page.on('pageerror', err => console.log(`   [PAGE EXCEPTION] ${err.message}`))

  console.log('1. Loading application and measuring asset transfer...')
  const startTime = Date.now()
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
      break
    } catch (e) {
      if (attempt === 3) throw e
      console.log(`   Retry ${attempt} connecting to ${url}...`)
      await new Promise(r => setTimeout(r, 2000))
    }
  }
  await page.waitForFunction(
    () => document.querySelector('.screen-boot')?.classList.contains('is-active') === false,
    undefined,
    { timeout: 35000 }
  )
  const bootLoadTime = Date.now() - startTime
  console.log(`   Boot screen cleared in ${bootLoadTime}ms.`)

  // Click Enter the studio
  const enterBtn = page.getByRole('button', { name: 'Enter the studio' })
  await enterBtn.click()
  await page.waitForFunction(() => window.__game?.game?.mode === 'playing', undefined, { timeout: 30000 })
  console.log('2. Entered Studio. Settling scene (3s)...')
  await page.waitForTimeout(3000)

  // Collect network resource stats
  const networkStats = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource')
    let totalTransfer = 0
    let totalDecoded = 0
    const topAssets = []

    for (const r of resources) {
      const size = r.transferSize || r.encodedBodySize || 0
      totalTransfer += size
      totalDecoded += r.decodedBodySize || size
      topAssets.push({
        name: r.name.split('/').pop().split('?')[0],
        type: r.initiatorType,
        sizeKb: (size / 1024).toFixed(1),
        durationMs: r.duration.toFixed(0),
      })
    }

    topAssets.sort((a, b) => parseFloat(b.sizeKb) - parseFloat(a.sizeKb))

    return {
      totalResources: resources.length,
      totalTransferMb: (totalTransfer / (1024 * 1024)).toFixed(2),
      totalDecodedMb: (totalDecoded / (1024 * 1024)).toFixed(2),
      top10Assets: topAssets.slice(0, 10),
    }
  })

  console.log('\n--- NETWORK ASSETS & DOWNLOAD ---')
  console.log(`Total Resources: ${networkStats.totalResources}`)
  console.log(`Total Wire Transfer: ${networkStats.totalTransferMb} MB`)
  console.log(`Total Decoded Size: ${networkStats.totalDecodedMb} MB`)
  console.log('Top Assets by Wire Size:')
  console.table(networkStats.top10Assets)

  // Measure Physics step timing
  const physicsTiming = await page.evaluate(() => {
    const game = window.__game.game
    const physics = game.physics
    const iters = 100
    const t0 = performance.now()
    for (let i = 0; i < iters; i++) {
      physics.step(1 / 60)
    }
    const t1 = performance.now()
    return {
      avgPhysicsMs: ((t1 - t0) / iters).toFixed(3),
    }
  })
  console.log(`\nPhysics Step Cost (Rapier): ${physicsTiming.avgPhysicsMs} ms/step`)

  // Benchmark all 4 presets: Low, Medium, High, Ultra
  const presets = ['low', 'medium', 'high', 'ultra']
  const presetResults = {}

  for (const preset of presets) {
    console.log(`\nTesting Preset: ${preset.toUpperCase()}...`)

    // Apply preset
    await page.evaluate(p => {
      window.__game.game.setQuality(p)
      const save = window.__game.save
      save.update({ quality: p })
    }, preset)

    // Warm up / let shaders compile and pipeline settle
    await page.waitForTimeout(1500)

    // Measure 120 frames in-browser with precision timestamps
    const frameStats = await page.evaluate(async () => {
      const gl = window.__game.game.renderer.gl
      const deltas = []
      let lastTime = performance.now()

      // Enable total draw call accumulation
      gl.info.autoReset = false

      await new Promise(resolve => {
        let count = 0
        const timeout = setTimeout(() => resolve(), 6000) // 6s safety timeout

        function onFrame(now) {
          const dt = now - lastTime
          lastTime = now
          if (count > 0) deltas.push(dt) // ignore first transition frame
          count++
          if (count < 120) {
            requestAnimationFrame(onFrame)
          } else {
            clearTimeout(timeout)
            resolve()
          }
        }
        requestAnimationFrame(onFrame)
      })

      // Count total accumulated calls in one full frame
      gl.info.reset()
      window.__game.game.render(0, 1 / 60)
      const totalCalls = gl.info.render.calls
      const totalTriangles = gl.info.render.triangles
      gl.info.autoReset = true

      deltas.sort((a, b) => a - b)
      const sum = deltas.reduce((acc, v) => acc + v, 0)
      const avgMs = sum / Math.max(1, deltas.length)
      const avgFps = 1000 / Math.max(0.001, avgMs)
      const minMs = deltas[0] || 0
      const maxMs = deltas[deltas.length - 1] || 0
      const p99Index = Math.floor(deltas.length * 0.99)
      const p99Ms = deltas[p99Index] || maxMs
      const onePercentLowFps = 1000 / Math.max(0.001, p99Ms)

      // Renderer info
      const info = gl.info
      const memory = performance.memory
        ? (performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)
        : 'N/A'

      return {
        avgFps: avgFps.toFixed(1),
        onePercentLowFps: onePercentLowFps.toFixed(1),
        avgFrameTimeMs: avgMs.toFixed(2),
        minFrameTimeMs: minMs.toFixed(2),
        maxFrameTimeMs: maxMs.toFixed(2),
        p99FrameTimeMs: p99Ms.toFixed(2),
        totalDrawCalls: totalCalls,
        totalTriangles: totalTriangles,
        textures: info.memory.textures,
        geometries: info.memory.geometries,
        programs: info.programs ? info.programs.length : 'N/A',
        jsHeapMb: memory,
      }
    })

    presetResults[preset] = frameStats
  }

  console.log('\n======================================================')
  console.log(`PERFORMANCE PROFILE SUMMARY (${url})`)
  console.log('======================================================')
  console.table(presetResults)

  await browser.close()
  return { networkStats, presetResults }
}

async function main() {
  await profileUrl(targetUrl)
}

main().catch(err => {
  console.error('Profiling error:', err)
  process.exit(1)
})
