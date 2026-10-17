// Saving a file where the user picks (android/app/src/main/java/com/micwalk/timelineclock/FilesPlugin.java):
// the WebView ignores download links, so a backup export goes through Android's "Save to…" picker.
import { registerPlugin } from '@capacitor/core'

export interface FilesPlugin {
  /** Asks where to save, then writes `text` there; `saved` is false when the picker was cancelled. */
  save(options: { name: string; text: string; mimeType: string }): Promise<{ saved: boolean }>
}

export const Files = registerPlugin<FilesPlugin>('Files')
