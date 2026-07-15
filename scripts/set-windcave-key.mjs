#!/usr/bin/env node
// Reads the Windcave API key from the macOS clipboard and pastes it into
// .env.local, replacing the REPLACE_ME placeholder. Then prints a masked
// confirmation.

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const envPath = join(process.cwd(), '.env.local')
const contents = readFileSync(envPath, 'utf8')

let key
try {
  key = execSync('pbpaste', { encoding: 'utf8' }).trim()
} catch (e) {
  console.error('❌ Could not read clipboard. Copy the API key first (Cmd+C on the value in Vercel).')
  process.exit(1)
}

if (!key || key.length < 10) {
  console.error('❌ Clipboard is empty or too short. Copy the API key from Vercel and try again.')
  process.exit(1)
}

if (!contents.includes('REPLACE_ME')) {
  console.error('❌ No REPLACE_ME placeholder found in .env.local — maybe already replaced?')
  console.error('   Current WINDCAVE_API_KEY line:')
  const m = contents.match(/WINDCAVE_API_KEY=(.*)/)
  console.error('   ' + (m ? m[0].slice(0, 25) + '…' : '(not found)'))
  process.exit(1)
}

const next = contents.replace('REPLACE_ME', key)
writeFileSync(envPath, next)

console.log('✅ WINDCAVE_API_KEY set (' + key.length + ' chars, starts with ' + key.slice(0, 4) + '…)')
