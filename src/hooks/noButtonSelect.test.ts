import { describe, expect, it } from 'vitest'
import { isButtonText } from './noButtonSelect.ts'

describe('isButtonText', () => {
  it('is true for text inside a button or a role=button, false for a box to type in or plain text', () => {
    document.body.innerHTML = '<button><span id="t">10:20a</span></button><div role="button"><input id="i"></div><p id="p">x</p>'
    expect(isButtonText(document.getElementById('t')!.firstChild)).toBe(true)
    expect(isButtonText(document.getElementById('i'))).toBe(false)
    expect(isButtonText(document.getElementById('p'))).toBe(false)
    expect(isButtonText(null)).toBe(false)
  })
})
