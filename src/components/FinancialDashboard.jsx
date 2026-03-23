import { useState, useEffect } from 'react'
import { db, collection, query, where, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, orderBy, limit, onSnapshot } from '../firebase'
import { Timestamp } from 'firebase/firestore'
import { DollarSign, TrendingUp, TrendingDown, Wallet, Calendar, Copy, Trash2, PlusCircle, CheckCircle, Clock, RefreshCw, Download, Building, CreditCard, ArrowUpCircle } from 'lucide-react'
import { BARBERS, STORES } from '../data/barbers'

// ==========================================
// CONSTANTES E ENUMS
// ==========================================

const FINANCE_TYPES = [
    { id: 'custo_fixo', label: 'Custo Fixo', color: 'orange', icon: Building },
    { id: 'custo_variavel', label: 'Custo Variável', color: 'red', icon: CreditCard },
    { id: 'receita_externa', label: 'Receita Externa', color: 'green', icon: ArrowUpCircle }
]

const STATUS_OPTIONS = [
    { id: 'pago', label: 'Pago', color: 'green' },
    { id: 'pendente', label: 'Pendente', color: 'yellow' },
    { id: 'provisionado', label: 'Provisionado', color: 'blue' },
    { id: 'automatico', label: 'Automático', color: 'purple' }
]

const SOURCE_OPTIONS = [
    { id: 'manual', label: 'Manual' },
    { id: 'sistema', label: 'Sistema' },
    { id: 'integracao', label: 'Integração' }
]

const STORE_OPTIONS = [
    { id: 'loja01', label: 'Loja 01' },
    { id: 'loja02', label: 'Loja 02' },
    { id: 'global', label: 'Global' }
]

// ==========================================
// MOVIMENTAÇÕES DE CAPITAL (NÃO AFETAM LUCRO)
// ==========================================

const MOVEMENT_TYPES = [
    { id: 'entrada', label: 'Entrada de Capital', color: 'green' },
    { id: 'saida', label: 'Saída de Capital', color: 'red' }
]

const MOVEMENT_CATEGORIES = [
    // Entradas
    { id: 'emprestimo', label: 'Empréstimo Recebido', type: 'entrada' },
    { id: 'aporte', label: 'Aporte de Capital', type: 'entrada' },
    // Saídas
    { id: 'pagamento_emprestimo', label: 'Pagamento de Empréstimo (Principal)', type: 'saida' },
    { id: 'retirada', label: 'Retirada de Capital', type: 'saida' },
    { id: 'ajuste_caixa', label: 'Ajuste de Caixa', type: 'both' },
    { id: 'outro', label: 'Outro', type: 'both' }
]

