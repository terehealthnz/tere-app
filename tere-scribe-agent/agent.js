process.on('uncaughtException', (e) => { console.error('[FATAL uncaughtException]', e); process.exit(2) })
process.on('unhandledRejection', (e) => { console.error('[FATAL unhandledRejection]', e); process.exit(2) })
console.error('[boot] loading agent module')

import { defineAgent, cli, ServerOptions, AutoSubscribe, stt as sttLib } from '@livekit/agents'
import * as deepgram from '@livekit/agents-plugin-deepgram'
import { RoomEvent, AudioStream, TrackKind } from '@livekit/rtc-node'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const SpeechEventType = sttLib.SpeechEventType

function labelFor(identity) {
  if (!identity) return 'Unknown'
  if (identity.startsWith('provider-')) return 'Provider'
  if (identity.startsWith('sip-patient-')) return 'Patient (phone)'
  if (identity.startsWith('patient-')) return 'Patient'
  return identity
}

export default defineAgent({
  entry: async (ctx) => {
    const log = ctx.log ?? console
    const startedAt = Date.now()

    let consultId = null
    try {
      const meta = JSON.parse(ctx.job?.metadata || '{}')
      consultId = meta.consultId || null
    } catch (e) {
      log.warn?.({ err: e }, 'failed to parse job metadata')
    }

    if (!consultId) {
      log.warn?.('no consultId in job metadata; agent is a no-op for this job')
      return
    }

    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY)

    const stt = new deepgram.STT({
      model: 'nova-3-medical',
      language: 'en-NZ',
      keyterm: ['ACC', 'NHI', 'ibuprofen', 'paracetamol', 'amoxicillin', 'fracture', 'laceration', 'sprain', 'contusion', 'hypertension', 'diabetes', 'asthma', 'ankle', 'knee', 'wrist', 'shoulder', 'Tere'],
      smartFormat: true,
      punctuate: true,
      diarize: true,
      numerals: true,
      fillerWords: false,
      interimResults: false,
    })

    const segments = []
    const streamsByTrackSid = new Map()
    const sttEventCounts = new Map()

    console.error(`[diag] agent entry: consultId=${consultId} room=${ctx.room?.name} remoteParticipants=${ctx.room?.remoteParticipants?.size ?? '?'}`)

    ctx.room.on(RoomEvent.ParticipantConnected, (p) => {
      console.error(`[diag] ParticipantConnected: identity=${p.identity} audioTracks=${p.audioTrackPublications?.size ?? 0}`)
    })

    ctx.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      console.error(`[diag] TrackSubscribed: participant=${participant.identity} kind=${track.kind} sid=${publication.sid}`)
      if (track.kind !== TrackKind.KIND_AUDIO) return

      const sttStream = stt.stream()
      streamsByTrackSid.set(publication.sid, sttStream)
      sttEventCounts.set(publication.sid, { interim: 0, final: 0, finalWithText: 0, other: 0 })

      const audioStream = new AudioStream(track, 16000, 1)
      sttStream.updateInputStream(audioStream)
      console.error(`[diag] STT stream wired for sid=${publication.sid} identity=${participant.identity}`)

      ;(async () => {
        try {
          for await (const ev of sttStream) {
            const counts = sttEventCounts.get(publication.sid)
            if (ev.type === SpeechEventType.FINAL_TRANSCRIPT) {
              counts.final++
              const text = ev.alternatives?.[0]?.text?.trim()
              if (text) {
                counts.finalWithText++
                segments.push({
                  participantIdentity: participant.identity,
                  text,
                  at: Date.now(),
                })
                console.error(`[diag] FINAL text sid=${publication.sid}: ${text.slice(0, 60)}`)
              }
            } else if (ev.type === SpeechEventType.INTERIM_TRANSCRIPT) {
              counts.interim++
            } else {
              counts.other++
            }
          }
          console.error(`[diag] STT stream closed normally sid=${publication.sid}`)
        } catch (e) {
          log.error?.({ err: e, trackSid: publication.sid }, 'STT stream errored')
          console.error(`[diag] STT stream errored sid=${publication.sid}: ${e?.message || e}`)
        }
      })()
    })

    ctx.room.on(RoomEvent.TrackUnsubscribed, (_track, publication) => {
      console.error(`[diag] TrackUnsubscribed sid=${publication.sid}`)
      const sttStream = streamsByTrackSid.get(publication.sid)
      if (sttStream) {
        streamsByTrackSid.delete(publication.sid)
        try {
          const p = sttStream.close()
          if (p && typeof p.catch === 'function') p.catch((e) => log.error?.({ err: e }, 'failed to close STT stream on unsubscribe'))
        } catch (e) {
          log.error?.({ err: e }, 'close() threw on unsubscribe')
        }
      }
    })

    ctx.shutdownCallbacks.push(async () => {
      for (const [sid, s] of streamsByTrackSid.entries()) {
        try {
          await s.close()
        } catch (e) {
          log.error?.({ err: e, trackSid: sid }, 'failed to close STT stream at shutdown')
        }
      }
      streamsByTrackSid.clear()

      segments.sort((a, b) => a.at - b.at)
      const fullText = segments
        .map((s) => `[${labelFor(s.participantIdentity)}] ${s.text}`)
        .join('\n')

      if (!fullText) {
        log.info?.({ consultId }, 'no transcript captured; leaving consultations.transcript untouched')
        return
      }

      const supabaseUrl = process.env.SUPABASE_URL
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!supabaseUrl || !supabaseKey) {
        log.error?.({ consultId }, 'missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; cannot persist transcript')
        return
      }

      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })

      const { error } = await supabase
        .from('consultations')
        .update({ transcript: fullText, transcript_source: 'agent' })
        .eq('id', consultId)

      if (error) {
        log.error?.({ err: error, consultId }, 'supabase transcript update failed')
      } else {
        log.info?.({ consultId, chars: fullText.length }, 'transcript persisted')
      }
    })

    ctx.shutdownCallbacks.push(async () => {
      const fullText = segments
        .slice()
        .sort((a, b) => a.at - b.at)
        .map((s) => `[${labelFor(s.participantIdentity)}] ${s.text}`)
        .join('\n')
      log.info?.(
        {
          consultId,
          segments: segments.length,
          chars: fullText.length,
          durationMs: Date.now() - startedAt,
        },
        'scribe agent shutdown summary',
      )
      for (const [sid, counts] of sttEventCounts.entries()) {
        console.error(`[diag] final event counts sid=${sid}: ${JSON.stringify(counts)}`)
      }
      console.error(`[diag] shutdown: subscribedTracks=${streamsByTrackSid.size + sttEventCounts.size - streamsByTrackSid.size} totalStreams=${sttEventCounts.size} segments=${segments.length}`)
    })
  },
})

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: 'tere-scribe',
    // Keep 2 prewarmed job runner subprocesses hot so a dispatched job doesn't
    // have to wait ~20-30s for a cold fork+require. On shared-cpu-2x/1GB a cold
    // runner init was timing out at the default 10s on the first call after
    // deploy, so the agent entered rooms AFTER the provider hung up.
    numIdleProcesses: 2,
    initializeProcessTimeout: 30000,
  }),
)
