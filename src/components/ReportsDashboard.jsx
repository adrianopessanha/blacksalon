import { useState, useEffect, useMemo } from 'react'
import { db, collection, query, where, getDocs, deleteDoc, doc } from '../firebase'
import { Timestamp } from 'firebase/firestore'
import { Filter, Calendar, User, DollarSign, RefreshCw, Copy, Trash2, Download, TrendingUp, TrendingDown, Scissors, CreditCard, Banknote, Smartphone, Award, BarChart3, Clock, Star, Store, Users, ChevronDown, ChevronUp } from 'lucide-react'
import { BARBERS, STORES } from '../data/barbers'

// =============================================
// UTILITY FUNCTIONS
// =============================================

const fmt = (val) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (val, total) => total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%'
const avg = (total, count) => count > 0 ? total / count : 0

const PAYMENT_ICONS = {
    'Dinheiro': Banknote,
    'Pix': Smartphone,
    'Crédito': CreditCard,
    'Débito': CreditCard,
    'Assinante': Star,
    'Vale Presente': Award
}

const PAYMENT_COLORS = {
    'Dinheiro': 'text-green-400 bg-green-900/30 border-green-800/50',
    'Pix': 'text-cyan-400 bg-cyan-900/30 border-cyan-800/50',
    'Crédito': 'text-yellow-400 bg-yellow-900/30 border-yellow-800/50',
    'Débito': 'text-orange-400 bg-orange-900/30 border-orange-800/50',
    'Assinante': 'text-purple-400 bg-purple-900/30 border-purple-800/50',
    'Vale Presente': 'text-pink-400 bg-pink-900/30 border-pink-800/50'
}

// Operações financeiras (adiantamento, fechamento) - NÃO são atendimentos
const isFinancial = (item) =>
    ['adiantamento', 'fechamento_comissao'].includes(item.tipo)

// Serviços que NÃO geram receita na hora (Assinante/Vale Presente)
const isNonCashRevenue = (item) =>
    ['Assinante', 'Vale Presente'].includes(item.forma_pagamento)

// Gera receita real (exclui assinante, vale presente, adiantamento, fechamento)
const isRevenue = (item) => !isFinancial(item) && !isNonCashRevenue(item)

// É um atendimento real (serviço/produto) - inclui assinante e vale presente
const isService = (item) => !isFinancial(item)

// =============================================
// MAIN COMPONENT
// =============================================

