/**
 * Keeps the screen on while the tuner listens or sounds (Screen Wake Lock API). The browser drops
 * the lock whenever the page is hidden, so it is re-acquired when the page becomes visible again.
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinel | null = null
  private wanted = false

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (this.wanted && document.visibilityState === 'visible') void this.acquire()
    })
  }

  async request(): Promise<void> {
    this.wanted = true
    await this.acquire()
  }

  async release(): Promise<void> {
    this.wanted = false
    const sentinel = this.sentinel
    this.sentinel = null
    await sentinel?.release().catch(() => {})
  }

  private async acquire(): Promise<void> {
    if (!('wakeLock' in navigator) || this.sentinel) return
    try {
      const sentinel = await navigator.wakeLock.request('screen')
      if (!this.wanted) {
        // Released while the request was pending.
        await sentinel.release()
        return
      }
      this.sentinel = sentinel
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null
      })
    } catch {
      // Denied (e.g. low battery mode or no user activation): the tuner works without it.
    }
  }
}
