// The page's side of the Android app's todo widgets (docs/prd_todo_import_widgets.md §3–4): it
// writes the todos to the app when they change, and on start and each return to the app takes
// what the widgets asked for: text from quick add goes into the Todos tab's Add box (read and
// shown, added on Add), a todo ticked there is done when it was ticked, a tap opens its row.
import { instantsByTodo } from '../../domain/todos.ts'
import { splitSpoken } from '../../domain/todoImport.ts'
import { sanitizeInbox, widgetSnapshot } from '../../domain/todoWidget.ts'
import { formatClockCompact } from '../../domain/format.ts'
import { isList } from '../../domain/todoImport.ts'
import { entities, useEntities } from '../../store/entities.ts'
import { ui } from '../../store/ui.ts'
import * as act from '../../store/actions.ts'
import { TodoWidget } from './todoWidgetPlugin.ts'
import { diag } from './diagLog.ts'

let last = ''

/** Writes the todos for the widgets (skipped when nothing they show changed). */
export async function syncTodoWidget() {
  const { todos, instants } = useEntities.getState()
  const snap = widgetSnapshot(todos ?? [], instantsByTodo(instants), Date.now(), ts => formatClockCompact(ts, false))
  const json = JSON.stringify({ ...snap, written: 0 })
  if (json === last) return
  last = json
  await TodoWidget.setSnapshot({ json: JSON.stringify(snap) })
}

/** Takes what the widgets asked for. */
export async function drainTodoWidget() {
  const inbox = sanitizeInbox((await TodoWidget.drain()).inbox)
  for (const d of inbox.dones) {
    if (entities.getTodo(d.id)?.status === 'open') { diag('done from a widget'); act.doneTodo(d.id, { at: d.at }) }
  }
  if (inbox.adds.length > 0) {
    diag(`quick add (${inbox.adds.length})`)
    const now = Date.now()
    // Several waiting: each one's pieces on lines of their own, so they read as one list.
    const text = inbox.adds.length === 1 ? inbox.adds[0] : inbox.adds.flatMap(a => (isList(a) ? [a] : splitSpoken(a, now))).join('\n')
    act.showTodosTab()
    ui.setTodoDraft(text)
  } else if (inbox.open !== null) {
    if (inbox.open && entities.getTodo(inbox.open)) act.findTodo(inbox.open)
    else act.showTodosTab()
  }
}
