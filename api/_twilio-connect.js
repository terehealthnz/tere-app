import twilio from 'twilio'
const { VoiceResponse } = twilio.twiml

export default function handler(req, res) {
  const consultationId = req.query.consultationId

  const twiml = new VoiceResponse()

  if (!consultationId) {
    twiml.say('Sorry, there was an error connecting your call. Please wait for the doctor to try again.')
    twiml.hangup()
  } else {
    const dial = twiml.dial()
    dial.conference(`tere-${consultationId}`, {
      startConferenceOnEnter: true,
      endConferenceOnExit: false,
      waitUrl: 'https://twimlets.com/holdmusic?Bucket=com.twilio.music.classical',
    })
  }

  res.setHeader('Content-Type', 'text/xml')
  res.send(twiml.toString())
}
