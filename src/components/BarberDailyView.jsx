import { useState, useEffect } from 'react'
import { db, collection, query, where, onSnapshot, orderBy, limit, addDoc, serverTimestamp, deleteDoc, doc } from '../firebase'
import { Timestamp } from 'firebase/firestore'
import { DollarSign, Calendar, TrendingUp, Clock, Wallet, CheckCircle, AlertCircle, Trash2, MessageCircle } from 'lucide-react'

const MONTHLY_TARGET = 4000
const AVG_COMMISSION_VALUE = 30

export function BarberDailyView({ barberId, barberName, isAdmin, selectedDate }) {
    const todayDay = new Date().getDay()
    const isOffDay = todayDay === 0 || todayDay === 1 // Sunday(0) or Monday(1) are off

    const [stats, setStats] = useState({
        todayCount: 0,
        todayValue: 0,
        todayCommission: 0,
        monthCommission: 0,
        monthProduction: 0,
        monthAdvances: 0,
        todayServices: []
    })
    const [loading, setLoading] = useState(true)
    const [showAdvanceModal, setShowAdvanceModal] = useState(false)
    const [advanceValue, setAdvanceValue] = useState('')
    const [processing, setProcessing] = useState(false)
    const [deleteConfirmation, setDeleteConfirmation] = useState(null)
    const [closeCommissionConfirmation, setCloseCommissionConfirmation] = useState(false)

    // Using selectedDate prop or defaulting to today
    const targetDateStr = selectedDate || new Date().toISOString().split('T')[0]

    // ...

    useEffect(() => {
        if (!barberId) return

        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        startOfMonth.setHours(0, 0, 0, 0)

        // Parse Target Date
        const [y, m, d] = targetDateStr.split('-').map(Number)
        const startOfTargetDay = new Date(y, m - 1, d)
        startOfTargetDay.setHours(0, 0, 0, 0)

        const endOfTargetDay = new Date(y, m - 1, d)
        endOfTargetDay.setHours(23, 59, 59, 999)

        const q = query(
            collection(db, 'lancamentos'),
            where('barbeiro_id', '==', barberId),
            orderBy('data', 'desc'),
            limit(200)
        )

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let tCount = 0
            let tValue = 0
            let tComm = 0
            let mComm = 0
            let mProduction = 0 // Produção do MÊS inteiro (para meta)
            let mAdvances = 0
            let todayList = []

            const docs = []
            snapshot.forEach(doc => docs.push({ id: doc.id, ...doc.data() }))

            // Sort docs by date desc
            docs.sort((a, b) => {
                const dA = a.data?.toDate ? a.data.toDate() : new Date(0)
                const dB = b.data?.toDate ? b.data.toDate() : new Date(0)
                return dB - dA
            })

            let lastClosureDate = null
            for (const doc of docs) {
                if (doc.tipo === 'fechamento_comissao') {
                    lastClosureDate = doc.data.toDate()
                    break
                }
            }

            docs.forEach(data => {
                try {
                    if (!data?.data?.toDate) return

                    const date = data.data.toDate()

                    // Cycle Commission (para saldo a receber - usa ciclo de fechamento)
                    const cycleStartDate = lastClosureDate || startOfMonth

                    // [FIX] Produção mensal para META - considera o MÊS INTEIRO, não o ciclo
                    if (date >= startOfMonth) {
                        if (data.tipo !== 'adiantamento' && data.tipo !== 'fechamento_comissao') {
                            mProduction += (data.comissao_barbeiro || 0)
                        }
                    }

                    // Saldo a receber - considera apenas após último fechamento
                    if (date > cycleStartDate) {
                        mComm += (data.comissao_barbeiro || 0)

                        if (data.tipo === 'adiantamento') {
                            mAdvances += Math.abs(data.comissao_barbeiro || 0)
                        }
                    }

                    // Selected Date Stats
                    if (date >= startOfTargetDay && date <= endOfTargetDay) {
                        const isNonRevenue = ['Assinante', 'Vale Presente', 'venda_assinatura', 'venda_vale'].includes(data.forma_pagamento) ||
                            ['venda_assinatura', 'venda_vale', 'adiantamento', 'fechamento_comissao'].includes(data.tipo)

                        if (data.tipo !== 'adiantamento' && data.tipo !== 'fechamento_comissao') {
                            tCount++
                            if (!isNonRevenue) {
                                tValue += (data.valor_bruto || 0)
                            }
                        }

                        // [FIX] Não incluir fechamento_comissao na comissão do dia
                        if (data.tipo !== 'fechamento_comissao') {
                            tComm += (data.comissao_barbeiro || 0)
                        }

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
                monthCommission: mComm,
                monthProduction: mProduction,
                monthAdvances: mAdvances,
                todayServices: todayList
            })
            setLoading(false)
        }, (error) => {
            console.error("Error fetching barber stats:", error)
            setLoading(false)
        })

        return () => unsubscribe()
    }, [barberId, targetDateStr])

    const handleSendReport = () => {
        const telefone = "5521971577221"
        const dataHoje = new Date().toLocaleDateString('pt-BR')

        let mensagem = `📊 *Relatório Diário - ${barberName}*\n`
        mensagem += `📅 Data: ${dataHoje}\n\n`

        mensagem += `✂️ *Serviços Realizados:*\n`

        if (stats.todayServices.length === 0) {
            mensagem += `_Nenhum serviço registrado hoje._\n`
        } else {
            // Ordenar por horário antes de enviar
            const sortedServices = [...stats.todayServices].sort((a, b) => {
                return (a.data.seconds - b.data.seconds)
            })

            sortedServices.forEach(item => {
                const horario = item.dateStr
                const desc = item.servico_descricao
                const valor = item.valor_bruto > 0 ? `R$ ${item.valor_bruto.toFixed(2)}` : ''
                const pgto = item.forma_pagamento
                const isDebit = item.comissao_barbeiro < 0

                let linha = `${horario} - ${desc}`
                if (valor) linha += ` (${valor})`
                linha += ` - ${pgto}`
                if (isDebit) linha = `[DÉBITO] ${linha}`

                mensagem += `• ${linha}\n`
            })
        }

        mensagem += `\n💰 *Resumo do Dia:*\n`
        mensagem += `✅ Qtd Serviços: ${stats.todayCount}\n`
        mensagem += `💵 Total Bruto: R$ ${stats.todayValue.toFixed(2)}\n`
        mensagem += `🤑 Minha Comissão: R$ ${stats.todayCommission.toFixed(2)}\n`

        const url = `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`
        window.open(url, '_blank')
    }

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
        // if (!isAdmin) return alert("Sem permissão para excluir.") // [MOD] Allowed for barbers too
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



    // Helper to calculate remaining working days (Tue-Sat)
    const getRemainingWorkDays = () => {
        const today = new Date()
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
        let count = 0
        const current = new Date(today) // Clone to iterate

        // Iterate from today until end of month
        while (current <= endOfMonth) {
            const day = current.getDay()
            // 0 = Sunday, 1 = Monday. We exclude these.
            if (day !== 0 && day !== 1) {
                count++
            }
            current.setDate(current.getDate() + 1)
        }
        return count > 0 ? count : 1 // Avoid div/0
    }

    const remainingWorkDays = getRemainingWorkDays()
    // [FIX] Usar monthProduction (produção bruta) para meta, não monthCommission (saldo líquido)
    // Assim vales não afetam o progresso da meta
    const currentMonthProduction = stats.monthProduction

    // logic: If we already exceeded target, goal is 0. 
    // Else divide remaining balance by remaining days.
    const remainingBalance = Math.max(0, MONTHLY_TARGET - currentMonthProduction)
    const dailyGoal = remainingWorkDays > 0 ? (remainingBalance / remainingWorkDays) : 0

    // Services needed to hit TODAY's goal
    const servicesNeeded = Math.ceil(dailyGoal / AVG_COMMISSION_VALUE)

    // Calculate Today's Positive Production (ignoring negative advances for the visual goal)
    const todayProduction = stats.todayServices.reduce((acc, curr) => {
        const val = parseFloat(curr.comissao_barbeiro) || 0
        return val > 0 ? acc + val : acc
    }, 0)

    const isGoalMet = todayProduction >= dailyGoal
    const goalProgress = dailyGoal > 0 ? Math.min(100, (todayProduction / dailyGoal) * 100) : 100

    const todayStr = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' })


    return (
        <div className="mt-8 border-t border-gray-800 pt-6">
            <h3 className="text-base sm:text-lg font-bold text-gray-200 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                    <TrendingUp size={20} className="text-cyan-500" />
                    Meu Painel
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={handleSendReport}
                        className="text-xs bg-green-900/40 hover:bg-green-800/60 text-green-400 border border-green-800 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                        title="Enviar Relatório do Dia"
                    >
                        <MessageCircle size={14} /> Relatório Dia
                    </button>
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


            {/* ========== NOVO WIDGET DE METAS REDESENHADO ========== */}
            <div className="space-y-4">

                {/* Header com Meta Mensal */}
                <div className="bg-gradient-to-r from-cyan-900/30 via-gray-900 to-gray-950 rounded-2xl p-4 border border-cyan-500/20">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center">
                                <TrendingUp size={20} className="text-cyan-400" />
                            </div>
                            <div>
                                <h2 className="text-white font-bold text-lg">Meta Mensal</h2>
                                <p className="text-cyan-400 text-xs font-medium">Objetivo: R$ 4.000,00</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-2xl sm:text-3xl font-black text-white">
                                {Math.min(100, Math.floor((currentMonthProduction / MONTHLY_TARGET) * 100))}%
                            </span>
                            <p className="text-xs text-gray-500">concluído</p>
                        </div>
                    </div>

                    {/* Barra de Progresso Mensal */}
                    <div className="relative">
                        <div className="h-6 bg-gray-950 rounded-full overflow-hidden border border-gray-800">
                            <div
                                className={`h-full transition-all duration-1000 ease-out relative ${currentMonthProduction >= MONTHLY_TARGET
                                    ? 'bg-gradient-to-r from-green-600 to-green-400 shadow-[0_0_20px_rgba(34,197,94,0.5)]'
                                    : 'bg-gradient-to-r from-cyan-700 to-cyan-500'
                                    }`}
                                style={{ width: `${Math.min(100, (currentMonthProduction / MONTHLY_TARGET) * 100)}%` }}
                            >
                                {currentMonthProduction >= MONTHLY_TARGET && (
                                    <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                )}
                            </div>
                        </div>

                        {/* Marcadores de meta */}
                        <div className="flex justify-between mt-2 text-xs">
                            <span className="text-gray-500">R$ 0</span>
                            <div className="flex gap-4 sm:gap-8">
                                <span className={`${currentMonthProduction >= 1000 ? 'text-cyan-400' : 'text-gray-600'}`}>1k</span>
                                <span className={`${currentMonthProduction >= 2000 ? 'text-cyan-400' : 'text-gray-600'}`}>2k</span>
                                <span className={`${currentMonthProduction >= 3000 ? 'text-cyan-400' : 'text-gray-600'}`}>3k</span>
                            </div>
                            <span className={`font-bold ${currentMonthProduction >= MONTHLY_TARGET ? 'text-green-400' : 'text-cyan-500'}`}>
                                🎯 R$ 4k
                            </span>
                        </div>
                    </div>

                    {/* Stats do Mês */}
                    <div className="grid grid-cols-2 gap-3 mt-4">
                        <div className="bg-gray-950/50 rounded-xl p-3 border border-gray-800">
                            <p className="text-xs text-gray-500 mb-1">Você já fez</p>
                            <p className="text-xl font-bold text-cyan-400">
                                {currentMonthProduction.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                        </div>
                        <div className="bg-gray-950/50 rounded-xl p-3 border border-gray-800">
                            <p className="text-xs text-gray-500 mb-1">Falta para meta</p>
                            <p className={`text-xl font-bold ${remainingBalance <= 0 ? 'text-green-400' : 'text-orange-400'}`}>
                                {remainingBalance <= 0 ? '🏆 BATIDA!' : remainingBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Card Meta Diária */}
                <div className={`relative overflow-hidden rounded-2xl p-4 border transition-all ${isGoalMet
                    ? 'bg-gradient-to-br from-green-900/50 to-green-950 border-green-500/50'
                    : isOffDay
                        ? 'bg-gray-900/50 border-gray-800'
                        : 'bg-gray-900 border-gray-800'
                    }`}>

                    {/* Glow Effect quando meta batida */}
                    {isGoalMet && <div className="absolute inset-0 bg-green-500/10 blur-3xl animate-pulse" />}

                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
                                    {isOffDay ? '😴 Dia de Folga' : `📅 ${todayStr}`}
                                </p>
                                <h3 className="text-white font-bold text-base">
                                    {isGoalMet ? '🔥 Meta do Dia Batida!' : 'Meta de Hoje'}
                                </h3>
                            </div>
                            {!isOffDay && (
                                <div className="bg-gray-950/70 rounded-lg px-3 py-2 border border-gray-700 text-center">
                                    <span className="text-xs text-gray-400 block">~cortes</span>
                                    <span className="font-bold text-white text-xl">{servicesNeeded}</span>
                                </div>
                            )}
                        </div>

                        {!isOffDay ? (
                            <>
                                {/* Meta Diária Value */}
                                <div className="flex items-end gap-3 mb-4">
                                    <span className={`text-3xl sm:text-4xl font-black ${isGoalMet ? 'text-green-400' : 'text-white'}`}>
                                        {dailyGoal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </span>
                                    <span className="text-sm text-gray-500 pb-1">por dia</span>
                                </div>

                                {/* Barra de Progresso Diária */}
                                <div className="relative mb-2">
                                    <div className="h-5 bg-gray-950 rounded-full overflow-hidden border border-gray-700">
                                        <div
                                            className={`h-full transition-all duration-700 ease-out ${isGoalMet
                                                ? 'bg-gradient-to-r from-green-600 to-green-400 shadow-[0_0_12px_rgba(34,197,94,0.5)]'
                                                : 'bg-gradient-to-r from-purple-600 to-pink-500'
                                                }`}
                                            style={{ width: `${goalProgress}%` }}
                                        />
                                        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-lg">
                                            {Math.floor(goalProgress)}%
                                        </div>
                                    </div>
                                </div>

                                {/* Stats abaixo da barra */}
                                <div className="flex justify-between text-xs font-medium">
                                    <span className="text-purple-400">
                                        Feito: {todayProduction.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </span>
                                    <span className={isGoalMet ? 'text-green-400' : 'text-gray-500'}>
                                        {isGoalMet
                                            ? `+${(todayProduction - dailyGoal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} extra!`
                                            : `Falta: ${Math.max(0, dailyGoal - todayProduction).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                                        }
                                    </span>
                                </div>

                                {/* Mensagem motivacional */}
                                <p className={`text-xs mt-3 p-2 rounded-lg text-center ${isGoalMet
                                    ? 'bg-green-900/30 text-green-300 border border-green-800'
                                    : 'bg-gray-800/50 text-gray-400 border border-gray-700'
                                    }`}>
                                    {isGoalMet
                                        ? "🚀 Excelente! Cada corte agora é lucro extra!"
                                        : `Restam ${remainingWorkDays} dias úteis no mês. Bora!`
                                    }
                                </p>
                            </>
                        ) : (
                            <div className="text-center py-4">
                                <p className="text-gray-500 text-sm">Descanse bem! Amanhã é dia de batalha 💪</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* ========== FIM WIDGET DE METAS ========== */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 mt-4">
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

                <div className="bg-gray-950 p-4 rounded-xl border border-gray-800 sm:col-span-1">
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
                        <Clock size={14} /> Atividades de {new Date(targetDateStr + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </span>
                    <span className="text-xs text-gray-500">Total Bruto: R$ {stats.todayValue.toFixed(2)}</span>
                </div>

                {stats.todayServices.length === 0 ? (
                    <div className="p-6 text-center text-gray-600 text-sm">
                        Nenhum serviço lançado nesta data.
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
                                        {true && (
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
