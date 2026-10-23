import { useState, useMemo } from 'react'
import { Search, UserCheck, UserX, RefreshCw, X, ShieldCheck, Users } from 'lucide-react'
import { useSubscribers } from '../hooks/useSubscribers'
import { buscarAssinantes } from '../utils/consultaClub'
import { formatTelefone } from '../utils/phone'

const COR = {
    Ativo: 'border-emerald-500/30 bg-emerald-950/5',
    inativo: 'border-red-900/30 bg-red-950/5',
}

export function ClubLookup() {
    const { subscribers, loading, error } = useSubscribers()
    const [search, setSearch] = useState('')

    const filtered = useMemo(() => buscarAssinantes(subscribers, search), [subscribers, search])

    return (
        <div className="space-y-4 pb-20">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <ShieldCheck size={24} className="text-emerald-400" /> Consulta Club Black Salon
                </h2>
                <button onClick={() => window.location.reload()} aria-label="Atualizar"
                    className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-emerald-400 transition-colors">
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 shadow-xl">
                <p className="text-sm text-gray-400 mb-4">
                    Pesquise pelo nome (ou parte dele) ou pelo telefone, com ou sem DDD.
                </p>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                    <input type="text" inputMode="search" placeholder="Nome ou telefone do cliente..." autoFocus
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl py-4 pl-11 pr-11 text-lg text-white outline-none focus:border-emerald-500 placeholder:text-gray-700"
                        value={search} onChange={e => setSearch(e.target.value)} />
                    {search && (
                        <button onClick={() => setSearch('')} aria-label="Limpar"
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-500 hover:text-gray-300"><X size={20} /></button>
                    )}
                </div>
            </div>

            {loading && !subscribers.length && (
                <div className="text-center py-10 text-gray-600 animate-pulse">
                    <RefreshCw className="mx-auto mb-2 animate-spin" /> Buscando assinantes...
                </div>
            )}
            {error && <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 text-red-400 text-sm">Erro ao carregar: {error}</div>}

            <div className="space-y-3">
                {search.trim().length >= 2 && filtered.length === 0 && !loading && (
                    <div className="bg-gray-900/50 border border-dashed border-gray-800 rounded-2xl p-10 text-center">
                        <UserX size={40} className="mx-auto text-gray-700 mb-3" />
                        <p className="text-gray-500 font-medium">Nenhum assinante encontrado para "{search}"</p>
                    </div>
                )}

                {filtered.map(c => {
                    const ativo = c.status === 'ativo'
                    return (
                        <div key={c.telefone} className={`bg-gray-900 border rounded-2xl p-4 ${ativo ? COR.Ativo : COR.inativo}`}>
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-bold text-white leading-tight">{c.name}</h3>
                                    <div className="text-[13px] text-gray-400 mt-1 space-y-0.5">
                                        <div>{c.plano || 'Plano não informado'} · {formatTelefone(c.phone)}</div>
                                        {c.dependenteDe && (
                                            <div className="flex items-center gap-1 text-cyan-300"><Users size={13} /> Dependente de {c.dependenteDe}</div>
                                        )}
                                        {ativo && c.proximoVencimento && (
                                            <div>Próximo vencimento: <span className="text-emerald-400/80">{c.proximoVencimento.split('-').reverse().join('/')}</span></div>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-black uppercase tracking-wider mb-1 ${ativo ? 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30' : 'bg-red-900/40 text-red-400 border-red-800/30'}`}>
                                        {ativo ? <UserCheck size={14} /> : <UserX size={14} />} {c.statusTexto}
                                    </div>
                                    <div className={`text-[9px] font-bold uppercase tracking-widest ${ativo ? 'text-emerald-600' : 'text-red-700'}`}>
                                        {ativo ? 'Pode realizar o serviço' : 'Consultar recepção'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="mt-8 bg-amber-900/10 border border-amber-900/20 rounded-xl p-4 text-amber-500/80 text-xs leading-relaxed">
                <p className="font-bold mb-1 uppercase tracking-wider">Atenção barbeiro:</p>
                Só atenda pelo clube quem aparece como <b className="text-emerald-400">ATIVO</b>. Vencido, cartão recusado ou cancelado:
                o cliente acerta na recepção ou paga o serviço avulso.
            </div>
        </div>
    )
}