export function ReportsDashboard() {
    const [filters, setFilters] = useState({
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
        barberId: 'all',
        storeId: 'all'
    })
    const [data, setData] = useState([])
    const [rawData, setRawData] = useState([])
    const [loading, setLoading] = useState(false)
    const [pageError, setPageError] = useState(null)
    const [deleteId, setDeleteId] = useState(null)
    const [expandedDays, setExpandedDays] = useState({})

    // Managerial Data (Current Month)
    const [managerialStats, setManagerialStats] = useState(null)

    // Assinaturas
    const [manualSubscriptionRevenue, setManualSubscriptionRevenue] = useState('')

    // 1. Fetch Managerial Data (Independent of filters)
    useEffect(() => {
        const fetchManagerial = async () => {
            try {
                const now = new Date()
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
                startOfMonth.setHours(0, 0, 0, 0)

                const q = query(
                    collection(db, 'lancamentos'),
                    where('data', '>=', Timestamp.fromDate(startOfMonth))
                )

                const snapshot = await getDocs(q)
                const raw = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

                const todayStr = new Date().toLocaleDateString('pt-BR')

                const calculateStats = (items) => {
                    const stats = { dinheiro: 0, pix: 0, debito: 0, credito: 0, total: 0 }
                    items.forEach(i => {
                        const pm = i.forma_pagamento?.toLowerCase() || ''
                        const tp = i.tipo?.toLowerCase() || ''
                        const val = parseFloat(i.valor_bruto) || 0

                        if (pm.includes('assinante') || pm.includes('vale presente') ||
                            tp.includes('adiantamento') || tp.includes('fechamento')) return

                        if (pm.includes('dinheiro')) stats.dinheiro += val
                        else if (pm.includes('pix')) stats.pix += val
                        else if (pm.includes('débito') || pm.includes('debito')) stats.debito += val
                        else if (pm.includes('crédito') || pm.includes('credito')) stats.credito += val
                        stats.total += val
                    })
                    return stats
                }

                const getStore = (d) => {
                    const barber = BARBERS.find(b => b.id === d.barbeiro_id)
                    return barber?.store || d.loja_id || 'unknown'
                }

                const loja01Month = raw.filter(d => getStore(d) === 'loja-01')
                const loja02Month = raw.filter(d => getStore(d) === 'loja-02')
                const loja01Today = loja01Month.filter(d => d.data && new Date(d.data.seconds * 1000).toLocaleDateString('pt-BR') === todayStr)
                const loja02Today = loja02Month.filter(d => d.data && new Date(d.data.seconds * 1000).toLocaleDateString('pt-BR') === todayStr)

                setManagerialStats({
                    loja01: { today: calculateStats(loja01Today), month: calculateStats(loja01Month) },
                    loja02: { today: calculateStats(loja02Today), month: calculateStats(loja02Month) }
                })
            } catch (e) {
                console.error("Error fetching managerial stats:", e)
                setPageError(e.message)
            }
        }
        fetchManagerial()
    }, [])

    // 2. Fetch Reports (Dependent on filters)
    const fetchReports = async () => {
        setLoading(true)
        setPageError(null)
        try {
            const start = new Date(filters.startDate + 'T00:00:00')
            const end = new Date(filters.endDate + 'T23:59:59')

            const q = query(
                collection(db, 'lancamentos'),
                where('data', '>=', Timestamp.fromDate(start)),
                where('data', '<=', Timestamp.fromDate(end))
            )

            const snapshot = await getDocs(q)
            const raw = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => b.data.seconds - a.data.seconds)

            setRawData(raw)

            const filtered = raw.filter(d => {
                const barber = BARBERS.find(b => b.id === d.barbeiro_id)
                // Usa a loja cadastrada do barbeiro como fonte de verdade
                const store = barber?.store || d.loja_id || 'unknown'
                const matchBarber = filters.barberId === 'all' || d.barbeiro_id === filters.barberId
                const matchStore = filters.storeId === 'all' || store === filters.storeId
                return matchBarber && matchStore
            })

            setData(filtered)
        } catch (e) {
            console.error(e)
            setPageError('Erro ao buscar relatórios: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    // 3. Initial Fetch
    useEffect(() => { fetchReports() }, [])

    // =============================================
    // COMPUTED ANALYTICS
    // =============================================

    const analytics = useMemo(() => {
        if (!data.length) return null

        // Serviços reais (exclui adiantamento/fechamento)
        const services = data.filter(d => isService(d))
        // Serviços que geram receita (exclui assinante/vale presente também)
        const revenueItems = data.filter(d => isRevenue(d))

        // Faturamento = só serviços que geram receita na hora
        const gross = revenueItems.reduce((s, d) => s + (parseFloat(d.valor_bruto) || 0), 0)
        // Comissão = de TODOS os serviços (incluindo assinante/vale presente, excluindo fechamento/adiantamento)
        const commission = services.reduce((s, d) => s + (parseFloat(d.comissao_barbeiro) || 0), 0)
        // Atendimentos = todos os serviços (incluindo assinante/vale presente)
        const serviceCount = services.length
        const totalCount = data.length
        // Ticket Médio = faturamento / atendimentos (incluindo assinante/vale presente)
        const avgTicket = avg(gross, serviceCount)

        // Payment breakdown (todos os serviços, incluindo assinante/vale presente)
        const byPayment = {}
        services.forEach(d => {
            const pm = d.forma_pagamento || 'Outros'
            if (!byPayment[pm]) byPayment[pm] = { count: 0, total: 0 }
            byPayment[pm].count++
            byPayment[pm].total += parseFloat(d.valor_bruto) || 0
        })
        // Total geral para percentuais (inclui tudo)
        const paymentTotal = services.reduce((s, d) => s + (parseFloat(d.valor_bruto) || 0), 0)

        // Service breakdown (todos os serviços reais)
        const byService = {}
        services.forEach(d => {
            const svc = d.servico_descricao || 'Não especificado'
            if (!byService[svc]) byService[svc] = { count: 0, total: 0, commission: 0 }
            byService[svc].count++
            byService[svc].total += parseFloat(d.valor_bruto) || 0
            byService[svc].commission += parseFloat(d.comissao_barbeiro) || 0
        })
        const topServices = Object.entries(byService)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 8)

        // Daily breakdown
        const byDay = {}
        data.forEach(d => {
            const dateStr = d.data?.seconds
                ? new Date(d.data.seconds * 1000).toLocaleDateString('pt-BR')
                : 'Sem data'
            if (!byDay[dateStr]) byDay[dateStr] = { items: [], gross: 0, commission: 0, count: 0 }
            byDay[dateStr].items.push(d)
            if (isRevenue(d)) byDay[dateStr].gross += parseFloat(d.valor_bruto) || 0
            if (isService(d)) byDay[dateStr].commission += parseFloat(d.comissao_barbeiro) || 0
            byDay[dateStr].count++
        })

        // Per-barber breakdown (só serviços reais, exclui fechamento/adiantamento)
        const byBarber = {}
        data.forEach(d => {
            const bid = d.barbeiro_id || 'unknown'
            const bname = d.barbeiro_nome || 'Desconhecido'
            if (!byBarber[bid]) byBarber[bid] = { name: bname, count: 0, serviceCount: 0, gross: 0, commission: 0, services: {} }
            byBarber[bid].count++
            if (isService(d)) {
                byBarber[bid].serviceCount++
                byBarber[bid].commission += parseFloat(d.comissao_barbeiro) || 0
                const svc = d.servico_descricao || 'Outros'
                if (!byBarber[bid].services[svc]) byBarber[bid].services[svc] = 0
                byBarber[bid].services[svc]++
            }
            if (isRevenue(d)) byBarber[bid].gross += parseFloat(d.valor_bruto) || 0
        })

        // Subscription metrics
        const subData = data.filter(d => d.forma_pagamento === 'Assinante')
        const internalSubSales = data.filter(d => d.tipo === 'venda_assinatura')
        const internalRevenue = internalSubSales.reduce((sum, i) => sum + (parseFloat(i.valor_bruto) || 0), 0)
        const subCommissionCost = subData.reduce((s, d) => s + (parseFloat(d.comissao_barbeiro) || 0), 0)

        // Store breakdown
        const getStore = (d) => {
            const barber = BARBERS.find(b => b.id === d.barbeiro_id)
            return barber?.store || d.loja_id || 'unknown'
        }
        const byStore = {}
        rawData.forEach(d => {
            const store = getStore(d)
            if (!byStore[store]) byStore[store] = { gross: 0, commission: 0, count: 0 }
            if (isRevenue(d)) byStore[store].gross += parseFloat(d.valor_bruto) || 0
            if (isService(d)) byStore[store].commission += parseFloat(d.comissao_barbeiro) || 0
            if (isService(d)) byStore[store].count++
        })

        // Best day
        const bestDay = Object.entries(byDay).sort((a, b) => b[1].gross - a[1].gross)[0]

        // Peak hour
        const byHour = {}
        data.forEach(d => {
            if (!d.data?.seconds) return
            const hour = new Date(d.data.seconds * 1000).getHours()
            byHour[hour] = (byHour[hour] || 0) + 1
        })
        const peakHour = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0]

        return {
            gross, commission, totalCount, serviceCount, avgTicket, paymentTotal,
            byPayment, topServices, byDay, byBarber, byStore,
            subCount: subData.length, subCommissionCost, internalRevenue,
            bestDay, peakHour
        }
    }, [data, rawData])

    // =============================================
    // FILTER STATE
    // =============================================

    const isBarberFilter = filters.barberId !== 'all'
    const isStoreFilter = filters.storeId !== 'all'
    const selectedBarber = isBarberFilter ? BARBERS.find(b => b.id === filters.barberId) : null
    const selectedStore = isStoreFilter ? STORES.find(s => s.id === filters.storeId) : null

    // =============================================
    // DELETE LOGIC
    // =============================================

    const confirmDelete = (id) => setDeleteId(id)

    const executeDelete = async () => {
        if (!deleteId) return
        try {
            await deleteDoc(doc(db, 'lancamentos', deleteId))
            setDeleteId(null)
            setData(data.filter(d => d.id !== deleteId))
            alert("Lançamento excluído com sucesso!")
        } catch (e) {
            console.error("Error deleting:", e)
            alert("Erro ao excluir: " + e.message)
        }
    }

    // =============================================
    // EXPORT FUNCTIONS
    // =============================================

    const handleExportForAI = () => {
        const report = {
            metadata: {
                generated_at: new Date().toISOString(),
                period: { start: filters.startDate, end: filters.endDate },
                filters: { barber: filters.barberId, store: filters.storeId }
            },
            metrics: analytics ? { gross: analytics.gross, commission: analytics.commission, count: analytics.serviceCount } : {},
            data: data.map(d => ({
                date: d.data?.seconds ? new Date(d.data.seconds * 1000).toISOString().split('T')[0] : null,
                barber: d.barbeiro_nome,
                service: d.servico_descricao,
                value: parseFloat(d.valor_bruto),
                commission: parseFloat(d.comissao_barbeiro),
                payment: d.forma_pagamento,
                type: d.tipo
            }))
        }
        navigator.clipboard.writeText(JSON.stringify(report, null, 2))
            .then(() => alert("Relatório copiado para a área de transferência!"))
            .catch(err => alert("Erro ao copiar: " + err))
    }

    const handleExportMonthlyRAW = () => {
        const PAYMENT_MAP = {
            'Dinheiro': 'dinheiro', 'dinheiro': 'dinheiro',
            'Pix': 'pix', 'pix': 'pix', 'PIX': 'pix',
            'Crédito': 'credito', 'Credito': 'credito', 'crédito': 'credito', 'credito': 'credito',
            'Débito': 'debito', 'Debito': 'debito', 'débito': 'debito', 'debito': 'debito',
            'Assinante': 'assinante', 'assinante': 'assinante',
            'Vale Presente': 'vale_presente', 'vale_presente': 'vale_presente'
        }
        const EVENT_TYPE_MAP = {
            'servico': 'servico', 'Servico': 'servico', 'serviço': 'servico',
            'produto': 'produto', 'Produto': 'produto',
            'venda_assinatura': 'venda_assinatura', 'uso_assinatura': 'uso_assinatura',
            'venda_vale': 'venda_vale', 'uso_vale': 'uso_vale',
            'adiantamento': 'adiantamento', 'Adiantamento': 'adiantamento',
            'pagamento': 'pagamento', 'Pagamento': 'pagamento',
            'fechamento_comissao': 'fechamento_comissao', 'fechamento': 'fechamento_comissao'
        }
        const STORE_MAP = { 'loja-01': 'loja01', 'loja01': 'loja01', 'loja-02': 'loja02', 'loja02': 'loja02' }

        const normalizeEventType = (raw) => {
            if (!raw) return 'servico'
            return EVENT_TYPE_MAP[raw] || EVENT_TYPE_MAP[raw.toLowerCase()] || 'servico'
        }
        const normalizePayment = (raw, eventType) => {
            if (['adiantamento', 'pagamento', 'fechamento_comissao'].includes(eventType)) return null
            if (!raw) return null
            return PAYMENT_MAP[raw] || null
        }
        const normalizeStore = (raw, barberId) => {
            if (raw) { const n = STORE_MAP[raw] || STORE_MAP[raw.toLowerCase()]; if (n) return n }
            const barber = BARBERS.find(b => b.id === barberId)
            return barber ? (STORE_MAP[barber.store] || 'loja01') : 'loja01'
        }
        const toFixed2 = (val) => parseFloat((val || 0).toFixed(2))
        const calculateFee = (gross, pm) => {
            if (pm === 'credito') return toFixed2(gross * 0.05)
            if (pm === 'debito') return toFixed2(gross * 0.02)
            return 0
        }
        const getCashInfo = (eventDate, pm, et) => {
            if (['adiantamento', 'pagamento', 'fechamento_comissao'].includes(et)) return { cash_date: null, is_cash_received: false }
            if (['dinheiro', 'pix', 'debito'].includes(pm)) return { cash_date: eventDate, is_cash_received: true }
            return { cash_date: null, is_cash_received: false }
        }

        const transformedData = data.map(d => {
            const eventDate = d.data?.seconds ? new Date(d.data.seconds * 1000).toISOString().split('T')[0] : null
            const eventType = normalizeEventType(d.tipo)
            const paymentMethod = normalizePayment(d.forma_pagamento, eventType)
            const storeId = normalizeStore(d.loja_id, d.barbeiro_id)
            const cashInfo = getCashInfo(eventDate, paymentMethod, eventType)

            let grossValue = 0, commissionValue = 0, feeValue = 0, netCompanyValue = 0
            if (['adiantamento', 'pagamento', 'fechamento_comissao'].includes(eventType)) {
                commissionValue = toFixed2(-(Math.abs(parseFloat(d.valor_bruto) || parseFloat(d.comissao_barbeiro) || 0)))
                netCompanyValue = toFixed2(-commissionValue)
            } else {
                grossValue = toFixed2(parseFloat(d.valor_bruto) || 0)
                commissionValue = toFixed2(parseFloat(d.comissao_barbeiro) || 0)
                feeValue = calculateFee(grossValue, paymentMethod)
                netCompanyValue = toFixed2(grossValue - commissionValue - feeValue)
            }

            const event = {
                event_id: d.id, event_date: eventDate, cash_date: cashInfo.cash_date,
                is_cash_received: cashInfo.is_cash_received, store_id: storeId,
                barber_id: d.barbeiro_id || null, barber_name: d.barbeiro_nome || null,
                event_type: eventType, service_name: d.servico_descricao || d.cliente_nome || 'Não especificado',
                payment_method: paymentMethod, gross_value: grossValue,
                commission_value: commissionValue, fee_value: feeValue, net_company_value: netCompanyValue
            }

            if (paymentMethod === 'assinante' || eventType === 'uso_assinatura') {
                event.subscription_event = 'usage'
            } else if (eventType === 'venda_assinatura') {
                event.subscription_event = 'sale'
            }
            if (paymentMethod === 'vale_presente' || eventType === 'uso_vale') {
                event.voucher_event = 'usage'
            } else if (eventType === 'venda_vale') {
                event.voucher_event = 'sale'
            }
            return event
        }).sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''))

        const report = {
            metadata: { generated_at: new Date().toISOString(), period_start: filters.startDate, period_end: filters.endDate },
            data: transformedData
        }
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `relatorio_mensal_${filters.startDate}_${filters.endDate}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    // =============================================
    // TOGGLE DAY EXPANSION
    // =============================================

    const toggleDay = (day) => setExpandedDays(prev => ({ ...prev, [day]: !prev[day] }))

    // =============================================
    // RENDER
    // =============================================

    if (pageError) return <div className="p-8 text-red-500 font-bold">Erro crítico: {pageError}</div>

    const totalSubRevenue = (parseFloat(manualSubscriptionRevenue || 0) + (analytics?.internalRevenue || 0))
    const subProfit = totalSubRevenue - (analytics?.subCommissionCost || 0)

    return (
        <div className="space-y-6 pb-20">
            {/* ============ FILTERS ============ */}
            <div className="bg-gray-900 border border-gray-800 p-3 sm:p-4 rounded-2xl flex flex-wrap gap-3 sm:gap-4 items-end shadow-lg">
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Início</label>
                    <input type="date"
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-cyan-500 scheme-dark"
                        value={filters.startDate}
                        onChange={e => setFilters({ ...filters, startDate: e.target.value })}
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Fim</label>
                    <input type="date"
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-cyan-500 scheme-dark"
                        value={filters.endDate}
                        onChange={e => setFilters({ ...filters, endDate: e.target.value })}
                    />
                </div>
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Loja</label>
                    <select
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-cyan-500 appearance-none min-w-[120px]"
                        value={filters.storeId}
                        onChange={e => setFilters({ ...filters, storeId: e.target.value, barberId: 'all' })}
                    >
                        <option value="all">Todas</option>
                        {STORES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs text-gray-400 mb-1">Barbeiro</label>
                    <select
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-cyan-500 appearance-none min-w-[150px]"
                        value={filters.barberId}
                        onChange={e => setFilters({ ...filters, barberId: e.target.value })}
                    >
                        <option value="all">Todos</option>
                        {BARBERS
                            .filter(b => filters.storeId === 'all' || b.store === filters.storeId)
                            .map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>
                <button onClick={fetchReports} className="bg-cyan-600 hover:bg-cyan-500 text-white p-2 rounded-lg transition-all shadow-lg active:scale-95 flex items-center gap-2 text-sm font-medium px-3 sm:px-4 h-[38px] flex-1 sm:flex-initial justify-center">
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> <span className="hidden sm:inline">Filtrar</span>
                </button>
                <button onClick={handleExportForAI} className="bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 p-2 rounded-lg transition-all shadow-lg active:scale-95 flex items-center gap-2 text-sm font-medium px-3 sm:px-4 h-[38px] justify-center">
                    <Copy size={16} /> <span className="hidden sm:inline">Copiar para IA</span>
                </button>
                <button onClick={handleExportMonthlyRAW} className="bg-green-800 hover:bg-green-700 text-green-200 border border-green-600 p-2 rounded-lg transition-all shadow-lg active:scale-95 flex items-center gap-2 text-sm font-medium px-3 sm:px-4 h-[38px] sm:ml-auto justify-center">
                    <Download size={16} /> <span className="hidden sm:inline">Baixar JSON RAW</span>
                </button>
            </div>

            {/* ============ ACTIVE FILTER BADGE ============ */}
            {(isBarberFilter || isStoreFilter) && (
                <div className="flex items-center gap-2 flex-wrap">
                    <Filter size={14} className="text-cyan-500" />
                    <span className="text-xs text-gray-500">Filtro ativo:</span>
                    {isStoreFilter && (
                        <span className="text-xs bg-cyan-900/30 text-cyan-400 px-2.5 py-1 rounded-full border border-cyan-800/50 flex items-center gap-1.5">
                            <Store size={12} /> {selectedStore?.name}
                        </span>
                    )}
                    {isBarberFilter && (
                        <span className="text-xs bg-purple-900/30 text-purple-400 px-2.5 py-1 rounded-full border border-purple-800/50 flex items-center gap-1.5">
                            <User size={12} /> {selectedBarber?.name}
                        </span>
                    )}
                    <button
                        onClick={() => { setFilters({ ...filters, barberId: 'all', storeId: 'all' }); setTimeout(fetchReports, 100) }}
                        className="text-xs text-gray-500 hover:text-gray-300 underline ml-2"
                    >Limpar filtros</button>
                </div>
            )}

            {/* ============ CONDITIONAL VIEWS ============ */}

            {/* === VIEW: BARBER SELECTED === */}
            {isBarberFilter && analytics && (
                <BarberDetailView
                    barber={selectedBarber}
                    analytics={analytics}
                    data={data}
                    filters={filters}
                />
            )}

            {/* === VIEW: STORE SELECTED (no barber) === */}
            {!isBarberFilter && isStoreFilter && analytics && (
                <StoreDetailView
                    store={selectedStore}
                    analytics={analytics}
                    data={data}
                    filters={filters}
                />
            )}

            {/* === VIEW: ALL (no specific filter) === */}
            {!isBarberFilter && !isStoreFilter && (
                <>
                    {/* Managerial Summary */}
                    {managerialStats && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6 border-b border-gray-800">
                            <StoreManagerCard label="Loja 01" stats={managerialStats.loja01} color="cyan" />
                            <StoreManagerCard label="Loja 02" stats={managerialStats.loja02} color="purple" />
                        </div>
                    )}

                    {/* General Metrics */}
                    {analytics && (
                        <>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <MetricCard label="Faturamento Bruto" value={fmt(analytics.gross)} icon={DollarSign} color="cyan" />
                                <MetricCard label="Comissões Totais" value={fmt(analytics.commission)} icon={Users} color="green" />
                                <MetricCard label="Atendimentos" value={analytics.serviceCount} icon={Scissors} color="blue" />
                                <MetricCard label="Ticket Médio" value={fmt(analytics.avgTicket)} icon={TrendingUp} color="yellow" />
                            </div>

                            {/* Store Comparison */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {Object.entries(analytics.byStore).map(([storeId, s]) => {
                                    const storeName = STORES.find(st => st.id === storeId)?.name || storeId
                                    const color = storeId === 'loja-01' ? 'cyan' : 'purple'
                                    return (
                                        <div key={storeId} className="bg-gray-900 border border-gray-800 p-5 rounded-2xl shadow-lg">
                                            <div className="flex justify-between items-start mb-3">
                                                <h3 className={`text-gray-300 font-semibold flex items-center gap-2`}>
                                                    <Store size={18} className={`text-${color}-500`} /> {storeName}
                                                </h3>
                                                <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-full">{s.count} atend.</span>
                                            </div>
                                            <div className="text-2xl font-bold text-gray-100">{fmt(s.gross)}</div>
                                            <div className="text-xs text-gray-500 mt-1">Comissões: {fmt(s.commission)}</div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Payment Breakdown */}
                            <PaymentBreakdown byPayment={analytics.byPayment} total={analytics.paymentTotal} />

                            {/* Top Services */}
                            <TopServicesCard topServices={analytics.topServices} />
                        </>
                    )}
                </>
            )}

            {/* ============ SUBSCRIPTION SECTION ============ */}
            {analytics && analytics.subCount > 0 && (
                <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-lg">
                    <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                        <span className="bg-purple-900/40 text-purple-400 p-1.5 rounded-lg"><Star size={20} /></span> Monitoramento de Assinaturas
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Receita Plataforma Externa (Celcoin)</label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-3 text-gray-500" size={18} />
                                <input type="number" step="0.01"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 pl-10 pr-4 text-gray-200 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
                                    placeholder="0,00" value={manualSubscriptionRevenue}
                                    onChange={e => setManualSubscriptionRevenue(e.target.value)}
                                />
                            </div>
                            <div className="mt-2 text-xs text-gray-500 flex justify-between">
                                <span>Vendas Balcão:</span>
                                <span className="text-gray-300 font-medium">{fmt(analytics.internalRevenue)}</span>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 sm:col-span-2">
                            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 flex-1">
                                <div className="text-xs text-gray-500 mb-1">Atendimentos</div>
                                <div className="text-xl font-bold text-gray-200">{analytics.subCount}</div>
                            </div>
                            <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 flex-1">
                                <div className="text-xs text-gray-500 mb-1">Custo Comissões</div>
                                <div className="text-xl font-bold text-red-400">- {fmt(analytics.subCommissionCost)}</div>
                            </div>
                            <div className={`p-3 rounded-xl border flex-1 ${subProfit >= 0 ? 'bg-green-900/20 border-green-900/50' : 'bg-red-900/20 border-red-900/50'}`}>
                                <div className={`text-xs mb-1 ${subProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>Lucro Assinaturas</div>
                                <div className={`text-xl font-bold ${subProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(subProfit)}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ============ DAILY TIMELINE ============ */}
            {analytics && Object.keys(analytics.byDay).length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-lg overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                        <h3 className="font-semibold text-gray-200 flex items-center gap-2">
                            <Calendar size={18} className="text-cyan-500" /> Linha do Tempo
                        </h3>
                        <span className="text-xs text-gray-500">{Object.keys(analytics.byDay).length} dia(s)</span>
                    </div>
                    <div className="divide-y divide-gray-800">
                        {Object.entries(analytics.byDay).map(([day, info]) => (
                            <div key={day}>
                                <button
                                    onClick={() => toggleDay(day)}
                                    className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-800/50 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-bold text-gray-200">{day}</span>
                                        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{info.count} lanç.</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-semibold text-cyan-400">{fmt(info.gross)}</span>
                                        <span className="text-xs text-gray-500">com. {fmt(info.commission)}</span>
                                        {expandedDays[day] ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                                    </div>
                                </button>
                                {expandedDays[day] && (
                                    <div className="bg-gray-950/50 border-t border-gray-800">
                                        <table className="w-full text-left text-sm">
                                            <thead className="text-gray-500 text-xs">
                                                <tr>
                                                    <th className="px-5 py-2 font-medium">Hora</th>
                                                    <th className="px-3 py-2 font-medium">Barbeiro</th>
                                                    <th className="px-3 py-2 font-medium">Cliente</th>
                                                    <th className="px-3 py-2 font-medium">Serviço</th>
                                                    <th className="px-3 py-2 font-medium text-right">Valor</th>
                                                    <th className="px-3 py-2 font-medium text-right">Comissão</th>
                                                    <th className="px-3 py-2 font-medium text-right">Pagamento</th>
                                                    <th className="px-3 py-2 font-medium text-right">Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-800/50 text-gray-300">
                                                {info.items.map(item => (
                                                    <tr key={item.id} className="hover:bg-gray-800/30 transition-colors">
                                                        <td className="px-5 py-2.5 text-xs text-gray-400">
                                                            {item.data?.seconds ? new Date(item.data.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-sm">{item.barbeiro_nome}</td>
                                                        <td className="px-3 py-2.5 text-sm text-gray-400">{item.cliente_nome || '-'}</td>
                                                        <td className="px-3 py-2.5 text-sm">{item.servico_descricao}</td>
                                                        <td className="px-3 py-2.5 text-sm text-right">{fmt(parseFloat(item.valor_bruto))}</td>
                                                        <td className="px-3 py-2.5 text-sm text-right text-gray-500">{fmt(parseFloat(item.comissao_barbeiro))}</td>
                                                        <td className="px-3 py-2.5 text-right">
                                                            <PaymentBadge method={item.forma_pagamento} />
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right">
                                                            <button onClick={() => confirmDelete(item.id)}
                                                                className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-red-900/10 transition-colors"
                                                                title="Excluir">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {data.length === 0 && !loading && (
                <div className="text-center py-12 text-gray-500">
                    <BarChart3 size={48} className="mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium">Nenhum lançamento encontrado</p>
                    <p className="text-sm mt-1">Ajuste os filtros e clique em Filtrar</p>
                </div>
            )}

            {/* DELETE MODAL */}
            {deleteId && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-2">Excluir Lançamento?</h3>
                        <p className="text-gray-400 mb-6">Essa ação não pode ser desfeita e afetará os relatórios.</p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setDeleteId(null)} className="px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-800">Cancelar</button>
                            <button onClick={executeDelete} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium">Sim, Excluir</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// =============================================
// BARBER DETAIL VIEW
// =============================================

function BarberDetailView({ barber, analytics, data }) {
    if (!barber) return null

    const barberData = analytics.byBarber[barber.id]
    if (!barberData) return <div className="text-center py-8 text-gray-500">Sem dados para este barbeiro no período</div>

    const storeName = STORES.find(s => s.id === barber.store)?.name || barber.store

    // Payment breakdown for this barber (todos os serviços, incluindo assinante/vale)
    const barberPayments = {}
    const barberServices = data.filter(d => isService(d))
    barberServices.forEach(d => {
        const pm = d.forma_pagamento || 'Outros'
        if (!barberPayments[pm]) barberPayments[pm] = { count: 0, total: 0 }
        barberPayments[pm].count++
        barberPayments[pm].total += parseFloat(d.valor_bruto) || 0
    })
    const barberPaymentTotal = barberServices.reduce((s, d) => s + (parseFloat(d.valor_bruto) || 0), 0)

    // Services for this barber
    const topServices = Object.entries(barberData.services)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)

    // Daily performance
    const dailyPerf = {}
    data.forEach(d => {
        if (!isService(d)) return
        const dateStr = d.data?.seconds ? new Date(d.data.seconds * 1000).toLocaleDateString('pt-BR') : null
        if (!dateStr) return
        if (!dailyPerf[dateStr]) dailyPerf[dateStr] = { gross: 0, commission: 0, count: 0 }
        if (isRevenue(d)) dailyPerf[dateStr].gross += parseFloat(d.valor_bruto) || 0
        dailyPerf[dateStr].commission += parseFloat(d.comissao_barbeiro) || 0
        dailyPerf[dateStr].count++
    })
    const maxDailyGross = Math.max(...Object.values(dailyPerf).map(d => d.gross), 1)

    return (
        <div className="space-y-5">
            {/* Profile Header */}
            <div className="bg-gradient-to-r from-purple-900/30 to-gray-900 border border-purple-800/30 rounded-2xl p-6 shadow-lg">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-purple-900/50 border-2 border-purple-500/50 flex items-center justify-center text-2xl font-bold text-purple-300">
                        {barber.name.charAt(0)}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">{barber.name}</h2>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs bg-gray-800/80 text-gray-400 px-2.5 py-1 rounded-full flex items-center gap-1">
                                <Store size={11} /> {storeName}
                            </span>
                            <span className="text-xs text-gray-500">{barberData.serviceCount} atendimentos no período</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Personal Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Faturamento" value={fmt(barberData.gross)} icon={DollarSign} color="cyan" />
                <MetricCard label="Comissão Gerada" value={fmt(barberData.commission)} icon={Award} color="green" />
                <MetricCard label="Atendimentos" value={barberData.serviceCount} icon={Scissors} color="blue" />
                <MetricCard label="Ticket Médio" value={fmt(avg(barberData.gross, barberData.serviceCount))} icon={TrendingUp} color="yellow" />
            </div>

            {/* Payment + Services side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PaymentBreakdown byPayment={barberPayments} total={barberPaymentTotal} />

                {/* Top Services */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-lg">
                    <h3 className="font-semibold text-gray-200 mb-4 flex items-center gap-2">
                        <Scissors size={18} className="text-blue-500" /> Serviços Realizados
                    </h3>
                    <div className="space-y-2">
                        {topServices.map(([name, count]) => (
                            <div key={name} className="flex items-center justify-between py-1.5">
                                <span className="text-sm text-gray-300 truncate mr-3">{name}</span>
                                <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full whitespace-nowrap">{count}x</span>
                            </div>
                        ))}
                        {topServices.length === 0 && <p className="text-sm text-gray-500">Nenhum serviço no período</p>}
                    </div>
                </div>
            </div>

            {/* Daily Performance Chart */}
            {Object.keys(dailyPerf).length > 1 && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-lg">
                    <h3 className="font-semibold text-gray-200 mb-4 flex items-center gap-2">
                        <BarChart3 size={18} className="text-cyan-500" /> Desempenho Diário
                    </h3>
                    <div className="space-y-2">
                        {Object.entries(dailyPerf).reverse().map(([day, perf]) => (
                            <div key={day} className="flex items-center gap-3">
                                <span className="text-xs text-gray-500 w-[70px] shrink-0">{day}</span>
                                <div className="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden relative">
                                    <div
                                        className="bg-gradient-to-r from-cyan-600 to-cyan-500 h-full rounded-full transition-all duration-500"
                                        style={{ width: `${(perf.gross / maxDailyGross) * 100}%` }}
                                    />
                                    <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs text-gray-300 font-medium">
                                        {fmt(perf.gross)}
                                    </span>
                                </div>
                                <span className="text-xs text-gray-500 w-[30px] text-right">{perf.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// =============================================
// STORE DETAIL VIEW
// =============================================

function StoreDetailView({ store, analytics, data }) {
    if (!store) return null

    const color = store.id === 'loja-01' ? 'cyan' : 'purple'

    // Per-barber ranking in this store
    const barberRanking = Object.entries(analytics.byBarber)
        .map(([id, info]) => ({ id, ...info }))
        .sort((a, b) => b.gross - a.gross)

    // Payment breakdown for this store (todos os serviços, incluindo assinante/vale)
    const storeServices = data.filter(d => isService(d))
    const storePayments = {}
    storeServices.forEach(d => {
        const pm = d.forma_pagamento || 'Outros'
        if (!storePayments[pm]) storePayments[pm] = { count: 0, total: 0 }
        storePayments[pm].count++
        storePayments[pm].total += parseFloat(d.valor_bruto) || 0
    })

    const maxBarberGross = Math.max(...barberRanking.map(b => b.gross), 1)

    return (
        <div className="space-y-5">
            {/* Store Header */}
            <div className={`bg-gradient-to-r ${color === 'cyan' ? 'from-cyan-900/30' : 'from-purple-900/30'} to-gray-900 border ${color === 'cyan' ? 'border-cyan-800/30' : 'border-purple-800/30'} rounded-2xl p-6 shadow-lg`}>
                <div className="flex items-center gap-4">
                    <div className={`w-16 h-16 rounded-full ${color === 'cyan' ? 'bg-cyan-900/50 border-cyan-500/50' : 'bg-purple-900/50 border-purple-500/50'} border-2 flex items-center justify-center`}>
                        <Store size={28} className={`text-${color}-400`} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">{store.name}</h2>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-gray-500">{analytics.serviceCount} atendimentos no período</span>
                            <span className="text-xs text-gray-500">{barberRanking.length} barbeiros</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Store Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <MetricCard label="Faturamento" value={fmt(analytics.gross)} icon={DollarSign} color={color} />
                <MetricCard label="Comissões" value={fmt(analytics.commission)} icon={Users} color="green" />
                <MetricCard label="Atendimentos" value={analytics.serviceCount} icon={Scissors} color="blue" />
                <MetricCard label="Ticket Médio" value={fmt(analytics.avgTicket)} icon={TrendingUp} color="yellow" />
            </div>

            {/* Barber Ranking */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-lg">
                <h3 className="font-semibold text-gray-200 mb-4 flex items-center gap-2">
                    <Award size={18} className="text-yellow-500" /> Ranking de Barbeiros
                </h3>
                <div className="space-y-3">
                    {barberRanking.map((b, i) => (
                        <div key={b.id} className="flex items-center gap-3">
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50' :
                                i === 1 ? 'bg-gray-700/50 text-gray-300 border border-gray-600/50' :
                                    i === 2 ? 'bg-orange-900/50 text-orange-400 border border-orange-700/50' :
                                        'bg-gray-800 text-gray-500 border border-gray-700'
                                }`}>
                                {i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium text-gray-200 truncate">{b.name}</span>
                                    <div className="flex items-center gap-3 shrink-0 ml-2">
                                        <span className="text-xs text-gray-500">{b.serviceCount} atend.</span>
                                        <span className="text-sm font-bold text-cyan-400">{fmt(b.gross)}</span>
                                    </div>
                                </div>
                                <div className="bg-gray-800 rounded-full h-2 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${i === 0 ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' :
                                            `bg-gradient-to-r from-${color}-700 to-${color}-500`
                                            }`}
                                        style={{ width: `${(b.gross / maxBarberGross) * 100}%` }}
                                    />
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] text-gray-500">Comissão: {fmt(b.commission)}</span>
                                    <span className="text-[10px] text-gray-600">|</span>
                                    <span className="text-[10px] text-gray-500">Ticket médio: {fmt(avg(b.gross, b.serviceCount))}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {barberRanking.length === 0 && <p className="text-sm text-gray-500">Sem dados de barbeiros</p>}
                </div>
            </div>

            {/* Payment Breakdown + Insights */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PaymentBreakdown byPayment={storePayments} total={analytics.paymentTotal} />

                {/* Quick Insights */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-lg">
                    <h3 className="font-semibold text-gray-200 mb-4 flex items-center gap-2">
                        <TrendingUp size={18} className="text-green-500" /> Insights
                    </h3>
                    <div className="space-y-3">
                        {analytics.bestDay && (
                            <InsightRow
                                icon={<Calendar size={14} className="text-cyan-400" />}
                                label="Melhor dia"
                                value={`${analytics.bestDay[0]} - ${fmt(analytics.bestDay[1].gross)}`}
                            />
                        )}
                        {analytics.peakHour && (
                            <InsightRow
                                icon={<Clock size={14} className="text-yellow-400" />}
                                label="Horário de pico"
                                value={`${analytics.peakHour[0]}h - ${analytics.peakHour[1]} atend.`}
                            />
                        )}
                        {barberRanking[0] && (
                            <InsightRow
                                icon={<Award size={14} className="text-yellow-400" />}
                                label="Top barbeiro"
                                value={`${barberRanking[0].name} - ${fmt(barberRanking[0].gross)}`}
                            />
                        )}
                        <InsightRow
                            icon={<TrendingUp size={14} className="text-green-400" />}
                            label="Margem (Fat - Com)"
                            value={fmt(analytics.gross - analytics.commission)}
                        />
                    </div>
                </div>
            </div>

            <TopServicesCard topServices={analytics.topServices} />
        </div>
    )
}

// =============================================
// REUSABLE COMPONENTS
// =============================================

function MetricCard({ label, value, icon: Icon, color }) {
    const colorMap = {
        cyan: 'text-cyan-500',
        green: 'text-green-500',
        blue: 'text-blue-500',
        yellow: 'text-yellow-500',
        purple: 'text-purple-500',
        red: 'text-red-500'
    }
    return (
        <div className="bg-gray-900 border border-gray-800 p-4 sm:p-5 rounded-2xl shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <Icon size={40} className={colorMap[color]} />
            </div>
            <h3 className="text-gray-400 text-xs font-medium">{label}</h3>
            <p className="text-xl sm:text-2xl font-bold text-gray-100 mt-1">{value}</p>
        </div>
    )
}

function PaymentBadge({ method }) {
    const colors = PAYMENT_COLORS[method] || 'text-gray-400 bg-gray-800 border-gray-700'
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${colors}`}>
            {method}
        </span>
    )
}