const MOVEMENT_STATUS = [
    { id: 'pago', label: 'Efetivado', color: 'green' },
    { id: 'pendente', label: 'Pendente', color: 'yellow' },
    { id: 'provisionado', label: 'Provisionado', color: 'blue' }
]

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export function FinancialDashboard() {
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({
        loja01: { revenue: 0, expenses: 0, balance: 0 },
        loja02: { revenue: 0, expenses: 0, balance: 0 },
        global: { revenue: 0, expenses: 0, external: 0, profit: 0 }
    })
    const [financialData, setFinancialData] = useState([])
    const [uiFinancialData, setUiFinancialData] = useState([]) // For display including virtual
    const [revenueData, setRevenueData] = useState([])

    // Movimentações de Capital
    const [movementsData, setMovementsData] = useState([])
    const [capitalStats, setCapitalStats] = useState({ entradas: 0, saidas: 0, saldo: 0 })

    const [newFinance, setNewFinance] = useState({
        description: '',
        amount: '',
        store_id: 'loja01',
        finance_type: 'custo_fixo',
        status: 'pago',
        source: 'manual',
        date: new Date().toISOString().slice(0, 10),
        competence_month: new Date().toISOString().slice(0, 7)
    })
    const [processing, setProcessing] = useState(false)

    // Form State - Movimentações de Capital
    const [newMovement, setNewMovement] = useState({
        description: '',
        amount: '',
        movement_type: 'entrada',
        movement_category: 'aporte',
        status: 'pago',
        date: new Date().toISOString().slice(0, 10)
    })
    const [processingMovement, setProcessingMovement] = useState(false)

    // Real-time Listeners
    useEffect(() => {
        setLoading(true)
        const [y, m] = month.split('-')
        const start = new Date(y, m - 1, 1)
        const end = new Date(y, m, 0, 23, 59, 59)

        // 1. Revenue Listener (for auto-calculating commissions)
        const revenueQ = query(
            collection(db, 'lancamentos'),
            orderBy('data', 'desc'),
            limit(1000)
        )

        const unsubRevenue = onSnapshot(revenueQ, (snapshot) => {
            const docs = snapshot.docs
                .map(d => d.data())
                .filter(d => {
                    const date = d.data?.toDate ? d.data.toDate() : new Date(d.data.seconds * 1000)
                    return date >= start && date <= end
                })
            setRevenueData(docs)
        }, (error) => {
            console.error("Revenue listener error:", error)
        })

        // 2. Financial Data Listener (nova coleção 'financeiro')
        const financeQ = query(collection(db, 'financeiro'))
        const unsubFinance = onSnapshot(financeQ, (snapshot) => {
            const docs = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(d => d.competence_month === month || (d.date >= month + '-01' && d.date <= month + '-31'))

            // Sort client-side by date desc
            setFinancialData(docs.sort((a, b) => (b.date || '').localeCompare(a.date || '')))
            setLoading(false)
        }, (error) => {
            console.error("Finance listener error:", error)
            setLoading(false)
        })

        // 3. Legacy: despesas collection (retrocompatibilidade)
        const despesasQ = query(collection(db, 'despesas'))
        const unsubDespesas = onSnapshot(despesasQ, (snapshot) => {
            const docs = snapshot.docs
                .map(d => ({
                    id: d.id,
                    ...d.data(),
                    // Mapear campos antigos para novos
                    finance_type: 'custo_variavel',
                    source: 'manual',
                    store_id: d.data().store?.replace('loja-', 'loja') || 'loja01',
                    amount: d.data().value,
                    competence_month: d.data().date?.slice(0, 7) || month,
                    isLegacy: true
                }))
                .filter(d => d.date >= month + '-01' && d.date <= month + '-31')

            // Merge with new data
            setFinancialData(prev => {
                const newDocs = prev.filter(p => !p.isLegacy)
                return [...newDocs, ...docs].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
            })
        })

        // 4. Movimentações de Capital Listener
        const movementQ = query(collection(db, 'movimentacoes'))
        const unsubMovements = onSnapshot(movementQ, (snapshot) => {
            const docs = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(d => d.date >= month + '-01' && d.date <= month + '-31')

            // Sort by date desc
            setMovementsData(docs.sort((a, b) => (b.date || '').localeCompare(a.date || '')))

            // Calculate capital stats (only 'pago' counts for cash flow)
            const entradas = docs
                .filter(d => d.movement_type === 'entrada' && d.status === 'pago')
                .reduce((acc, d) => acc + (parseFloat(d.amount) || 0), 0)
            const saidas = docs
                .filter(d => d.movement_type === 'saida' && d.status === 'pago')
                .reduce((acc, d) => acc + (parseFloat(d.amount) || 0), 0)

            setCapitalStats({
                entradas,
                saidas,
                saldo: entradas - saidas
            })
        }, (error) => {
            console.error("Movements listener error:", error)
        })

        return () => {
            unsubRevenue()
            unsubFinance()
            unsubDespesas()
            unsubMovements()
        }
    }, [month])

    // Calculate Stats whenever data changes
    useEffect(() => {
        // Normalize store_id
        const normalizeStore = (storeId) => {
            if (!storeId) return 'loja01'
            return storeId.replace('loja-', 'loja')
        }

        const calcStoreRevenue = (storeId) => {
            return revenueData.filter(d => {
                const docStore = normalizeStore(d.loja_id)
                if (docStore === storeId) return true
                const barber = BARBERS.find(b => b.id === d.barbeiro_id)
                return normalizeStore(barber?.store) === storeId
            }).reduce((acc, curr) => {
                if (curr.forma_pagamento === 'Assinante') return acc
                if (['adiantamento', 'fechamento_comissao', 'pagamento'].includes(curr.tipo)) return acc
                return acc + (parseFloat(curr.valor_bruto) || 0)
            }, 0)
        }

        const calcStoreCommissions = (storeId) => {
            return revenueData.filter(d => {
                const barber = BARBERS.find(b => b.id === d.barbeiro_id)
                if (d.tipo !== 'servico') return false
                const docStore = normalizeStore(d.loja_id)
                if (docStore === storeId) return true
                return normalizeStore(barber?.store) === storeId
            }).reduce((acc, curr) => acc + (parseFloat(curr.comissao_barbeiro) || 0), 0)
        }

        // Custos fixos por loja
        const calcStoreCostosFixos = (storeId) => {
            return financialData
                .filter(d => d.finance_type === 'custo_fixo' && d.store_id === storeId && d.status !== 'provisionado')
                .reduce((acc, curr) => acc + (parseFloat(curr.amount || curr.value) || 0), 0)
        }

        // Custos variáveis por loja (manuais)
        const calcStoreCostosVariaveis = (storeId) => {
            return financialData
                .filter(d => d.finance_type === 'custo_variavel' && d.store_id === storeId && d.status !== 'provisionado')
                .reduce((acc, curr) => acc + (parseFloat(curr.amount || curr.value) || 0), 0)
        }

        // Receitas externas (global ou por loja)
        const calcReceitasExternas = (storeId) => {
            return financialData
                .filter(d => d.finance_type === 'receita_externa' && (d.store_id === storeId || d.store_id === 'global'))
                .reduce((acc, curr) => acc + (parseFloat(curr.amount || curr.value) || 0), 0)
        }

        // Loja 01
        const l1Rev = calcStoreRevenue('loja01')
        const l1Comm = calcStoreCommissions('loja01')
        const l1CustosFixos = calcStoreCostosFixos('loja01')
        const l1CustosVar = calcStoreCostosVariaveis('loja01')
        const l1TotalExp = l1Comm + l1CustosFixos + l1CustosVar

        // Loja 02
        const l2Rev = calcStoreRevenue('loja02')
        const l2Comm = calcStoreCommissions('loja02')
        const l2CustosFixos = calcStoreCostosFixos('loja02')
        const l2CustosVar = calcStoreCostosVariaveis('loja02')
        const l2TotalExp = l2Comm + l2CustosFixos + l2CustosVar

        // Global
        const globalCustosFixos = calcStoreCostosFixos('global')
        const globalCustosVar = calcStoreCostosVariaveis('global')
        const receitasExternas = calcReceitasExternas('global')

        const totalRevenue = l1Rev + l2Rev + receitasExternas
        const totalExpenses = l1TotalExp + l2TotalExp + globalCustosFixos + globalCustosVar

        setStats({
            loja01: { revenue: l1Rev, expenses: l1TotalExp, balance: l1Rev - l1TotalExp },
            loja02: { revenue: l2Rev, expenses: l2TotalExp, balance: l2Rev - l2TotalExp },
            global: {
                revenue: l1Rev + l2Rev,
                expenses: totalExpenses,
                external: receitasExternas,
                profit: totalRevenue - totalExpenses
            }
        })

        // Inject Virtual Expenses for UI (calculated from Realtime Data)
        const virtualExpenses = []
        if (l1Comm > 0) virtualExpenses.push({
            id: 'auto-l1',
            date: month + '-28',
            description: 'Comissões Automáticas',
            amount: l1Comm,
            store_id: 'loja01',
            finance_type: 'custo_variavel',
            status: 'automatico',
            source: 'sistema',
            competence_month: month,
            isVirtual: true
        })
        if (l2Comm > 0) virtualExpenses.push({
            id: 'auto-l2',
            date: month + '-28',
            description: 'Comissões Automáticas',
            amount: l2Comm,
            store_id: 'loja02',
            finance_type: 'custo_variavel',
            status: 'automatico',
            source: 'sistema',
            competence_month: month,
            isVirtual: true
        })

        // Merge with REAL filtered entries for UI display
        const allData = [...financialData, ...virtualExpenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        setUiFinancialData(allData)

    }, [revenueData, financialData, month])

    // ==========================================
    // HANDLERS
    // ==========================================

    const handleAddFinance = async () => {
        if (!newFinance.description) return alert("Por favor, preencha a descrição.")
        if (!newFinance.amount) return alert("Por favor, preencha o valor.")
        if (!newFinance.date) return alert("Por favor, selecione uma data.")

        setProcessing(true)
        try {
            let valStr = newFinance.amount.toString().replace(',', '.')
            const valFloat = parseFloat(valStr)

            if (isNaN(valFloat) || valFloat <= 0) {
                alert("Valor inválido! Digite apenas números, ex: 100 ou 10.50")
                setProcessing(false)
                return
            }

            await addDoc(collection(db, 'financeiro'), {
                description: newFinance.description,
                amount: valFloat,
                store_id: newFinance.store_id,
                finance_type: newFinance.finance_type,
                status: newFinance.status,
                source: newFinance.source,
                date: newFinance.date,
                competence_month: newFinance.competence_month,
                created_at: serverTimestamp()
            })

            setNewFinance({
                ...newFinance,
                description: '',
                amount: ''
            })

        } catch (e) {
            console.error("Error adding finance:", e)
            alert("ERRO ao salvar: " + e.message)
        } finally {
            setProcessing(false)
        }
    }

    // Handler para Movimentações de Capital
    const handleAddMovement = async () => {
        if (!newMovement.description) return alert("Por favor, preencha a descrição.")
        if (!newMovement.amount) return alert("Por favor, preencha o valor.")
        if (!newMovement.date) return alert("Por favor, selecione uma data.")

        setProcessingMovement(true)
        try {
            let valStr = newMovement.amount.toString().replace(',', '.')
            const valFloat = parseFloat(valStr)

            if (isNaN(valFloat) || valFloat <= 0) {
                alert("Valor inválido! Digite apenas números, ex: 100 ou 10.50")
                setProcessingMovement(false)
                return
            }

            await addDoc(collection(db, 'movimentacoes'), {
                description: newMovement.description,
                amount: valFloat,
                movement_type: newMovement.movement_type,
                movement_category: newMovement.movement_category,
                store_id: 'global', // Sempre global
                source: 'manual',
                status: newMovement.status,
                date: newMovement.date,
                created_at: serverTimestamp()
            })

            setNewMovement({
                ...newMovement,
                description: '',
                amount: ''
            })

        } catch (e) {
            console.error("Error adding movement:", e)
            alert("ERRO ao salvar: " + e.message)
        } finally {
            setProcessingMovement(false)
        }
    }

    const [deleteId, setDeleteId] = useState(null)
    const [deleteMovementId, setDeleteMovementId] = useState(null)

    const confirmDelete = (id) => {
        setDeleteId(id)
    }

    const executeDelete = async () => {
        if (!deleteId) return

        try {
            // Try new collection first, then legacy
            try {
                await deleteDoc(doc(db, 'financeiro', deleteId))
            } catch {
                await deleteDoc(doc(db, 'despesas', deleteId))
            }
            setDeleteId(null)
        } catch (e) {
            console.error("Error deleting:", e)
            alert("Erro ao excluir: " + e.message)
        }
    }

    const toggleStatus = async (item) => {
        if (item.isVirtual) return alert("Lançamentos automáticos não podem ser alterados.")

        const statusCycle = ['pago', 'pendente', 'provisionado']
        const currentIdx = statusCycle.indexOf(item.status)
        const newStatus = statusCycle[(currentIdx + 1) % statusCycle.length]

        try {
            const collectionName = item.isLegacy ? 'despesas' : 'financeiro'
            await updateDoc(doc(db, collectionName, item.id), {
                status: newStatus
            })
        } catch (e) {
            console.error("Error updating status:", e)
            alert("Erro ao atualizar status: " + e.message)
        }
    }

    // Delete Movement handlers
    const confirmDeleteMovement = (id) => {
        setDeleteMovementId(id)
    }

    const executeDeleteMovement = async () => {
        if (!deleteMovementId) return

        try {
            await deleteDoc(doc(db, 'movimentacoes', deleteMovementId))
            setDeleteMovementId(null)
        } catch (e) {
            console.error("Error deleting movement:", e)
            alert("Erro ao excluir: " + e.message)
        }
    }

    const toggleStatusMovement = async (item) => {
        const statusCycle = ['pago', 'pendente', 'provisionado']
        const currentIdx = statusCycle.indexOf(item.status || 'pago')
        const newStatus = statusCycle[(currentIdx + 1) % statusCycle.length]

        try {
            await updateDoc(doc(db, 'movimentacoes', item.id), {
                status: newStatus
            })
        } catch (e) {
            console.error("Error updating movement status:", e)
            alert("Erro ao atualizar status: " + e.message)
        }
    }

    // ==========================================
    // EXPORT JSON FINANCEIRO RAW
    // ==========================================

    const handleExportFinanceRAW = () => {
        const transformedData = uiFinancialData.map(d => ({
            finance_id: d.id,
            date: d.date,
            store_id: d.store_id,
            finance_type: d.finance_type,
            description: d.description,
            amount: parseFloat(d.amount || d.value || 0),
            status: d.status,
            source: d.source || 'manual',
            competence_month: d.competence_month || d.date?.slice(0, 7) || month
        }))

        const report = {
            metadata: {
                generated_at: new Date().toISOString(),
                period: month
            },
            data: transformedData
        }

        const jsonStr = JSON.stringify(report, null, 2)
        const blob = new Blob([jsonStr], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `financeiro_${month}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const handleExportAI = () => {
        const report = {
            period: month,
            generated_at: new Date().toISOString(),
            financials: {
                ...stats,
                final_profit: stats.global.profit
            },
            entries_list: uiFinancialData.map(e => ({
                date: e.date,
                desc: e.description,
                amount: e.amount || e.value,
                store: e.store_id,
                type: e.finance_type,
                status: e.status
            }))
        }
        navigator.clipboard.writeText(JSON.stringify(report, null, 2))
        alert("Relatório Financeiro COPIADO para IA!")
    }

    // ==========================================
    // COMPONENTES UI
    // ==========================================

    const BarChart = ({ label, revenue, expense, color }) => {
        const max = Math.max(revenue, expense, 1)
        const revH = (revenue / max) * 100
        const expH = (expense / max) * 100
        const profit = revenue - expense

        return (
            <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 flex flex-col h-full">
                <h4 className="text-gray-400 text-sm font-medium mb-4 flex items-center gap-2">
                    <TrendingUp size={16} className={`text-${color}-500`} /> {label}
                </h4>

                <div className="flex-1 flex items-end gap-4 justify-center px-4 min-h-[120px]">
                    <div className="w-16 flex flex-col items-center gap-2 group">
                        <span className="text-xs text-green-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                            {revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <div className="w-full bg-green-500/20 border border-green-500/50 rounded-t-sm transition-all hover:bg-green-500/40 relative" style={{ height: `${revH}%` }}></div>
                        <span className="text-xs text-gray-500">Rec</span>
                    </div>

                    <div className="w-16 flex flex-col items-center gap-2 group">
                        <span className="text-xs text-red-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                            {expense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <div className="w-full bg-red-500/20 border border-red-500/50 rounded-t-sm transition-all hover:bg-red-500/40" style={{ height: `${expH}%` }}></div>
                        <span className="text-xs text-gray-500">Desp</span>
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between items-center">
                    <span className="text-sm text-gray-500">Resultado</span>
                    <span className={`text-lg font-bold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {profit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                </div>
            </div>
        )
    }

    const getTypeColor = (type) => {
        const t = FINANCE_TYPES.find(f => f.id === type)
        return t?.color || 'gray'
    }

    const getStatusColor = (status) => {
        const s = STATUS_OPTIONS.find(f => f.id === status)
        return s?.color || 'gray'
    }

    // ==========================================
    // RENDER
    // ==========================================

    return (
        <div className="space-y-8 pb-20">
            {/* Header / Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-900 p-4 rounded-xl border border-gray-800">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                        <Wallet className="text-cyan-500" /> Painel Financeiro
                    </h2>
                    <input
                        type="month"
                        value={month}
                        onChange={e => setMonth(e.target.value)}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-white"
                    />
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleExportAI}
                        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg font-medium shadow-lg active:scale-95 transition-all text-sm"
                    >
                        <Copy size={16} /> Copiar IA
                    </button>
                    <button
                        onClick={handleExportFinanceRAW}
                        className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded-lg font-medium shadow-lg active:scale-95 transition-all text-sm"
                    >
                        <Download size={16} /> JSON RAW
                    </button>
                </div>
            </div>

            {/* MAIN STATS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <BarChart
                    label="Loja 01 (Matriz)"
                    revenue={stats.loja01.revenue}
                    expense={stats.loja01.expenses}
                    color="cyan"
                />
                <BarChart
                    label="Loja 02 (Filial)"
                    revenue={stats.loja02.revenue}
                    expense={stats.loja02.expenses}
                    color="purple"
                />

                {/* GLOBAL */}
                <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-sm">Receita Externa</span>
                        <span className="text-green-400 font-bold">
                            {stats.global.external.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                    </div>

                    <div className="bg-gray-950/50 p-4 rounded-lg flex-1 flex flex-col justify-center items-center">
                        <span className="text-gray-500 text-sm mb-1">Lucro Líquido Global</span>
                        <span className={`text-2xl sm:text-4xl font-bold ${stats.global.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {stats.global.profit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <span className="text-xs text-gray-600 mt-2">
                            (Receitas + Externa) - Despesas
                        </span>
                    </div>
                </div>
            </div>

            {/* FINANCIAL MANAGER */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <h3 className="font-bold text-gray-200 flex items-center gap-2">
                        <TrendingDown className="text-red-500" /> Gestão Financeira
                    </h3>
                    <span className="text-xs text-gray-500">{uiFinancialData.length} lançamentos</span>
                </div>

                {/* ADD FORM */}
                <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-950/30 border-b border-gray-800">
                    <div className="col-span-2">
                        <input
                            type="text"
                            placeholder="Descrição..."
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 text-sm"
                            value={newFinance.description}
                            onChange={e => setNewFinance({ ...newFinance, description: e.target.value })}
                        />
                    </div>
                    <div>
                        <input
                            type="text"
                            placeholder="R$ Valor"
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 text-sm"
                            value={newFinance.amount}
                            onChange={e => setNewFinance({ ...newFinance, amount: e.target.value })}
                        />
                    </div>
                    <div>
                        <select
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 text-sm"
                            value={newFinance.finance_type}
                            onChange={e => setNewFinance({ ...newFinance, finance_type: e.target.value })}
                        >
                            {FINANCE_TYPES.map(t => (
                                <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <input
                            type="date"
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 text-sm"
                            value={newFinance.date}
                            onChange={e => setNewFinance({ ...newFinance, date: e.target.value })}
                        />
                    </div>
                    <div>
                        <input
                            type="month"
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 text-sm"
                            value={newFinance.competence_month}
                            onChange={e => setNewFinance({ ...newFinance, competence_month: e.target.value })}
                            title="Mês de Competência"
                        />
                    </div>
                    <div>
                        <select
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 text-sm"
                            value={newFinance.store_id}
                            onChange={e => setNewFinance({ ...newFinance, store_id: e.target.value })}
                        >
                            {STORE_OPTIONS.map(s => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <select
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 text-sm"
                            value={newFinance.status}
                            onChange={e => setNewFinance({ ...newFinance, status: e.target.value })}
                        >
                            {STATUS_OPTIONS.filter(s => s.id !== 'automatico').map(s => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        onClick={handleAddFinance}
                        disabled={processing}
                        className="col-span-2 sm:col-span-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg flex items-center justify-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed py-2"
                    >
                        <PlusCircle size={18} /> {processing ? '...' : 'Adicionar Lançamento'}
                    </button>
                </div>

                {/* LIST */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-950 text-gray-400">
                            <tr>
                                <th className="px-4 py-3">Data</th>
                                <th className="px-4 py-3">Descrição</th>
                                <th className="px-4 py-3">Tipo</th>
                                <th className="px-4 py-3">Loja</th>
                                <th className="px-4 py-3 text-right">Valor</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 text-gray-300">
                            {uiFinancialData.length === 0 ? (
                                <tr><td colSpan="7" className="p-8 text-center text-gray-500">Nenhum lançamento neste mês.</td></tr>
                            ) : (
                                uiFinancialData.map(item => (
                                    <tr key={item.id} className={`hover:bg-gray-800/30 transition-colors ${item.status === 'pendente' ? 'opacity-70 bg-yellow-900/5' : ''} ${item.status === 'provisionado' ? 'opacity-60 bg-blue-900/5' : ''} ${item.isVirtual ? 'bg-purple-900/10' : ''}`}>
                                        <td className="px-4 py-3 text-gray-500">
                                            <div className="flex flex-col">
                                                <span>{new Date(item.date).toLocaleDateString('pt-BR')}</span>
                                                {item.competence_month && item.competence_month !== item.date?.slice(0, 7) && (
                                                    <span className="text-[10px] text-gray-600">Comp: {item.competence_month}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-medium flex items-center gap-2">
                                            {item.description}
                                            {item.isVirtual && <span className="text-[10px] bg-purple-900/40 text-purple-300 px-1 rounded border border-purple-500/20">AUTO</span>}
                                            {item.isLegacy && <span className="text-[10px] bg-gray-800 text-gray-500 px-1 rounded">LEGADO</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded text-xs bg-${getTypeColor(item.finance_type)}-900/30 text-${getTypeColor(item.finance_type)}-400 border border-${getTypeColor(item.finance_type)}-500/30`}>
                                                {FINANCE_TYPES.find(t => t.id === item.finance_type)?.label || item.finance_type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-400">
                                            {STORE_OPTIONS.find(s => s.id === item.store_id)?.label || item.store_id}
                                        </td>
                                        <td className={`px-4 py-3 text-right font-bold ${item.finance_type === 'receita_externa' ? 'text-green-400' : 'text-red-400'}`}>
                                            {item.finance_type === 'receita_externa' ? '+' : '-'} {parseFloat(item.amount || item.value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span
                                                onClick={() => toggleStatus(item)}
                                                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer hover:scale-105 transition-transform select-none bg-${getStatusColor(item.status)}-900/30 text-${getStatusColor(item.status)}-400 border border-${getStatusColor(item.status)}-500/30`}
                                                title={item.isVirtual ? 'Automático' : 'Clique para alterar status'}
                                            >
                                                {item.status === 'pago' ? <CheckCircle size={12} /> : item.status === 'automatico' ? <TrendingDown size={12} /> : <Clock size={12} />}
                                                {item.status?.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {!item.isVirtual && (
                                                <button
                                                    onClick={() => confirmDelete(item.id)}
                                                    className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-red-900/10 transition-colors"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ==========================================
                MOVIMENTAÇÕES DE CAPITAL
            =========================================== */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-gray-800">
                    <h3 className="font-bold text-gray-200 flex items-center gap-2">
                        <Wallet className="text-yellow-500" /> Movimentações de Capital
                        <span className="text-xs text-gray-500 font-normal ml-2">(Não afetam lucro operacional)</span>
                    </h3>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-gray-950/30 border-b border-gray-800">
                    <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 text-center">
                        <span className="text-xs text-green-400 block mb-1">Entradas</span>
                        <span className="text-xl font-bold text-green-400">
                            {capitalStats.entradas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                    </div>
                    <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-center">
                        <span className="text-xs text-red-400 block mb-1">Saídas</span>
                        <span className="text-xl font-bold text-red-400">
                            {capitalStats.saidas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                    </div>
                    <div className={`border rounded-lg p-4 text-center ${capitalStats.saldo >= 0 ? 'bg-cyan-900/20 border-cyan-500/30' : 'bg-orange-900/20 border-orange-500/30'}`}>
                        <span className={`text-xs block mb-1 ${capitalStats.saldo >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>Saldo de Caixa</span>
                        <span className={`text-xl font-bold ${capitalStats.saldo >= 0 ? 'text-cyan-400' : 'text-orange-400'}`}>
                            {capitalStats.saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                    </div>
                </div>

                {/* ADD Movement FORM */}
                <div className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 bg-gray-950/20 border-b border-gray-800">
                    <div className="col-span-2">
                        <input
                            type="text"
                            placeholder="Descrição..."
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-yellow-500 text-sm"
                            value={newMovement.description}
                            onChange={e => setNewMovement({ ...newMovement, description: e.target.value })}
                        />
                    </div>
                    <div>
                        <input
                            type="text"
                            placeholder="R$ Valor"
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-yellow-500 text-sm"
                            value={newMovement.amount}
                            onChange={e => setNewMovement({ ...newMovement, amount: e.target.value })}
                        />
                    </div>
                    <div>
                        <select
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-yellow-500 text-sm"
                            value={newMovement.movement_type}
                            onChange={e => setNewMovement({ ...newMovement, movement_type: e.target.value })}
                        >
                            {MOVEMENT_TYPES.map(t => (
                                <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <select
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-yellow-500 text-sm"
                            value={newMovement.movement_category}
                            onChange={e => setNewMovement({ ...newMovement, movement_category: e.target.value })}
                        >
                            {MOVEMENT_CATEGORIES.map(c => (
                                <option key={c.id} value={c.id}>{c.label}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <input
                            type="date"
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-yellow-500 text-sm"
                            value={newMovement.date}
                            onChange={e => setNewMovement({ ...newMovement, date: e.target.value })}
                        />
                    </div>
                    <div>
                        <select
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-yellow-500 text-sm"
                            value={newMovement.status}
                            onChange={e => setNewMovement({ ...newMovement, status: e.target.value })}
                        >
                            {MOVEMENT_STATUS.map(s => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        onClick={handleAddMovement}
                        disabled={processingMovement}
                        className="col-span-2 sm:col-span-4 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg flex items-center justify-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed py-2"
                    >
                        <PlusCircle size={18} /> {processingMovement ? '...' : 'Registrar Movimentação'}
                    </button>
                </div>

                {/* Movement List */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-950 text-gray-400">
                            <tr>
                                <th className="px-4 py-3">Data</th>
                                <th className="px-4 py-3">Descrição</th>
                                <th className="px-4 py-3">Categoria</th>
                                <th className="px-4 py-3 text-center">Tipo</th>
                                <th className="px-4 py-3 text-right">Valor</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 text-gray-300">
                            {movementsData.length === 0 ? (
                                <tr><td colSpan="7" className="p-8 text-center text-gray-500">Nenhuma movimentação neste mês.</td></tr>
                            ) : (
                                movementsData.map(item => (
                                    <tr key={item.id} className={`hover:bg-gray-800/30 transition-colors ${item.status === 'pendente' ? 'opacity-70 bg-yellow-900/5' : ''} ${item.status === 'provisionado' ? 'opacity-60 bg-blue-900/5' : ''}`}>
                                        <td className="px-4 py-3 text-gray-500">
                                            {new Date(item.date).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="px-4 py-3 font-medium">
                                            {item.description}
                                        </td>
                                        <td className="px-4 py-3 text-gray-400">
                                            {MOVEMENT_CATEGORIES.find(c => c.id === item.movement_category)?.label || item.movement_category}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded text-xs ${item.movement_type === 'entrada' ? 'bg-green-900/30 text-green-400 border border-green-500/30' : 'bg-red-900/30 text-red-400 border border-red-500/30'}`}>
                                                {item.movement_type === 'entrada' ? '↑ ENTRADA' : '↓ SAÍDA'}
                                            </span>
                                        </td>
                                        <td className={`px-4 py-3 text-right font-bold ${item.movement_type === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>
                                            {item.movement_type === 'entrada' ? '+' : '-'} {parseFloat(item.amount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span
                                                onClick={() => toggleStatusMovement(item)}
                                                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer hover:scale-105 transition-transform select-none bg-${getStatusColor(item.status || 'pago')}-900/30 text-${getStatusColor(item.status || 'pago')}-400 border border-${getStatusColor(item.status || 'pago')}-500/30`}
                                            >
                                                {item.status === 'pago' ? <CheckCircle size={12} /> : <Clock size={12} />}
                                                {(item.status || 'pago').toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => confirmDeleteMovement(item.id)}
                                                className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-red-900/10 transition-colors"
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

            {/* DELETE MODAL - Financial */}
            {
                deleteId && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl">
                            <h3 className="text-lg font-bold text-white mb-2">Excluir Lançamento?</h3>
                            <p className="text-gray-400 mb-6">Essa ação não pode ser desfeita.</p>
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
                )
            }

            {/* DELETE MODAL - Movements */}
            {
                deleteMovementId && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl">
                            <h3 className="text-lg font-bold text-white mb-2">Excluir Movimentação?</h3>
                            <p className="text-gray-400 mb-6">Essa ação não pode ser desfeita.</p>
                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setDeleteMovementId(null)}
                                    className="px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-800"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={executeDeleteMovement}
                                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium"
                                >
                                    Sim, Excluir
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    )
}
