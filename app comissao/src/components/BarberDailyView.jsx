import { useState, useEffect } from 'react'
import { db, collection, query, where, onSnapshot, orderBy, limit, addDoc, serverTimestamp, deleteDoc, doc } from '../firebase'
import { Timestamp } from 'firebase/firestore'
import { DollarSign, Calendar, TrendingUp, Clock, Wallet, CheckCircle, AlertCircle, Trash2 } from 'lucide-react'

export function BarberDailyView({ barberId, barberName, isAdmin }) {
    const [stats, setStats] = useState({
        todayCount: 0,
        todayValue: 0,
        todayCommission: 0,
        monthCommission: 0,
        monthAdvances: 0, // [NEW] Tracking advances
        todayServices: []
    })
    const [loading, setLoading] = useState(true)
    const [showAdvanceModal, setShowAdvanceModal] = useState(false)
    const [advanceValue, setAdvanceValue] = useState('')
    const [processing, setProcessing] = useState(false)
    const [deleteConfirmation, setDeleteConfirmation] = useState(null)
    const [closeCommissionConfirmation, setCloseCommissionConfirmation] = useState(false)

    useEffect(() => {
        if (!barberId) return

        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        startOfMonth.setHours(0, 0, 0, 0)

        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)

        // Query simplified to avoid Index issues
        const q = query(
            collection(db, 'lancamentos'),
            where('barbeiro_id', '==', barberId),
            orderBy('data', 'desc'), // Attempting orderBy since user created index previously, if fails we fallback? 
            // Actually, user REMOVED index dependency earlier. Let's stick to safe client-side sort if we want extreme safety, 
            // BUT user says "time is wrong", maybe sorting is off? 
            // Stick to client sort for safety but ensure correct time display.
            limit(100)
        )

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let tCount = 0
            let tValue = 0
            let tComm = 0
            let mComm = 0
            let mAdvances = 0 // [NEW] Accumulator
            let todayList = []

            const docs = []
            snapshot.forEach(doc => docs.push({ id: doc.id, ...doc.data() }))

            // Client-side Sort & Filter (Descending)
            docs.sort((a, b) => {
                const dateA = a.data?.toDate?.() || new Date(0)
                const dateB = b.data?.toDate?.() || new Date(0)
                return dateB - dateA
            })

            docs.forEach(data => {
                try {
                    if (!data?.data?.toDate) return

                    const date = data.data.toDate()

                    // Calculate Monthly Commission (Net Balance)

                    if (date >= startOfMonth) {
                        mComm += (data.comissao_barbeiro || 0)

                        // [NEW] Sum Advances
                        if (data.tipo === 'adiantamento') {
                            mAdvances += Math.abs(data.comissao_barbeiro || 0)
                        }
                    }

                    // Calculate Today's Stats
                    if (date >= startOfToday) {
                        // Logic to EXCLUDE non-cash payments from Revenue (Faturamento)
                        // Checks if payment method or type indicates non-cash
                        const isNonRevenue = ['Assinante', 'Vale Presente', 'venda_assinatura', 'venda_vale'].includes(data.forma_pagamento) ||
                            ['venda_assinatura', 'venda_vale', 'adiantamento', 'fechamento_comissao'].includes(data.tipo)

                        // General counting logic
                        if (data.tipo !== 'adiantamento' && data.tipo !== 'fechamento_comissao') {
                            tCount++

                            // Only add to Total Value (Faturamento) if it is CASH revenue
                            if (!isNonRevenue) {
                                tValue += (data.valor_bruto || 0)
                            }
                        }

                        // Commission is ALWAYS calculated (you get paid for cutting subscriber hair)
                        tComm += (data.comissao_barbeiro || 0)

                        todayList.push({
                            ...data,
                            dateStr: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                        })
                    }
                } catch (err) {
                    console.warn("Skipping invalid document", err)
                }
            })

            setStats({
                todayCount: tCount,
                todayValue: tValue,
                todayCommission: tComm,
                todayCommission: tComm,
                monthCommission: mComm,
                monthAdvances: mAdvances,
                todayServices: todayList
            })
            setLoading(false)
        }, (error) => {
            console.error("Error fetching barber stats:", error)
            setLoading(false)
        })

        return () => unsubscribe()
    }, [barberId])

    const handleAdvance = async () => {
        if (!advanceValue || parseFloat(advanceValue) <= 0) return alert("Digite um valor válido")

        setProcessing(true)
        try {
            const valor = parseFloat(advanceValue)
            await addDoc(collection(db, 'lancamentos'), {
                data: serverTimestamp(),
                barbeiro_id: barberId,
                barbeiro_nome: barberName || 'Barbeiro',
                servico_descricao: 'Adiantamento (Vale)',
                valor_bruto: 0,
                forma_pagamento: 'Adiantamento',
                comissao_barbeiro: -Math.abs(valor),
                tipo: 'adiantamento',
                created_at: serverTimestamp()
            })
            setAdvanceValue('')
            setShowAdvanceModal(false)
            alert("Adiantamento registrado!")
        } catch (e) {
            alert("Erro: " + e.message)
        } finally {
            setProcessing(false)
        }
    }

    const handleCloseCommission = async () => {
        if (stats.monthCommission <= 0) return alert("Não há saldo positivo para fechar.")
        setCloseCommissionConfirmation(true)
    }

    const executeCommissionClosure = async () => {
        setProcessing(true)
        try {
            await addDoc(collection(db, 'lancamentos'), {
                data: serverTimestamp(),
                barbeiro_id: barberId,
                barbeiro_nome: barberName || 'Barbeiro',
                servico_descricao: 'Fechamento de Comissão',
                valor_bruto: 0,
                forma_pagamento: 'Pagamento',
                comissao_barbeiro: -Math.abs(stats.monthCommission),
                tipo: 'fechamento_comissao',
                created_at: serverTimestamp()
            })
            // alert("Comissão fechada com sucesso! Saldo zerado.") // Smooth ux
            setCloseCommissionConfirmation(false)
        } catch (e) {
            alert("Erro: " + e.message)
        } finally {
            setProcessing(false)
        }
    }

    const handleDelete = async (id) => {
        if (!id) return alert("Erro: ID inválido")
        if (!isAdmin) return alert("Sem permissão para excluir.")
        setDeleteConfirmation(id)
    }

    const executeDeletion = async () => {
        if (!deleteConfirmation) return

        setProcessing(true)
        try {
            console.log(`[Delete] Deleting doc ${deleteConfirmation}`)
            await deleteDoc(doc(db, 'lancamentos', deleteConfirmation))
            console.log(`[Delete] Success`)
            // alert('Lançamento excluído com sucesso!') // Removing alert to be smoother
            setDeleteConfirmation(null)
        } catch (e) {
            console.error("[Delete] Error:", e)
            alert('Erro ao excluir: ' + e.message)
        } finally {
            setProcessing(false)
        }
    }

    if (loading) return <div className="text-gray-500 text-center py-4">Carregando dados...</div>

    return (
        <div className="mt-8 border-t border-gray-800 pt-6">
            <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <TrendingUp size={20} className="text-cyan-500" />
                    Meu Painel
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowAdvanceModal(true)}
                        className="text-xs bg-gray-800 hover:bg-gray-700 text-yellow-500 border border-yellow-900/30 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                    >
                        <Wallet size={14} /> Vale
                    </button>
                    {stats.monthCommission > 0 && (
                        <button
                            onClick={handleCloseCommission}
                            disabled={processing}
                            className="text-xs bg-gray-800 hover:bg-green-900/30 text-green-400 border border-green-900/30 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                        >
                            <CheckCircle size={14} /> Receber Tudo
                        </button>
                    )}
                </div>
            </h3>

            {/* Advance Modal */}
            {showAdvanceModal && (
                <div className="mb-4 bg-yellow-900/10 border border-yellow-900/30 p-4 rounded-xl animate-in fade-in slide-in-from-top-2">
                    <h4 className="text-yellow-500 font-bold text-sm mb-2 flex items-center gap-2">
                        <Wallet size={16} /> Novo Adiantamento
                    </h4>
                    <div className="flex gap-2">
                        <input
                            type="number"
                            step="0.01"
                            autoFocus
                            placeholder="R$ 0,00"
                            className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-yellow-600 flex-1"
                            value={advanceValue}
                            onChange={e => setAdvanceValue(e.target.value)}
                        />
                        <button
                            onClick={handleAdvance}
                            disabled={processing}
                            className="bg-yellow-700 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                        >
                            {processing ? '...' : 'Confirmar'}
                        </button>
                        <button
                            onClick={() => setShowAdvanceModal(false)}
                            className="bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 px-3 rounded-lg"
                        >
                            X
                        </button>
                    </div>
                </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-gray-950 p-4 rounded-xl border border-gray-800">
                    <p className="text-xs text-gray-500 mb-1">Comissão Hoje ({isAdmin ? 'Líquido' : 'Total'})</p>
                    <p className={`text-xl font-bold ${stats.todayCommission >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        R$ {stats.todayCommission.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">{stats.todayCount} serviços</p>
                </div>


                {/* [NEW] Advances Card */}
                <div className="bg-gray-950 p-4 rounded-xl border border-gray-800">
                    <p className="text-xs text-gray-500 mb-1">Vales Retirados (Mês)</p>
                    <p className="text-xl font-bold text-yellow-500">
                        R$ {stats.monthAdvances.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">Adiantamentos</p>
                </div>

                <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 col-span-2 sm:col-span-1">
                    <p className="text-xs text-gray-500 mb-1">A Receber (Mês)</p>
                    <p className={`text-xl font-bold ${stats.monthCommission >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                        R$ {stats.monthCommission.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">Já descontado vales</p>
                </div>
            </div>

            {/* Today's List */}
            <div className="bg-gray-950 rounded-xl border border-gray-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
                        <Clock size={14} /> Atividades de Hoje
                    </span>
                    <span className="text-xs text-gray-500">Total Bruto: R$ {stats.todayValue.toFixed(2)}</span>
                </div>

                {stats.todayServices.length === 0 ? (
                    <div className="p-6 text-center text-gray-600 text-sm">
                        Nenhum serviço lançado hoje.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800">
                        {stats.todayServices.map(item => {
                            const isDeduction = item.comissao_barbeiro < 0
                            return (
                                <div key={item.id} className="p-4 flex justify-between items-center hover:bg-gray-900/30 transition-colors">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className={`text-sm font-medium ${isDeduction ? 'text-yellow-500' : 'text-gray-200'}`}>
                                                {item.cliente_nome && item.cliente_nome !== 'Não Informado' ? item.cliente_nome : item.servico_descricao}
                                            </span>
                                            {isDeduction && <span className="text-xs bg-yellow-900/30 text-yellow-500 px-1.5 py-0.5 rounded">DÉBITO</span>}
                                        </div>
                                        <div className="text-xs text-gray-500 flex items-center gap-2">
                                            <span>{item.dateStr}</span>
                                            <span>
                                                {item.cliente_nome && item.cliente_nome !== 'Não Informado' ? `• ${item.servico_descricao}` : ''}
                                                {item.tipo !== 'servico' && !isDeduction && <span className="text-cyan-600 ml-1">({item.tipo})</span>}
                                                {!isDeduction && <span className="text-gray-600 ml-1">• {item.forma_pagamento}</span>}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-right">
                                            <div className="text-gray-500 font-medium text-xs">
                                                {item.valor_bruto > 0 ? `R$ ${item.valor_bruto.toFixed(2)}` : ''}
                                            </div>
                                            <div className={`text-sm font-bold ${isDeduction ? 'text-red-400' : 'text-green-500/80'}`}>
                                                {item.comissao_barbeiro >= 0 ? '+' : ''} R$ {item.comissao_barbeiro.toFixed(2)}
                                            </div>
                                        </div>
                                        {isAdmin && (
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="text-red-500 hover:text-red-300 p-2 rounded-lg hover:bg-red-900/20 transition-colors"
                                                title="Excluir Lançamento"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Custom Delete Modal */}
            {
                deleteConfirmation && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full animate-in zoom-in-50 duration-200">
                            <div className="flex items-center gap-3 text-red-500 mb-4">
                                <div className="bg-red-900/20 p-3 rounded-full">
                                    <Trash2 size={24} />
                                </div>
                                <h3 className="text-lg font-bold">Confirmar Exclusão</h3>
                            </div>

                            <p className="text-gray-400 text-sm mb-6">
                                Você tem certeza que deseja remover este lançamento? Esta ação não poderá ser desfeita.
                            </p>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setDeleteConfirmation(null)}
                                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2.5 rounded-xl transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={executeDeletion}
                                    disabled={processing}
                                    className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl transition-colors shadow-lg shadow-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {processing ? 'Excluindo...' : 'Sim, Excluir'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Custom Commission Closure Modal */}
            {
                closeCommissionConfirmation && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full animate-in zoom-in-50 duration-200">
                            <div className="flex items-center gap-3 text-green-500 mb-4">
                                <div className="bg-green-900/20 p-3 rounded-full">
                                    <CheckCircle size={24} />
                                </div>
                                <h3 className="text-lg font-bold">Fechar Comissão</h3>
                            </div>

                            <p className="text-gray-400 text-sm mb-6">
                                Confirmar recebimento de <span className="text-white font-bold">R$ {stats.monthCommission.toFixed(2)}</span> e zerar o saldo?
                            </p>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setCloseCommissionConfirmation(false)}
                                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2.5 rounded-xl transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={executeCommissionClosure}
                                    disabled={processing}
                                    className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2.5 rounded-xl transition-colors shadow-lg shadow-green-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {processing ? 'Processando...' : 'Confirmar Recebimento'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    )
}
