import { useState, useEffect } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import { auth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from './firebase'
import { LogOut, Scissors, BarChart3, Wallet } from 'lucide-react'

import { ServiceForm } from './components/ServiceForm'
import { ReportsDashboard } from './components/ReportsDashboard'
import { DailyClosure } from './components/DailyClosure'
import { FinancialDashboard } from './components/FinancialDashboard'

import { BARBERS } from './data/barbers'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return () => unsub()
  }, [])

  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-900 text-cyan-500">Carregando...</div>

  if (!user) return <LoginScreen />

  // Determine Admin Status
  const currentUserData = BARBERS.find(b => b.email === user.email)
  const isAdmin = currentUserData?.isAdmin === true

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      <header className="border-b border-gray-800 bg-gray-950 p-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-cyan-500 font-bold text-xl tracking-tighter">BLACK SALON</span>
          {isAdmin && <span className="bg-cyan-900/30 text-cyan-400 text-[10px] px-2 py-0.5 rounded border border-cyan-500/20">ADMIN</span>}
        </div>
        <nav className="flex gap-4">
          <Link to="/" className="flex items-center gap-2 text-sm font-medium hover:text-cyan-400"><Scissors size={18} /> <span className="hidden md:inline">Lançar</span></Link>

          {isAdmin && (
            <>
              <Link to="/reports" className="flex items-center gap-2 text-sm font-medium hover:text-cyan-400"><BarChart3 size={18} /> <span className="hidden md:inline">Relatórios</span></Link>
              <Link to="/financeiro" className="flex items-center gap-2 text-sm font-medium hover:text-cyan-400"><Wallet size={18} /> <span className="hidden md:inline">Financeiro</span></Link>
              <Link to="/fechamento" className="flex items-center gap-2 text-sm font-medium hover:text-cyan-400"><LogOut size={18} /> <span className="hidden md:inline">Fechamento</span></Link>
            </>
          )}

          <button onClick={() => signOut(auth)} className="text-gray-400 hover:text-white"><LogOut size={18} /></button>
        </nav>
      </header>
      <main className="flex-1 p-4 max-w-5xl mx-auto w-full">
        <Routes>
          <Route path="/" element={<ServiceForm />} />
          {isAdmin ? (
            <>
              <Route path="/reports" element={<ReportsDashboard />} />
              <Route path="/fechamento" element={<DailyClosure />} />
              <Route path="/financeiro" element={<FinancialDashboard />} />
            </>
          ) : (
            <Route path="*" element={<div className="text-center p-10 text-gray-500">Acesso Restrito</div>} />
          )}
        </Routes>
      </main>
    </div>
  )
}

function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (e) {
      console.error(e)
      setError('Erro ao entrar: Verifique e-mail e senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-800">
        <h1 className="text-3xl font-bold text-cyan-500 mb-6 text-center">BLACK SALON</h1>

        {error && <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4 text-sm border border-red-800">{error}</div>}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-gray-400 text-sm mb-1">E-mail</label>
            <input
              type="email"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-white focus:border-cyan-500 outline-none"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-gray-400 text-sm mb-1">Senha</label>
            <input
              type="password"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg p-3 text-white focus:border-cyan-500 outline-none"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-cyan-900/20 disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Acessar Sistema'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default App
