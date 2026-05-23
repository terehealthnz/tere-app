import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pub = resolve(__dirname, '../public')

function convert(srcFile, destFile, opts = {}) {
  const svg = readFileSync(srcFile, 'utf8')
  const resvg = new Resvg(svg, opts)
  writeFileSync(destFile, resvg.render().asPng())
  console.log(`✓ ${destFile.replace(pub + '/', 'public/')}`)
}

// Logo at 512×512
convert(
  `${pub}/tere-logo.svg`,
  `${pub}/tere-logo.png`,
  { fitTo: { mode: 'width', value: 512 } }
)

// OG preview at exact SVG intrinsic size (1200×630)
convert(
  `${pub}/tere-preview.svg`,
  `${pub}/tere-preview.png`
)

console.log('Done.')
