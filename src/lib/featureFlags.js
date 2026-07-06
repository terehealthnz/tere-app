// Runtime feature flags backed by the Supabase feature_flags table.
//
// Boot flow:
//   1. loadFlags() is called on app mount (main.jsx or top-level component).
//   2. Flags are cached in-memory and persisted to localStorage as a fallback
//      for the case where Supabase is unreachable at next boot.
//   3. Callers use isEnabled(key) or the useFeatureFlag(key) React hook.
//
// Flag semantics:
//   - If provider_allowlist is non-empty, ONLY those provider ids see the
//     feature (regardless of `enabled`). This is how a change ships to prod
//     but only reaches specific staff first — e.g., yourself.
//   - Otherwise, `enabled` boolean decides.
//   - Unknown flags default to false (fail closed).

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const TTL_MS = 60 * 1000
const STORAGE_KEY = 'tere_feature_flags'

let cache = null
let lastFetch = 0
let inflight = null
const subscribers = new Set()

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return new Map(Object.entries(parsed))
  } catch { return null }
}

function writeStorage(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(map)))
  } catch {}
}

/** Force a refresh from Supabase. Returns the flag map. Safe to call repeatedly — de-dupes concurrent calls. */
export async function loadFlags() {
  if (cache && Date.now() - lastFetch < TTL_MS) return cache
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const { data, error } = await supabase.from('feature_flags').select('*')
      if (error) throw error
      const map = new Map((data || []).map(f => [f.key, f]))
      cache = map
      lastFetch = Date.now()
      writeStorage(map)
      subscribers.forEach(fn => { try { fn() } catch {} })
      return map
    } catch (e) {
      // Fall back to localStorage snapshot if we can't reach Supabase.
      if (!cache) cache = readStorage() || new Map()
      return cache
    } finally {
      inflight = null
    }
  })()
  return inflight
}

function providerId() {
  try { return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('providerId') : null }
  catch { return null }
}

function checkFlag(f, pid) {
  if (!f) return false
  if (Array.isArray(f.provider_allowlist) && f.provider_allowlist.length > 0) {
    return !!(pid && f.provider_allowlist.includes(pid))
  }
  return !!f.enabled
}

/** Synchronous check. Returns false if flags haven't been loaded yet. */
export function isEnabled(key, { providerId: pidOverride } = {}) {
  const pid = pidOverride ?? providerId()
  if (cache) return checkFlag(cache.get(key), pid)
  // First-render fallback: use localStorage snapshot so we don't flash the
  // wrong state before loadFlags() resolves.
  const stored = readStorage()
  if (stored) { cache = stored; return checkFlag(stored.get(key), pid) }
  return false
}

/** React hook — subscribes to flag changes. */
export function useFeatureFlag(key) {
  const [enabled, setEnabled] = useState(() => isEnabled(key))
  useEffect(() => {
    let cancelled = false
    const update = () => { if (!cancelled) setEnabled(isEnabled(key)) }
    subscribers.add(update)
    loadFlags().then(update)
    return () => { cancelled = true; subscribers.delete(update) }
  }, [key])
  return enabled
}

/** Explicit refresh (call after admin toggles a flag so UIs update immediately). */
export function invalidateFlags() {
  cache = null
  lastFetch = 0
  return loadFlags()
}
