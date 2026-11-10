// NZF formulary lazy-loader. Split across two bundles so first paint of the
// prescribe modal is cheap:
//
//   nzf-names.json    (~216 KB, 1106 entries): name + preparations
//     Loaded on PrescribeModal mount — needed for autocomplete + the
//     strength/form picker.
//   nzf-details.json  (~443 KB,  450 entries): indications + dose
//     Loaded lazily — needed only for the dosing monograph card. Pre-warm
//     on provider entry into a call (ProviderConsult mount) so that by
//     the time the provider opens PrescribeModal mid-consult the bundle
//     is already warm. Falls back to first-keystroke trigger inside the
//     modal if the provider skips the call (re-issue flow, countersign).
//
// Singletons live at module scope so every importer sees the same cache.
// Vite + the browser module registry will dedupe the dynamic import even
// if multiple call sites race.

export let NZF_NAMES = null
export let NZF_INDEX = null
export let NZF_DETAILS = null
let _nzfNamesPromise = null
let _nzfDetailsPromise = null

export function loadNzfNamesOnce() {
  if (NZF_NAMES) return Promise.resolve(NZF_NAMES)
  if (_nzfNamesPromise) return _nzfNamesPromise
  _nzfNamesPromise = import('./nzf-names.json').then(m => {
    NZF_NAMES = m.default
    NZF_INDEX = new Map(NZF_NAMES.map(e => [e.name, e]))
    return NZF_NAMES
  })
  return _nzfNamesPromise
}

export function loadNzfDetailsOnce() {
  if (NZF_DETAILS) return Promise.resolve(NZF_DETAILS)
  if (_nzfDetailsPromise) return _nzfDetailsPromise
  _nzfDetailsPromise = import('./nzf-details.json').then(m => {
    NZF_DETAILS = m.default
    return NZF_DETAILS
  })
  return _nzfDetailsPromise
}

// Returns a merged view: name + preparations always, indications + dose
// present once details have loaded for that drug.
export function findNzfEntry(medicationText) {
  if (!medicationText || !NZF_INDEX) return null
  const key = medicationText.toLowerCase().trim().split(/\s+/)[0]  // "Ibuprofen 400mg" → "ibuprofen"
  const base = NZF_INDEX.get(key)
  if (!base) return null
  const detail = NZF_DETAILS ? NZF_DETAILS[key] : null
  return detail ? { ...base, ...detail } : base
}
