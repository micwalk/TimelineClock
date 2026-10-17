// Saving and reading user files (backups). Browser side effects only, except in the Android app,
// whose WebView ignores download links: there a save goes through Android's "Save to…" picker.
import { isNativeShell } from './nativeShell.ts'

/** How a save went: saved (or handed to the browser), cancelled in the picker, or the Android app is too old to save files. */
export type SaveResult = 'saved' | 'cancelled' | 'update-app'

/** Saves `text` as `fileName`: a download in a browser, Android's file picker in the app. */
export async function saveText(fileName: string, text: string, type = 'application/json'): Promise<SaveResult> {
  if (!isNativeShell()) { downloadText(fileName, text, type); return 'saved' }
  const { Files } = await import('./native/filesPlugin.ts')
  try {
    return (await Files.save({ name: fileName, text, mimeType: type })).saved ? 'saved' : 'cancelled'
  } catch (err) {
    // An app installed before it could save files has no Files plugin.
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'UNIMPLEMENTED') return 'update-app'
    throw err
  }
}

/** Offers `text` as a download named `fileName`. */
export function downloadText(fileName: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Reads a picked file as text (FileReader: works where Blob.text() is missing). */
export function readFileText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'))
    reader.readAsText(file)
  })
}
