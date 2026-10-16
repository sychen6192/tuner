import { t, type MessageKey } from '../i18n'

/** Toasts hold message keys, not text, so they follow a language switch while shown. */
export interface ToastAction {
  label: MessageKey
  run: () => void
}

interface Toast {
  message: MessageKey
  action?: ToastAction
  vars?: Record<string, string | number>
}

const region = document.getElementById('toast-region')!
const toast = document.getElementById('toast')!
const text = document.getElementById('toast-text')!
const actionButton = document.getElementById('toast-action') as HTMLButtonElement
const closeButton = document.getElementById('toast-close') as HTMLButtonElement

/**
 * Toasts with an action (e.g. "Reload" for an update) and problems (the microphone was refused)
 * stay until used or dismissed, and are never lost: a newer one shows on top and the older one
 * returns afterwards. A plain message shows over them for a while, longer the longer it is, and
 * never hides while the pointer or focus is on it.
 *
 * The polite live region (#toast-region) is always in the page; only the card inside it hides,
 * so screen readers announce a toast when its text arrives.
 */
const persistent: Toast[] = []
let transient: Toast | null = null
let hideTimer: number | undefined
let hideAt = 0
let held = false

closeButton.addEventListener('click', () => {
  if (transient) clearTransient()
  else persistent.pop()
  render()
})
actionButton.addEventListener('click', () => {
  const top = persistent.pop()
  render()
  top?.action?.run()
})
for (const [event, hold] of [
  ['pointerenter', true],
  ['pointerleave', false],
  ['focusin', true],
  ['focusout', false],
] as const) {
  toast.addEventListener(event, () => {
    held = hold
    if (!transient) return
    if (hold) clearTimeout(hideTimer)
    else scheduleHide(Math.max(1500, hideAt - Date.now()))
  })
}

/**
 * Show a message. `action` adds a button and keeps the toast until used or closed; so does
 * `sticky`, for problems the user must not miss.
 */
export function showToast(
  message: MessageKey,
  action?: ToastAction,
  vars?: Record<string, string | number>,
  sticky = false,
): void {
  if (action || sticky) {
    dismissToast(message)
    persistent.push({ message, action, vars })
  } else {
    clearTransient()
    transient = { message, vars }
    // About 6 s, plus reading time for longer messages.
    const duration = Math.max(6000, 60 * t(message, vars).length)
    hideAt = Date.now() + duration
    if (!held) scheduleHide(duration)
  }
  render()
}

/** Remove a persistent toast once it no longer applies (e.g. listening started after all). */
export function dismissToast(message: MessageKey): void {
  const index = persistent.findIndex((item) => item.message === message)
  if (index !== -1) {
    persistent.splice(index, 1)
    render()
  }
}

function scheduleHide(ms: number): void {
  clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => {
    transient = null
    render()
  }, ms)
}

function clearTransient(): void {
  clearTimeout(hideTimer)
  transient = null
}

/** Show the current toast in the current language. */
export function render(): void {
  const current = transient ?? persistent.at(-1)
  region.classList.toggle('shown', !!current)
  toast.hidden = !current
  if (!current) {
    text.textContent = ''
    return
  }
  text.textContent = t(current.message, current.vars)
  actionButton.hidden = !current.action
  actionButton.textContent = current.action ? t(current.action.label) : ''
}
