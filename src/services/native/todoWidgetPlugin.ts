// The Android app's todo widgets (android/.../TodoWidgetPlugin.java; docs/prd_todo_import_widgets.md).
import { registerPlugin } from '@capacitor/core'

export interface TodoWidgetPlugin {
  /** The todos for the widgets (domain/todoWidget WidgetSnapshot, as JSON); they redraw. */
  setSnapshot(options: { json: string }): Promise<void>
  /** What the widgets asked for since last asked (untrusted shape: sanitizeInbox), and forgets it. */
  drain(): Promise<{ inbox: unknown }>
}

export const TodoWidget = registerPlugin<TodoWidgetPlugin>('TodoWidget')
