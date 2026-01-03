export const TZ = 'America/Sao_Paulo'
export function todayISO(){ return new Date().toLocaleString('sv-SE',{timeZone:TZ}).slice(0,10) }
export function toISO(d){ return new Date(d).toLocaleString('sv-SE',{timeZone:TZ}).slice(0,10) }
export function startOfWeekTuesday(date=new Date()){
  const d = new Date(date)
  const wd = new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:TZ}).formatToParts(d).find(p=>p.type==='weekday').value
  const map = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}
  const i = map[wd]
  const delta = (i>=2? i-2 : (7 - (2-i)))
  d.setDate(d.getDate() - delta)
  return toISO(d)
}
export function endOfWeekSaturday(date=new Date()){
  const s = new Date(startOfWeekTuesday(date))
  s.setDate(s.getDate()+4)
  return toISO(s)
}
export function monthRange(year, month){
  const start = new Date(Date.UTC(year, month-1, 1))
  const end = new Date(Date.UTC(year, month, 0))
  return { startISO: start.toISOString().slice(0,10), endISO: end.toISOString().slice(0,10) }
}
