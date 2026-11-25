// A pasted list or dictation, read (docs/prd_todo_import_widgets.md §1–2; domain/todoImport):
// a row per todo it found, each ticked to add, its text editable (read again as you type), and
// what it read under it ("Tomorrow 3:00p · ⏱ 20m · ⟳ daily", "done"). Nothing is made until
// Add N todos (act.addTodoRows).
import { TODO_UI } from '../../config/labels.ts'
import type { useImportRows } from '../../hooks/useImportRows.ts'
import { rowReading } from '../../hooks/useImportRows.ts'

export function TodoImportPreview({ state, onAdd, onCancel }: {
  state: ReturnType<typeof useImportRows>
  onAdd: () => void
  onCancel: () => void
}) {
  const now = Date.now()
  const { shown, off, chosen } = state
  return (
    <div className="todo-import" role="group" aria-label={TODO_UI.importCount(shown.length)}>
      {shown.map(r => (
        <div key={r.key} className={`todo-import__row${off.has(r.key) ? ' is-off' : ''}`}>
          <input type="checkbox" className="todo-import__tick" checked={!off.has(r.key)} aria-label={TODO_UI.importInclude(r.label || r.source)}
            onChange={() => state.toggle(r.key)} />
          <input className="todo-import__text" value={r.source} aria-label={TODO_UI.importEdit} autoComplete="off"
            onChange={e => state.edit(r.key, e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); onAdd() } if (e.key === 'Escape') onCancel() }} />
          <span className={`todo-import__read${r.done ? ' is-done' : ''}`}>
            {r.label !== r.source ? <b>{r.label}</b> : null}{r.label !== r.source && rowReading(r, now) ? ' · ' : ''}{rowReading(r, now)}
          </span>
        </div>
      ))}
      <div className="todo-import__foot">
        <button type="button" className="alarm-link todo-import__add glow-box" disabled={chosen.length === 0} onClick={onAdd}>{TODO_UI.importAdd(chosen.length)}</button>
        <button type="button" className="alarm-link glow-box" onClick={onCancel}>{TODO_UI.importCancel}</button>
      </div>
    </div>
  )
}
