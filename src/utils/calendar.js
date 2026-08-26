const SOLAR_HOLIDAYS = { '01-01': '元旦', '02-14': '情人节', '03-08': '妇女节', '03-12': '植树节', '04-01': '愚人节', '05-01': '劳动节', '05-04': '青年节', '06-01': '儿童节', '07-01': '建党节', '08-01': '建军节', '09-10': '教师节', '10-01': '国庆节', '12-24': '平安夜', '12-25': '圣诞节' }
const LUNAR_HOLIDAYS = { '正月-初一': '春节', '正月-十五': '元宵节', '二月-初二': '龙抬头', '五月-初五': '端午节', '七月-初七': '七夕节', '七月-十五': '中元节', '八月-十五': '中秋节', '九月-初九': '重阳节', '腊月-初八': '腊八节', '腊月-廿三': '小年', '腊月-三十': '除夕' }

export function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseLocalDate(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(date, count) {
  const value = new Date(date)
  value.setDate(value.getDate() + count)
  return value
}

export function startOfWeek(date) {
  const value = new Date(date)
  const offset = (value.getDay() + 6) % 7
  value.setDate(value.getDate() - offset)
  value.setHours(0, 0, 0, 0)
  return value
}

export function monthCells(year, month, events = []) {
  const first = new Date(year, month, 1)
  const start = addDays(first, -((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index)
    const dateString = formatDate(date)
    return { date: dateString, day: date.getDate(), isCurrentMonth: date.getMonth() === month, isToday: dateString === formatDate(new Date()), events: events.filter(item => item.startDate <= dateString && item.endDate >= dateString) }
  })
}

export function weekDays(anchor) {
  const start = startOfWeek(anchor)
  return Array.from({ length: 7 }, (_, index) => { const date = addDays(start, index); return { date: formatDate(date), day: date.getDate(), weekday: date.toLocaleDateString(undefined, { weekday: 'short' }), isToday: formatDate(date) === formatDate(new Date()) } })
}

export function yearMonths(year, events = []) {
  return Array.from({ length: 12 }, (_, month) => ({ month, cells: monthCells(year, month, events).filter(cell => cell.isCurrentMonth) }))
}

export function holidayForDate(dateString) {
  const solar = SOLAR_HOLIDAYS[dateString.slice(5)]
  if (solar) return { holiday: solar, isLunar: false }
  try {
    const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' }).formatToParts(parseLocalDate(dateString))
    const month = parts.find(part => part.type === 'month')?.value?.replace('月', '')
    const day = parts.find(part => part.type === 'day')?.value
    const holiday = LUNAR_HOLIDAYS[`${month}-${day}`]
    return holiday ? { holiday, isLunar: true } : null
  } catch { return null }
}

export function isInDateRange(date, start, end) {
  const low = start < end ? start : end
  const high = start < end ? end : start
  return Boolean(start && end && date >= low && date <= high)
}

export function localDateTime(date, time = '00:00') {
  return new Date(`${date}T${time || '00:00'}`)
}

export function todoCalendarItems(todos) {
  return todos.filter(item => item.dueAt).map(item => ({ ...item, kind: 'todo', startDate: formatDate(new Date(item.dueAt)), endDate: formatDate(new Date(item.dueAt)), startTime: new Date(item.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }), endTime: '', allDay: false, completed: Boolean(item.completedAt), color: '#8E24AA' }))
}
