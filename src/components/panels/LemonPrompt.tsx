// "Are you a sour lemon?" (the lemon log, domain/lemons): asked after you put words on the
// timeline; Yes or No is kept with what you wrote. A card at the top of the screen that never
// blocks what you are doing; × or Escape closes it without an answer.
import { useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/20/solid'
import { lemons, useLemons } from '../../store/lemons.ts'

export function LemonPrompt() {
  const asking = useLemons(s => s.asking)
  useEffect(() => {
    if (!asking) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') lemons.dismiss() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [asking])
  if (!asking) return null
  return (
    <div className="lemon-prompt glow-box" role="dialog" aria-label="Are you a sour lemon?">
      <button type="button" className="lemon-prompt__close" aria-label="Close without answering" onClick={lemons.dismiss}><XMarkIcon aria-hidden /></button>
      <div className="lemon-prompt__q">Are you a sour lemon? <span aria-hidden>🍋</span></div>
      <div className="lemon-prompt__about">after “{asking.text}”</div>
      <div className="lemon-prompt__answers">
        <button type="button" className="lemon-prompt__yes glow-box" onClick={() => lemons.answer(true)}>Yes 🍋</button>
        <button type="button" className="lemon-prompt__no glow-box" onClick={() => lemons.answer(false)}>No 😊</button>
      </div>
    </div>
  )
}
