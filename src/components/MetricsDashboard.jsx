import { useState, useMemo } from 'react'
import { TrendingUp, Users, Clock, UserX, CalendarCheck, RefreshCw, Search, MessageCircle, ChevronDown, ChevronUp, Phone, AlertTriangle, Calendar, Star, CheckCircle2 } from 'lucide-react'
import { useClientPredictions } from '../hooks/useClientPredictions'

const fmt = (d) => {
    if (!d) return '-'
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const fmtShort = (d) => {
    if (!d) return '-'
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function buildWhatsAppLink(phone, name) {
    const firstName = (name || '').split(' ')[0]
    const msg = `Olá ${firstName}! Tudo bem? 😊 Notamos que está na hora do seu próximo corte. Quer agendar um horário? 💈✂️`
    // Ensure phone starts with 55
    const cleanPhone = phone.startsWith('55') ? phone : `55${phone}`
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
}

function frequencyLabel(days) {
    if (!days || days <= 0) return '-'
    if (days <= 7) return `${days}d (semanal)`
    if (days <= 10) return `${days}d (~semanal)`
    if (days <= 16) return `${days}d (quinzenal)`
    if (days <= 21) return `${days}d (~quinzenal)`
    if (days <= 35) return `${days}d (mensal)`
    if (days <= 50) return `${days}d (~mensal)`
    return `${days}d (esporádico)`
}

function predictionLabel(daysUntil) {
    if (daysUntil === 0) return 'Hoje'
    if (daysUntil === 1) return 'Amanhã'
    if (daysUntil === -1) return 'Ontem'
    if (daysUntil > 1) return `em ${daysUntil}d`
    return `${Math.abs(daysUntil)}d atrás`
}

function ConfidenceBadge({ label }) {
    const colors = {
        'Alta': 'bg-green-900/40 text-green-400 border-green-700/40',
        'Média': 'bg-yellow-900/40 text-yellow-400 border-yellow-700/40',
        'Baixa': 'bg-red-900/40 text-red-400 border-red-700/40'
    }
    return (
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${colors[label] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
            {label}
        </span>
    )
}

export function MetricsDashboard() {
    const { predictions, inactive, stats, loading, error, refetch } = useClientPredictions()
    const [search, setSearch] = useState('')
    const [showInactive, setShowInactive] = useState(false)
    const [showAll, setShowAll] = useState(false)
    const [hideSubscribers, setHideSubscribers] = useState(false)
    const [filter, setFilter] = useState('all') // 'today' | 'week' | 'all' | 'overdue'

    const filtered = useMemo(() => {
        let list = predictions

        // Subscriber filter
        if (hideSubscribers) {
            list = list.filter(p => !p.isSubscriber)
        }

        // Filter by prediction window
        if (filter === 'today') list = list.filter(p => Math.abs(p.daysUntilNext) <= 2)
        else if (filter === 'week') list = list.filter(p => p.daysUntilNext >= -2 && p.daysUntilNext <= 7)
        else if (filter === 'overdue') list = list.filter(p => p.daysUntilNext < -2)

        // Search filter
        if (search) {
            const q = search.toLowerCase()
            list = list.filter(p =>
                p.name.toLowerCase().includes(q) || p.phone.includes(q)
            )
        }

        return list
    }, [predictions, search, filter])

    const filteredInactive = useMemo(() => {
        let list = inactive
        if (hideSubscribers) {
            list = list.filter(p => !p.isSubscriber)
        }
        if (!search) return list
        const q = search.toLowerCase()
        return list.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q))
    }, [inactive, search, hideSubscribers])

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="text-center">
                    <RefreshCw size={32} className="text-cyan-500 animate-spin mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Analisando frequência dos clientes...</p>
                    <p className="text-gray-600 text-xs mt-1">Processando dados de agendamento</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-950 text-gray-200 p-3 sm:p-4 pb-24 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <TrendingUp size={22} className="text-cyan-500" />
                    <h1 className="text-lg font-bold">Previsão de Visitas</h1>
                </div>
                <button onClick={refetch} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-cyan-400 transition-colors">
                    <RefreshCw size={16} />
                </button>
            </div>

            {error && (
                <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 mb-4 text-sm text-red-400 flex items-center gap-2">
                    <AlertTriangle size={16} /> {error}
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <div className="flex items-center gap-2 text-cyan-500 mb-1">
                        <CalendarCheck size={16} />
                        <span className="text-[10px] uppercase tracking-wider text-gray-500">Previstos Hoje</span>
                    </div>
                    <div className="text-2xl font-bold text-cyan-400">{stats.todayCount || 0}</div>
                    <div className="text-[10px] text-gray-600">±2 dias</div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <div className="flex items-center gap-2 text-purple-500 mb-1">
                        <Clock size={16} />
                        <span className="text-[10px] uppercase tracking-wider text-gray-500">Freq. Média</span>
                    </div>
                    <div className="text-2xl font-bold text-purple-400">{stats.avgFrequency || 0}d</div>
                    <div className="text-[10px] text-gray-600">entre visitas</div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <div className="flex items-center gap-2 text-green-500 mb-1">
                        <Users size={16} />
                        <span className="text-[10px] uppercase tracking-wider text-gray-500">Clientes Ativos</span>
                    </div>
                    <div className="text-2xl font-bold text-green-400">{stats.totalActive || 0}</div>
                    <div className="text-[10px] text-gray-600">WA + Booksy</div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <div className="flex items-center gap-2 text-yellow-500 mb-1">
                        <AlertTriangle size={16} />
                        <span className="text-[10px] uppercase tracking-wider text-gray-500">Atrasados</span>
                    </div>
                    <div className="text-2xl font-bold text-yellow-400">{stats.overdueCount || 0}</div>
                    <div className="text-[10px] text-gray-600">passaram da previsão</div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <div className="flex items-center gap-2 text-amber-500 mb-1">
                        <Star size={16} />
                        <span className="text-[10px] uppercase tracking-wider text-gray-500">Club (Assinantes)</span>
                    </div>
                    <div className="text-2xl font-bold text-amber-400">{stats.subscriberCount || 0}</div>
                    <div className="text-[10px] text-gray-600">no total analisado</div>
                </div>
            </div>

            {/* Search + Filter */}
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <div className="flex-1 flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                    <Search size={16} className="text-gray-500" />
                    <input
                        placeholder="Buscar cliente por nome ou telefone..."
                        className="flex-1 bg-transparent text-sm text-gray-200 outline-none placeholder-gray-600"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
                    )}
                </div>
                <div className="flex gap-1">
                    {[
                        { key: 'today', label: 'Hoje' },
                        { key: 'week', label: 'Semana' },
                        { key: 'overdue', label: 'Atrasados' },
                        { key: 'all', label: 'Todos' }
                    ].map(f => (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f.key
                                ? 'bg-cyan-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                    <button
                        onClick={() => setHideSubscribers(!hideSubscribers)}
                        className={`ml-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border ${hideSubscribers
                            ? 'bg-amber-900/40 text-amber-400 border-amber-700/50'
                            : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
                            }`}
                    >
                        {hideSubscribers ? <><Star size={12} fill="currentColor" /> Assinantes Ocultos</> : <><Star size={12} /> Ocultar Assinantes</>}
                    </button>
                </div>
            </div>

            {/* Predictions Table */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-4">
                <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                        <CalendarCheck size={16} className="text-cyan-500" />
                        Clientes com visita prevista
                    </h3>
                    <span className="text-xs text-gray-500">{filtered.length} clientes</span>
                </div>

                {filtered.length === 0 ? (
                    <div className="p-8 text-center text-gray-600 text-sm">
                        {search ? 'Nenhum cliente encontrado com essa busca' : 'Nenhum cliente previsto para o período selecionado'}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-950 text-gray-500 text-xs">
                                <tr>
                                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                                    <th className="px-3 py-2.5 font-medium hidden sm:table-cell">Última Visita</th>
                                    <th className="px-3 py-2.5 font-medium hidden sm:table-cell">Frequência</th>
                                    <th className="px-3 py-2.5 font-medium">Previsão</th>
                                    <th className="px-3 py-2.5 font-medium hidden sm:table-cell">Confiança</th>
                                    <th className="px-3 py-2.5 font-medium text-center">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800/50">
                                {(showAll ? filtered : filtered.slice(0, 20)).map((client, i) => {
                                    const predColor = client.daysUntilNext <= 0 ? 'text-red-400' :
                                        client.daysUntilNext <= 2 ? 'text-yellow-400' : 'text-green-400'
                                    return (
                                        <tr key={i} className="hover:bg-gray-800/30 transition-colors">
                                            <td className="px-4 py-2.5">
                                                <div className="font-medium text-sm flex items-center gap-1.5">
                                                    {client.name}
                                                    {client.isSubscriber && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400 border border-amber-700/40 flex items-center gap-0.5">
                                                            <CheckCircle2 size={8} /> CLUB
                                                        </span>
                                                    )}
                                                    {client.source === 'booksy' && !client.phone && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-900/40 text-orange-400 border border-orange-700/40">Booksy</span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-gray-600 flex items-center gap-1">
                                                    {client.phone ? (
                                                        <><Phone size={9} /> {client.phone}</>
                                                    ) : (
                                                        <><Calendar size={9} /> <span className="text-gray-700">Sem telefone</span></>
                                                    )}
                                                    {client.barbers?.length > 0 && (
                                                        <span className="ml-1 text-purple-500">· {client.barbers.join(', ')}</span>
                                                    )}
                                                </div>
                                                {/* Mobile-only info */}
                                                <div className="sm:hidden text-[10px] text-gray-500 mt-0.5">
                                                    Última: {fmtShort(client.lastVisit)} · {frequencyLabel(client.avgInterval)} · <ConfidenceBadge label={client.confidenceLabel} />
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 hidden sm:table-cell">
                                                <span className="text-xs text-gray-400">{fmtShort(client.lastVisit)}</span>
                                                <div className="text-[10px] text-gray-600">{client.lastVisit ? dayNames[client.lastVisit.getDay()] : ''} · {client.daysSinceLastVisit}d atrás</div>
                                            </td>
                                            <td className="px-3 py-2.5 hidden sm:table-cell">
                                                <span className="text-xs text-gray-300">{frequencyLabel(client.avgInterval)}</span>
                                                <div className="text-[10px] text-gray-600">{client.visitCount} visitas</div>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <div className={`text-xs font-bold ${predColor}`}>
                                                    {predictionLabel(client.daysUntilNext)}
                                                </div>
                                                <div className="text-[10px] text-gray-600">{fmtShort(client.predictedNext)}</div>
                                            </td>
                                            <td className="px-3 py-2.5 hidden sm:table-cell">
                                                <ConfidenceBadge label={client.confidenceLabel} />
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                {client.phone ? (
                                                    <a
                                                        href={buildWhatsAppLink(client.phone, client.name)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-medium transition-colors"
                                                        onClick={e => e.stopPropagation()}
                                                    >
                                                        <MessageCircle size={13} />
                                                        <span className="hidden sm:inline">WhatsApp</span>
                                                    </a>
                                                ) : (
                                                    <span className="text-[10px] text-gray-700">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {filtered.length > 20 && (
                    <button
                        onClick={() => setShowAll(!showAll)}
                        className="w-full py-3 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/30 transition-colors flex items-center justify-center gap-1 border-t border-gray-800"
                    >
                        {showAll ? <><ChevronUp size={14} /> Mostrar menos</> : <><ChevronDown size={14} /> Ver todos ({filtered.length})</>}
                    </button>
                )}
            </div>

            {/* Inactive Clients */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <button
                    onClick={() => setShowInactive(!showInactive)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
                >
                    <h3 className="font-semibold text-sm flex items-center gap-2 text-gray-400">
                        <UserX size={16} className="text-yellow-500" />
                        Clientes Inativos / Visita Única
                        <span className="text-[10px] text-gray-600 font-normal">({filteredInactive.length})</span>
                    </h3>
                    {showInactive ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                </button>

                {showInactive && (
                    <div className="border-t border-gray-800 overflow-x-auto">
                        {filteredInactive.length === 0 ? (
                            <div className="p-6 text-center text-gray-600 text-sm">Nenhum cliente inativo encontrado</div>
                        ) : (
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-950 text-gray-500 text-xs">
                                    <tr>
                                        <th className="px-4 py-2 font-medium">Cliente</th>
                                        <th className="px-3 py-2 font-medium">Última Visita</th>
                                        <th className="px-3 py-2 font-medium text-center">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800/50">
                                    {filteredInactive.slice(0, 30).map((client, i) => (
                                        <tr key={i} className="hover:bg-gray-800/30">
                                            <td className="px-4 py-2">
                                                <div className="text-sm text-gray-300 flex items-center gap-1.5">
                                                    {client.name}
                                                    {client.isSubscriber && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400 border border-amber-700/40 flex items-center gap-0.5">
                                                            <CheckCircle2 size={8} /> CLUB
                                                        </span>
                                                    )}
                                                    {client.source === 'booksy' && !client.phone && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-900/40 text-orange-400 border border-orange-700/40">Booksy</span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-gray-600">{client.phone || 'Sem telefone'}</div>
                                            </td>
                                            <td className="px-3 py-2">
                                                <span className="text-xs text-gray-400">{fmtShort(client.lastVisit)}</span>
                                                <div className="text-[10px] text-gray-600">{client.daysSinceLastVisit}d atrás</div>
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                {client.phone ? (
                                                    <a
                                                        href={buildWhatsAppLink(client.phone, client.name)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 px-2 py-1 bg-green-700/50 hover:bg-green-600 text-green-300 rounded-lg text-xs transition-colors"
                                                    >
                                                        <MessageCircle size={12} />
                                                    </a>
                                                ) : (
                                                    <span className="text-[10px] text-gray-700">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
