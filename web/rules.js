import { db, doc, getDoc } from './firebase.js'

let cache
export async function getCommissionRules(){
  if (cache) return cache
  const ref = doc(db,'commission_rules','current')
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('commission_rules/current não encontrado')
  cache = snap.data()
  return cache
}
