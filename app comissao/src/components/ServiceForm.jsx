import { useState } from 'react'
import { db, collection, addDoc, serverTimestamp, auth, signOut } from '../firebase'
import { Timestamp } from 'firebase/firestore'
import { Save, Calendar, User, Scissors, DollarSign } from 'lucide-react'
import { BARBERS } from '../data/barbers'
import { BarberDailyView } from './BarberDailyView'

export function ServiceForm() {
    // Auto-detect login
    const currentUserEmail = auth.currentUser?.email
    const loggedInBarber = BARBERS.find(b => b.email === currentUserEmail)
    const isAdmin = loggedInBarber?.isAdmin || false

    // State for form and SELECTION
    const [selectedBarberId, setSelectedBarberId] = useState(loggedInBarber?.id || '')
    const [formData, setFormData] = useState({
        servico_descricao: '',
        valor_bruto: '',
        forma_pagamento: 'Dinheiro',
        tipo: 'servico',
        data_manual: '',
        cliente_nome: ''
    })
    const [loading, setLoading] = useState(false)

    // Derived active barber (who we are launching for)
    const activeBarber = BARBERS.find(b => b.id === selectedBarberId) || loggedInBarber

    // Update selectedBarberId if login loads late
    if (!selectedBarberId && loggedInBarber) {
        setSelectedBarberId(loggedInBarber.id)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!formData.valor_bruto) return alert('Preencha o valor do serviço')

        setLoading(true)
        try {
            if (!activeBarber) throw new Error('Nenhum barbeiro selecionado.')

            const valor = parseFloat(formData.valor_bruto)

            // Commission Calculation
            let fee = 0
            if (formData.forma_pagamento === 'Crédito') fee = 0.05
            if (formData.forma_pagamento === 'Débito') fee = 0.02

            const base = valor * (1 - fee)

            let commissionRate = 0
            if (formData.tipo === 'servico') commissionRate = 0.5

            const comissao_barbeiro = base * commissionRate

            const now = new Date()
            const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')

            let entryDataField = Timestamp.fromDate(now) // Use client time by default for accuracy

            if (formData.data_manual) {
                if (formData.data_manual > todayStr) {
                    return alert('Não é permitido lançamentos futuros.')
                }

                // If manual date IS NOT today, use 12:00. If it IS today, use current time (default above)
                if (formData.data_manual < todayStr) {
                    if (!isAdmin) return alert('Apenas administradores podem fazer lançamentos retroativos.')
                    entryDataField = Timestamp.fromDate(new Date(formData.data_manual + 'T12:00:00'))
                }
            }

            await addDoc(collection(db, 'lancamentos'), {
                data: entryDataField,
                barbeiro_id: activeBarber.id,
                barbeiro_nome: activeBarber.name,
                loja_id: activeBarber.store,
                cliente_nome: formData.cliente_nome || 'Não Informado',
                servico_descricao: formData.servico_descricao,
                valor_bruto: valor,
                forma_pagamento: formData.forma_pagamento,
                comissao_barbeiro: parseFloat(comissao_barbeiro.toFixed(2)),
                tipo: formData.tipo,
                created_at: serverTimestamp()
            })

            alert(`Lançamento salvo para ${activeBarber.name}!`)
            setFormData({ ...formData, servico_descricao: '', valor_bruto: '', data_manual: '', cliente_nome: '' })
        } catch (e) {
            console.error(e)
            alert('Erro ao salvar: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    const getTodayStr = () => {
        const d = new Date()
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    }
    const today = getTodayStr()

    if (!loggedInBarber) {
        return (
            <div className="p-8 text-center text-red-500 bg-gray-900 rounded-xl border border-red-900">
                <p className="font-bold text-lg mb-2">Erro de Permissão</p>
                <p className="text-sm text-gray-400 mb-6">Seu e-mail ({currentUserEmail || 'Anônimo'}) não está cadastrado como barbeiro.</p>
                <button
                    onClick={() => signOut(auth)}
                    className="bg-red-900/50 hover:bg-red-900 text-red-200 px-4 py-2 rounded-lg text-sm border border-red-800 transition-colors cursor-pointer"
                >
                    Sair e Tentar Outra Conta
                </button>
            </div>
        )
    }

    return (
        <div className="max-w-md mx-auto bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-cyan-500 flex items-center gap-2"><Scissors /> Novo Lançamento</h2>

                {/* ADMIN SELECTOR */}
                {isAdmin ? (
                    <div className="mt-3 bg-gray-950 p-3 rounded-lg border border-gray-800">
                        <label className="text-xs text-gray-500 block mb-1">Lançar como:</label>
                        <select
                            value={selectedBarberId}
                            onChange={(e) => setSelectedBarberId(e.target.value)}
                            className="w-full bg-gray-900 text-white font-medium p-2 rounded border border-gray-700 focus:border-cyan-500 outline-none"
                        >
                            {BARBERS.map(b => (
                                <option key={b.id} value={b.id}>{b.name} ({b.store})</option>
                            ))}
                        </select>
                    </div>
                ) : (
                    <div className="text-sm text-gray-400 mt-1 flex items-center gap-2">
                        <User size={14} />
                        Logado como: <span className="text-white font-medium">{loggedInBarber.name}</span>
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

                <div>
                    <label className="block text-sm text-gray-400 mb-1">Data (Opcional)</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-3 text-gray-500" size={18} />
                        <input type="date"
                            className={`w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 pl-10 pr-4 text-gray-200 outline-none focus:border-cyan-500 transition-colors scheme-dark ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                            value={formData.data_manual}
                            max={today}
                            disabled={!isAdmin}
                            onChange={e => setFormData({ ...formData, data_manual: e.target.value })}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm text-gray-400 mb-1">Nome do Cliente (Opcional)</label>
                    <input
                        placeholder="Ex: João Silva"
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 px-4 text-gray-200 outline-none focus:border-cyan-500"
                        value={formData.cliente_nome}
                        onChange={e => setFormData({ ...formData, cliente_nome: e.target.value })}
                    />
                </div>

                <div>
                    <label className="block text-sm text-gray-400 mb-1">Descrição</label>
                    <input
                        placeholder="Corte, Barba, etc"
                        className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 px-4 text-gray-200 outline-none focus:border-cyan-500"
                        value={formData.servico_descricao}
                        onChange={e => setFormData({ ...formData, servico_descricao: e.target.value })}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Valor (R$)</label>
                        <div className="relative">
                            <DollarSign className="absolute left-3 top-3 text-gray-500" size={18} />
                            <input type="number" step="0.01"
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 pl-10 pr-4 text-gray-200 outline-none focus:border-cyan-500"
                                value={formData.valor_bruto}
                                onChange={e => setFormData({ ...formData, valor_bruto: e.target.value })}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Tipo</label>
                        <select
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 px-4 text-gray-200 outline-none focus:border-cyan-500"
                            value={formData.tipo}
                            onChange={e => setFormData({ ...formData, tipo: e.target.value })}
                        >
                            <option value="servico">Serviço</option>
                            <option value="produto">Produto</option>
                            <option value="venda_vale">Venda Vale Presente</option>
                            <option value="venda_assinatura">Venda Assinatura</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-sm text-gray-400 mb-1">Pagamento</label>
                    <div className="grid grid-cols-3 gap-2">
                        {['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Vale Presente', 'Assinante'].map(pm => (
                            <button type="button" key={pm}
                                onClick={() => setFormData({ ...formData, forma_pagamento: pm })}
                                className={`text-sm py-2 px-3 rounded-lg border transition-all ${formData.forma_pagamento === pm ? 'bg-cyan-900/40 border-cyan-500 text-cyan-400' : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700'}`}
                            >
                                {pm}
                            </button>
                        ))}
                    </div>
                </div>

                <button type="submit" disabled={loading} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-cyan-900/20 active:scale-95 disabled:opacity-50 mt-4 flex items-center justify-center gap-2">
                    <Save size={20} /> {loading ? 'Salvando...' : `Lançar para ${activeBarber ? activeBarber.name.split(' ')[0] : ''}`}
                </button>

            </form>

            {/* Component SAFE MODE enabled */}
            {activeBarber && <BarberDailyView key={activeBarber.id} barberId={activeBarber.id} barberName={activeBarber.name} isAdmin={isAdmin} />}
        </div>
    )
}
