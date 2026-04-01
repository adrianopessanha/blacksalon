import React, { useState, useEffect, useMemo } from 'react'
import { db, collection, query, where, getDocs, onSnapshot, orderBy } from '../firebase'
import { Search, CreditCard, Phone, Calendar, User, TrendingUp, TrendingDown, Clock, ChevronDown, ChevronUp, Award, DollarSign, Wallet, Scissors } from 'lucide-react'

// ==========================================
// UTILS
// ==========================================
const fmt = (val) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ==========================================
// COMPONENT
// ==========================================
export function GiftVoucherMonitor() {
    const [clients, setClients] = useState([])
    const [lancamentos, setLancamentos] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [expandedClient, setExpandedClient] = useState(null)

    // 1. Listen for Voucher Clients
    useEffect(() => {
        const q = query(collection(db, 'clientes_vale'), orderBy('nome'))
        const unsub = onSnapshot(q, (snapshot) => {
            setClients(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
        }, (err) => console.error("Error fetching voucher clients:", err))
        return () => unsub()
    }, [])

    // 2. Listen for ALL Voucher Lancamentos (Sales and Usage)
    useEffect(() => {
        // We fetch both tipo: venda_vale AND forma_pagamento: Vale Presente
        // Since Firestore doesn't support OR in a simple way for different fields without indexing,
        // we could fetch both and merge or just fetch all and filter in JS if volume is small.
        // Given this is a specific feature, we'll fetch all related to vouchers.
        const qSales = query(collection(db, 'lancamentos'), where('tipo', '==', 'venda_vale'))
        const qUsage = query(collection(db, 'lancamentos'), where('forma_pagamento', '==', 'Vale Presente'))

        const handleUpdate = () => {
             // We'll use a combined listener or simply two listeners that update a shared state
        }

        const unsubSales = onSnapshot(qSales, (snap) => {
            const sales = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            setLancamentos(prev => {
                const filteredPrev = prev.filter(p => p.tipo !== 'venda_vale')
                return [...filteredPrev, ...sales].sort((a, b) => (b.data?.seconds || 0) - (a.data?.seconds || 0))
            })
            setLoading(false)
        })

        const unsubUsage = onSnapshot(qUsage, (snap) => {
            const usage = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            setLancamentos(prev => {
                const filteredPrev = prev.filter(p => p.forma_pagamento !== 'Vale Presente')
                return [...filteredPrev, ...usage].sort((a, b) => (b.data?.seconds || 0) - (a.data?.seconds || 0))
            })
            setLoading(false)
        })

        return () => { unsubSales(); unsubUsage() }
    }, [])

    // 3. Process Analytics
    const analytics = useMemo(() => {
        const clientsData = clients.map(client => {
            const clientLanc = lancamentos.filter(l => 
                l.cliente_nome?.toLowerCase().trim() === client.nome?.toLowerCase().trim()
            )
            
            const sales = clientLanc.filter(l => l.tipo === 'venda_vale')
            const usage = clientLanc.filter(l => l.forma_pagamento === 'Vale Presente')
            
            const totalCredits = sales.length * 4
            const totalUsage = usage.length
            const balance = totalCredits - totalUsage
            
            return {
                ...client,
                totalCredits,
                totalUsage,
                balance,
                history: clientLanc
            }
        })

        const filtered = clientsData.filter(c => 
            c.nome.toLowerCase().includes(search.toLowerCase()) || 
            (c.telefone && c.telefone.includes(search))
        )

        const stats = {
            totalClients: clients.length,
            totalCreditsIssued: clientsData.reduce((s, c) => s + c.totalCredits, 0),
            totalUsage: clientsData.reduce((s, c) => s + c.totalUsage, 0),
            activeCredits: clientsData.reduce((s, c) => s + c.balance, 0)
        }

        return { list: filtered, stats }
    }, [clients, lancamentos, search])

    if (loading && clients.length === 0) return <div className="p-10 text-center text-cyan-500 animate-pulse font-bold">Carregando dados dos vales...</div>

    return (
        <div className="space-y-6 pb-20 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-xl font-bold font-black text-white flex items-center gap-2">
                    <Award className="text-pink-500" size={24} /> Monitoramento de Vales-Presente
                </h2>
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input 
                        type="text"
                        placeholder="Buscar cliente ou telefone..."
                        className="w-full bg-gray-900 border border-gray-800 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-pink-500 outline-none"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl">
                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Clientes</div>
                    <div className="text-2xl font-black text-white">{analytics.stats.totalClients}</div>
                </div>
                <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl border-l-4 border-l-pink-500">
                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Total Créditos</div>
                    <div className="text-2xl font-black text-white">{analytics.stats.totalCreditsIssued}</div>
                </div>
                <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl border-l-4 border-l-cyan-500">
                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Total Usos</div>
                    <div className="text-2xl font-black text-white">{analytics.stats.totalUsage}</div>
                </div>
                <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl border-l-4 border-l-green-500">
                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Saldo Ativo</div>
                    <div className="text-2xl font-black text-white">{analytics.stats.activeCredits}</div>
                </div>
            </div>

            {/* List */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-gray-950 text-gray-500 uppercase text-[10px] tracking-wider">
                            <th className="px-6 py-4 font-bold">Cliente</th>
                            <th className="px-4 py-4 font-bold">Telefone</th>
                            <th className="px-4 py-4 font-bold text-center">Compras</th>
                            <th className="px-4 py-4 font-bold text-center">Usos</th>
                            <th className="px-4 py-4 font-bold text-center">Saldo</th>
                            <th className="px-6 py-4 font-bold text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                        {analytics.list.length === 0 ? (
                            <tr><td colSpan="6" className="p-10 text-center text-gray-600">Nenhum cliente de vale encontrado.</td></tr>
                        ) : analytics.list.map(cl => (
                            <React.Fragment key={cl.id}>
                                <tr className={`hover:bg-gray-800/30 transition-colors ${expandedClient === cl.id ? 'bg-pink-900/5 transition-colors' : ''}`}>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-pink-900/40 text-pink-400 flex items-center justify-center font-bold text-xs">
                                                {cl.nome.charAt(0)}
                                            </div>
                                            <span className="font-bold text-gray-200">{cl.nome}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 text-gray-400">{cl.telefone || '-'}</td>
                                    <td className="px-4 py-4 text-center font-medium text-gray-400">{cl.totalCredits / 4}</td>
                                    <td className="px-4 py-4 text-center font-medium text-gray-400">{cl.totalUsage}</td>
                                    <td className="px-4 py-4 text-center">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                            cl.balance > 0 ? 'bg-green-900/30 text-green-400 border border-green-800/50' : 'bg-gray-800 text-gray-500'
                                        }`}>
                                            {cl.balance} {cl.balance === 1 ? 'uso' : 'usos'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => setExpandedClient(expandedClient === cl.id ? null : cl.id)}
                                            className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-500 hover:text-pink-400"
                                        >
                                            {expandedClient === cl.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                        </button>
                                    </td>
                                </tr>
                                {expandedClient === cl.id && (
                                    <tr>
                                        <td colSpan="6" className="bg-gray-950/50 p-6 animate-in fade-in slide-in-from-top-2">
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                                                    <h4 className="text-xs font-black uppercase text-pink-500 tracking-widest">Histórico de Atividade</h4>
                                                    <span className="text-[10px] text-gray-600 italic">Total de {cl.history.length} lançamentos encontrados</span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    {cl.history.map(item => {
                                                        const isSale = item.tipo === 'venda_vale'
                                                        return (
                                                            <div key={item.id} className="bg-gray-900 border border-gray-800 p-3 rounded-xl flex items-center justify-between group">
                                                                <div className="flex items-center gap-3">
                                                                    <div className={`p-2 rounded-lg ${isSale ? 'bg-green-900/30 text-green-400' : 'bg-pink-900/30 text-pink-400'}`}>
                                                                        {isSale ? <TrendingUp size={16} /> : <Scissors size={16} />}
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-xs font-bold text-gray-200">{isSale ? 'Compra de Vale' : item.servico_descricao}</div>
                                                                        <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                                                           <Clock size={10} /> {item.data?.seconds ? new Date(item.data.seconds * 1000).toLocaleDateString('pt-BR') : '-'}
                                                                           <span className="text-gray-700 mx-1">|</span>
                                                                           <User size={10} /> {item.barbeiro_nome}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className={`text-xs font-black sm:opacity-0 group-hover:opacity-100 transition-opacity ${isSale ? 'text-green-500' : 'text-pink-500'}`}>
                                                                    {isSale ? '+4 CRÉDITOS' : '-1 CRÉDITO'}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                    {cl.history.length === 0 && <p className="text-xs text-gray-500 italic">Nenhum evento registrado.</p>}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* Legend */}
            <div className="flex items-center gap-4 px-2">
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-[10px] text-gray-500 uppercase font-bold">Saldo Disponível</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                    <span className="text-[10px] text-gray-500 uppercase font-bold">Sem Créditos</span>
                </div>
            </div>
        </div>
    )
}
