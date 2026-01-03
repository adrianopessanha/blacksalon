import { db, serverTimestamp, collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, query, where, orderBy, limit, runTransaction, writeBatch, collectionGroup } from './firebase.js'
import { todayISO, startOfWeekTuesday, endOfWeekSaturday, TZ } from './dates.js'

export async function ensureIndexes(){ /* doc placeholder */ }

export const barberDoc = (barberId)=> doc(db,'barbers',barberId)
export const salesCol = (storeId)=> collection(db,'stores',storeId,'sales')
export const servicesCol = (barberId)=> collection(db,'barbers',barberId,'services')
export const dailyClosuresCol = (storeId)=> collection(db,'stores',storeId,'daily_closures')
export const weeklyEntriesDoc = (barberId, weekId)=> doc(db,'barbers',barberId,'weekly_entries',weekId)

export async function recordSale({storeId, cashierId, kind, payload}){
  const col = salesCol(storeId)
  const now = new Date().toLocaleString('sv-SE',{timeZone:TZ})
  const base = { ts: serverTimestamp(), isoDate: now.slice(0,10), time: now.slice(11,19), storeId, cashierId, kind, ...payload }
  return addDoc(col, base)
}

export async function recordService({barberId, payload}){
  const col = servicesCol(barberId)
  const now = new Date().toLocaleString('sv-SE',{timeZone:TZ})
  const base = { ts: serverTimestamp(), isoDate: now.slice(0,10), time: now.slice(11,19), barberId, ...payload }
  return addDoc(col, base)
}

export async function closeDay({storeId, counted:{cash,pix,debit,credit}, notes}){
  const col = dailyClosuresCol(storeId)
  const dateId = todayISO()

  const dayQ = query(salesCol(storeId), where('isoDate','==',dateId))
  const snap = await getDocs(dayQ)
  let appCash=0, appPix=0, appDebit=0, appCredit=0
  snap.forEach(d=>{
    const x = d.data()
    if (x.kind==='service-now'){
      if (x.paymentMethod==='Dinheiro') appCash += x.value||0
      if (x.paymentMethod==='Pix') appPix += x.value||0
      if (x.paymentMethod==='Débito') appDebit += x.value||0
      if (x.paymentMethod==='Crédito') appCredit += x.value||0
    }
    if (x.kind==='product'){
      if (x.productPaymentMethod==='Dinheiro') appCash += x.productSaleValue||0
      if (x.productPaymentMethod==='Pix') appPix += x.productSaleValue||0
      if (x.productPaymentMethod==='Débito') appDebit += x.productSaleValue||0
      if (x.productPaymentMethod==='Crédito') appCredit += x.productSaleValue||0
    }
    if (x.kind==='plan-sale'){
      if (x.planSalePaymentMethod==='Dinheiro') appCash += x.planSaleValue||0
      if (x.planSalePaymentMethod==='Pix') appPix += x.planSaleValue||0
      if (x.planSalePaymentMethod==='Débito') appDebit += x.planSaleValue||0
      if (x.planSalePaymentMethod==='Crédito') appCredit += x.planSaleValue||0
    }
  })

  const diff = { cash: (cash||0) - appCash, pix: (pix||0) - appPix, debit: (debit||0) - appDebit, credit: (credit||0) - appCredit }

  const docRef = doc(col, dateId)
  await setDoc(docRef, { dateId, storeId, counted: {cash, pix, debit, credit}, app: {cash:appCash, pix:appPix, debit:appDebit, credit:appCredit}, diff, notes: notes||'', closedAt: serverTimestamp(), locked: true })
  return docRef
}

// Helpers para relatórios (collectionGroup)
export async function fetchSalesPeriod({startISO, endISO}){
  const qSales = query(collectionGroup(db,'sales'), where('isoDate','>=',startISO), where('isoDate','<=',endISO))
  const ss = await getDocs(qSales)
  return ss.docs.map(d=>({ id:d.id, ...d.data() }))
}
export async function fetchServicesPeriod({startISO, endISO}){
  const qSvcs = query(collectionGroup(db,'services'), where('isoDate','>=',startISO), where('isoDate','<=',endISO))
  const ss = await getDocs(qSvcs)
  return ss.docs.map(d=>({ id:d.id, ...d.data() }))
}
