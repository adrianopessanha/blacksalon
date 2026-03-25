import { useState, useRef, useMemo } from 'react'
import { db, collection, addDoc, serverTimestamp, auth, signOut } from '../firebase'
import { Timestamp } from 'firebase/firestore'
import { Save, Calendar, User, Scissors, DollarSign, TrendingUp, ChevronRight, Search, UserCheck, AlertTriangle } from 'lucide-react'
import { BARBERS } from '../data/barbers'
import { BarberDailyView } from './BarberDailyView'
import { BarberRanking } from './BarberRanking'
import { useBarberStats } from '../hooks/useBarberStats'
import { useSubscribers } from '../hooks/useSubscribers'

// ==========================================
// SERVICE PRESETS (quick-tap chips, multi-select)
// ==========================================
const SERVICE_PRESETS = [
    { label: 'M', desc: 'Corte maq', value: 30 },
    { label: 'M+T', desc: 'Corte maq+tes', value: 40 },
    { label: 'B', desc: 'Barba', value: 30 },
    { label: 'Sobr', desc: 'Sobrancelha', value: 10 },
    { label: 'Pigm', desc: 'Pigmentacao', value: 20 },
    { label: 'M plano', desc: 'Corte maq plano', value: 20 },
    { label: 'M+T plano', desc: 'Corte maq+tes plano', value: 25 },
    { label: 'C+B plano', desc: 'Corte+barba plano', value: 35 },
]

