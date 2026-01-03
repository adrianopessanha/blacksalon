import { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from './services/firebase.js'
import { ensureIndexes } from './services/storage.js'
import { mountWeeklyView } from './views/weekly.js'
import { mountCloseDayView } from './views/close-day.js'
import { mountReportsView } from './views/reports.js'

const appRoot = document.getElementById('app')
const authArea = document.getElementById('authArea')
const viewSwitcher = document.getElementById('viewSwitcher')
let currentView = 'weekly'

function renderLogin() {
  authArea.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.className = 'flex gap-2'
  const email = document.createElement('input')
  email.placeholder = 'email'
  email.className = 'px-3 py-2 bg-gray-800 rounded border border-gray-700'
  const pass = document.createElement('input')
  pass.placeholder = 'senha'
  pass.type = 'password'
  pass.className = 'px-3 py-2 bg-gray-800 rounded border border-gray-700'
  const btn = document.createElement('button')
  btn.textContent = 'Entrar'
  btn.className = 'px-3 py-2 bg-cyan-600 rounded'
  btn.onclick = async ()=>{
    try { await signInWithEmailAndPassword(auth, email.value, pass.value) } catch (e) { alert(e.message) }
  }
  wrap.append(email, pass, btn)
  authArea.appendChild(wrap)
}

function renderUser(u) {
  authArea.innerHTML = ''
  const role = u?.stsTokenManager?.claims?.role || u?.role || 'barber'
  const span = document.createElement('span')
  span.className = 'text-sm text-gray-300'
  span.textContent = `${u.email} • ${role}`
  const btn = document.createElement('button')
  btn.textContent = 'Sair'
  btn.className = 'px-3 py-2 bg-gray-800 rounded border border-gray-700'
  btn.onclick = ()=> signOut(auth)
  authArea.append(span, btn)

  viewSwitcher.classList.remove('hidden')
  appRoot.innerHTML = ''
  mount()
}

function mountTabs() {
  viewSwitcher.querySelectorAll('.tab').forEach(btn=>{
    btn.onclick = ()=>{
      currentView = btn.dataset.view
      mount()
    }
  })
}

async function mount() {
  appRoot.innerHTML = ''
  await ensureIndexes()
  if (currentView === 'weekly') return mountWeeklyView(appRoot)
  if (currentView === 'close-day') return mountCloseDayView(appRoot)
  if (currentView === 'reports') return mountReportsView(appRoot)
}

onAuthStateChanged(auth, (u)=>{
  if (!u) { renderLogin(); viewSwitcher.classList.add('hidden'); appRoot.innerHTML=''; return }
  renderUser(u)
})

mountTabs()
