import twilio from 'twilio'
const { VoiceResponse } = twilio.twiml

export default function handler(req, res) {
  const twiml = new VoiceResponse()
  twiml.say('Sorry, we were unable to connect your call. Your doctor will try again shortly.')
  twiml.hangup()
  res.setHeader('Content-Type', 'text/xml')
  res.send(twiml.toString())
}
