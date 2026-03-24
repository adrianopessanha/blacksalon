import { useState } from 'react'
import { db, collection, addDoc, serverTimestamp, deleteDoc, doc } from '../firebase'
import { DollarSign, TrendingUp, Clock, Wallet, CheckCircle, Trash2, MessageCircle, ShoppingBag, Users, Sparkles } from 'lucide-react'

const AVG_COMMISSION_VALUE = 30

export function BarberDailyView({ barberId, barberName, isAdmin, selectedDate, stats, statsLoading, dynamicGoal }) {
    const todayDay = new Date().getDay()
    const isOffDay = todayDay === 0 || todayDay === 1

    const [showAdvanceModal, setShowAdvanceModal] = useState(false)
    const [advanceValue, setAdvanceValue] = useState('')
    const [processing, setProcessing] = useState(false)
    const [deleteConfirmation, setDeleteConfirmation] = useState(null)
    const [closeCommissionConfirmation, setCloseCommissionConfirmation] = useState(false)

    const targetDateStr = selectedDate || new Date().toISOString().split('T')[0]
    const MONTHLY_TARGET = dynamicGoal || 2000

    // ==========================================
    // ACTION HANDLERS
    // ==========================================

    const handleSendReport = () => {
        const telefone = "5521971577221"
        const dataHoje = new Date().toLocaleDateString('pt-BR')
        let mensagem = `📊 *Relatório Diário - ${barberName}*\n📅 Data: ${dataHoje}\n\n✂️ *Serviços Realizados:*\n`

        if (stats.todayServices.length === 0) {
            mensagem += `_Nenhum serviço registrado hoje._\n`
        } else {
            const sorted = [...stats.todayServices].sort((a, b) => a.data.seconds - b.data.seconds)
            sorted.forEach(item => {
                const horario = item.dateStr
                const desc = item.servico_descricao
                const valor = item.valor_bruto > 0 ? `R$ ${item.valor_bruto.toFixed(2)}` : ''
                let linha = `${horario} - ${desc}`
                if (valor) linha += ` (${valor})`
                linha += ` - ${item.forma_pagamento}`
                if (item.comissao_barbeiro < 0) linha = `[DÉBITO] ${linha}`
                mensagem += `• ${linha}\n`
            })
        }

        mensagem += `\n💰 *Resumo do Dia:*\n`
        mensagem += `✅ Qtd Serviços: ${stats.todayCount}\n`
        mensagem += `💵 Total Bruto: R$ ${stats.todayValue.toFixed(2)}\n`
        mensagem += `🤑 Minha Comissão: R$ ${stats.todayCommission.toFixed(2)}\n`

        window.open(`https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`, '_blank')
    }

    const handleAdvance = async () => {
        if (!advanceValue || parseFloat(advanceValue) <= 0) return alert("Digite um valor válido")
        setProcessing(true)
        try {
            await addDoc(collection(db, 'lancamentos'), {
                data: serverTimestamp(),
                barbeiro_id: barberId,
                barbeiro_nome: barberName || 'Barbeiro',
                servico_descricao: 'Adiantamento (Vale)',
                valor_bruto: 0,
                forma_pagamento: 'Adiantamento',
                comissao_barbeiro: -Math.abs(parseFloat(advanceValue)),
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

    const handleCloseCommission = () => {
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
            setCloseCommissionConfirmation(false)
        } catch (e) {
            alert("Erro: " + e.message)
        } finally {
            setProcessing(false)
        }
    }

    const handleDelete = (id) => {
        if (!id) return alert("Erro: ID inválido")
        setDeleteConfirmation(id)
    }

    const executeDeletion = async () => {
        if (!deleteConfirmation) return
        setProcessing(true)
        try {
            await deleteDoc(doc(db, 'lancamentos', deleteConfirmation))
            setDeleteConfirmation(null)
        } catch (e) {
            alert('Erro ao excluir: ' + e.message)
        } finally {
            setProcessing(false)
        }
    }

    // ==========================================
    // COMPUTED VALUES
    // ==========================================

    if (statsLoading) return <div className="text-gray-500 text-center py-4">Carregando dados...</div>

    const getRemainingWorkDays = () => {
        const today = new Date()
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
        let count = 0
        const current = new Date(today)
        while (current <= endOfMonth) {
            const day = current.getDay()
            if (day !== 0 && day !== 1) count++
            current.setDate(current.getDate() + 1)
        }
        return count > 0 ? count : 1
    }

    const remainingWorkDays = getRemainingWorkDays()
    const currentMonthProduction = stats.monthProduction
    const remainingBalance = Math.max(0, MONTHLY_TARGET - currentMonthProduction)
    const dailyGoal = remainingWorkDays > 0 ? (remainingBalance / remainingWorkDays) : 0
    const servicesNeeded = Math.ceil(dailyGoal / AVG_COMMISSION_VALUE)

    const todayProduction = stats.todayServices.reduce((acc, curr) => {
        const val = parseFloat(curr.comissao_barbeiro) || 0
        return val > 0 ? acc + val : acc
    }, 0)

    const isGoalMet = todayProduction >= dailyGoal
    const goalProgress = dailyGoal > 0 ? Math.min(100, (todayProduction / dailyGoal) * 100) : 100
    const todayStr = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' })

    const fmt = (val) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const fmtK = (val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : Math.round(val)

    // ==========================================
    // RENDER
    // ==========================================

    return (
        <div className="space-y-4">

            {/* Action Buttons */}
            <div className="flex gap-2 flex-wrap">
                <button onClick={handleSendReport}
                    className="text-xs bg-green-900/40 hover:bg-green-800/60 text-green-400 border border-green-800 px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors flex-1 justify-center">
                    <MessageCircle size={14} /> Relatorio
                </button>
                <button onClick={() => setShowAdvanceModal(true)}
                    className="text-xs bg-gray-800 hover:bg-gray-700 text-yellow-500 border border-yellow-900/30 px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors flex-1 justify-center">
                    <Wallet size={14} /> Vale
                </button>
                {stats.monthCommission > 0 && (
                    <button onClick={handleCloseCommission} disabled={processing}
                        className="text-xs bg-gray-800 hover:bg-green-900/30 text-green-400 border border-green-900/30 px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors flex-1 justify-center">
                        <CheckCircle size={14} /> Receber
                    </button>
                )}
            </div>

            {/* Advance Modal */}
            {showAdvanceModal && (
                <div className="bg-yellow-900/10 border border-yellow-900/30 p-4 rounded-xl">
                    <h4 className="text-yellow-500 font-bold text-sm mb-2 flex items-center gap-2">
                        <Wallet size={16} /> Novo Adiantamento
                    </h4>
                    <div className="flex gap-2">
                        <input type="number" step="0.01" autoFocus placeholder="R$ 0,00"
                            className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white outline-none focus:border-yellow-600 flex-1"
                            value={advanceValue} onChange={e => setAdvanceValue(e.target.value)} />
                        <button onClick={handleAdvance} disabled={processing}
                            className="bg-yellow-700 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg">
                            {processing ? '...' : 'OK'}
                        </button>
                        <button onClick={() => setShowAdvanceModal(false)}
                            className="bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 px-3 rounded-lg">X</button>
                    </div>
                </div>
            )}

            {/* ========== META MENSAL ========== */}
            <div className="bg-gradient-to-r from-cyan-900/30 via-gray-900 to-gray-950 rounded-2xl p-4 border border-cyan-500/20">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-full bg-cyan-500/20 flex items-center justify-center">
                            <TrendingUp size={18} className="text-cyan-400" />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-base">Meta Mensal</h2>
                            <p className="text-cyan-400 text-[10px] font-medium">Baseada na sua media + 10%</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-2xl font-black text-white">
                            {Math.min(100, Math.floor((currentMonthProduction / MONTHLY_TARGET) * 100))}%
                        </span>
                        <p className="text-[10px] text-gray-500">concluido</p>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="relative">
                    <div className="h-5 bg-gray-950 rounded-full overflow-hidden border border-gray-800">
                        <div
                            className={`h-full transition-all duration-1000 ease-out relative ${currentMonthProduction >= MONTHLY_TARGET
                                ? 'bg-gradient-to-r from-green-600 to-green-400 shadow-[0_0_20px_rgba(34,197,94,0.5)]'
                                : 'bg-gradient-to-r from-cyan-700 to-cyan-500'
                                }`}
                            style={{ width: `${Math.min(100, (currentMonthProduction / MONTHLY_TARGET) * 100)}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[10px]">
                        <span className="text-gray-600">R$ 0</span>
                        <span className={`font-bold ${currentMonthProduction >= MONTHLY_TARGET ? 'text-green-400' : 'text-cyan-500'}`}>
                            🎯 R$ {fmtK(MONTHLY_TARGET)}
                        </span>
                    </div>
                </div>

                {/* Month Stats */}
                <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="bg-gray-950/50 rounded-xl p-3 border border-gray-800">
                        <p className="text-[10px] text-gray-500 mb-0.5">Voce ja fez</p>
                        <p className="text-lg font-bold text-cyan-400">{fmt(currentMonthProduction)}</p>
                    </div>
                    <div className="bg-gray-950/50 rounded-xl p-3 border border-gray-800">
                        <p className="text-[10px] text-gray-500 mb-0.5">Falta para meta</p>
                        <p className={`text-lg font-bold ${remainingBalance <= 0 ? 'text-green-400' : 'text-orange-400'}`}>
                            {remainingBalance <= 0 ? '🏆 BATIDA!' : fmt(remainingBalance)}
                        </p>
                    </div>
                </div>
            </div>

            {/* ========== META DIARIA ========== */}
            <div className={`relative overflow-hidden rounded-2xl p-4 border transition-all ${isGoalMet
                ? 'bg-gradient-to-br from-green-900/50 to-green-950 border-green-500/50'
                : isOffDay ? 'bg-gray-900/50 border-gray-800' : 'bg-gray-900 border-gray-800'
                }`}>
                {isGoalMet && <div className="absolute inset-0 bg-green-500/10 blur-3xl animate-pulse" />}

                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                                {isOffDay ? '😴 Dia de Folga' : `📅 ${todayStr}`}
                            </p>
                            <h3 className="text-white font-bold text-sm">
                                {isGoalMet ? '🔥 Meta Batida!' : 'Meta de Hoje'}
                            </h3>
                        </div>
                        {!isOffDay && (
                            <div className="bg-gray-950/70 rounded-lg px-2.5 py-1.5 border border-gray-700 text-center">
                                <span className="text-[10px] text-gray-400 block">~cortes</span>
                                <span className="font-bold text-white text-lg">{servicesNeeded}</span>
                            </div>
                        )}
                    </div>

                    {!isOffDay ? (
                        <>
                            <div className="flex items-end gap-2 mb-3">
                                <span className={`text-3xl font-black ${isGoalMet ? 'text-green-400' : 'text-white'}`}>
                                    {fmt(dailyGoal)}
                                </span>
                                <span className="text-xs text-gray-500 pb-1">por dia</span>
                            </div>

                            <div className="relative mb-2">
                                <div className="h-4 bg-gray-950 rounded-full overflow-hidden border border-gray-700">
                                    <div
                                        className={`h-full transition-all duration-700 ${isGoalMet
                                            ? 'bg-gradient-to-r from-green-600 to-green-400'
                                            : 'bg-gradient-to-r from-purple-600 to-pink-500'
                                            }`}
                                        style={{ width: `${goalProgress}%` }}
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-lg">
                                        {Math.floor(goalProgress)}%
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-between text-[10px] font-medium">
                                <span className="text-purple-400">Feito: {fmt(todayProduction)}</span>
                                <span className={isGoalMet ? 'text-green-400' : 'text-gray-500'}>
                                    {isGoalMet
                                        ? `+${fmt(todayProduction - dailyGoal)} extra!`
                                        : `Falta: ${fmt(Math.max(0, dailyGoal - todayProduction))}`}
                                </span>
                            </div>

                            <p className={`text-[10px] mt-2 py-1.5 px-2 rounded-lg text-center ${isGoalMet
                                ? 'bg-green-900/30 text-green-300 border border-green-800'
                                : 'bg-gray-800/50 text-gray-400 border border-gray-700'
                                }`}>
                                {isGoalMet
                                    ? "🚀 Excelente! Cada corte agora é lucro extra!"
                                    : `Restam ${remainingWorkDays} dias úteis. Bora!`}
                            </p>
                        </>
                    ) : (
                        <div className="text-center py-3">
                            <p className="text-gray-500 text-sm">Descanse bem! Amanhã é dia de batalha 💪</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ========== INCENTIVE CARDS ========== */}
            <div className="grid grid-cols-3 gap-2">
                <IncentiveCard
                    icon={<Sparkles size={14} className="text-pink-400" />}
                    label="Sobrancelha"
                    count={stats.monthSobrancelhaCount}
                    goal={10}
                    color="pink"
                />
                <IncentiveCard
                    icon={<ShoppingBag size={14} className="text-amber-400" />}
                    label="Produtos"
                    count={stats.monthProductCount}
                    goal={8}
                    color="amber"
                />
                <IncentiveCard
                    icon={<Users size={14} className="text-purple-400" />}
                    label="Assinantes"
                    count={stats.monthSubscriberCount}
                    goal={15}
                    color="purple"
                />
            </div>

            {/* ========== COMMISSION CARDS ========== */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-900 p-3 rounded-xl border border-gray-800">
                    <p className="text-[10px] text-gray-500 mb-0.5">Comissao Hoje</p>
                    <p className={`text-lg font-bold ${stats.todayCommission >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {fmt(stats.todayCommission)}
                    </p>
                    <p className="text-[10px] text-gray-600">{stats.todayCount} servicos</p>
                </div>
                <div className="bg-gray-900 p-3 rounded-xl border border-gray-800">
                    <p className="text-[10px] text-gray-500 mb-0.5">Vales (Mes)</p>
                    <p className="text-lg font-bold text-yellow-500">{fmt(stats.monthAdvances)}</p>
                    <p className="text-[10px] text-gray-600">Adiantamentos</p>
                </div>
                <div className="bg-gray-900 p-3 rounded-xl border border-gray-800 col-span-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] text-gray-500 mb-0.5">A Receber (Mes)</p>
                            <p className={`text-xl font-bold ${stats.monthCommission >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                                {fmt(stats.monthCommission)}
                            </p>
                        </div>
                        <p className="text-[10px] text-gray-600">Ja descontado vales</p>
                    </div>
                </div>
            </div>

            {/* ========== ACTIVITY LIST ========== */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-800 flex justify-between items-center">
                    <span className="text-xs font-semibold text-gray-300 flex items-center gap-2">
                        <Clock size={14} /> Atividades de {new Date(targetDateStr + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </span>
                    <span className="text-[10px] text-gray-500">Bruto: {fmt(stats.todayValue)}</span>
                </div>

                {stats.todayServices.length === 0 ? (
                    <div className="p-6 text-center text-gray-600 text-sm">
                        Nenhum servico lancado nesta data.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-800/50">
                        {stats.todayServices.map(item => {
                            const isDeduction = item.comissao_barbeiro < 0
                            return (
                                <div key={item.id} className="px-4 py-3 flex justify-between items-center hover:bg-gray-800/20 transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className={`text-sm font-medium truncate ${isDeduction ? 'text-yellow-500' : 'text-gray-200'}`}>
                                                {item.cliente_nome && item.cliente_nome !== 'Não Informado' ? item.cliente_nome : item.servico_descricao}
                                            </span>
                                            {isDeduction && <span className="text-[10px] bg-yellow-900/30 text-yellow-500 px-1 py-0.5 rounded">DEBITO</span>}
                                        </div>
                                        <div className="text-[10px] text-gray-500 flex items-center gap-1.5">
                                            <span>{item.dateStr}</span>
                                            {item.cliente_nome && item.cliente_nome !== 'Não Informado' && <span>• {item.servico_descricao}</span>}
                                            {!isDeduction && <span className="text-gray-600">• {item.forma_pagamento}</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 ml-2">
                                        <div className="text-right">
                                            {item.valor_bruto > 0 && (
                                                <div className="text-gray-500 text-[10px]">R$ {item.valor_bruto.toFixed(2)}</div>
                                            )}
                                            <div className={`text-sm font-bold ${isDeduction ? 'text-red-400' : 'text-green-500/80'}`}>
                                                {item.comissao_barbeiro >= 0 ? '+' : ''}{fmt(item.comissao_barbeiro)}
                                            </div>
                                        </div>
                                        <button onClick={() => handleDelete(item.id)}
                                            className="text-red-500/50 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-900/20 transition-colors">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* ========== MODALS ========== */}
            {deleteConfirmation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full">
                        <div className="flex items-center gap-3 text-red-500 mb-4">
                            <div className="bg-red-900/20 p-3 rounded-full"><Trash2 size={24} /></div>
                            <h3 className="text-lg font-bold">Confirmar Exclusão</h3>
                        </div>
                        <p className="text-gray-400 text-sm mb-6">Tem certeza que deseja remover este lancamento?</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteConfirmation(null)}
                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2.5 rounded-xl">Cancelar</button>
                            <button onClick={executeDeletion} disabled={processing}
                                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl disabled:opacity-50">
                                {processing ? 'Excluindo...' : 'Sim, Excluir'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {closeCommissionConfirmation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full">
                        <div className="flex items-center gap-3 text-green-500 mb-4">
                            <div className="bg-green-900/20 p-3 rounded-full"><CheckCircle size={24} /></div>
                            <h3 className="text-lg font-bold">Fechar Comissão</h3>
                        </div>
                        <p className="text-gray-400 text-sm mb-6">
                            Confirmar recebimento de <span className="text-white font-bold">{fmt(stats.monthCommission)}</span> e zerar o saldo?
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setCloseCommissionConfirmation(false)}
                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2.5 rounded-xl">Cancelar</button>
                            <button onClick={executeCommissionClosure} disabled={processing}
                                className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2.5 rounded-xl disabled:opacity-50">
                                {processing ? 'Processando...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ==========================================
// INCENTIVE CARD COMPONENT
// ==========================================

function IncentiveCard({ icon, label, count, goal, color }) {
    const progress = Math.min(100, (count / goal) * 100)
    const colorMap = {
        pink: { bg: 'bg-pink-900/20', border: 'border-pink-900/30', text: 'text-pink-400', bar: 'bg-pink-500' },
        amber: { bg: 'bg-amber-900/20', border: 'border-amber-900/30', text: 'text-amber-400', bar: 'bg-amber-500' },
        purple: { bg: 'bg-purple-900/20', border: 'border-purple-900/30', text: 'text-purple-400', bar: 'bg-purple-500' },
    }
    const c = colorMap[color] || colorMap.pink

    return (
        <div className={`${c.bg} border ${c.border} rounded-xl p-2.5 text-center`}>
            <div className="flex items-center justify-center gap-1 mb-1">
                {icon}
                <span className="text-[10px] text-gray-400 font-medium">{label}</span>
            </div>
            <p className={`text-lg font-black ${c.text}`}>{count}</p>
            <div className="h-1 bg-gray-800 rounded-full mt-1 overflow-hidden">
                <div className={`h-full ${c.bar} rounded-full transition-all duration-500`} style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[8px] text-gray-600 mt-0.5">meta: {goal}/mes</p>
        </div>
    )
}
