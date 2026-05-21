// api/transcribe.js — Vercel serverless — Whisper transcription
import formidable from "formidable"
import fs from "fs"
import fetch from "node-fetch"
import FormData from "form-data"

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return res.status(500).json({ error: "OpenAI API key not configured" })
  const form = formidable({ maxFileSize: 25 * 1024 * 1024 })
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ error: err.message })
    const file = Array.isArray(files.file) ? files.file[0] : files.file
    if (!file) return res.status(400).json({ error: "No audio file" })
    try {
      const form = new FormData()
      form.append("file", fs.createReadStream(file.filepath), { filename: "consultation.webm", contentType: file.mimetype })
      form.append("model", "whisper-1")
      form.append("language", "en")
      form.append("prompt", "Medical consultation in New Zealand. ACC, NHI, clinical terms.")
      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, ...form.getHeaders() }, body: form
      })
      if (!r.ok) throw new Error(await r.text())
      const { text } = await r.json()
      fs.unlinkSync(file.filepath)
      res.status(200).json({ text })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })
}
