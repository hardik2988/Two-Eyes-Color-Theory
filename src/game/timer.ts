export interface TimerEvents {
  onTick?(remainingSeconds: number, formatted: string): void
  onExpired?(): void
}

export class CountdownTimer {
  readonly initialSeconds: number
  remainingSeconds: number
  isRunning = false
  isExpired = false
  untimed = false

  private lastTimestamp = 0

  constructor(totalMinutes = 15, private readonly events: TimerEvents = {}) {
    this.initialSeconds = totalMinutes * 60
    this.remainingSeconds = this.initialSeconds
  }

  get formatted(): string {
    if (this.untimed) return '∞ UNTIMED'
    const total = Math.max(0, Math.ceil(this.remainingSeconds))
    const mins = Math.floor(total / 60)
    const secs = total % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  get progress(): number {
    if (this.initialSeconds === 0) return 1
    return Math.max(0, Math.min(1, 1 - this.remainingSeconds / this.initialSeconds))
  }

  start(savedRemaining?: number): void {
    if (savedRemaining !== undefined && savedRemaining > 0 && savedRemaining <= this.initialSeconds) {
      this.remainingSeconds = savedRemaining
    }
    this.isRunning = true
    this.isExpired = false
    this.lastTimestamp = performance.now()
  }

  pause(): void {
    this.isRunning = false
  }

  resume(): void {
    if (this.isExpired) return
    this.isRunning = true
    this.lastTimestamp = performance.now()
  }

  stop(): void {
    this.isRunning = false
  }

  reset(): void {
    this.remainingSeconds = this.initialSeconds
    this.isRunning = false
    this.isExpired = false
    this.lastTimestamp = performance.now()
  }

  update(dt?: number): void {
    if (!this.isRunning || this.untimed || this.isExpired) return

    let elapsed = 0
    if (dt !== undefined && Number.isFinite(dt)) {
      elapsed = Math.max(0, dt)
    } else {
      const now = performance.now()
      elapsed = (now - this.lastTimestamp) / 1000
      this.lastTimestamp = now
      if (elapsed > 2) elapsed = 2
    }

    this.remainingSeconds = Math.max(0, this.remainingSeconds - elapsed)
    this.events.onTick?.(this.remainingSeconds, this.formatted)

    if (this.remainingSeconds <= 0 && !this.isExpired) {
      this.isExpired = true
      this.isRunning = false
      this.events.onExpired?.()
    }
  }

  setUntimed(untimed: boolean): void {
    this.untimed = untimed
  }
}
