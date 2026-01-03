import { useState, useEffect } from 'react'
import { db, collection, query, where, getDocs, addDoc, serverTimestamp, orderBy, limit } from '../firebase'
import { Timestamp } from 'firebase/firestore'
import { Calendar, User, DollarSign, Wallet, CheckCircle, AlertTriangle } from 'lucide-react'
import { BARBERS } from '../data/barbers'

export function DailyClosure() {
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
    const [barberId, setBarberId] = useState('')
    const [loading, setLoading] = useState(false)
    const [transactions, setTransactions] = useState([])
    const [expectedTotal, setExpectedTotal] = useState({ money: 0, card: 0, pix: 0, total: 0 })
    const [actualMoney, setActualMoney] = useState('')
    const [closureSaved, setClosureSaved] = useState(false)

    // Fetch transactions when date or barber changes
    useEffect(() => {
        if (!barberId) {
            setTransactions([])
            setExpectedTotal({ money: 0, card: 0, pix: 0, total: 0 })
            return
        }

        const fetchDailyData = async () => {
            setLoading(true)
            setClosureSaved(false)
            setActualMoney('')

            try {
                // Client-side date bounds
                const start = new Date(date + 'T00:00:00')
                const end = new Date(date + 'T23:59:59')

                // Query based on Barber ID + Order By Date (recent first) to avoid missing index on Composite Range
                const q = query(
                    collection(db, 'lancamentos'),
                    where('barbeiro_id', '==', barberId),
                    orderBy('data', 'desc'),
                    limit(500) // Fetch last 500 to ensure we cover the day (and recent past)
                )

                const snapshot = await getDocs(q)
                const rawData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

                // Filter logic applied in memory
                const data = rawData.filter(item => {
                    if (!item.data) return false
                    const itemDate = item.data.toDate ? item.data.toDate() : new Date(item.data.seconds * 1000)
                    return itemDate >= start && itemDate <= end
                })

                setTransactions(data)

                // Calculate totals
                const money = data.filter(i => i.forma_pagamento === 'Dinheiro').reduce((sum, i) => sum + (i.valor_bruto || 0), 0)
                const card = data.filter(i => ['Crédito', 'Débito'].includes(i.forma_pagamento)).reduce((sum, i) => sum + (i.valor_bruto || 0), 0)
                const pix = data.filter(i => i.forma_pagamento === 'Pix').reduce((sum, i) => sum + (i.valor_bruto || 0), 0)

                setExpectedTotal({
                    money,
                    card,
                    pix,
                    total: money + card + pix
                })

            } catch (error) {
                console.error("Error fetching data:", error)
                alert("Erro ao buscar dados: " + error.message)
            } finally {
                setLoading(false)
            }
        }

        fetchDailyData()
    }, [date, barberId])

    const handleCloseRegister = async () => {
        if (!barberId) return alert("Selecione um barbeiro")
        if (actualMoney === '') return alert("Informe o valor em dinheiro")

        setLoading(true)
        try {
            const moneyInHand = parseFloat(actualMoney)
            const difference = moneyInHand - expectedTotal.money

            await addDoc(collection(db, 'fechamentos'), {
                barbeiro_id: barberId,
                data_referencia: date,
                data_fechamento: serverTimestamp(),
                total_esperado: expectedTotal,
                total_informado: { money: moneyInHand },
                diferenca: difference,
                status: difference >= 0 ? 'ok' : 'falta'
            })

            setClosureSaved(true)
            alert("Caixa fechado com sucesso!")
        } catch (error) {
            console.error("Error saving closure:", error)
            alert("Erro ao fechar caixa: " + error.message)
        } finally {
            setLoading(false)
        }
    }

    const difference = (parseFloat(actualMoney || 0) - expectedTotal.money)

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl">
                <h2 className="text-xl font-bold text-cyan-500 mb-6 flex items-center gap-2">
                    <Wallet /> Fechamento de Caixa Individual
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Data</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-3 text-gray-500" size={18} />
                            <input type="date"
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 pl-10 pr-4 text-gray-200 outline-none focus:border-cyan-500 scheme-dark"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Barbeiro</label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 text-gray-500" size={18} />
                            <select
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 pl-10 pr-4 text-gray-200 outline-none focus:border-cyan-500 appearance-none"
                                value={barberId}
                                onChange={e => setBarberId(e.target.value)}
                            >
                                <option value="">Selecione...</option>
                                {BARBERS.map(barber => (
                                    <option key={barber.id} value={barber.id}>{barber.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {barberId && (
                    <div className="space-y-6">
                        <div className="bg-gray-950/50 p-4 rounded-xl border border-gray-800">
                            <h3 className="text-gray-400 text-sm font-medium mb-3">Resumo do Sistema</h3>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-gray-900 p-3 rounded-lg border border-gray-800">
                                    <span className="text-xs text-gray-500">Dinheiro</span>
                                    <div className="text-lg font-bold text-green-400">
                                        {expectedTotal.money.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </div>
                                </div>
                                <div className="bg-gray-900 p-3 rounded-lg border border-gray-800">
                                    <span className="text-xs text-gray-500">Cartão</span>
                                    <div className="text-lg font-bold text-gray-300">
                                        {expectedTotal.card.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </div>
                                </div>
                                <div className="bg-gray-900 p-3 rounded-lg border border-gray-800">
                                    <span className="text-xs text-gray-500">Pix</span>
                                    <div className="text-lg font-bold text-cyan-400">
                                        {expectedTotal.pix.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-950/50 p-4 rounded-xl border border-gray-800">
                            <h3 className="text-gray-400 text-sm font-medium mb-3">Conferência (Obrigatório)</h3>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Dinheiro em Mãos (R$)</label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-3 text-gray-500" size={18} />
                                    <input type="number" step="0.01"
                                        disabled={closureSaved}
                                        className="w-full bg-gray-900 border border-gray-800 rounded-lg py-2.5 pl-10 pr-4 text-white text-lg font-bold outline-none focus:border-cyan-500"
                                        placeholder="0,00"
                                        value={actualMoney}
                                        onChange={e => setActualMoney(e.target.value)}
                                    />
                                </div>
                            </div>

                            {actualMoney !== '' && (
                                <div className={`mt-4 p-3 rounded-lg flex items-center gap-3 ${difference >= 0 ? 'bg-green-900/20 text-green-400 border border-green-900' : 'bg-red-900/20 text-red-400 border border-red-900'}`}>
                                    {difference >= 0 ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                                    <div>
                                        <div className="font-bold text-sm">
                                            {difference === 0 ? "Caixa Bateu!" : (difference > 0 ? "Sobra de Caixa" : "Falta de Caixa")}
                                        </div>
                                        <div className="text-xs opacity-80">
                                            Diferença: {Math.abs(difference).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {!closureSaved ? (
                            <button
                                onClick={handleCloseRegister}
                                disabled={loading || actualMoney === ''}
                                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-cyan-900/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? 'Fechando...' : 'Fechar Caixa'}
                            </button>
                        ) : (
                            <div className="w-full bg-green-600/20 border border-green-800 text-green-400 font-semibold py-3 rounded-xl flex items-center justify-center gap-2">
                                <CheckCircle size={20} /> Caixa Fechado
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
