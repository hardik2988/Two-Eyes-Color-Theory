import { chromium } from 'playwright'

async function run() {
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-webgl'] }).catch(async () =>
    chromium.launch({ channel: 'msedge' })
  )
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto('http://localhost:4173')
  await page.waitForFunction(() => document.querySelector('.screen-boot')?.classList.contains('is-active') === false, undefined, { timeout: 35000 })
  await page.getByRole('button', { name: 'Enter the studio' }).click()
  await page.waitForFunction(() => window.__game?.game?.mode === 'playing', undefined, { timeout: 30000 })
  await page.waitForTimeout(2000)

  const analysis = await page.evaluate(() => {
    const scene = window.__game.game.world.scene
    const meshStats = []
    let totalMeshes = 0
    let totalShadowCasters = 0
    let totalShadowReceivers = 0
    let totalTris = 0

    scene.traverse(obj => {
      if (obj.isMesh) {
        totalMeshes++
        if (obj.castShadow) totalShadowCasters++
        if (obj.receiveShadow) totalShadowReceivers++
        const tris = obj.geometry.index
          ? obj.geometry.index.count / 3
          : (obj.geometry.attributes.position ? obj.geometry.attributes.position.count / 3 : 0)
        totalTris += tris

        meshStats.push({
          name: obj.name || obj.parent?.name || 'unnamed',
          parent: obj.parent?.name || 'scene',
          tris: Math.round(tris),
          material: Array.isArray(obj.material) ? 'MultiMaterial' : obj.material.type,
          castShadow: obj.castShadow,
          receiveShadow: obj.receiveShadow,
        })
      }
    })

    meshStats.sort((a, b) => b.tris - a.tris)

    // Also group by name pattern
    const groups = {}
    for (const m of meshStats) {
      const key = m.name.replace(/[-_]\d+$/, '').replace(/\d+$/, '')
      if (!groups[key]) groups[key] = { count: 0, totalTris: 0, shadowCasters: 0 }
      groups[key].count++
      groups[key].totalTris += m.tris
      if (m.castShadow) groups[key].shadowCasters++
    }

    const groupList = Object.entries(groups).map(([name, data]) => ({
      name,
      count: data.count,
      totalTris: data.totalTris,
      shadowCasters: data.shadowCasters,
    }))
    groupList.sort((a, b) => b.totalTris - a.totalTris)

    return {
      totalMeshes,
      totalShadowCasters,
      totalShadowReceivers,
      totalTris,
      top25MeshesByTriangles: meshStats.slice(0, 25),
      topGroups: groupList.slice(0, 25),
    }
  })

  console.log(`Total Meshes: ${analysis.totalMeshes}`)
  console.log(`Total Shadow Casters: ${analysis.totalShadowCasters}`)
  console.log(`Total Shadow Receivers: ${analysis.totalShadowReceivers}`)
  console.log(`Total Triangles: ${analysis.totalTris.toLocaleString()}`)
  console.log('\n--- TOP GROUPS BY TRIANGLE COUNT ---')
  console.table(analysis.topGroups)
  console.log('\n--- TOP 25 INDIVIDUAL MESHES BY TRIANGLES ---')
  console.table(analysis.top25MeshesByTriangles)

  await browser.close()
}

run().catch(console.error)
