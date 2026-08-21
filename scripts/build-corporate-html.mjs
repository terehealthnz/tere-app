// Post-build: emit dist/corporate.html as a copy of dist/index.html with
// tere.co.nz-specific meta tags (title, description, OG, twitter). The
// vercel.json rewrite serves this file for tere.co.nz / requests so a
// link-preview scraper reads the corporate positioning rather than the
// patient-facing terehealth.co.nz meta.
//
// Run automatically after `vite build` via the package.json build script.

import fs from 'node:fs/promises'
import path from 'node:path'

const CORP_TITLE = 'Tere Health Ltd — NZ-built telemedicine platform'
const CORP_DESC  = 'A New Zealand telemedicine platform. Live subtitle translation, vitals estimated from a phone camera, video, prescribing and messaging. Built in NZ, available to integrate.'
const CORP_IMG   = 'https://tere.co.nz/corporate/og-preview.png'
const CORP_URL   = 'https://tere.co.nz'

const distDir = path.resolve('dist')
const srcPath = path.join(distDir, 'index.html')
const outPath = path.join(distDir, 'corporate.html')

let html
try {
  html = await fs.readFile(srcPath, 'utf8')
} catch {
  console.error(`[build-corporate-html] ${srcPath} not found. Run 'vite build' first.`)
  process.exit(0)
}

// Replace only the meta tags we own. Regex is intentionally scoped so a
// future change to index.html that moves these into a template won't
// silently break the corporate copy.
function replaceTagContent(html, tag, attrKV, newContent) {
  const [attr, value] = attrKV
  const rx = new RegExp(`(<${tag}\\s+${attr}="${value}"[^>]*content=")[^"]*(")`, 'i')
  return html.replace(rx, `$1${newContent}$2`)
}

html = html.replace(/<title>[^<]*<\/title>/i, `<title>${CORP_TITLE}</title>`)
html = replaceTagContent(html, 'meta', ['name',     'description'],       CORP_DESC)
html = replaceTagContent(html, 'meta', ['property', 'og:title'],          CORP_TITLE)
html = replaceTagContent(html, 'meta', ['property', 'og:description'],    CORP_DESC)
html = replaceTagContent(html, 'meta', ['property', 'og:image'],          CORP_IMG)
html = replaceTagContent(html, 'meta', ['property', 'og:url'],            CORP_URL)
html = replaceTagContent(html, 'meta', ['name',     'twitter:image'],     CORP_IMG)
html = replaceTagContent(html, 'meta', ['name',     'twitter:title'],     CORP_TITLE)
html = replaceTagContent(html, 'meta', ['name',     'twitter:description'], CORP_DESC)

await fs.writeFile(outPath, html, 'utf8')
console.log(`[build-corporate-html] wrote ${outPath}`)
