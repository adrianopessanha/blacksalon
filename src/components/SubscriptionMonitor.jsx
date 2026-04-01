import React, { useState, useEffect, useMemo } from 'react'
import { db, collection, query, where, getDocs } from '../firebase'
import { Timestamp, doc, updateDoc } from 'firebase/firestore'
import { Users, DollarSign, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Target, CreditCard, ChevronDown, ChevronUp, RefreshCw, BarChart3, Pencil, X, Check, Search } from 'lucide-react'
import { useSubscribers } from '../hooks/useSubscribers'

// ==========================================
// PLAN CONFIGURATIONS
// Nomes exatos da Celcoin + valores e comissões do negócio
// ==========================================
const PLANS = [
    { id: 'cria', label: 'Corte de Cria', celcoin: 'plano corte de cria', value: 80, commission: 10, fee: 5.40 },
    { id: 'corte', label: 'Corte Ilimitado', celcoin: 'plano corte de cabelo ilimitado', value: 100, commission: 12.50, fee: 6.81 },
    { id: 'cabelo_barba', label: 'Cabelo e Barba', celcoin: 'plano cabelo e barba ilimitado', value: 140, commission: 17.50, fee: 8.88 },
    { id: 'barba', label: 'Barba Ilimitada', celcoin: 'plano barba ilimitada', value: 80, commission: 10, fee: 5.40 },
]

// Detect plan from Celcoin plan name, sheet data, or plan value
function detectPlan(subscriber, visits) {
    const plano = (subscriber?.plano || '').toLowerCase().trim()
    const planValue = subscriber?.planValue

    // 1. Match exact Celcoin plan names
    if (plano) {
        if (plano.includes('cabelo e barba') || plano.includes('cabelo') && plano.includes('barba')) return PLANS.find(p => p.id === 'cabelo_barba')
        if (plano.includes('barba ilimitada') || (plano.includes('barba') && !plano.includes('cabelo') && !plano.includes('cria'))) return PLANS.find(p => p.id === 'barba')
        if (plano.includes('corte de cabelo ilimitado')) return PLANS.find(p => p.id === 'corte')
        if (plano.includes('corte de cria') || plano.includes('cria')) return PLANS.find(p => p.id === 'cria')
    }

    // 2. Match by plan value from sheet
    if (planValue) {
        // R$ 140 = cabelo e barba (or cria at R$ 140 for combo clients like Jean Gomes)
        if (planValue >= 13000 || planValue === 140) return PLANS.find(p => p.id === 'cabelo_barba')
        if (planValue >= 9000 || planValue === 100) return PLANS.find(p => p.id === 'corte')
        if (planValue >= 7000 || planValue === 80) {
            // R$ 80 can be cria or barba - check plano text
            if (plano.includes('barba')) return PLANS.find(p => p.id === 'barba')
            return PLANS.find(p => p.id === 'cria')
        }
    }

    // 3. Fallback: detect from service descriptions in visits
    if (visits && visits.length > 0) {
        const descs = visits.map(v => (v.servico_descricao || '').toLowerCase())
        if (descs.some(d => d.includes('barba') && (d.includes('corte') || d.includes('cabelo')))) return PLANS.find(p => p.id === 'cabelo_barba')
        if (descs.some(d => d.includes('barba'))) return PLANS.find(p => p.id === 'barba')
        if (descs.some(d => d.includes('tes'))) return PLANS.find(p => p.id === 'corte')
    }

    // Default
    return PLANS.find(p => p.id === 'cria')
}

