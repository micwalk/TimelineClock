// Repeating todos pass when their series' next occurrence arrives (domain/todos passedTodos,
// store/actions passTodos): checked on start, then at the next moment one can pass, and again
// whenever the data changes. Sleeps at most an hour, so a clock change or a long sleep is caught.
import { HOUR } from '../domain/time.ts'
import { nextPassTime } from '../domain/todos.ts'
import { storedInstants } from '../domain/entities.ts'
import { passTodos } from '../store/actions.ts'
import { useEntities } from '../store/entities.ts'

let started = false
let timer: ReturnType<typeof setTimeout> | null = null

function check() {
  passTodos()
  if (timer) clearTimeout(timer)
  const now = Date.now()
  const { todos, instants } = useEntities.getState()
  const next = nextPassTime(todos ?? [], storedInstants(instants), now)
  const wait = next === null ? HOUR : Math.min(HOUR, Math.max(1000, next - now + 50))
  timer = setTimeout(check, wait)
}

export function startTodoSync() {
  if (started) return
  started = true
  check()
  let pending = false
  useEntities.subscribe((s, prev) => {
    if ((s.todos === prev.todos && s.instants === prev.instants) || pending) return
    pending = true
    // After the change that triggered it has settled (one check per burst of changes).
    queueMicrotask(() => { pending = false; check() })
  })
}
