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

const toast = document.getElementById('toast')!
const text = document.getElementById('toast-text')!
const actionButton = document.getElementById('toast-action') as HTMLButtonElement
const closeButton = document.getElementById('toast-close') as HTMLButtonElement

/**
 * Toasts with an action (e.g. "Reload" for an update) stay until used or dismissed, and are never
 * lost: a newer one shows on top and the older one returns afterwards. A plain message shows over
 * them for a few seconds.
 */
const persistent: Toast[] = []
let transient: Toast | null = null
let hideTimer: number | undefined

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

export function showToast(message: MessageKey, action?: ToastAction, vars?: Record<string, string | number>): void {
  if (action) {
    dismissToast(message)
    persistent.push({ message, action, vars })
  } else {
    clearTransient()
    transient = { message, vars }
    hideTimer = window.setTimeout(() => {
      transient = null
      render()
    }, 4000)
  }
  render()
}

/** Remove a persistent toast once it no longer applies (e.g. playback restarted). */
export function dismissToast(message: MessageKey): void {
  const index = persistent.findIndex((item) => item.message === message)
  if (index !== -1) {
    persistent.splice(index, 1)
    render()
  }
}

function clearTransient(): void {
  clearTimeout(hideTimer)
  transient = null
}

/** Show the current toast in the current language. */
export function render(): void {
  const current = transient ?? persistent.at(-1)
  toast.hidden = !current
  if (!current) return
  text.textContent = t(current.message, current.vars)
  actionButton.hidden = !current.action
  actionButton.textContent = current.action ? t(current.action.label) : ''
}
