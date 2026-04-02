import React, { useState, useEffect, useMemo } from 'react'
import { db, collection, query, where, getDocs, onSnapshot, orderBy, doc, deleteDoc, updateDoc } from '../firebase'
import { Search, CreditCard, Phone, Calendar, User, TrendingUp, TrendingDown, Clock, ChevronDown, ChevronUp, Award, DollarSign, Wallet, Scissors, Pencil, Trash2, X, Check } from 'lucide-react'

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
    const [editingClient, setEditingClient] = useState(null)
    const [editForm, setEditForm] = useState({ nome: '', telefone: '' })
    const [deletingClient, setDeletingClient] = useState(null)
    const [actionLoading, setActionLoading] = useState(false)

    const handleEditSave = async () => {
        if (!editingClient || !editForm.nome.trim()) return
        setActionLoading(true)
        try {
            const clientRef = doc(db, 'clientes_vale', editingClient.id)
            await updateDoc(clientRef, {
                nome: editForm.nome.trim(),
                telefone: editForm.telefone.trim()
            })
            setEditingClient(null)
        } catch (e) {
            alert('Erro ao salvar: ' + e.message)
        } finally {
            setActionLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!deletingClient) return
        setActionLoading(true)
        try {
            await deleteDoc(doc(db, 'clientes_vale', deletingClient.id))
            setDeletingClient(null)
            setExpandedClient(null)
        } catch (e) {
            alert('Erro ao excluir: ' + e.message)
        } finally {
            setActionLoading(false)
        }
    }

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
                            <th className="px-4 py-4 font-bold">Cliente</th>
                            <th className="px-3 py-4 font-bold hidden sm:table-cell">Telefone</th>
                            <th className="px-3 py-4 font-bold text-center">Pacote</th>
                            <th className="px-3 py-4 font-bold text-center">Visita</th>
                            <th className="px-3 py-4 font-bold text-center">Usos</th>
                            <th className="px-3 py-4 font-bold text-center">Saldo</th>
                            <th className="px-3 py-4 font-bold text-center">Restante</th>
                            <th className="px-4 py-4 font-bold text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                        {analytics.list.length === 0 ? (
                            <tr><td colSpan="8" className="p-10 text-center text-gray-600">Nenhum cliente de vale encontrado.</td></tr>
                        ) : analytics.list.map(cl => {
                            const valorPacote = cl.valor_total || 0
                            const valorVisita = cl.valor_por_uso || 0
                            const valorRestante = valorVisita * cl.balance
                            return (
                            <React.Fragment key={cl.id}>
                                <tr className={`hover:bg-gray-800/30 transition-colors ${expandedClient === cl.id ? 'bg-pink-900/5 transition-colors' : ''}`}>
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-pink-900/40 text-pink-400 flex items-center justify-center font-bold text-xs shrink-0">
                                                {cl.nome.charAt(0)}
                                            </div>
                                            <div>
                                                <span className="font-bold text-gray-200 text-sm">{cl.nome}</span>
                                                <div className="text-[10px] text-gray-600 sm:hidden">{cl.telefone || '-'}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 py-4 text-gray-400 text-xs hidden sm:table-cell">{cl.telefone || '-'}</td>
                                    <td className="px-3 py-4 text-center font-bold text-yellow-400 text-xs">{valorPacote ? fmt(valorPacote) : '-'}</td>
                                    <td className="px-3 py-4 text-center font-bold text-cyan-400 text-xs">{valorVisita ? fmt(valorVisita) : '-'}</td>
                                    <td className="px-3 py-4 text-center font-medium text-gray-400 text-xs">{cl.totalUsage}/{cl.totalCredits}</td>
                                    <td className="px-3 py-4 text-center">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                            cl.balance > 0 ? 'bg-green-900/30 text-green-400 border border-green-800/50' : 'bg-gray-800 text-gray-500'
                                        }`}>
                                            {cl.balance} {cl.balance === 1 ? 'uso' : 'usos'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-4 text-center font-bold text-green-400 text-xs">{valorVisita ? fmt(valorRestante) : '-'}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => { setEditingClient(cl); setEditForm({ nome: cl.nome, telefone: cl.telefone || '' }) }}
                                                className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-500 hover:text-cyan-400"
                                                title="Editar"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={() => setDeletingClient(cl)}
                                                className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-500 hover:text-red-400"
                                                title="Excluir"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                            <button
                                                onClick={() => setExpandedClient(expandedClient === cl.id ? null : cl.id)}
                                                className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-500 hover:text-pink-400"
                                            >
                                                {expandedClient === cl.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                {expandedClient === cl.id && (
                                    <tr>
                                        <td colSpan="8" className="bg-gray-950/50 p-6 animate-in fade-in slide-in-from-top-2">
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
                                                                           <span className="text-gray-700 mx-1">|</span>
                                                                           <DollarSign size={10} /> {fmt(item.valor_bruto || 0)}
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
                        )})}
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

            {/* Modal Editar */}
            {editingClient && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setEditingClient(null)}>
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-white flex items-center gap-2"><Pencil size={18} className="text-cyan-400" /> Editar Cliente</h3>
                            <button onClick={() => setEditingClient(null)} className="text-gray-500 hover:text-white"><X size={20} /></button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Nome</label>
                                <input
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 px-3 text-gray-200 outline-none focus:border-cyan-500"
                                    value={editForm.nome}
                                    onChange={e => setEditForm({ ...editForm, nome: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Telefone</label>
                                <input
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 px-3 text-gray-200 outline-none focus:border-cyan-500"
                                    value={editForm.telefone}
                                    onChange={e => setEditForm({ ...editForm, telefone: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setEditingClient(null)}
                                className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 transition-colors text-sm font-bold"
                            >Cancelar</button>
                            <button
                                onClick={handleEditSave}
                                disabled={actionLoading}
                                className="flex-1 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                            >{actionLoading ? '...' : <><Check size={16} /> Salvar</>}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Excluir */}
            {deletingClient && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setDeletingClient(null)}>
                    <div className="bg-gray-900 border border-red-900/50 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-red-400 flex items-center gap-2"><Trash2 size={18} /> Excluir Cliente</h3>
                            <button onClick={() => setDeletingClient(null)} className="text-gray-500 hover:text-white"><X size={20} /></button>
                        </div>
                        <p className="text-gray-400 text-sm">
                            Tem certeza que deseja excluir <span className="font-bold text-white">{deletingClient.nome}</span> da lista de vales?
                        </p>
                        <p className="text-[11px] text-gray-600">Os lançamentos já registrados não serão afetados.</p>
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setDeletingClient(null)}
                                className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 transition-colors text-sm font-bold"
                            >Cancelar</button>
                            <button
                                onClick={handleDelete}
                                disabled={actionLoading}
                                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                            >{actionLoading ? '...' : <><Trash2 size={16} /> Excluir</>}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
