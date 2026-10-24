import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'

const PUBLIC_DIR = path.resolve(process.cwd(), 'public')
const MODELS_DIR = path.join(PUBLIC_DIR, 'models')
const TEXTURES_DIR = path.join(PUBLIC_DIR, 'textures')
const ENV_DIR = path.join(PUBLIC_DIR, 'environments')

fs.mkdirSync(MODELS_DIR, { recursive: true })
fs.mkdirSync(TEXTURES_DIR, { recursive: true })
fs.mkdirSync(ENV_DIR, { recursive: true })

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log(`[skip] Already exists: ${dest}`);
      return resolve(dest)
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const file = fs.createWriteStream(dest)
    const req = https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlinkSync(dest)
        return reject(new Error(`Failed to download ${url}: status ${res.statusCode}`))
      }
      res.pipe(file)
      file.on('finish', () => {
        file.close(() => {
          console.log(`[done] Downloaded: ${path.basename(dest)} (${(fs.statSync(dest).size / 1024).toFixed(1)} KB)`)
          resolve(dest)
        })
      })
    })
    req.on('error', err => {
      fs.unlink(dest, () => {})
      reject(err)
    })
  })
}

async function downloadModel(assetId) {
  console.log(`Fetching metadata for model: ${assetId}...`)
  const metaUrl = `https://api.polyhaven.com/files/${assetId}`
  const res = await fetch(metaUrl).then(r => r.json())
  if (!res.gltf || !res.gltf['1k']) {
    throw new Error(`No 1k gltf for ${assetId}`)
  }
  const gltfInfo = res.gltf['1k'].gltf
  const targetDir = path.join(MODELS_DIR, assetId)
  fs.mkdirSync(targetDir, { recursive: true })

  // Download main gltf
  const gltfFileName = `${assetId}_1k.gltf`
  await downloadFile(gltfInfo.url, path.join(targetDir, gltfFileName))

  // Download includes (bin & textures)
  for (const [relPath, incInfo] of Object.entries(gltfInfo.include)) {
    const destPath = path.join(targetDir, relPath)
    await downloadFile(incInfo.url, destPath)
  }
  console.log(`✓ Completed model: ${assetId}`)
}

async function downloadFloorTextures() {
  console.log('Downloading oak_wood_planks 1k textures...')
  const targetDir = path.join(TEXTURES_DIR, 'oak_wood_planks')
  fs.mkdirSync(targetDir, { recursive: true })
  const urls = {
    'oak_wood_planks_diff_1k.jpg': 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/oak_wood_planks/oak_wood_planks_diff_1k.jpg',
    'oak_wood_planks_nor_gl_1k.jpg': 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/oak_wood_planks/oak_wood_planks_nor_gl_1k.jpg',
    'oak_wood_planks_rough_1k.jpg': 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/oak_wood_planks/oak_wood_planks_rough_1k.jpg',
  }
  for (const [filename, url] of Object.entries(urls)) {
    await downloadFile(url, path.join(targetDir, filename))
  }
  console.log('✓ Completed floor textures')
}

async function downloadHdri2k() {
  console.log('Downloading studio_small_08_2k.hdr...')
  const dest = path.join(ENV_DIR, 'studio_small_08_2k.hdr')
  await downloadFile('https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/studio_small_08_2k.hdr', dest)
  console.log('✓ Completed 2K HDRI')
}

async function main() {
  const models = [
    'cardboard_box_01',
    'marble_bust_01',
    'potted_plant_01',
    'potted_plant_04',
    'wooden_table_02',
    'wooden_stool_01',
    'wooden_bookshelf_worn',
    'painted_wooden_bench',
  ]

  for (const id of models) {
    try {
      await downloadModel(id)
    } catch (e) {
      console.error(`Error downloading model ${id}:`, e.message)
    }
  }

  await downloadFloorTextures()
  await downloadHdri2k()

  console.log('\nAll assets downloaded successfully!')
}

main().catch(console.error)
