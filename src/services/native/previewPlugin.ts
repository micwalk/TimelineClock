// TC Preview only (android/app/src/main/java/com/micwalk/timelineclock/PreviewPlugin.java): opens
// the "Which preview?" dialog from Settings, as the launcher shortcut does.
import { registerPlugin } from '@capacitor/core'

export interface PreviewPlugin {
  choose(): Promise<void>
}

export const Preview = registerPlugin<PreviewPlugin>('Preview')
