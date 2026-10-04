// Replay a stored validation-scan video through ME-rPPG so we can backfill DL
// HR predictions on historical readings. Our live validation scan now runs ME-
// rPPG in parallel to the classical pipeline, but readings captured before that
// commit (or on devices where the DL track didn't warm up) have null me_rppg_hr.
// Since we save the full MediaRecorder WebM to scan-videos, we can decode those
// blobs offline, run face mesh + 36×36 crop + ME-rPPG, and PATCH the result.
//
// Reuses loadFaceMesh() from rppg.js and MeRppgTracker from meRppg.js — same
// pipeline the live scan uses, so predictions are directly comparable.

import { loadFaceMesh } from './rppg'
import { MeRppgTracker } from './meRppg'

export async function replayVideoThroughMeRppg(videoUrl, onProgress) {
  if (!videoUrl) throw new Error('No videoUrl supplied')

  // Fetch the video to a Blob first then feed it to the <video> element via a
  // blob: URL. If we point video.src directly at the Supabase signed URL the
  // browser caches the response WITHOUT a CORS-safe tag and every subsequent
  // getImageData() silently throws SecurityError — tracker ends up with 0
  // frames and the batch button reports "failed" for most rows. Blob URLs are
  // same-origin, so canvas can never be tainted. Costs one extra network RT
  // and ~1-2 MB of memory per video — fine for sequential batch.
  let blobUrl = null
  try {
    const resp = await fetch(videoUrl, { credentials: 'omit' })
    if (!resp.ok) throw new Error(`fetch ${resp.status} — signed URL expired or 403?`)
    const blob = await resp.blob()
    if (blob.size < 1000) throw new Error(`video too small (${blob.size}B) — upload may have been truncated`)
    blobUrl = URL.createObjectURL(blob)
  } catch (e) {
    throw new Error(`Video fetch failed: ${e?.message || e}`)
  }

  // Hidden video + canvas scaffolding — mimics the live scan layout.
  const video = document.createElement('video')
  video.playsInline = true
  video.muted = true
  video.preload = 'auto'
  video.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none'
  document.body.appendChild(video)

  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none'
  document.body.appendChild(canvas)

  const faceCanvas = document.createElement('canvas')
  faceCanvas.width = 36; faceCanvas.height = 36

  const tracker = new MeRppgTracker()
  const mesh = await loadFaceMesh()
  await tracker.init()

  video.src = blobUrl
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve()
    video.onerror = () => reject(new Error('Video decode failed — codec unsupported by this browser?'))
  })
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const duration = video.duration

  let framesSeen = 0
  let framesFedToTracker = 0

  const processFrame = async (ts) => {
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      await mesh.send({ image: canvas })
      const result = mesh._latest
      if (result?.multiFaceLandmarks?.[0]) {
        const lms = result.multiFaceLandmarks[0]
        let minX=1,minY=1,maxX=0,maxY=0
        for (const l of lms) { if(l.x<minX)minX=l.x; if(l.y<minY)minY=l.y; if(l.x>maxX)maxX=l.x; if(l.y>maxY)maxY=l.y }
        const cw = canvas.width, ch = canvas.height
        let bx = minX*cw, by = minY*ch, bw = (maxX-minX)*cw, bh = (maxY-minY)*ch
        // Same forehead-inclusion expansion as the live hook in rppg.js _tick.
        bh *= 1.2; by -= bh * 0.2 / 1.2
        bx = Math.max(0, Math.round(bx)); by = Math.max(0, Math.round(by))
        bw = Math.min(Math.round(bw), cw - bx); bh = Math.min(Math.round(bh), ch - by)
        if (bw > 20 && bh > 20) {
          const mctx = faceCanvas.getContext('2d')
          mctx.imageSmoothingEnabled = true
          mctx.imageSmoothingQuality = 'high'
          mctx.drawImage(canvas, bx, by, bw, bh, 0, 0, 36, 36)
          const idata = mctx.getImageData(0, 0, 36, 36)
          // ME-rPPG wants real wall-clock timestamps so its internal dt-based
          // state updates are consistent — using video.currentTime*1000 gives
          // dt values matching real-time playback.
          tracker.pushFrame(idata.data, video.currentTime * 1000)
          framesFedToTracker++
        }
      }
      framesSeen++
      if (onProgress && framesSeen % 10 === 0) {
        onProgress(Math.min(100, Math.round((video.currentTime / duration) * 100)))
      }
    } catch (e) { /* swallow single-frame errors — continue the replay */ }
  }

  await video.play()

  await new Promise((resolve) => {
    const supportsRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype
    const tick = async (now, metadata) => {
      await processFrame(metadata?.mediaTime ?? video.currentTime)
      if (video.ended || video.currentTime >= duration - 0.05) { resolve(); return }
      if (supportsRVFC) video.requestVideoFrameCallback(tick)
      else requestAnimationFrame(() => tick(0, null))
    }
    if (supportsRVFC) video.requestVideoFrameCallback(tick)
    else requestAnimationFrame(() => tick(0, null))
    video.onended = () => resolve()
  })

  // Give the tracker's inference workers 1s to flush their queue + 1 final
  // Welch cycle before we read the HR.
  await new Promise(r => setTimeout(r, 1200))
  const summary = tracker.getLatestHR()

  // Cleanup
  video.src = ''
  video.remove()
  canvas.remove()
  faceCanvas.remove()
  tracker.terminate()
  if (blobUrl) URL.revokeObjectURL(blobUrl)

  if (!summary) {
    // Diagnose with real counts so the batch button's failure message is
    // actionable instead of just "failed". Three failure modes:
    //   framesSeen 0           → video decode didn't produce frames (codec/duration)
    //   framesSeen high, Tracker low → face mesh missed the face (lighting / angle)
    //   framesFedToTracker ok but no HR → BVP buffer didn't reach the 300-sample
    //     Welch window (video <10s or scan was mostly motion-rejected)
    const detail = `seen=${framesSeen} face=${framesFedToTracker} dur=${duration?.toFixed(1)}s`
    if (framesSeen === 0) throw new Error(`ME-rPPG failed: video decoded 0 frames (${detail})`)
    if (framesFedToTracker < 150) throw new Error(`ME-rPPG failed: face detected on ${framesFedToTracker} frames only — scan too dark or face off-camera (${detail})`)
    throw new Error(`ME-rPPG failed: tracker didn't produce HR despite ${framesFedToTracker} frames — model warmup incomplete (${detail})`)
  }

  return {
    hr: Math.round(summary.hr),
    confidence: summary.confidence,
    meanErr: Number(summary.meanErr.toFixed(4)),
    framesProcessed: framesFedToTracker,
    bvpSamples: summary.bvpSamples,
  }
}
