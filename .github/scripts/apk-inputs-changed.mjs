// Did anything that goes into the Android APK change between two commits? Prints "apk=true" or
// "apk=false" (for $GITHUB_OUTPUT), so .github/workflows/android.yml builds only when it did.
//
// The APK is the native project, the offline page, the Capacitor config and plugins, and the
// version (versionName / versionCode come from package.json). Web code isn't in it: the app
// loads the live site. Anything we can't compare (a first push, a force push) counts as changed.
//
// Usage: node .github/scripts/apk-inputs-changed.mjs <from-sha> <to-sha>
import { execFileSync } from 'node:child_process'

const [from, to] = process.argv.slice(2)
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const say = (changed, why) => {
  console.error(`APK inputs ${changed ? 'changed' : 'unchanged'}: ${why}`)
  console.log(`apk=${changed}`)
  process.exit(0)
}

const known = sha => {
  if (!sha || /^0+$/.test(sha)) return false
  try { git('cat-file', '-e', `${sha}^{commit}`); return true } catch { return false }
}
if (!known(from) || !known(to)) say(true, `can't compare ${from || '(none)'}..${to || '(none)'}`)

const NATIVE = [
  /^android\//,
  /^android-offline\//,
  /^capacitor\.config\.ts$/,
  /^\.github\/workflows\/android\.yml$/,
  /^\.github\/actions\/android-setup\//,
  /^\.github\/scripts\/apk-inputs-changed\.mjs$/,
]
const files = git('diff', '--name-only', from, to).split('\n').filter(Boolean)
const native = files.find(f => NATIVE.some(re => re.test(f)))
if (native) say(true, native)

const json = (sha, path) => {
  try { return JSON.parse(git('show', `${sha}:${path}`)) } catch { return null }
}
const capacitor = name => /capacitor/i.test(name)
const pick = (obj, keep) => Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => keep(k)).sort(([a], [b]) => a.localeCompare(b)))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

if (files.includes('package.json')) {
  const [a, b] = [json(from, 'package.json'), json(to, 'package.json')]
  if (a?.version !== b?.version) say(true, `version ${a?.version} → ${b?.version}`)
  for (const field of ['dependencies', 'devDependencies']) {
    if (!same(pick(a?.[field], capacitor), pick(b?.[field], capacitor))) say(true, `Capacitor ${field} in package.json`)
  }
}
if (files.includes('package-lock.json')) {
  const [a, b] = [json(from, 'package-lock.json'), json(to, 'package-lock.json')]
  const plugins = lock => pick(lock?.packages, k => k.startsWith('node_modules/') && capacitor(k))
  if (!same(plugins(a), plugins(b))) say(true, 'Capacitor packages in package-lock.json')
}
say(false, files.length ? `${files.length} file(s), none in the APK` : 'no files')
