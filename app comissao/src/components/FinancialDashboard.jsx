import { useState, useEffect } from 'react'
import { db, collection, query, where, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, orderBy, limit, onSnapshot } from '../firebase'
import { Timestamp } from 'firebase/firestore'
import { DollarSign, TrendingUp, TrendingDown, Wallet, Calendar, Copy, Trash2, PlusCircle, CheckCircle, Clock, RefreshCw } from 'lucide-react'
import { BARBERS, STORES } from '../data/barbers'

export function FinancialDashboard() {
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({
        loja01: { revenue: 0, expenses: 0, balance: 0 },
        loja02: { revenue: 0, expenses: 0, balance: 0 },
        global: { revenue: 0, expenses: 0, external: 0, profit: 0 }
    })
    const [expenses, setExpenses] = useState([])
    const [uiExpenses, setUiExpenses] = useState([]) // For display including virtual
    const [revenueData, setRevenueData] = useState([])
    const [externalRevenue, setExternalRevenue] = useState('')

    // Form State
    const [newExpense, setNewExpense] = useState({
        description: '',
        value: '',
        store: 'loja-01',
        date: new Date().toISOString().slice(0, 10),
        status: 'pago'
    })
    const [processing, setProcessing] = useState(false)

    // Real-time Listeners
    useEffect(() => {
        setLoading(true)
        const [y, m] = month.split('-')
        const start = new Date(y, m - 1, 1)
        const end = new Date(y, m, 0, 23, 59, 59)

        // 1. Revenue Listener
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

        // 2. Expense Listener
        const expenseQ = query(collection(db, 'despesas'))
        const unsubExpenses = onSnapshot(expenseQ, (snapshot) => {
            const docs = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(d => d.date >= month + '-01' && d.date <= month + '-31')

            // Sort client-side
            setExpenses(docs.sort((a, b) => b.date.localeCompare(a.date)))
            setLoading(false)
        }, (error) => {
            console.error("Expense listener error:", error)
            setLoading(false)
        })

        return () => {
            unsubRevenue()
            unsubExpenses()
        }
    }, [month])

    // Calculate Stats whenever data changes
    useEffect(() => {
        const calcStoreRevenue = (storeId) => {
            return revenueData.filter(d => {
                if (d.loja_id === storeId) return true
                const barber = BARBERS.find(b => b.id === d.barber_id)
                return barber?.store === storeId
            }).reduce((acc, curr) => {
                if (curr.forma_pagamento === 'Assinante') return acc
                if (['adiantamento', 'fechamento_comissao'].includes(curr.tipo)) return acc
                return acc + (parseFloat(curr.valor_bruto) || 0)
            }, 0)
        }

        const calcStoreCommissions = (storeId) => {
            return revenueData.filter(d => {
                const barber = BARBERS.find(b => b.id === d.barber_id)
                if (d.tipo !== 'servico') return false
                if (d.loja_id === storeId) return true
                return barber?.store === storeId
            }).reduce((acc, curr) => acc + (parseFloat(curr.comissao_barbeiro) || 0), 0)
        }

        const calcStoreManualExpenses = (storeId) => {
            // Filter expenses strictly from the 'expenses' state which is already date-filtered
            return expenses
                .filter(d => d.store === storeId && d.status === 'pago')
                .reduce((acc, curr) => acc + (parseFloat(curr.value) || 0), 0)
        }

        const l1Rev = calcStoreRevenue('loja-01')
        const l1ManualExp = calcStoreManualExpenses('loja-01')
        const l1Comm = calcStoreCommissions('loja-01')
        const l1TotalExp = l1ManualExp + l1Comm

        const l2Rev = calcStoreRevenue('loja-02')
        const l2ManualExp = calcStoreManualExpenses('loja-02')
        const l2Comm = calcStoreCommissions('loja-02')
        const l2TotalExp = l2ManualExp + l2Comm

        setStats({
            loja01: { revenue: l1Rev, expenses: l1TotalExp, balance: l1Rev - l1TotalExp },
            loja02: { revenue: l2Rev, expenses: l2TotalExp, balance: l2Rev - l2TotalExp },
            global: {
                revenue: l1Rev + l2Rev,
                expenses: l1TotalExp + l2TotalExp,
                external: 0,
                profit: (l1Rev + l2Rev) - (l1TotalExp + l2TotalExp)
            }
        })

        // Inject Virtual Expenses for UI (calculated from Realtime Data)
        const virtualExpenses = []
        if (l1Comm > 0) virtualExpenses.push({
            id: 'auto-l1', date: month + '-28', description: 'Comissões Automáticas (Loja 01)',
            value: l1Comm, store: 'loja-01', status: 'auto', isVirtual: true
        })
        if (l2Comm > 0) virtualExpenses.push({
            id: 'auto-l2', date: month + '-28', description: 'Comissões Automáticas (Loja 02)',
            value: l2Comm, store: 'loja-02', status: 'auto', isVirtual: true
        })

        // Merge with REAL filtered expenses for UI display
        const allExpenses = [...expenses, ...virtualExpenses].sort((a, b) => b.date.localeCompare(a.date))
        setUiExpenses(allExpenses)

    }, [revenueData, expenses]) // Recalculate when either revenue (for commissions) or manual expenses change

    const handleAddExpense = async () => {
        // e.preventDefault() // No longer a form

        // Validation with alerts
        if (!newExpense.description) return alert("Por favor, preencha a descrição.")
        if (!newExpense.value) return alert("Por favor, preencha o valor.")
        if (!newExpense.date) return alert("Por favor, selecione uma data.")

        setProcessing(true)
        try {
            // Robust Number Parsing
            // 1. Remove non-numeric chars except . and ,
            // 2. Replace , with .
            let valStr = newExpense.value.toString()
            valStr = valStr.replace(',', '.') // Allow 10,50 -> 10.50
            const valFloat = parseFloat(valStr)

            if (isNaN(valFloat) || valFloat <= 0) {
                alert("Valor inválido! Digite apenas números, ex: 100 ou 10.50")
                setProcessing(false)
                return
            }

            console.log("Saving expense:", { ...newExpense, value: valFloat })

            // Add Doc
            await addDoc(collection(db, 'despesas'), {
                description: newExpense.description,
                value: valFloat,
                store: newExpense.store,
                date: newExpense.date,
                status: newExpense.status,
                created_at: serverTimestamp()
            })

            console.log("Expense Saved!")
            // alert("Despesa salva!") // Let's give feedback since user said 'not working'

            setNewExpense({
                ...newExpense,
                description: '',
                value: '',
                // Keep date to help entering multiple items in same day
            })

            // Force refresh explicitly if listener is weird? No, onSnapshot should handle it.

        } catch (e) {
            console.error("Error adding expense:", e)
            alert("ERRO CRÍTICO ao salvar: " + e.message)
        } finally {
            setProcessing(false)
        }
    }

    const [deleteId, setDeleteId] = useState(null)

    const confirmDelete = (id) => {
        setDeleteId(id)
    }

    const executeDelete = async () => {
        if (!deleteId) return

        try {
            await deleteDoc(doc(db, 'despesas', deleteId))
            setDeleteId(null) // Close modal
        } catch (e) {
            console.error("Error deleting:", e)
            alert("Erro ao excluir: " + e.message)
        }
    }

    const toggleExpenseStatus = async (item) => {
        if (item.isVirtual) return alert("Despesas automáticas não podem ser alteradas.")

        const newStatus = item.status === 'planejado' ? 'pago' : 'planejado'
        try {
            await updateDoc(doc(db, 'despesas', item.id), {
                status: newStatus
            })
        } catch (e) {
            console.error("Error updating status:", e)
            alert("Erro ao atualizar status: " + e.message)
        }
    }

    // Re-calculating Global Profit with External Revenue
    const totalProfit = stats.global.profit + (parseFloat(externalRevenue) || 0)

    const handleExportAI = () => {
        const report = {
            period: month,
            generated_at: new Date().toISOString(),
            financials: {
                ...stats,
                external_revenue: parseFloat(externalRevenue) || 0,
                final_profit: totalProfit
            },
            expenses_list: uiExpenses.map(e => ({
                date: e.date,
                desc: e.description,
                value: e.value,
                store: e.store,
                status: e.status
            }))
        }
        navigator.clipboard.writeText(JSON.stringify(report, null, 2))
        alert("Relatório Financeiro COPIADO para IA!")
    }

    // Chart Component (Simple SVG)
    const BarChart = ({ label, revenue, expense, color }) => {
        const max = Math.max(revenue, expense, 1) // avoid div by 0
        const revH = (revenue / max) * 100
        const expH = (expense / max) * 100
        const profit = revenue - expense

        return (
            <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 flex flex-col h-full">
                <h4 className="text-gray-400 text-sm font-medium mb-4 flex items-center gap-2">
                    <TrendingUp size={16} className={`text-${color}-500`} /> {label}
                </h4>

                <div className="flex-1 flex items-end gap-4 justify-center px-4 min-h-[120px]">
                    {/* Revenue Bar */}
                    <div className="w-16 flex flex-col items-center gap-2 group">
                        <span className="text-xs text-green-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                            {revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <div className="w-full bg-green-500/20 border border-green-500/50 rounded-t-sm transition-all hover:bg-green-500/40 relative" style={{ height: `${revH}%` }}></div>
                        <span className="text-xs text-gray-500">Rec</span>
                    </div>

                    {/* Expense Bar */}
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

    return (
        <div className="space-y-8 pb-20">
            {/* Header / Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-900 p-4 rounded-xl border border-gray-800">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Wallet className="text-cyan-500" /> Painel Financeiro
                    </h2>
                    <input
                        type="month"
                        value={month}
                        onChange={e => setMonth(e.target.value)}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-white"
                    />
                </div>
                <button
                    onClick={handleExportAI}
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium shadow-lg shadow-purple-900/20 active:scale-95 transition-all"
                >
                    <Copy size={16} /> Relatório para IA
                </button>
            </div>

            {/* MAIN STATS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

                {/* GLOBAL & EXTERNAL */}
                <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 flex flex-col gap-6">
                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Receita Externa (Celcoin/Assinaturas)</label>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-3 text-purple-500" size={18} />
                            <input
                                type="number"
                                value={externalRevenue}
                                onChange={e => setExternalRevenue(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-2 text-white focus:border-purple-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="bg-gray-950/50 p-4 rounded-lg flex-1 flex flex-col justify-center items-center">
                        <span className="text-gray-500 text-sm mb-1">Lucro Líquido Global</span>
                        <span className={`text-4xl font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {totalProfit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <span className="text-xs text-gray-600 mt-2">
                            (Receitas + Externa) - Despesas Totais
                        </span>
                    </div>
                </div>
            </div>

            {/* EXPENSE MANAGER */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <h3 className="font-bold text-gray-200 flex items-center gap-2">
                        <TrendingDown className="text-red-500" /> Gestão de Despesas
                    </h3>
                </div>

                {/* ADD FORM (Div based to avoid form submission quirks) */}
                <div className="p-4 grid grid-cols-2 md:grid-cols-12 gap-3 bg-gray-950/30 border-b border-gray-800">
                    <div className="col-span-2 md:col-span-4">
                        <input
                            type="text"
                            placeholder="Descrição da despesa..."
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500"
                            value={newExpense.description}
                            onChange={e => setNewExpense({ ...newExpense, description: e.target.value })}
                        />
                    </div>
                    <div className="col-span-1 md:col-span-2">
                        <input
                            type="text"
                            placeholder="R$ Valor"
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500"
                            value={newExpense.value}
                            onChange={e => setNewExpense({ ...newExpense, value: e.target.value })}
                        />
                    </div>
                    <div className="col-span-1 md:col-span-2">
                        <input
                            type="date"
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500"
                            value={newExpense.date}
                            onChange={e => setNewExpense({ ...newExpense, date: e.target.value })}
                        />
                    </div>
                    <div className="col-span-1 md:col-span-1">
                        <select
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 text-sm"
                            value={newExpense.store}
                            onChange={e => setNewExpense({ ...newExpense, store: e.target.value })}
                        >
                            <option value="loja-01">L01</option>
                            <option value="loja-02">L02</option>
                        </select>
                    </div>
                    <div className="col-span-1 md:col-span-1">
                        <select
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 text-sm"
                            value={newExpense.status}
                            onChange={e => setNewExpense({ ...newExpense, status: e.target.value })}
                        >
                            <option value="pago">Pg</option>
                            <option value="planejado">Pln</option>
                        </select>
                    </div>
                    <button
                        type="button"
                        onClick={handleAddExpense}
                        disabled={processing}
                        className="col-span-2 md:col-span-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg flex items-center justify-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <PlusCircle size={18} /> {processing ? '...' : 'Adicionar'}
                    </button>
                </div>

                {/* LIST */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-950 text-gray-400">
                            <tr>
                                <th className="px-4 py-3">Data</th>
                                <th className="px-4 py-3">Descrição</th>
                                <th className="px-4 py-3">Loja</th>
                                <th className="px-4 py-3 text-right">Valor</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 text-gray-300">
                            {uiExpenses.length === 0 ? (
                                <tr><td colSpan="6" className="p-8 text-center text-gray-500">Nenhuma despesa neste mês.</td></tr>
                            ) : (
                                uiExpenses.map(item => (
                                    <tr key={item.id} className={`hover:bg-gray-800/30 transition-colors ${item.status === 'planejado' ? 'opacity-70 bg-yellow-900/5' : ''} ${item.isVirtual ? 'bg-purple-900/10' : ''}`}>
                                        <td className="px-4 py-3 text-gray-500">{new Date(item.date).toLocaleDateString('pt-BR')}</td>
                                        <td className="px-4 py-3 font-medium flex items-center gap-2">
                                            {item.description}
                                            {item.isVirtual && <span className="text-[10px] bg-purple-900/40 text-purple-300 px-1 rounded border border-purple-500/20">AUTO</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            {STORES.find(s => s.id === item.store)?.name || item.store}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-red-400">
                                            - {parseFloat(item.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span
                                                onClick={() => toggleExpenseStatus(item)}
                                                className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer hover:scale-105 transition-transform select-none ${item.status === 'pago' ? 'bg-green-900/30 text-green-400 border border-green-500/30' : item.status === 'auto' ? 'bg-purple-900/30 text-purple-400' : 'bg-yellow-900/30 text-yellow-400 border border-yellow-500/30'}`}
                                                title={item.status === 'auto' ? 'Automático' : 'Clique para alterar status'}
                                            >
                                                {item.status === 'pago' ? <CheckCircle size={12} /> : item.status === 'auto' ? <TrendingDown size={12} /> : <Clock size={12} />}
                                                {item.status.toUpperCase()}
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
            {/* DELETE MODAL */}
            {deleteId && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-2">Excluir Despesa?</h3>
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
            )}
        </div>
    )
}
