const SOLAR_HOLIDAYS = { '01-01': '元旦', '02-14': '情人节', '03-08': '妇女节', '03-12': '植树节', '04-01': '愚人节', '05-01': '劳动节', '05-04': '青年节', '06-01': '儿童节', '07-01': '建党节', '08-01': '建军节', '09-10': '教师节', '10-01': '国庆节', '12-24': '平安夜', '12-25': '圣诞节' }
const LUNAR_HOLIDAYS = { '正月-初一': '春节', '正月-十五': '元宵节', '二月-初二': '龙抬头', '五月-初五': '端午节', '七月-初七': '七夕节', '七月-十五': '中元节', '八月-十五': '中秋节', '九月-初九': '重阳节', '腊月-初八': '腊八节', '腊月-廿三': '小年', '腊月-三十': '除夕' }
const LUNAR_MONTHS = ['', '正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月']

function lunarMonthName(value) {
  const number = Number(String(value || '').replace(/\D/g, ''))
  if (number >= 1 && number <= 12) return LUNAR_MONTHS[number]
  const text = String(value || '')
  return text.endsWith('月') ? text : text + '月'
}

function lunarDayName(value) {
  const text = String(value || '')
  if (!/^\d+$/.test(text)) return text
  const day = Number(text)
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (day <= 10) return '初' + (day === 10 ? '十' : digits[day])
  if (day < 20) return '十' + digits[day - 10]
  if (day === 20) return '二十'
  if (day < 30) return '廿' + digits[day - 20]
  return '三十'
}

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
  const offset = value.getDay()
  value.setDate(value.getDate() - offset)
  value.setHours(0, 0, 0, 0)
  return value
}

export function monthCells(year, month, events = []) {
  const first = new Date(year, month, 1)
  const start = addDays(first, -first.getDay())
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
    const month = lunarMonthName(parts.find(part => part.type === 'month')?.value)
    const day = lunarDayName(parts.find(part => part.type === 'day')?.value)
    const holiday = LUNAR_HOLIDAYS[`${month}-${day}`]
    return holiday ? { holiday, isLunar: true } : null
  } catch { return null }
}

export function lunarLabelForDate(dateString) {
  const holiday = holidayForDate(dateString)
  if (holiday) return { text: holiday.holiday, holiday: true }
  try {
    const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' }).formatToParts(parseLocalDate(dateString))
    const month = lunarMonthName(parts.find(part => part.type === 'month')?.value)
    const day = lunarDayName(parts.find(part => part.type === 'day')?.value)
    return { text: day === '初一' ? month : day, holiday: false }
  } catch { return { text: '', holiday: false } }
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
  const colors = { high: '#C45A67', medium: '#B18B62', low: '#4E83A8', none: '#4B8F78' }
  return todos.filter(item => item.dueAt).map(item => {
    const due = new Date(item.dueAt)
    const start = item.startAt ? new Date(item.startAt) : due
    const time = date => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    const isDateRange = Boolean(item.startAt)
    return { ...item, kind: 'todo', startDate: formatDate(start), endDate: formatDate(due), startTime: isDateRange ? '' : time(due), endTime: '', allDay: isDateRange, completed: Boolean(item.completedAt), color: colors[item.priority] || colors.none }
  })
}

export function monthWeekRows(year, month, items = [], maxVisibleLanes = 4) {
  const cells = monthCells(year, month, items)
  return Array.from({ length: 6 }, (_, weekIndex) => {
    const weekCells = cells.slice(weekIndex * 7, weekIndex * 7 + 7)
    const weekStart = weekCells[0].date
    const weekEnd = weekCells[6].date
    const laneEnds = []
    const segments = items
      .filter(item => item.startDate <= weekEnd && item.endDate >= weekStart)
      .sort((a, b) => {
        if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate)
        return b.endDate.localeCompare(a.endDate) || String(a.title).localeCompare(String(b.title))
      })
      .map(item => {
        const clippedStart = item.startDate < weekStart ? weekStart : item.startDate
        const clippedEnd = item.endDate > weekEnd ? weekEnd : item.endDate
        const startColumn = weekCells.findIndex(cell => cell.date === clippedStart) + 1
        const endColumn = weekCells.findIndex(cell => cell.date === clippedEnd) + 1
        let lane = laneEnds.findIndex(lastColumn => lastColumn < startColumn)
        if (lane < 0) lane = laneEnds.length
        laneEnds[lane] = endColumn
        return {
          item,
          key: item.kind + '-' + item.id + '-' + weekIndex,
          startColumn,
          span: endColumn - startColumn + 1,
          lane,
          continuesBefore: item.startDate < weekStart,
          continuesAfter: item.endDate > weekEnd
        }
      })
    const hiddenCounts = weekCells.map((cell, index) => segments.filter(segment => segment.lane >= maxVisibleLanes && segment.startColumn <= index + 1 && segment.startColumn + segment.span > index + 1).length)
    return { cells: weekCells, segments: segments.filter(segment => segment.lane < maxVisibleLanes), hiddenCounts }
  })
}
