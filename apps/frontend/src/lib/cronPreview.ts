// Preview only the daily/hourly/every-minute forms we can evaluate exactly.
// More complex cron expressions remain supported by the backend scheduler.
export function getNextRunsPreview(cronExpr: string, now = new Date()): string[] {
  const parts = cronExpr.trim().split(/\s+/)
  if (parts.length !== 5 || parts.slice(2).some(part => part !== '*')) return []
  const [minute, hour] = parts
  if (!/^(\*|\d{1,2})$/.test(minute) || !/^(\*|\d{1,2})$/.test(hour)) return []
  if (minute !== '*' && Number(minute) > 59 || hour !== '*' && Number(hour) > 23) return []
  const next = new Date(now)
  next.setSeconds(0, 0)
  const runs: string[] = []
  // Three daily occurrences require at most three days of minute increments.
  for (let i = 0; i < 3 * 24 * 60 && runs.length < 3; i++) {
    next.setMinutes(next.getMinutes() + 1)
    if ((minute === '*' || next.getMinutes() === Number(minute)) &&
        (hour === '*' || next.getHours() === Number(hour))) {
      runs.push(next.toLocaleString())
    }
  }
  return runs
}
