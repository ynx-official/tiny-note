interface EventSchedule { startDate: string; endDate: string; startTime: string; endTime: string }
const pad = (value: number) => String(value).padStart(2, '0')

export function localDateValue(date = new Date()) {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
}

export function localTimeValue(date = new Date()) {
  return pad(date.getHours()) + ':' + pad(date.getMinutes())
}

export function localDateTimeValue(date = new Date()) {
  return localDateValue(date) + 'T' + localTimeValue(date)
}

export function roundedFutureDate(minutes = 30, step = 5, now = new Date()) {
  const date = new Date(now)
  date.setSeconds(0, 0)
  date.setMinutes(Math.ceil((date.getMinutes() + minutes) / step) * step)
  return date
}

export function defaultEventSchedule(now = new Date()) {
  const start = roundedFutureDate(30, 30, now)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return {
    startDate: localDateValue(start),
    endDate: localDateValue(end),
    startTime: localTimeValue(start),
    endTime: localTimeValue(end)
  }
}

export function addLocalDays(value: string, amount: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
  if (!match) return value
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  date.setDate(date.getDate() + amount)
  return localDateValue(date)
}

export function compareLocalEventTimes(form: Partial<EventSchedule>) {
  if (!form?.startDate || !form?.endDate) return 0
  const start = new Date(form.startDate + 'T' + (form.startTime || '00:00'))
  const end = new Date(form.endDate + 'T' + (form.endTime || '23:59'))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  return end.getTime() - start.getTime()
}

export function endOneHourAfter(startDate: string, startTime: string) {
  const start = new Date(startDate + 'T' + startTime)
  if (Number.isNaN(start.getTime())) return { endDate: startDate, endTime: startTime }
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return { endDate: localDateValue(end), endTime: localTimeValue(end) }
}

export function shiftEventStart(form: EventSchedule, startDate: string, startTime: string) {
  const previousStart = new Date(form.startDate + 'T' + form.startTime)
  const previousEnd = new Date(form.endDate + 'T' + form.endTime)
  const previousDuration = previousEnd.getTime() - previousStart.getTime()
  const duration = Number.isFinite(previousDuration) && previousDuration > 0 ? previousDuration : 60 * 60 * 1000
  const nextStart = new Date(startDate + 'T' + startTime)
  if (Number.isNaN(nextStart.getTime())) return endOneHourAfter(startDate, startTime)
  const nextEnd = new Date(nextStart.getTime() + duration)
  return { endDate: localDateValue(nextEnd), endTime: localTimeValue(nextEnd) }
}
