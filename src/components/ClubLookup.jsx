import { useState, useMemo } from 'react'
import { Search, UserCheck, UserX, CreditCard, Phone, RefreshCw, X, ShieldCheck } from 'lucide-react'
import { useSubscribers } from '../hooks/useSubscribers'

export function ClubLookup() {
    const { subscribers, loading, error, refetch } = useSubscribers()
    const [search, setSearch] = useState('')

    const filtered = useMemo(() => {
        if (!search || search.length < 2) return []
        const q = search.toLowerCase()
        return subscribers.filter(s => 
            s.name.toLowerCase().includes(q) || 
            (s.phone && s.phone.includes(q))
        )
    }, [subscribers, search])

    return (
        <div className="space-y-4 pb-20">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <ShieldCheck size={24} className="text-emerald-400" /> Consulta Club Black Salon
                </h2>
                <button 
                    onClick={() => window.location.reload()} 
                    className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-emerald-400 transition-colors"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 shadow-xl">
                <p className="text-sm text-gray-400 mb-4">
                    Pesquise pelo nome ou telefone do cliente para verificar se ele é um assinante ativo do clube.
                </p>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                    <input 
                        type="text"
                        placeholder="Nome ou telefone do cliente..."
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl py-4 pl-11 pr-11 text-lg text-white outline-none focus:border-emerald-500 transition-all placeholder:text-gray-700 shadow-inner"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        autoFocus
                    />
                    {search && (
                        <button 
                            onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-500 hover:text-gray-300"
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>
            </div>

            {loading && !subscribers.length && (
                <div className="text-center py-10 text-gray-600 animate-pulse">
                    <RefreshCw className="mx-auto mb-2 animate-spin" />
                    Buscando lista de assinantes...
                </div>
            )}

            {error && (
                <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 text-red-400 text-sm">
                    Erro ao carregar dados: {error}
                </div>
            )}

            <div className="space-y-3">
                {search.length >= 2 && filtered.length === 0 && !loading && (
                    <div className="bg-gray-900/50 border border-dashed border-gray-800 rounded-2xl p-10 text-center">
                        <UserX size={40} className="mx-auto text-gray-700 mb-3" />
                        <p className="text-gray-500 font-medium">Nenhum assinante encontrado para "{search}"</p>
                        <p className="text-[10px] text-gray-700 mt-1 uppercase tracking-widest">Verifique se o nome está correto</p>
                    </div>
                )}

                {filtered.map((client, i) => {
                    const isAtivo = client.status === 'ativo'
                    
                    // Simple logic to find the NEXT billing date
                    const now = new Date()
                    const bDay = client.billingDay || 1
                    let nextBilling = new Date(now.getFullYear(), now.getMonth(), bDay)
                    if (now.getDate() >= bDay) {
                        nextBilling.setMonth(nextBilling.getMonth() + 1)
                    }
                    const nextBillingStr = nextBilling.toLocaleDateString('pt-BR', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric' 
                    })

                    return (
                        <div 
                            key={i} 
                            className={`bg-gray-900 border rounded-2xl p-4 transition-all animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                                isAtivo 
                                ? 'border-emerald-500/30 bg-emerald-950/5' 
                                : 'border-red-900/30 bg-red-950/5'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-white mb-1 leading-tight">{client.name}</h3>
                                    <div className="space-y-1">
                                        {client.email && (
                                            <div className="flex items-center gap-2 text-[13px] text-gray-400">
                                                <span className="text-gray-600 font-medium">E-mail:</span> {client.email}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 text-[13px] text-gray-400">
                                            <span className="text-gray-600 font-medium">Vencimento:</span> 
                                            <span className={isAtivo ? 'text-emerald-400/80' : 'text-red-400/80'}>
                                                {nextBillingStr}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[13px] text-gray-500 italic">
                                            {client.plano || 'Plano não identificado'}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-right">
                                    {isAtivo ? (
                                        <div className="flex flex-col items-end">
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/40 text-emerald-400 rounded-full border border-emerald-500/30 text-xs font-black uppercase tracking-wider mb-1 shadow-lg shadow-emerald-900/20">
                                                <UserCheck size={14} /> ATIVO
                                            </div>
                                            <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-widest leading-none">Pode realizar o serviço</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-end">
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/40 text-red-500 rounded-full border border-red-800/30 text-xs font-black uppercase tracking-wider mb-1">
                                                <UserX size={14} /> INATIVO
                                            </div>
                                            <span className="text-[9px] text-red-700 font-bold uppercase tracking-widest leading-none">Consultar recepção</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {client.rawStatus && (
                                <div className="mt-4 pt-3 border-t border-gray-800/50 flex justify-between items-center bg-gray-950/20 -mx-4 px-4 -mb-4 rounded-b-2xl py-2">
                                    <span className="text-[10px] text-gray-600 uppercase tracking-widest font-medium">Status detalhado Celcoin</span>
                                    <span className={`text-[10px] font-bold ${isAtivo ? 'text-emerald-500/60' : 'text-red-500/60'}`}>
                                        {client.rawStatus}
                                    </span>
                                </div>
                            )}
                        </div>
                    )
                })}

                {search.length < 2 && search.length > 0 && (
                    <div className="text-center py-4 text-gray-600 text-xs">
                        Continue digitando para pesquisar...
                    </div>
                )}
            </div>

            {/* Hint for Barbers */}
            <div className="mt-8 bg-amber-900/10 border border-amber-900/20 rounded-xl p-4 text-amber-500/80">
                <div className="flex gap-3">
                    <ShieldCheck size={32} className="shrink-0 opacity-50" />
                    <div className="text-xs leading-relaxed">
                        <p className="font-bold mb-1 uppercase tracking-wider">Atenção Barbeiro:</p>
                        Sempre verifique o status do cliente antes de iniciar o atendimento pelo clube. Se o status for <span className="text-red-500 font-bold">INATIVO</span>, o cliente deve acertar a situação financeira ou pagar pelo serviço avulso.
                    </div>
                </div>
            </div>
        </div>
    )
}
