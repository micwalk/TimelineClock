// Inside the Android app: what Android allows (notifications, alarm sound, exact alarms),
// with what to do about anything that's off. Nothing in a browser.
import { shellStatusItems } from '../../domain/nativeNotifications.ts'
import { useShell } from '../../store/shell.ts'

export function ShellStatus() {
  const status = useShell(s => s.status)
  if (!status) return null
  return (
    <ul className="shell-status" aria-label="Android permissions">
      {shellStatusItems(status).map(item => (
        <li key={item.label} className={item.ok ? 'is-ok' : 'is-off'}>
          <span aria-hidden>{item.ok ? '✓' : '✗'}</span> {item.label}{item.ok ? '' : ' (off)'}
          {item.fix && <div className="shell-status__fix">{item.fix}</div>}
        </li>
      ))}
    </ul>
  )
}
