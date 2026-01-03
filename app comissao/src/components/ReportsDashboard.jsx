import { useState, useEffect } from 'react'
import { db, collection, query, where, getDocs, deleteDoc, doc, orderBy, limit } from '../firebase'
import { Timestamp } from 'firebase/firestore'
import { Filter, Calendar, User, DollarSign, RefreshCw, AlertCircle, Copy, Trash2 } from 'lucide-react'
import { BARBERS, STORES } from '../data/barbers'

export function ReportsDashboard() {
    const [filters, setFilters] = useState({
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
        barberId: 'all',
        storeId: 'all'
    })
    const [data, setData] = useState([])
    const [loading, setLoading] = useState(false)
    const [metrics, setMetrics] = useState({ gross: 0, commission: 0, count: 0 })
    const [pageError, setPageError] = useState(null)

    // Assinaturas
    const [manualSubscriptionRevenue, setManualSubscriptionRevenue] = useState('')
    const [subscriptionMetrics, setSubscriptionMetrics] = useState({ count: 0, commissionCost: 0, internalRevenue: 0 })

    // Managerial Data (Current Month)
    const [managerialStats, setManagerialStats] = useState(null)

    // Store Metrics (Driven by filters)
    const [storeMetrics, setStoreMetrics] = useState({
        loja01: { gross: 0, commission: 0, count: 0 },
        loja02: { gross: 0, commission: 0, count: 0 }
    })

    // 1. Fetch Managerial Data (Independent of filters)
    useEffect(() => {
        const fetchManagerial = async () => {
            try {
                const now = new Date()
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
                startOfMonth.setHours(0, 0, 0, 0)

                const q = query(
                    collection(db, 'lancamentos'),
                    limit(20)
                    // limit query to debug permissions
                )

                const snapshot = await getDocs(q)
                const raw = snapshot.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                // .sort((a, b) => b.data.seconds - a.data.seconds)

                // Identify today
                const todayStr = new Date().toLocaleDateString('pt-BR')

                const calculateStats = (items) => {
                    const stats = {
                        dinheiro: 0, pix: 0, debito: 0, credito: 0, vale: 0, total: 0
                    }
                    items.forEach(i => {
                        const pm = i.forma_pagamento?.toLowerCase() || ''
                        const tp = i.tipo?.toLowerCase() || ''
                        const val = parseFloat(i.valor_bruto) || 0

                        // Skip non-revenue items
                        if (pm.includes('assinante') || pm.includes('vale presente') ||
                            tp.includes('adiantamento') || tp.includes('fechamento')) {
                            return
                        }

                        if (pm.includes('dinheiro')) stats.dinheiro += val
                        else if (pm.includes('pix')) stats.pix += val
                        else if (pm.includes('débito') || pm.includes('debito')) stats.debito += val
                        else if (pm.includes('crédito') || pm.includes('credito')) stats.credito += val
                        // Removed 'vale' addition to stats if it refers to 'Vale Presente' usage, 
                        // but if 'vale' means 'Voucher' payment that IS money, we keep it. 
                        // However, user said "vale presente" shouldn't sum.
                        // Assuming 'vale' in pm might catch 'vale presente'.
                        // Let's rely on the skip logic above. 

                        stats.total += val
                    })
                    return stats
                }

                const getStore = (d) => {
                    const barber = BARBERS.find(b => b.id === d.barber_id)
                    return d.loja_id || barber?.store || 'unknown'
                }

                const loja01Month = raw.filter(d => getStore(d) === 'loja-01')
                const loja02Month = raw.filter(d => getStore(d) === 'loja-02')

                // Filter for Today using Locale String
                const loja01Today = loja01Month.filter(d => d.data && new Date(d.data.seconds * 1000).toLocaleDateString('pt-BR') === todayStr)
                const loja02Today = loja02Month.filter(d => d.data && new Date(d.data.seconds * 1000).toLocaleDateString('pt-BR') === todayStr)

                setManagerialStats({
                    loja01: {
                        today: calculateStats(loja01Today),
                        month: calculateStats(loja01Month)
                    },
                    loja02: {
                        today: calculateStats(loja02Today),
                        month: calculateStats(loja02Month)
                    }
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

            let q = query(
                collection(db, 'lancamentos'),
                where('data', '>=', Timestamp.fromDate(start)),
                where('data', '<=', Timestamp.fromDate(end))
                // orderBy('data', 'desc') - Removed to avoid index issues
            )

            const snapshot = await getDocs(q)
            const raw = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => b.data.seconds - a.data.seconds) // Client-side sort

            const filtered = raw.filter(d => {
                const barber = BARBERS.find(b => b.id === d.barber_id)
                const store = d.loja_id || barber?.store || 'unknown'

                const matchBarber = filters.barberId === 'all' || d.barber_id === filters.barberId
                const matchStore = filters.storeId === 'all' || store === filters.storeId
                return matchBarber && matchStore
            })

            setData(filtered)

            // General Metrics
            const m = filtered.reduce((acc, curr) => {
                const isNonRevenue = ['Assinante', 'Vale Presente'].includes(curr.forma_pagamento) ||
                    ['adiantamento', 'fechamento_comissao'].includes(curr.tipo)

                return {
                    gross: acc.gross + (isNonRevenue ? 0 : (parseFloat(curr.valor_bruto) || 0)),
                    commission: acc.commission + (parseFloat(curr.comissao_barbeiro) || 0),
                    count: acc.count + 1
                }
            }, { gross: 0, commission: 0, count: 0 })

            setMetrics(m)

            // Subscription Metrics
            const subData = filtered.filter(d => d.forma_pagamento === 'Assinante')
            const internalSubSales = filtered.filter(d => d.tipo === 'venda_assinatura')
            const internalRevenue = internalSubSales.reduce((sum, i) => sum + (parseFloat(i.valor_bruto) || 0), 0)

            const subMetrics = subData.reduce((acc, curr) => ({
                count: acc.count + 1,
                commissionCost: acc.commissionCost + (parseFloat(curr.comissao_barbeiro) || 0),
                internalRevenue: 0
            }), { count: 0, commissionCost: 0, internalRevenue: 0 })

            subMetrics.internalRevenue = internalRevenue
            setSubscriptionMetrics(subMetrics)

            // Store Metrics
            const calculateStoreStats = (items) => items.reduce((acc, curr) => {
                const isNonRevenue = ['Assinante', 'Vale Presente'].includes(curr.forma_pagamento) ||
                    ['adiantamento', 'fechamento_comissao'].includes(curr.tipo)

                return {
                    gross: acc.gross + (isNonRevenue ? 0 : (parseFloat(curr.valor_bruto) || 0)),
                    commission: acc.commission + (parseFloat(curr.comissao_barbeiro) || 0),
                    count: acc.count + 1
                }
            }, { gross: 0, commission: 0, count: 0 })

            const getStore = (d) => {
                const barber = BARBERS.find(b => b.id === d.barber_id)
                return d.loja_id || barber?.store || 'unknown'
            }

            const loja01Data = raw.filter(d => getStore(d) === 'loja-01')
            const loja02Data = raw.filter(d => getStore(d) === 'loja-02')

            setStoreMetrics({
                loja01: calculateStoreStats(loja01Data),
                loja02: calculateStoreStats(loja02Data)
            })

        } catch (e) {
            console.error(e)
            setPageError('Erro ao buscar relatórios: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    // 3. Initial Fetch
    useEffect(() => {
        fetchReports()
    }, [])

    const [deleteId, setDeleteId] = useState(null)

    const confirmDelete = (id) => {
        setDeleteId(id)
    }

    const executeDelete = async () => {
        if (!deleteId) return
        try {
            await deleteDoc(doc(db, 'lancamentos', deleteId))
            setDeleteId(null)
            // Refresh logic - removing locally to avoid full refetch
            setData(data.filter(d => d.id !== deleteId))
            alert("Lançamento excluído com sucesso!")
        } catch (e) {
            console.error("Error deleting:", e)
            alert("Erro ao excluir: " + e.message)
        }
    }

    const totalSubscriptionRevenue = (parseFloat(manualSubscriptionRevenue || 0) + subscriptionMetrics.internalRevenue)
    const subscriptionProfit = totalSubscriptionRevenue - subscriptionMetrics.commissionCost

    const handleExportForAI = () => {
        const report = {
            metadata: {
                generated_at: new Date().toISOString(),
                period: { start: filters.startDate, end: filters.endDate },
                filters: { barber: filters.barberId, store: filters.storeId }
            },
            metrics: metrics,
            store_metrics: storeMetrics,
            data: data.map(d => ({
                date: d.data?.seconds ? new Date(d.data.seconds * 1000).toISOString().split('T')[0] : null,
                barber: d.barber_nome,
                service: d.servico_descricao,
                value: parseFloat(d.valor_bruto),
                commission: parseFloat(d.comissao_barbeiro),
                payment: d.forma_pagamento,
                type: d.tipo
            }))
        }

        const text = JSON.stringify(report, null, 2)
        navigator.clipboard.writeText(text)
            .then(() => alert("Relatório copiado para a área de transferência!"))
            .catch(err => alert("Erro ao copiar: " + err))
    }

    if (pageError) return <div className="p-8 text-red-500 font-bold">Erro crítico: {pageError}</div>

    return (
        <div className="space-y-6 pb-20">
            {/* Filters */}
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl flex flex-wrap gap-4 items-end shadow-lg">
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
                    <div className="relative">
                        <DollarSign className="absolute left-2.5 top-2.5 text-gray-500" size={14} />
                        <select
                            className="bg-gray-950 border border-gray-800 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-200 outline-none focus:border-cyan-500 appearance-none min-w-[120px]"
                            value={filters.storeId}
                            onChange={e => setFilters({ ...filters, storeId: e.target.value, barberId: 'all' })}
                        >
                            <option value="all">Todas</option>
                            {STORES.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
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
                            .map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                    </select>
                </div>
                <button onClick={fetchReports} className="bg-cyan-600 hover:bg-cyan-500 text-white p-2 rounded-lg transition-all shadow-lg active:scale-95 flex items-center gap-2 text-sm font-medium px-4 h-[38px]">
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Filtrar
                </button>
                <button onClick={handleExportForAI} className="bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 p-2 rounded-lg transition-all shadow-lg active:scale-95 flex items-center gap-2 text-sm font-medium px-4 h-[38px] ml-auto">
                    <Copy size={16} /> Copiar para IA
                </button>
            </div>

            {/* Managerial Summary Section */}
            {managerialStats && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6 border-b border-gray-800">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-lg">
                        <div className="flex items-center gap-2 mb-4">
                            <DollarSign className="text-cyan-500" size={20} />
                            <h3 className="font-bold text-gray-200">Resumo Loja 01</h3>
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
                                            <td className="py-2 text-right">{managerialStats.loja01.today[row.key].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                            <td className="py-2 text-right">{managerialStats.loja01.month[row.key].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        </tr>
                                    ))}
                                    <tr className="font-bold bg-gray-800/20">
                                        <td className="py-2 text-cyan-400">Total</td>
                                        <td className="py-2 text-right text-cyan-400">{managerialStats.loja01.today.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        <td className="py-2 text-right text-cyan-400">{managerialStats.loja01.month.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-lg">
                        <div className="flex items-center gap-2 mb-4">
                            <DollarSign className="text-purple-500" size={20} />
                            <h3 className="font-bold text-gray-200">Resumo Loja 02</h3>
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
                                            <td className="py-2 text-right">{managerialStats.loja02.today[row.key].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                            <td className="py-2 text-right">{managerialStats.loja02.month[row.key].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        </tr>
                                    ))}
                                    <tr className="font-bold bg-gray-800/20">
                                        <td className="py-2 text-purple-400">Total</td>
                                        <td className="py-2 text-right text-purple-400">{managerialStats.loja02.today.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        <td className="py-2 text-right text-purple-400">{managerialStats.loja02.month.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><DollarSign size={48} className="text-cyan-500" /></div>
                    <h3 className="text-gray-400 text-sm font-medium">Faturamento Bruto</h3>
                    <p className="text-3xl font-bold text-gray-100 mt-2">
                        {metrics.gross.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                </div>
                <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><User size={48} className="text-green-500" /></div>
                    <h3 className="text-gray-400 text-sm font-medium">Comissões Totais</h3>
                    <p className="text-3xl font-bold text-gray-100 mt-2 text-green-400">
                        {metrics.commission.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                </div>
            </div>

            {/* Store Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><DollarSign size={64} /></div>
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-gray-400 font-medium flex items-center gap-2"><DollarSign size={18} className="text-cyan-500" /> Loja 01</h3>
                        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-full">{storeMetrics.loja01.count} atendimentos</span>
                    </div>
                    <div className="space-y-1">
                        <div className="text-2xl font-bold text-gray-100">{storeMetrics.loja01.gross.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                        <div className="text-xs text-gray-500">Comissões: {storeMetrics.loja01.commission.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    </div>
                </div>
                <div className="bg-gray-900 border border-gray-800 p-5 rounded-2xl shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><DollarSign size={64} /></div>
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="text-gray-400 font-medium flex items-center gap-2"><DollarSign size={18} className="text-purple-500" /> Loja 02</h3>
                        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-full">{storeMetrics.loja02.count} atendimentos</span>
                    </div>
                    <div className="space-y-1">
                        <div className="text-2xl font-bold text-gray-100">{storeMetrics.loja02.gross.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                        <div className="text-xs text-gray-500">Comissões: {storeMetrics.loja02.commission.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    </div>
                </div>
            </div>

            {/* Subscription Section */}
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-lg">
                <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                    <span className="bg-purple-900/40 text-purple-400 p-1.5 rounded-lg"><User size={20} /></span> Monitoramento de Assinaturas
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Receita Plataforma Externa (Celcoin)</label>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-3 text-gray-500" size={18} />
                            <input type="number" step="0.01"
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 pl-10 pr-4 text-gray-200 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
                                placeholder="0,00"
                                value={manualSubscriptionRevenue}
                                onChange={e => setManualSubscriptionRevenue(e.target.value)}
                            />
                        </div>
                        <div className="mt-2 text-xs text-gray-500 flex justify-between">
                            <span>Vendas Balcão:</span>
                            <span className="text-gray-300 font-medium">{subscriptionMetrics.internalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                    </div>

                    <div className="flex gap-4 col-span-2">
                        <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 flex-1">
                            <div className="text-xs text-gray-500 mb-1">Atendimentos</div>
                            <div className="text-xl font-bold text-gray-200">{subscriptionMetrics.count}</div>
                        </div>
                        <div className="bg-gray-950 p-3 rounded-xl border border-gray-800 flex-1">
                            <div className="text-xs text-gray-500 mb-1">Custo Comissões</div>
                            <div className="text-xl font-bold text-red-400">
                                - {subscriptionMetrics.commissionCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </div>
                        </div>
                        <div className={`p-3 rounded-xl border flex-1 ${subscriptionProfit >= 0 ? 'bg-green-900/20 border-green-900/50' : 'bg-red-900/20 border-red-900/50'}`}>
                            <div className={`text-xs mb-1 ${subscriptionProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>Lucro Assinaturas</div>
                            <div className={`text-xl font-bold ${subscriptionProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {subscriptionProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-950 text-gray-400 border-b border-gray-800">
                            <tr>
                                <th className="px-4 py-3 font-medium">Data</th>
                                <th className="px-4 py-3 font-medium">Barbeiro</th>
                                <th className="px-4 py-3 font-medium">Cliente</th>
                                <th className="px-4 py-3 font-medium">Serviço</th>
                                <th className="px-4 py-3 font-medium text-right">Valor</th>
                                <th className="px-4 py-3 font-medium text-right">Comissão</th>
                                <th className="px-4 py-3 font-medium text-right">Pagamento</th>
                                <th className="px-4 py-3 font-medium text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 text-gray-300">
                            {data.length === 0 ? (
                                <tr><td colSpan="8" className="px-4 py-8 text-center text-gray-500">Nenhum lançamento encontrado</td></tr>
                            ) : (
                                data.map(item => (
                                    <tr key={item.id} className="hover:bg-gray-800/50 transition-colors">
                                        <td className="px-4 py-3">{item.data?.seconds ? new Date(item.data.seconds * 1000).toLocaleDateString('pt-BR') : '-'}</td>
                                        <td className="px-4 py-3">{item.barbeiro_nome}</td>
                                        <td className="px-4 py-3 text-gray-400">{item.cliente_nome || '-'}</td>
                                        <td className="px-4 py-3">{item.servico_descricao}</td>
                                        <td className="px-4 py-3 text-right">{parseFloat(item.valor_bruto).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        <td className="px-4 py-3 text-right text-gray-500">{parseFloat(item.comissao_barbeiro).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`px-2 py-1 rounded text-xs ${item.forma_pagamento === 'Assinante' ? 'bg-purple-900/40 text-purple-400' : 'bg-gray-800 text-gray-400'}`}>
                                                {item.forma_pagamento}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => confirmDelete(item.id)}
                                                className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-red-900/10 transition-colors"
                                                title="Excluir Lançamento"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* DELETE MODAL */}
            {deleteId && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-2">Excluir Lançamento?</h3>
                        <p className="text-gray-400 mb-6">Essa ação não pode ser desfeita e afetará os relatórios.</p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setDeleteId(null)}
                                className="px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-800"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={executeDelete}
                                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium"
                            >
                                Sim, Excluir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    )
}