function PaymentBreakdown({ byPayment, total }) {
    const sorted = Object.entries(byPayment).sort((a, b) => b[1].total - a[1].total)

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-lg">
            <h3 className="font-semibold text-gray-200 mb-4 flex items-center gap-2">
                <CreditCard size={18} className="text-yellow-500" /> Formas de Pagamento
            </h3>
            <div className="space-y-3">
                {sorted.map(([method, info]) => {
                    const Icon = PAYMENT_ICONS[method] || CreditCard
                    const percentage = total > 0 ? (info.total / total) * 100 : 0
                    const colors = PAYMENT_COLORS[method] || 'text-gray-400 bg-gray-800/50 border-gray-700'
                    const barColor = colors.split(' ')[0].replace('text-', 'bg-')

                    return (
                        <div key={method}>
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <Icon size={14} className={colors.split(' ')[0]} />
                                    <span className="text-sm text-gray-300">{method}</span>
                                    <span className="text-xs text-gray-500">({info.count}x)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-gray-200">{fmt(info.total)}</span>
                                    <span className="text-xs text-gray-500 w-[40px] text-right">{pct(info.total, total)}</span>
                                </div>
                            </div>
                            <div className="bg-gray-800 rounded-full h-1.5 overflow-hidden">
                                <div className={`${barColor} h-full rounded-full transition-all duration-500`}
                                    style={{ width: `${percentage}%` }} />
                            </div>
                        </div>
                    )
                })}
                {sorted.length === 0 && <p className="text-sm text-gray-500">Sem dados de pagamento</p>}
            </div>
        </div>
    )
}

