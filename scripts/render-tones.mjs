// Renders the bundled alarm sounds (src/services/tones.ts) to the Android app's channel sounds,
// android/app/src/main/res/raw/tone_1.ogg … tone_4.ogg and chime.ogg, so the app's tones sound
// the same as the web app's. Run it after changing a preset:
//
//   node scripts/render-tones.mjs
//
// Needs Microsoft Edge (or Chrome: set BROWSER) and ffmpeg on the PATH (or set FFMPEG). The
// presets are bundled with esbuild and rendered in the headless browser (driven over the DevTools
// protocol) with an OfflineAudioContext; a tone is one pass (Android loops it while it rings), the chime plays once.
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'

const BROWSER = process.env.BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
const RATE = 44100
const OUT = 'android/app/src/main/res/raw'
const FILES = { tone1: 'tone_1', tone2: 'tone_2', tone3: 'tone_3', tone4: 'tone_4', chime: 'chime' }

const dir = mkdtempSync(join(tmpdir(), 'tc-tones-'))
const bundle = await build({ entryPoints: ['src/services/tones.ts'], bundle: true, format: 'iife', globalName: 'Tones', write: false })
const page = `<!doctype html><meta charset="utf-8"><script>${bundle.outputFiles[0].text}</script><script>
const RATE = ${RATE}
function wav(buf) {
  const data = buf.getChannelData(0)
  const view = new DataView(new ArrayBuffer(44 + data.length * 2))
  const str = (o, s) => [...s].forEach((ch, k) => view.setUint8(o + k, ch.charCodeAt(0)))
  str(0, 'RIFF'); view.setUint32(4, 36 + data.length * 2, true); str(8, 'WAVEfmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, RATE, true); view.setUint32(28, RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  str(36, 'data'); view.setUint32(40, data.length * 2, true)
  data.forEach((x, k) => view.setInt16(44 + k * 2, Math.max(-1, Math.min(1, x)) * 0x7fff, true))
  let bin = ''
  const bytes = new Uint8Array(view.buffer)
  for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000))
  return btoa(bin)
}
async function renderAll() {
  const out = {}
  for (const [sound, preset] of Object.entries(Tones.TONE_PRESETS)) {
    const ctx = new OfflineAudioContext(1, Math.ceil(preset.cycle * RATE), RATE)
    const gain = ctx.createGain()
    gain.gain.value = 0.8
    gain.connect(ctx.destination)
    preset.play(ctx, gain, 0.01)
    out[sound] = wav(await ctx.startRendering())
  }
  return JSON.stringify(out)
}
</script>`
writeFileSync(join(dir, 'tones.html'), page)

// The browser, driven over the DevTools protocol (Node's own WebSocket): load the page, await the render.
const PORT = 9335
const browser = spawn(BROWSER, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(dir, 'profile')}`, `file:///${join(dir, 'tones.html').replace(/\\/g, '/')}`], { stdio: 'ignore' })
let target
for (let k = 0; k < 50 && !target; k++) {
  await new Promise(r => setTimeout(r, 200))
  target = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()).then(l => l.find(t => t.type === 'page')).catch(() => undefined)
}
if (!target) throw new Error('The browser did not start')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail })
const reply = await new Promise(ok => {
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id === 1) ok(m) }
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'renderAll()', awaitPromise: true, returnByValue: true } }))
})
ws.close()
browser.kill()
if (!reply.result?.result?.value) throw new Error(`The browser rendered nothing: ${JSON.stringify(reply).slice(0, 300)}`)
const rendered = JSON.parse(reply.result.result.value)
for (const [sound, file] of Object.entries(FILES)) {
  const wavPath = join(dir, `${file}.wav`)
  writeFileSync(wavPath, Buffer.from(rendered[sound], 'base64'))
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', wavPath, '-c:a', 'libvorbis', '-q:a', '5', join(OUT, `${file}.ogg`)])
  console.log(`${OUT}/${file}.ogg`, readFileSync(join(OUT, `${file}.ogg`)).length, 'bytes')
}
