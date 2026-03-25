import { useState, useEffect, useMemo } from 'react'
import { db, collection, query, where, getDocs } from '../firebase'
import { Timestamp } from 'firebase/firestore'
import { Users, DollarSign, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Target, CreditCard, ChevronDown, ChevronUp, RefreshCw, BarChart3 } from 'lucide-react'
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
            // Fetch from day 1 of previous month to end of next month to cover all cycles
            const start = new Date(y, m - 2, 1)
            const end = new Date(y, m, 31, 23, 59, 59)

            const q = query(
                collection(db, 'lancamentos'),
                where('forma_pagamento', '==', 'Assinante'),
                where('data', '>=', Timestamp.fromDate(start)),
                where('data', '<=', Timestamp.fromDate(end))
            )
            const snapshot = await getDocs(q)
            setLancamentos(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
        } catch (e) {
            console.error('Erro ao buscar lançamentos:', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [month])

    // ==========================================
    // CYCLE HELPERS
    // ==========================================

    // Calculate billing cycle window for a subscriber based on their billing day
    const getCycleWindow = (billingDay, selectedMonth) => {
        const [y, m] = selectedMonth.split('-').map(Number)
        const day = billingDay || 1

        // Cycle runs from billingDay of previous month to billingDay-1 of selected month
        // Ex: billing day 15, selected month March 2026
        // Cycle: Feb 15 → Mar 14
        const cycleStart = new Date(y, m - 2, day, 0, 0, 0)
        const cycleEnd = new Date(y, m - 1, day - 1, 23, 59, 59)

        // Handle edge case: if billingDay > days in month, clamp to last day
        if (cycleEnd.getDate() !== day - 1 && day > 1) {
            cycleEnd.setDate(0) // Last day of previous month
            cycleEnd.setHours(23, 59, 59)
        }

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

        // Group visits by client name within their individual cycle
        const getVisitsForClient = (clientName, billingDay) => {
            const { cycleStart, cycleEnd } = getCycleWindow(billingDay, month)
            const key = clientName.toLowerCase()
            return lancamentosWithDates.filter(l => {
                const lName = (l.cliente_nome || '').trim().toLowerCase()
                return lName === key && l.dateObj >= cycleStart && l.dateObj <= cycleEnd
            })
        }

        // Build per-subscriber analysis with individual billing cycles
        const clientAnalysis = []

        // Active subscribers from sheet
        const processedKeys = new Set()
        subscribers.forEach(sub => {
            const key = sub.name.toLowerCase()
            processedKeys.add(key)

            const billingDay = sub.billingDay || 1
            const visits = getVisitsForClient(sub.name, billingDay)
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
            if (processedKeys.has(key)) return
            if (!key || key === 'não informado') return

            const visits = getVisitsForClient(key, 1)
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
            totalVisits: lancamentos.length,
            byPlan
        }
    }, [subscribers, lancamentos, subsLoading])

    // ==========================================
    // EXPAND/COLLAPSE
    // ==========================================
    const [expandedClient, setExpandedClient] = useState(null)
    const [showAllClients, setShowAllClients] = useState(false)

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
                            <div className="text-xs text-gray-500 mt-1">Sem uso no mês</div>
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
                                    {(showAllClients ? analytics.clients : analytics.clients.slice(0, 15)).map((client, i) => {
                                        const profitColor = client.profit > 0 ? 'text-green-400' : client.profit < 0 ? 'text-red-400' : 'text-gray-400'
                                        const visitColor = client.isOverLimit ? 'text-red-400 font-bold' : client.visitCount >= client.breakEven ? 'text-yellow-400 font-medium' : 'text-green-400'
                                        const isExpanded = expandedClient === client.name

                                        return (
                                            <tr key={i}
                                                onClick={() => setExpandedClient(isExpanded ? null : client.name)}
                                                className="hover:bg-gray-800/30 transition-colors cursor-pointer">
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full shrink-0 ${client.profit > 0 ? 'bg-green-500' : client.profit < 0 ? 'bg-red-500' : 'bg-gray-500'}`} />
                                                        <div>
                                                            <div className="font-medium text-sm">{client.name}</div>
                                                            {!client.isFromSheet && <span className="text-[10px] text-yellow-500">sem cadastro</span>}
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