const fmt = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ==========================================
// MAIN COMPONENT
// ==========================================
export function SubscriptionMonitor() {
    const { subscribers, loading: subsLoading, error: subsError } = useSubscribers()
    const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
    const [lancamentos, setLancamentos] = useState([])
    const [loading, setLoading] = useState(false)

    // Fetch lancamentos - broader range to cover individual billing cycles
    const fetchData = async () => {
        setLoading(true)
        try {
            const [y, m] = month.split('-').map(Number)
            // Fetch from previous month start to cover cycles that started in the previous month
            const start = new Date(y, m - 2, 1)
            const end = new Date(y, m + 1, 0, 23, 59, 59)

            const q = query(
                collection(db, 'lancamentos'),
                where('data', '>=', Timestamp.fromDate(start)),
                where('data', '<=', Timestamp.fromDate(end))
            )
            const snapshot = await getDocs(q)
            // Filter Assinante client-side to avoid needing composite index
            setLancamentos(snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.forma_pagamento === 'Assinante'))
        } catch (e) {
            console.error('Erro ao buscar lançamentos:', e)
            alert('Erro ao buscar lançamentos: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [month])

    // ==========================================
    // CYCLE HELPERS
    // ==========================================

    // Calculate billing cycle window for a subscriber based on their billing day
    // Shows the ACTIVE cycle: if billing day hasn't happened yet this month,
    // show the previous cycle (last month's billing day → this month's billing day - 1)
    const getCycleWindow = (billingDay, selectedMonth) => {
        const [y, m] = selectedMonth.split('-').map(Number) // m is 1-indexed
        const day = billingDay || 1

        // Clamp day to max days in a given month (e.g. day 31 in Feb → 28)
        const safeDate = (year, month0, d) => {
            const maxDay = new Date(year, month0 + 1, 0).getDate()
            return new Date(year, month0, Math.min(d, maxDay))
        }

        // Reference: use today for current month, last day for past/future months
        const now = new Date()
        const isCurrentMonth = y === now.getFullYear() && m === (now.getMonth() + 1)
        const refDay = isCurrentMonth ? now.getDate() : new Date(y, m, 0).getDate()

        let cycleStart, cycleEnd

        if (day > refDay) {
            // Billing day hasn't happened this month → show previous cycle
            // Ex: billing day 31, today Mar 25 → cycle: Feb 28 → Mar 30
            cycleStart = safeDate(y, m - 2, day) // prev month billing day (0-indexed)
            const thisMonthBilling = safeDate(y, m - 1, day)
            cycleEnd = new Date(thisMonthBilling.getTime() - 86400000) // day before
        } else {
            // Billing day already passed → show current cycle
            // Ex: billing day 13, today Mar 25 → cycle: Mar 13 → Apr 12
            cycleStart = safeDate(y, m - 1, day) // this month billing day
            const nextMonthBilling = safeDate(y, m, day)
            cycleEnd = new Date(nextMonthBilling.getTime() - 86400000) // day before
        }

        cycleStart.setHours(0, 0, 0, 0)
        cycleEnd.setHours(23, 59, 59, 999)

        return { cycleStart, cycleEnd }
    }

    const formatCycle = (cycleStart, cycleEnd) => {
        const fmtDate = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
        return `${fmtDate(cycleStart)} → ${fmtDate(cycleEnd)}`
    }

    // ==========================================
    // COMPUTED ANALYTICS
    // ==========================================
    const analytics = useMemo(() => {
        if (subsLoading) return null

        // Pre-process lancamentos with dates
        const lancamentosWithDates = lancamentos.map(l => ({
            ...l,
            dateObj: l.data?.seconds ? new Date(l.data.seconds * 1000) : null
        })).filter(l => l.dateObj)

        // Group visits by subscriber code (preferred) or client name within their individual cycle
        const getVisitsForClient = (subscriber, billingDay) => {
            const { cycleStart, cycleEnd } = getCycleWindow(billingDay, month)
            const code = subscriber.code || null
            const nameKey = subscriber.name.toLowerCase()
            return lancamentosWithDates.filter(l => {
                if (l.dateObj < cycleStart || l.dateObj > cycleEnd) return false
                // Match by subscriber code first (reliable), then fallback to name
                if (code && l.subscriber_code) {
                    return l.subscriber_code === code
                }
                const lName = (l.cliente_nome || '').trim().toLowerCase()
                return lName === nameKey
            })
        }

        // Build per-subscriber analysis with individual billing cycles
        const clientAnalysis = []

        // Active subscribers from sheet
        const processedNames = new Set()
        const processedCodes = new Set()
        subscribers.forEach(sub => {
            const key = sub.name.toLowerCase()
            processedNames.add(key)
            if (sub.code) processedCodes.add(sub.code)

            const billingDay = sub.billingDay || 1
            const visits = getVisitsForClient(sub, billingDay)
            const { cycleStart, cycleEnd } = getCycleWindow(billingDay, month)
            const plan = detectPlan(sub, visits)
            const visitCount = visits.length
            const totalCommission = visits.reduce((s, v) => s + (parseFloat(v.comissao_barbeiro) || 0), 0)
            const revenue = plan.value
            const costs = plan.fee + totalCommission
            const profit = revenue - costs
            const breakEven = Math.floor((revenue - plan.fee) / plan.commission)
            const isOverLimit = visitCount > breakEven

            clientAnalysis.push({
                name: sub.name,
                code: sub.code || null,
                plan,
                planoLabel: sub.plano || plan.label,
                phone: sub.phone,
                status: 'ativo',
                billingDay,
                cycleStart,
                cycleEnd,
                cycleLabel: formatCycle(cycleStart, cycleEnd),
                visitCount,
                totalCommission,
                revenue,
                fee: plan.fee,
                costs,
                profit,
                breakEven,
                isOverLimit,
                visits,
                isFromSheet: true
            })
        })

        // Also include clients who used Assinante but aren't in the sheet (edge cases)
        // Use default cycle (day 1) for unknown subscribers
        const allClientNames = new Set(lancamentosWithDates.map(l => (l.cliente_nome || '').trim().toLowerCase()))
        allClientNames.forEach(key => {
            if (processedNames.has(key)) return
            if (!key || key === 'não informado') return
            // Check if any lancamento with this name has a code that was already processed
            const hasProcessedCode = lancamentosWithDates.some(l =>
                (l.cliente_nome || '').trim().toLowerCase() === key && l.subscriber_code && processedCodes.has(l.subscriber_code)
            )
            if (hasProcessedCode) return

            const visits = getVisitsForClient({ name: key, code: null }, 1)
            if (visits.length === 0) return

            const { cycleStart, cycleEnd } = getCycleWindow(1, month)
            const clientName = visits[0].cliente_nome?.trim() || key
            const plan = detectPlan(null, visits)
            const visitCount = visits.length
            const totalCommission = visits.reduce((s, v) => s + (parseFloat(v.comissao_barbeiro) || 0), 0)
            const revenue = plan.value
            const costs = plan.fee + totalCommission
            const profit = revenue - costs
            const breakEven = Math.floor((revenue - plan.fee) / plan.commission)

            clientAnalysis.push({
                name: clientName,
                plan,
                planoLabel: plan.label,
                status: 'sem_cadastro',
                billingDay: 1,
                cycleStart,
                cycleEnd,
                cycleLabel: formatCycle(cycleStart, cycleEnd),
                visitCount,
                totalCommission,
                revenue,
                fee: plan.fee,
                costs,
                profit,
                breakEven,
                isOverLimit: visitCount > breakEven,
                visits,
                isFromSheet: false
            })
        })

        // Sort: most visits first (most impactful)
        clientAnalysis.sort((a, b) => b.visitCount - a.visitCount)

        // Totals
        const activeWithVisits = clientAnalysis.filter(c => c.visitCount > 0)
        const totalRevenue = clientAnalysis.filter(c => c.status === 'ativo').reduce((s, c) => s + c.revenue, 0)
        const totalFees = clientAnalysis.filter(c => c.status === 'ativo').reduce((s, c) => s + c.fee, 0)
        const totalCommission = clientAnalysis.reduce((s, c) => s + c.totalCommission, 0)
        const totalCosts = totalFees + totalCommission
        const totalProfit = totalRevenue - totalCosts
        const profitableCount = clientAnalysis.filter(c => c.profit > 0 && c.visitCount > 0).length
        const lossCount = clientAnalysis.filter(c => c.profit < 0).length
        const noShowCount = clientAnalysis.filter(c => c.visitCount === 0 && c.status === 'ativo').length
        const avgVisits = activeWithVisits.length > 0 ? activeWithVisits.reduce((s, c) => s + c.visitCount, 0) / activeWithVisits.length : 0

        // Per-plan breakdown
        const byPlan = {}
        PLANS.forEach(p => {
            const clients = clientAnalysis.filter(c => c.plan.id === p.id && c.status === 'ativo')
            byPlan[p.id] = {
                plan: p,
                count: clients.length,
                totalRevenue: clients.reduce((s, c) => s + c.revenue, 0),
                totalCommission: clients.reduce((s, c) => s + c.totalCommission, 0),
                totalFees: clients.reduce((s, c) => s + c.fee, 0),
                totalProfit: clients.reduce((s, c) => s + c.profit, 0),
                avgVisits: clients.length > 0 ? clients.reduce((s, c) => s + c.visitCount, 0) / clients.length : 0,
                breakEven: Math.floor((p.value - p.fee) / p.commission)
            }
        })

        return {
            clients: clientAnalysis,
            totalRevenue,
            totalFees,
            totalCommission,
            totalCosts,
            totalProfit,
            activeCount: subscribers.length,
            profitableCount,
            lossCount,
            noShowCount,
            avgVisits,
            totalVisits: clientAnalysis.reduce((s, c) => s + c.visitCount, 0),
            byPlan
        }
    }, [subscribers, lancamentos, subsLoading])

    // ==========================================
    // EXPAND/COLLAPSE
    // ==========================================
    const [expandedClient, setExpandedClient] = useState(null)
    const [showAllClients, setShowAllClients] = useState(false)
    const [editingClient, setEditingClient] = useState(null) // { name, visits }
    const [editSearch, setEditSearch] = useState('')
    const [editLoading, setEditLoading] = useState(false)
    const [clientSearch, setClientSearch] = useState('')

    // Link lancamentos from one client name to a subscriber from the sheet
    const handleLinkSubscriber = async (oldClient, subscriber) => {
        if (!oldClient?.visits?.length) return
        setEditLoading(true)
        try {
            const promises = oldClient.visits.map(v =>
                updateDoc(doc(db, 'lancamentos', v.id), {
                    cliente_nome: subscriber.name,
                    subscriber_code: subscriber.code || null
                })
            )
            await Promise.all(promises)
            alert(`${oldClient.visits.length} lançamento(s) vinculados a "${subscriber.name}" (${subscriber.code ? '#' + subscriber.code : ''})`)
            setEditingClient(null)
            setEditSearch('')
            fetchData() // Refresh
        } catch (e) {
            alert('Erro ao vincular: ' + e.message)
        } finally {
            setEditLoading(false)
        }
    }

    // ==========================================
    // RENDER
    // ==========================================
    const isLoading = loading || subsLoading

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <CreditCard size={24} className="text-purple-400" /> Monitoramento de Assinaturas
                </h2>
                <div className="flex items-center gap-2">
                    <input type="month" value={month}
                        onChange={e => setMonth(e.target.value)}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-purple-500 scheme-dark" />
                    <button onClick={fetchData} className="bg-purple-600 hover:bg-purple-500 text-white p-2 rounded-lg transition-all">
                        <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {subsError && (
                <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 text-red-400 text-sm flex items-center gap-2">
                    <AlertTriangle size={16} /> Erro ao carregar assinantes: {subsError}
                </div>
            )}

            {analytics && (
                <>
                    {/* ============ SUMMARY CARDS ============ */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <MetricCard label="Assinantes Ativos" value={analytics.activeCount} icon={Users} color="purple" />
                        <MetricCard label="Receita Planos" value={fmt(analytics.totalRevenue)} icon={DollarSign} color="cyan" />
                        <MetricCard label="Comissões Pagas" value={fmt(analytics.totalCommission)} icon={TrendingDown} color="red" />
                        <MetricCard label="Taxas Celcoin" value={fmt(analytics.totalFees)} icon={CreditCard} color="orange" />
                        <MetricCard label={analytics.totalProfit >= 0 ? 'Lucro' : 'Prejuízo'} value={fmt(analytics.totalProfit)} icon={analytics.totalProfit >= 0 ? TrendingUp : TrendingDown} color={analytics.totalProfit >= 0 ? 'green' : 'red'} />
                        <MetricCard label="Média Visitas" value={analytics.avgVisits.toFixed(1)} icon={BarChart3} color="blue" sub={`${analytics.totalVisits} total`} />
                    </div>

                    {/* ============ HEALTH INDICATORS ============ */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-green-900/20 border border-green-800/50 rounded-xl p-4 text-center">
                            <div className="text-3xl font-black text-green-400">{analytics.profitableCount}</div>
                            <div className="text-xs text-green-500 mt-1 flex items-center justify-center gap-1"><CheckCircle size={12} /> Lucrativos</div>
                        </div>
                        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 text-center">
                            <div className="text-3xl font-black text-red-400">{analytics.lossCount}</div>
                            <div className="text-xs text-red-500 mt-1 flex items-center justify-center gap-1"><AlertTriangle size={12} /> Prejuízo</div>
                        </div>
                        <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 text-center">
                            <div className="text-3xl font-black text-gray-400">{analytics.noShowCount}</div>
                            <div className="text-xs text-gray-500 mt-1">Sem uso no ciclo</div>
                        </div>
                    </div>

                    {/* ============ BREAK-EVEN PER PLAN ============ */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-800">
                            <h3 className="font-bold text-gray-200 flex items-center gap-2">
                                <Target size={18} className="text-yellow-500" /> Ponto de Equilíbrio por Plano
                            </h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-800">
                            {PLANS.map(plan => {
                                const data = analytics.byPlan[plan.id]
                                const breakEven = data.breakEven
                                return (
                                    <div key={plan.id} className="p-4">
                                        <div className="text-sm font-bold text-gray-200 mb-2">{plan.label}</div>
                                        <div className="text-xs text-gray-500 space-y-1">
                                            <div className="flex justify-between"><span>Plano:</span> <span className="text-gray-300">{fmt(plan.value)}/mês</span></div>
                                            <div className="flex justify-between"><span>Comissão/visita:</span> <span className="text-gray-300">{fmt(plan.commission)}</span></div>
                                            <div className="flex justify-between"><span>Taxa Celcoin:</span> <span className="text-gray-300">{fmt(plan.fee)}</span></div>
                                            <div className="flex justify-between border-t border-gray-800 pt-1 mt-1">
                                                <span className="font-medium text-yellow-500">Máx visitas (lucro):</span>
                                                <span className="font-bold text-yellow-400 text-lg">{breakEven}x</span>
                                            </div>
                                        </div>
                                        {data.count > 0 && (
                                            <div className="mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500 space-y-0.5">
                                                <div className="flex justify-between"><span>{data.count} assinantes</span> <span>Média: {data.avgVisits.toFixed(1)} visitas</span></div>
                                                <div className={`flex justify-between font-medium ${data.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    <span>Resultado:</span> <span>{fmt(data.totalProfit)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* ============ CLIENT TABLE ============ */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="font-bold text-gray-200 flex items-center gap-2">
                                <Users size={18} className="text-purple-500" /> Análise por Assinante
                            </h3>
                            <span className="text-xs text-gray-500">{analytics.clients.length} assinantes</span>
                        </div>

                        {/* Search bar */}
                        <div className="px-4 py-3 border-b border-gray-800">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    placeholder="Buscar assinante pelo nome..."
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 pl-9 pr-9 text-sm text-gray-200 outline-none focus:border-purple-500 placeholder-gray-600"
                                    value={clientSearch}
                                    onChange={e => setClientSearch(e.target.value)}
                                />
                                {clientSearch && (
                                    <button onClick={() => setClientSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-950 text-gray-500 text-xs">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Assinante</th>
                                        <th className="px-3 py-3 font-medium">Plano</th>
                                        <th className="px-3 py-3 font-medium">Ciclo</th>
                                        <th className="px-3 py-3 font-medium text-center">Visitas</th>
                                        <th className="px-3 py-3 font-medium text-center">Limite</th>
                                        <th className="px-3 py-3 font-medium text-right">Receita</th>
                                        <th className="px-3 py-3 font-medium text-right">Comissão</th>
                                        <th className="px-3 py-3 font-medium text-right">Resultado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800/50 text-gray-300">
                                    {(() => {
                                        const filtered = clientSearch
                                            ? analytics.clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                                            : analytics.clients
                                        const visible = clientSearch ? filtered : (showAllClients ? filtered : filtered.slice(0, 15))
                                        return visible
                                    })().map((client, i) => {
                                        const profitColor = client.profit > 0 ? 'text-green-400' : client.profit < 0 ? 'text-red-400' : 'text-gray-400'
                                        const visitColor = client.isOverLimit ? 'text-red-400 font-bold' : client.visitCount >= client.breakEven ? 'text-yellow-400 font-medium' : 'text-green-400'
                                        const isExpanded = expandedClient === client.name

                                        return (
                                            <React.Fragment key={i}>
                                            <tr
                                                onClick={() => setExpandedClient(isExpanded ? null : client.name)}
                                                className={`hover:bg-gray-800/30 transition-colors cursor-pointer ${isExpanded ? 'bg-gray-800/20' : ''}`}>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full shrink-0 ${client.profit > 0 ? 'bg-green-500' : client.profit < 0 ? 'bg-red-500' : 'bg-gray-500'}`} />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-medium text-sm truncate">{client.name}</span>
                                                                {client.visitCount > 0 && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            setEditingClient(editingClient?.name === client.name ? null : client)
                                                                            setEditSearch('')
                                                                        }}
                                                                        className="p-0.5 rounded hover:bg-purple-900/40 text-gray-600 hover:text-purple-400 transition-colors shrink-0"
                                                                        title="Vincular ao assinante correto"
                                                                    >
                                                                        <Pencil size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                            {client.code && <span className="text-[10px] text-gray-500">#{client.code}</span>}
                                                            {!client.isFromSheet && <span className="text-[10px] text-yellow-500">sem cadastro</span>}

                                                            {/* Edit dropdown */}
                                                            {editingClient?.name === client.name && (
                                                                <div className="mt-2 bg-gray-950 border border-purple-700/50 rounded-lg p-2 shadow-xl" onClick={e => e.stopPropagation()}>
                                                                    <div className="flex items-center gap-1 mb-2">
                                                                        <Search size={12} className="text-gray-500" />
                                                                        <input
                                                                            autoFocus
                                                                            placeholder="Buscar assinante..."
                                                                            className="flex-1 bg-transparent text-xs text-gray-200 outline-none placeholder-gray-600"
                                                                            value={editSearch}
                                                                            onChange={e => setEditSearch(e.target.value)}
                                                                        />
                                                                        <button onClick={() => { setEditingClient(null); setEditSearch('') }} className="text-gray-600 hover:text-red-400">
                                                                            <X size={14} />
                                                                        </button>
                                                                    </div>
                                                                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                                                                        {subscribers
                                                                            .filter(s => !editSearch || s.name.toLowerCase().includes(editSearch.toLowerCase()) || (s.code && s.code.includes(editSearch)))
                                                                            .slice(0, 15)
                                                                            .map((sub, si) => (
                                                                                <button key={si}
                                                                                    disabled={editLoading}
                                                                                    onClick={() => handleLinkSubscriber(client, sub)}
                                                                                    className="w-full text-left px-2 py-1.5 rounded hover:bg-purple-900/30 text-xs text-gray-300 flex items-center justify-between gap-2 transition-colors disabled:opacity-50"
                                                                                >
                                                                                    <span className="truncate">{sub.name}</span>
                                                                                    <span className="text-[10px] text-gray-600 shrink-0">
                                                                                        {sub.code && `#${sub.code}`} {sub.plano && `· ${sub.plano}`}
                                                                                    </span>
                                                                                </button>
                                                                            ))
                                                                        }
                                                                        {subscribers.filter(s => !editSearch || s.name.toLowerCase().includes(editSearch.toLowerCase())).length === 0 && (
                                                                            <div className="text-[10px] text-gray-600 text-center py-2">Nenhum assinante encontrado</div>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-[9px] text-gray-600 mt-1 pt-1 border-t border-gray-800">
                                                                        {client.visitCount} lançamento(s) serão vinculados
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <span className="text-xs bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded border border-purple-800/30">
                                                        {client.planoLabel}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2.5">
                                                    <span className="text-[10px] text-gray-500 whitespace-nowrap">
                                                        {client.cycleLabel}
                                                    </span>
                                                    <div className="text-[9px] text-gray-600">dia {client.billingDay}</div>
                                                </td>
                                                <td className={`px-3 py-2.5 text-center ${visitColor}`}>
                                                    {client.visitCount}x
                                                </td>
                                                <td className="px-3 py-2.5 text-center text-gray-500">
                                                    {client.breakEven}x
                                                </td>
                                                <td className="px-3 py-2.5 text-right text-gray-400 text-xs">{fmt(client.revenue)}</td>
                                                <td className="px-3 py-2.5 text-right text-gray-400 text-xs">{fmt(client.totalCommission)}</td>
                                                <td className={`px-3 py-2.5 text-right font-bold ${profitColor}`}>
                                                    {fmt(client.profit)}
                                                    {client.isOverLimit && <span className="ml-1 text-[10px]">⚠</span>}
                                                </td>
                                            </tr>
                                            {/* Expanded visit details */}
                                            {isExpanded && client.visits.length > 0 && (
                                                <tr className="bg-gray-950/80">
                                                    <td colSpan={8} className="px-4 py-3">
                                                        <div className="ml-4 border-l-2 border-purple-800/40 pl-4">
                                                            <div className="text-[10px] text-gray-500 font-medium mb-2 uppercase tracking-wider">
                                                                Atendimentos no ciclo ({client.visits.length})
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                {client.visits
                                                                    .sort((a, b) => (b.dateObj || 0) - (a.dateObj || 0))
                                                                    .map((v, vi) => {
                                                                        const d = v.dateObj
                                                                        const dateStr = d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}` : '??'
                                                                        const dayName = d ? ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()] : ''
                                                                        return (
                                                                            <div key={vi} className="flex items-center gap-3 text-xs py-1 px-2 rounded hover:bg-gray-800/40 transition-colors">
                                                                                <span className="text-gray-500 w-16 shrink-0">{dateStr} <span className="text-gray-600">{dayName}</span></span>
                                                                                <span className="text-gray-300 flex-1 truncate">{v.servico_descricao || 'Serviço'}</span>
                                                                                <span className="text-purple-400/70 text-[11px] w-28 truncate text-right">{v.barbeiro_nome || '-'}</span>
                                                                                <span className="text-gray-500 w-20 text-right">{fmt(parseFloat(v.comissao_barbeiro) || 0)}</span>
                                                                            </div>
                                                                        )
                                                                    })
                                                                }
                                                            </div>
                                                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-800/50 text-[10px]">
                                                                <span className="text-gray-600">
                                                                    Receita {fmt(client.revenue)} − Taxa {fmt(client.fee)} − Comissões {fmt(client.totalCommission)}
                                                                </span>
                                                                <span className={`font-bold ${client.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                    = {fmt(client.profit)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            {isExpanded && client.visits.length === 0 && (
                                                <tr className="bg-gray-950/80">
                                                    <td colSpan={8} className="px-8 py-3 text-xs text-gray-600 italic">
                                                        Nenhum atendimento neste ciclo
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    )
                                })}
                                </tbody>
                            </table>
                        </div>

                        {analytics.clients.length > 15 && (
                            <button
                                onClick={() => setShowAllClients(!showAllClients)}
                                className="w-full py-3 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/30 transition-colors flex items-center justify-center gap-1 border-t border-gray-800"
                            >
                                {showAllClients ? <><ChevronUp size={14} /> Mostrar menos</> : <><ChevronDown size={14} /> Ver todos ({analytics.clients.length})</>}
                            </button>
                        )}
                    </div>

                    {/* ============ VERDICT ============ */}
                    <div className={`rounded-2xl p-6 border ${analytics.totalProfit >= 0 ? 'bg-green-900/10 border-green-800/30' : 'bg-red-900/10 border-red-800/30'}`}>
                        <h3 className={`text-lg font-bold mb-3 flex items-center gap-2 ${analytics.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {analytics.totalProfit >= 0 ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
                            {analytics.totalProfit >= 0 ? 'Assinaturas Lucrativas' : 'Assinaturas com Prejuízo'}
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                            <div>
                                <div className="text-gray-500 text-xs">Receita Total</div>
                                <div className="text-gray-200 font-bold">{fmt(analytics.totalRevenue)}</div>
                            </div>
                            <div>
                                <div className="text-gray-500 text-xs">Comissões + Taxas</div>
                                <div className="text-red-400 font-bold">- {fmt(analytics.totalCosts)}</div>
                            </div>
                            <div>
                                <div className="text-gray-500 text-xs">Resultado Final</div>
                                <div className={`text-xl font-black ${analytics.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(analytics.totalProfit)}</div>
                            </div>
                            <div>
                                <div className="text-gray-500 text-xs">Margem</div>
                                <div className={`font-bold ${analytics.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {analytics.totalRevenue > 0 ? ((analytics.totalProfit / analytics.totalRevenue) * 100).toFixed(1) : 0}%
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {isLoading && (
                <div className="text-center py-12 text-gray-500">
                    <RefreshCw size={32} className="mx-auto mb-3 animate-spin text-purple-500" />
                    <p>Carregando dados...</p>
                </div>
            )}
        </div>
    )
}

// ==========================================
// METRIC CARD
// ==========================================
function MetricCard({ label, value, icon: Icon, color, sub }) {
    const colorMap = {
        purple: 'text-purple-400 bg-purple-900/30',
        cyan: 'text-cyan-400 bg-cyan-900/30',
        green: 'text-green-400 bg-green-900/30',
        red: 'text-red-400 bg-red-900/30',
        yellow: 'text-yellow-400 bg-yellow-900/30',
        orange: 'text-orange-400 bg-orange-900/30',
        blue: 'text-blue-400 bg-blue-900/30',
    }
    const c = colorMap[color] || colorMap.cyan

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 shadow">
            <div className="flex items-center gap-2 mb-1">
                <span className={`p-1 rounded ${c}`}><Icon size={14} /></span>
                <span className="text-[10px] text-gray-500 uppercase">{label}</span>
            </div>
            <div className="text-lg font-bold text-gray-100">{value}</div>
            {sub && <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>}
        </div>
    )
}