export function ServiceForm() {
    // Auto-detect login
    const currentUserEmail = auth.currentUser?.email
    const loggedInBarber = BARBERS.find(b => b.email === currentUserEmail)
    const isAdmin = loggedInBarber?.isAdmin || false

    // Tab state
    const [activeTab, setActiveTab] = useState('lancar')

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
    const [selectedPresets, setSelectedPresets] = useState([])
    const [showCustomDesc, setShowCustomDesc] = useState(false)
    const isSubmittingRef = useRef(false)
    const [subscriberSearch, setSubscriberSearch] = useState('')
    const [showSubscriberDropdown, setShowSubscriberDropdown] = useState(false)

    // Subscribers from Google Sheets
    const { subscribers, loading: subsLoading, error: subsError } = useSubscribers()

    // Derived active barber
    const activeBarber = BARBERS.find(b => b.id === selectedBarberId) || loggedInBarber

    if (!selectedBarberId && loggedInBarber) {
        setSelectedBarberId(loggedInBarber.id)
    }

    const getTodayStr = () => {
        const d = new Date()
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    }
    const today = getTodayStr()

    // Shared stats hook
    const { stats, loading: statsLoading, dynamicGoal } = useBarberStats(
        activeBarber?.id,
        formData.data_manual || today
    )

    const handlePresetToggle = (preset) => {
        setShowCustomDesc(false)
        const isSelected = selectedPresets.find(p => p.label === preset.label)
        let newPresets
        if (isSelected) {
            newPresets = selectedPresets.filter(p => p.label !== preset.label)
        } else {
            newPresets = [...selectedPresets, preset]
        }
        setSelectedPresets(newPresets)

        if (newPresets.length > 0) {
            const desc = newPresets.map(p => p.desc).join(' + ')
            const total = newPresets.reduce((sum, p) => sum + p.value, 0)
            const planos = newPresets.filter(p => p.label.includes('plano'))
            const avulsos = newPresets.filter(p => !p.label.includes('plano'))
            const onlyPlano = planos.length > 0 && avulsos.length === 0
            setFormData({ ...formData, servico_descricao: desc, valor_bruto: total.toString(), tipo: 'servico', forma_pagamento: onlyPlano ? 'Assinante' : (formData.forma_pagamento === 'Assinante' && avulsos.length > 0 ? 'Dinheiro' : formData.forma_pagamento) })
        } else {
            setFormData({ ...formData, servico_descricao: '', valor_bruto: '' })
        }
    }

    const handleCustomService = () => {
        setSelectedPresets([])
        setShowCustomDesc(true)
        setFormData({ ...formData, servico_descricao: '', valor_bruto: '' })
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (isSubmittingRef.current) return

        if (!formData.valor_bruto) return alert('Preencha o valor do serviço')
        if (!formData.servico_descricao) return alert('Selecione ou descreva o serviço')

        // Validar assinante: precisa selecionar cliente da lista
        const planos = selectedPresets.filter(p => p.label.includes('plano'))
        const avulsos = selectedPresets.filter(p => !p.label.includes('plano'))
        const isMixed = planos.length > 0 && avulsos.length > 0
        const needsSubscriber = formData.forma_pagamento === 'Assinante' || isMixed
        if (needsSubscriber && !formData.cliente_nome) {
            return alert('Selecione o assinante da lista para lançar com pagamento Assinante.')
        }
        if (needsSubscriber && subscribers.length > 0) {
            const isValid = subscribers.some(s => s.name.toLowerCase() === formData.cliente_nome.toLowerCase())
            if (!isValid) {
                return alert(`"${formData.cliente_nome}" não está na lista de assinantes ativos. Selecione um assinante válido.`)
            }
        }

        const PAGAMENTOS_REAIS = ['Dinheiro', 'Pix', 'Crédito', 'Débito']
        if (['venda_vale', 'venda_assinatura'].includes(formData.tipo) && !PAGAMENTOS_REAIS.includes(formData.forma_pagamento)) {
            return alert('Venda de Assinatura ou Vale Presente só pode ser feita com pagamento real (Dinheiro, Pix, Crédito ou Débito).')
        }

        isSubmittingRef.current = true
        setLoading(true)
        try {
            if (!activeBarber) throw new Error('Nenhum barbeiro selecionado.')

            const now = new Date()
            const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')

            let entryDataField = Timestamp.fromDate(now)

            if (formData.data_manual) {
                if (formData.data_manual > todayStr) {
                    return alert('Não é permitido lançamentos futuros.')
                }
                if (formData.data_manual < todayStr) {
                    if (!isAdmin) return alert('Apenas administradores podem fazer lançamentos retroativos.')
                    const [year, month, day] = formData.data_manual.split('-').map(Number)
                    const manualDate = new Date(year, month - 1, day, 12, 0, 0)
                    entryDataField = Timestamp.fromDate(manualDate)
                }
            }

            const calcComissao = (valor, pagamento, tipo) => {
                let fee = 0
                if (pagamento === 'Crédito') fee = 0.05
                if (pagamento === 'Débito') fee = 0.02
                const base = valor * (1 - fee)
                if (tipo === 'servico') return parseFloat((base * 0.5).toFixed(2))
                if (tipo === 'produto') return 5.00
                return 0
            }

            const baseEntry = {
                data: entryDataField,
                barbeiro_id: activeBarber.id,
                barbeiro_nome: activeBarber.name,
                loja_id: activeBarber.store,
                cliente_nome: formData.cliente_nome || 'Não Informado',
                created_at: serverTimestamp()
            }

            // Detectar mix plano + avulso
            const planos = selectedPresets.filter(p => p.label.includes('plano'))
            const avulsos = selectedPresets.filter(p => !p.label.includes('plano'))
            const isMixed = planos.length > 0 && avulsos.length > 0

            if (isMixed) {
                // Lançamento 1: serviços do plano (Assinante)
                const planoDesc = planos.map(p => p.desc).join(' + ')
                const planoValor = planos.reduce((s, p) => s + p.value, 0)
                const planoComissao = calcComissao(planoValor, 'Assinante', 'servico')
                await addDoc(collection(db, 'lancamentos'), {
                    ...baseEntry,
                    servico_descricao: planoDesc,
                    valor_bruto: planoValor,
                    forma_pagamento: 'Assinante',
                    comissao_barbeiro: planoComissao,
                    tipo: 'servico'
                })

                // Lançamento 2: serviços avulsos (pagamento escolhido)
                const avulsoDesc = avulsos.map(p => p.desc).join(' + ')
                const avulsoValor = avulsos.reduce((s, p) => s + p.value, 0)
                const avulsoComissao = calcComissao(avulsoValor, formData.forma_pagamento, 'servico')
                await addDoc(collection(db, 'lancamentos'), {
                    ...baseEntry,
                    servico_descricao: avulsoDesc,
                    valor_bruto: avulsoValor,
                    forma_pagamento: formData.forma_pagamento,
                    comissao_barbeiro: avulsoComissao,
                    tipo: 'servico'
                })

                alert(`2 lançamentos salvos para ${activeBarber.name}!\n• ${planoDesc} (Assinante)\n• ${avulsoDesc} (${formData.forma_pagamento})`)
            } else {
                // Lançamento único normal
                const valor = parseFloat(formData.valor_bruto)
                const comissao_barbeiro = calcComissao(valor, formData.forma_pagamento, formData.tipo)

                await addDoc(collection(db, 'lancamentos'), {
                    ...baseEntry,
                    servico_descricao: formData.servico_descricao,
                    valor_bruto: valor,
                    forma_pagamento: formData.forma_pagamento,
                    comissao_barbeiro,
                    tipo: formData.tipo
                })

                alert(`Lançamento salvo para ${activeBarber.name}!`)
            }
            setFormData({ ...formData, servico_descricao: '', valor_bruto: '', data_manual: '', cliente_nome: '' })
            setSelectedPresets([])
            setShowCustomDesc(false)
        } catch (e) {
            console.error(e)
            alert('Erro ao salvar: ' + e.message)
        } finally {
            setLoading(false)
            isSubmittingRef.current = false
        }
    }

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

    const fmt = (val) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    return (
        <div className="max-w-md mx-auto pb-4">

            {/* ========== TAB BAR ========== */}
            <div className="flex bg-gray-900 rounded-2xl p-1 border border-gray-800 mb-4 sticky top-0 z-30">
                <button
                    onClick={() => setActiveTab('lancar')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'lancar'
                        ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/30'
                        : 'text-gray-400 hover:text-gray-200'
                        }`}
                >
                    <Scissors size={16} /> Lancar
                </button>
                <button
                    onClick={() => setActiveTab('painel')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === 'painel'
                        ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/30'
                        : 'text-gray-400 hover:text-gray-200'
                        }`}
                >
                    <TrendingUp size={16} /> Painel
                </button>
            </div>

            {/* ========== TAB: LANCAR ========== */}
            {activeTab === 'lancar' && (
                <div className="space-y-4">

                    {/* Quick Stats Strip */}
                    {!statsLoading && (
                        <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5">
                            <div className="flex items-center gap-4">
                                <div className="text-center">
                                    <p className="text-lg font-black text-cyan-400">{stats.todayCount}</p>
                                    <p className="text-[10px] text-gray-500 uppercase">servicos</p>
                                </div>
                                <div className="w-px h-8 bg-gray-800" />
                                <div className="text-center">
                                    <p className="text-lg font-black text-green-400">{fmt(stats.todayCommission)}</p>
                                    <p className="text-[10px] text-gray-500 uppercase">comissao</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setActiveTab('painel')}
                                className="text-xs text-gray-500 hover:text-cyan-400 flex items-center gap-0.5 transition-colors"
                            >
                                Ver painel <ChevronRight size={12} />
                            </button>
                        </div>
                    )}

                    {/* Form Card */}
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-4">

                        {/* Admin Selector */}
                        {isAdmin && (
                            <div className="bg-gray-950 p-3 rounded-lg border border-gray-800">
                                <label className="text-xs text-gray-500 block mb-1">Lancar como:</label>
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
                        )}

                        {/* Service Preset Chips (multi-select) */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Servico</label>
                                {selectedPresets.length > 1 && (
                                    <span className="text-[10px] text-cyan-400 font-bold bg-cyan-900/30 px-2 py-0.5 rounded-full">
                                        {selectedPresets.length} selecionados
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {SERVICE_PRESETS.map(preset => {
                                    const isActive = selectedPresets.some(p => p.label === preset.label)
                                    return (
                                        <button
                                            key={preset.label}
                                            type="button"
                                            onClick={() => handlePresetToggle(preset)}
                                            className={`px-2.5 py-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${isActive
                                                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/30 ring-1 ring-cyan-400/30'
                                                : 'bg-gray-950 border border-gray-800 text-gray-300 hover:border-gray-600'
                                                }`}
                                        >
                                            {preset.label}
                                            <span className={`ml-1 text-[10px] ${isActive ? 'text-cyan-200' : 'text-gray-600'}`}>
                                                {preset.value}
                                            </span>
                                        </button>
                                    )
                                })}
                                <button
                                    type="button"
                                    onClick={handleCustomService}
                                    className={`px-2.5 py-2 rounded-lg text-xs font-medium transition-all ${showCustomDesc
                                        ? 'bg-cyan-600 text-white shadow-lg'
                                        : 'bg-gray-950 border border-gray-800 text-gray-500 hover:border-gray-600'
                                        }`}
                                >
                                    Outro...
                                </button>
                            </div>
                            {/* Combined description preview */}
                            {selectedPresets.length > 0 && (
                                <div className="mt-2 text-xs text-gray-400 bg-gray-950 rounded-lg px-3 py-1.5 border border-gray-800">
                                    {formData.servico_descricao}
                                </div>
                            )}
                        </div>

                        {/* Custom description (only when "Outro" selected) */}
                        {showCustomDesc && (
                            <input
                                placeholder="Descreva o servico..."
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 px-4 text-gray-200 outline-none focus:border-cyan-500"
                                value={formData.servico_descricao}
                                autoFocus
                                onChange={e => setFormData({ ...formData, servico_descricao: e.target.value })}
                            />
                        )}

                        {/* Value + Type Row */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Valor (R$)</label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-3 top-2.5 text-gray-500" size={16} />
                                        <input type="number" step="0.01"
                                            className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 pl-9 pr-3 text-gray-200 outline-none focus:border-cyan-500 text-lg font-bold"
                                            value={formData.valor_bruto}
                                            onChange={e => setFormData({ ...formData, valor_bruto: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                                    <select
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2.5 px-3 text-gray-200 outline-none focus:border-cyan-500"
                                        value={formData.tipo}
                                        onChange={e => setFormData({ ...formData, tipo: e.target.value })}
                                    >
                                        <option value="servico">Servico</option>
                                        <option value="produto">Produto</option>
                                        <option value="venda_vale">Venda Vale Presente</option>
                                        <option value="venda_assinatura">Venda Assinatura</option>
                                    </select>
                                </div>
                            </div>

                            {/* Client Name */}
                            {(() => {
                                const isAssinante = formData.forma_pagamento === 'Assinante'
                                const planos = selectedPresets.filter(p => p.label.includes('plano'))
                                const avulsos = selectedPresets.filter(p => !p.label.includes('plano'))
                                const isMixed = planos.length > 0 && avulsos.length > 0
                                const needsSubscriber = isAssinante || isMixed

                                if (needsSubscriber) {
                                    const filtered = subscribers.filter(s =>
                                        s.name.toLowerCase().includes(subscriberSearch.toLowerCase())
                                    )
                                    return (
                                        <div className="relative">
                                            <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                <UserCheck size={12} className="text-purple-400" />
                                                Assinante <span className="text-red-400">*</span>
                                                {subsLoading && <span className="text-gray-600 ml-1">(carregando...)</span>}
                                                {subsError && <span className="text-red-500 ml-1 flex items-center gap-0.5"><AlertTriangle size={10} /> erro</span>}
                                            </label>
                                            {formData.cliente_nome ? (
                                                <div className="flex items-center gap-2 bg-purple-900/20 border border-purple-700/50 rounded-lg py-2 px-3">
                                                    <UserCheck size={16} className="text-purple-400" />
                                                    <span className="text-purple-300 text-sm font-medium flex-1">{formData.cliente_nome}</span>
                                                    <button type="button"
                                                        onClick={() => { setFormData({ ...formData, cliente_nome: '' }); setSubscriberSearch('') }}
                                                        className="text-gray-500 hover:text-red-400 text-xs px-2 py-0.5 rounded bg-gray-800 hover:bg-red-900/30 transition-colors"
                                                    >trocar</button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="relative">
                                                        <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
                                                        <input
                                                            placeholder={`Buscar assinante (${subscribers.length} ativos)`}
                                                            className="w-full bg-gray-950 border border-purple-700/50 rounded-lg py-2 pl-8 pr-3 text-gray-200 outline-none focus:border-purple-500 text-sm"
                                                            value={subscriberSearch}
                                                            onChange={e => { setSubscriberSearch(e.target.value); setShowSubscriberDropdown(true) }}
                                                            onFocus={() => setShowSubscriberDropdown(true)}
                                                        />
                                                    </div>
                                                    {showSubscriberDropdown && (
                                                        <div className="absolute z-50 w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                                                            {filtered.length === 0 ? (
                                                                <div className="px-3 py-3 text-gray-500 text-xs text-center">
                                                                    {subscriberSearch ? 'Nenhum assinante encontrado' : 'Digite para buscar'}
                                                                </div>
                                                            ) : (
                                                                filtered.slice(0, 20).map((sub, i) => (
                                                                    <button type="button" key={i}
                                                                        onClick={() => {
                                                                            setFormData({ ...formData, cliente_nome: sub.name })
                                                                            setSubscriberSearch('')
                                                                            setShowSubscriberDropdown(false)
                                                                        }}
                                                                        className="w-full text-left px-3 py-2 hover:bg-purple-900/20 transition-colors flex items-center justify-between gap-2 border-b border-gray-800/50 last:border-0"
                                                                    >
                                                                        <span className="text-sm text-gray-200 truncate">{sub.name}</span>
                                                                        {sub.plano && <span className="text-[10px] text-purple-400 bg-purple-900/30 px-1.5 py-0.5 rounded shrink-0">{sub.plano}</span>}
                                                                    </button>
                                                                ))
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )
                                }

                                return (
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Cliente (opcional)</label>
                                        <input
                                            placeholder="Nome do cliente"
                                            className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-3 text-gray-200 outline-none focus:border-cyan-500 text-sm"
                                            value={formData.cliente_nome}
                                            onChange={e => setFormData({ ...formData, cliente_nome: e.target.value })}
                                        />
                                    </div>
                                )
                            })()}

                            {/* Payment Buttons */}
                            <div>
                                <label className="block text-xs text-gray-500 mb-2 uppercase tracking-wider font-semibold">Pagamento</label>
                                {(() => {
                                    const planos = selectedPresets.filter(p => p.label.includes('plano'))
                                    const avulsos = selectedPresets.filter(p => !p.label.includes('plano'))
                                    const onlyPlano = planos.length > 0 && avulsos.length === 0
                                    const isMixed = planos.length > 0 && avulsos.length > 0
                                    return (
                                        <>
                                            {isMixed && (
                                                <div className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-800/40 rounded-lg px-3 py-2 mb-2">
                                                    ⚡ Mix plano + avulso: será separado em 2 lançamentos. Escolha o pagamento do serviço avulso ({avulsos.map(p => p.label).join(', ')}).
                                                </div>
                                            )}
                                            <div className="grid grid-cols-3 gap-2">
                                                {['Dinheiro', 'Pix', 'Crédito', 'Débito', 'Vale Presente', 'Assinante'].map(pm => {
                                                    const disabled = (onlyPlano && pm !== 'Assinante') || (isMixed && (pm === 'Assinante' || pm === 'Vale Presente'))
                                                    return (
                                                        <button type="button" key={pm}
                                                            onClick={() => !disabled && setFormData({ ...formData, forma_pagamento: pm })}
                                                            disabled={disabled}
                                                            className={`text-sm py-2.5 px-2 rounded-lg border transition-all active:scale-95 ${formData.forma_pagamento === pm && !disabled
                                                                ? 'bg-cyan-900/40 border-cyan-500 text-cyan-400 font-bold'
                                                                : disabled
                                                                    ? 'bg-gray-950 border-gray-800 text-gray-700 cursor-not-allowed opacity-40'
                                                                    : 'bg-gray-950 border-gray-800 text-gray-400'
                                                                }`}
                                                        >
                                                            {pm}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </>
                                    )
                                })()}
                            </div>

                            {/* Date (admin only) */}
                            {isAdmin && (
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Data (retroativo)</label>
                                    <input type="date"
                                        className="w-full bg-gray-950 border border-gray-800 rounded-lg py-2 px-3 text-gray-200 outline-none focus:border-cyan-500 text-sm scheme-dark"
                                        value={formData.data_manual}
                                        max={today}
                                        onChange={e => setFormData({ ...formData, data_manual: e.target.value })}
                                    />
                                </div>
                            )}

                            {/* Submit */}
                            <button type="submit" disabled={loading}
                                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-cyan-900/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 text-base"
                            >
                                <Save size={18} /> {loading ? 'Salvando...' : `Lancar`}
                            </button>
                        </form>
                    </div>

                    {/* Last 3 Entries */}
                    {stats.todayServices.length > 0 && (
                        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                            <div className="px-4 py-2.5 border-b border-gray-800 flex justify-between items-center">
                                <span className="text-xs font-semibold text-gray-400">Ultimos lancamentos</span>
                                <button onClick={() => setActiveTab('painel')} className="text-[10px] text-cyan-500 hover:text-cyan-400">
                                    Ver tudo
                                </button>
                            </div>
                            <div className="divide-y divide-gray-800/50">
                                {stats.todayServices.slice(0, 3).map(item => {
                                    const isDeduction = item.comissao_barbeiro < 0
                                    return (
                                        <div key={item.id} className="px-4 py-2.5 flex items-center justify-between">
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <span className="text-xs text-gray-500">{item.dateStr}</span>
                                                <span className="text-sm text-gray-300 truncate">
                                                    {item.cliente_nome && item.cliente_nome !== 'Não Informado' ? item.cliente_nome : item.servico_descricao}
                                                </span>
                                                <span className="text-[10px] text-gray-600">{item.forma_pagamento}</span>
                                            </div>
                                            <span className={`text-sm font-bold ml-2 ${isDeduction ? 'text-red-400' : 'text-green-500/80'}`}>
                                                {isDeduction ? '' : '+'}{fmt(item.comissao_barbeiro)}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ========== TAB: PAINEL ========== */}
            {activeTab === 'painel' && (
                <div className="space-y-4">
                    {activeBarber && (
                        <BarberDailyView
                            key={activeBarber.id}
                            barberId={activeBarber.id}
                            barberName={activeBarber.name}
                            isAdmin={isAdmin}
                            selectedDate={formData.data_manual || today}
                            stats={stats}
                            statsLoading={statsLoading}
                            dynamicGoal={dynamicGoal}
                        />
                    )}
                    <BarberRanking currentBarberId={activeBarber?.id} />
                </div>
            )}
        </div>
    )
}