function TopServicesCard({ topServices }) {
    if (!topServices || topServices.length === 0) return null
    const maxVal = Math.max(...topServices.map(([, s]) => s.total), 1)

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-lg">
            <h3 className="font-semibold text-gray-200 mb-4 flex items-center gap-2">
                <Scissors size={18} className="text-blue-500" /> Top Serviços
            </h3>
            <div className="space-y-2.5">
                {topServices.map(([name, info], i) => (
                    <div key={name} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-5 text-right shrink-0">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                                <span className="text-sm text-gray-300 truncate mr-2">{name}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs text-gray-500">{info.count}x</span>
                                    <span className="text-sm font-semibold text-gray-200">{fmt(info.total)}</span>
                                </div>
                            </div>
                            <div className="bg-gray-800 rounded-full h-1 overflow-hidden">
                                <div className="bg-blue-500 h-full rounded-full transition-all duration-500"
                                    style={{ width: `${(info.total / maxVal) * 100}%` }} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function StoreManagerCard({ label, stats, color }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
                <DollarSign className={`text-${color}-500`} size={20} />
                <h3 className="font-bold text-gray-200">Resumo {label}</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-gray-500 border-b border-gray-800">
                        <tr>
                            <th className="py-2">Forma</th>
                            <th className="py-2 text-right">Hoje</th>
                            <th className="py-2 text-right">Mês Atual</th>
                        </tr>
                    </thead>
                    <tbody className="text-gray-300 divide-y divide-gray-800">
                        {[
                            { label: 'Dinheiro', key: 'dinheiro' },
                            { label: 'Pix', key: 'pix' },
                            { label: 'Débito', key: 'debito' },
                            { label: 'Crédito', key: 'credito' }
                        ].map(row => (
                            <tr key={row.key}>
                                <td className="py-2">{row.label}</td>
                                <td className="py-2 text-right">{fmt(stats.today[row.key])}</td>
                                <td className="py-2 text-right">{fmt(stats.month[row.key])}</td>
                            </tr>
                        ))}
                        <tr className="font-bold bg-gray-800/20">
                            <td className={`py-2 text-${color}-400`}>Total</td>
                            <td className={`py-2 text-right text-${color}-400`}>{fmt(stats.today.total)}</td>
                            <td className={`py-2 text-right text-${color}-400`}>{fmt(stats.month.total)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function InsightRow({ icon, label, value }) {
    return (
        <div className="flex items-center gap-3 py-2 px-3 bg-gray-950/50 rounded-lg border border-gray-800/50">
            {icon}
            <span className="text-xs text-gray-500">{label}</span>
            <span className="text-sm text-gray-200 font-medium ml-auto">{value}</span>
        </div>
    )
}
