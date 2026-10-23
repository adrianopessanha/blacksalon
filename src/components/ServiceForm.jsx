import { useState, useEffect, useRef, useMemo } from 'react'
import { db, collection, addDoc, serverTimestamp, auth, signOut, query, where, getDocs, doc, setDoc, deleteDoc, updateDoc, chamarFuncao } from '../firebase'
import { Timestamp, getDoc } from 'firebase/firestore'
import { Save, Calendar, User, Scissors, DollarSign, TrendingUp, ChevronLeft, ChevronRight, Search, UserCheck, AlertTriangle, Phone, CreditCard, Trash2, Pencil, X } from 'lucide-react'
import { BARBERS } from '../data/barbers'
import { BarberDailyView } from './BarberDailyView'
import { BarberRanking } from './BarberRanking'
import { useBarberStats } from '../hooks/useBarberStats'
import { useSubscribers } from '../hooks/useSubscribers'
import { useVoucherClients } from '../hooks/useVoucherClients'
import { ClientePicker } from './ClientePicker'
import { storeToUnidade, codigoDoTelefone, cadastrarClienteBalcao } from '../hooks/useClientes'
import { normalizeTelefone55 } from '../utils/phone'

// ==========================================
// SUBSCRIPTION PLANS
// ==========================================
const SUBSCRIPTION_PLANS = [
    { id: 'cria', label: 'Corte de Cria', value: 80 },
    { id: 'corte', label: 'Corte Completo', value: 100 },
    { id: 'cabelo_barba', label: 'Cabelo e Barba', value: 140 },
    { id: 'barba', label: 'Barba Completa', value: 80 },
]

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
    { label: 'B plano', desc: 'Barba plano', value: 20 },
]

export function ServiceForm() {
    // Auto-detect login
    const currentUserEmail = auth.currentUser?.email
    const loggedInBarber = BARBERS.find(b => b.email === currentUserEmail)
    const isAdmin = loggedInBarber?.isAdmin || false

    // Tab state
    const [activeTab, setActiveTab] = useState('lancar')
    const [panelDate, setPanelDate] = useState('')

    // State for form and SELECTION
    const [selectedBarberId, setSelectedBarberId] = useState(loggedInBarber?.id || '')
    const [formData, setFormData] = useState({
        servico_descricao: '',
        valor_bruto: '',
        forma_pagamento: 'Dinheiro',
        tipo: 'servico',
        data_manual: '',
        cliente_nome: '',
        cliente_id: '', // código do cliente escolhido na lista (sem telefone)
        cliente_telefone: '', // só o que o barbeiro digita na venda de assinatura/vale
        subscriber_code: ''
    })
    const [voucherBalance, setVoucherBalance] = useState(null)
    const [voucherValorPorUso, setVoucherValorPorUso] = useState(null)
    const [fetchingBalance, setFetchingBalance] = useState(false)
    const [loading, setLoading] = useState(false)
    const [selectedPresets, setSelectedPresets] = useState([])
    const [showCustomDesc, setShowCustomDesc] = useState(false)
    const isSubmittingRef = useRef(false)
    const [subscriberSearch, setSubscriberSearch] = useState('')
    const [showSubscriberDropdown, setShowSubscriberDropdown] = useState(false)
    const [voucherSearch, setVoucherSearch] = useState('')
    const [showVoucherDropdown, setShowVoucherDropdown] = useState(false)
    const [selectedPlan, setSelectedPlan] = useState(null)
    const [agendamentoSel, setAgendamentoSel] = useState(null)
    const [clienteInfo, setClienteInfo] = useState(null)
    const isRenovacao = formData.tipo === 'renovacao_celcoin'
    const isAssinVenda = formData.tipo === 'venda_assinatura' || isRenovacao

    // Telefone digitado na venda: o servidor devolve só o código do cliente
    const usaTelefoneDigitado = formData.tipo === 'venda_vale' || isAssinVenda
    const tel55Digitado = usaTelefoneDigitado ? normalizeTelefone55(formData.cliente_telefone) : ''
    const [cidDigitado, setCidDigitado] = useState(null)
    useEffect(() => {
        setCidDigitado(null)
        if (!tel55Digitado) return
        let cancelado = false
        codigoDoTelefone(tel55Digitado)
            .then(cid => { if (!cancelado) setCidDigitado(cid) })
            .catch(err => console.error('resolverCliente:', err))
        return () => { cancelado = true }
    }, [tel55Digitado])
    const cidCliente = cidDigitado || formData.cliente_id || null

    // Status da assinatura (gravado pela Celcoin em clientes/{código})
    useEffect(() => {
        if (!cidCliente) { setClienteInfo(null); return }
        let cancelado = false
        getDoc(doc(db, 'clientes', cidCliente))
            .then(snap => { if (!cancelado) setClienteInfo(snap.exists() ? snap.data() : null) })
            .catch(err => console.error('clientes:', err))
        return () => { cancelado = true }
    }, [cidCliente])

    const [splitPayment, setSplitPayment] = useState(false)
    const [splitForma2, setSplitForma2] = useState('Crédito')
    const [splitValor1, setSplitValor1] = useState('')

    const [deleteConfirmation, setDeleteConfirmation] = useState(null)
    const [editingLaunch, setEditingLaunch] = useState(null)
    const [editForm, setEditForm] = useState({})
    // Subscribers from Google Sheets (Club)
    const { subscribers, loading: subsLoading, error: subsError } = useSubscribers()

    // Voucher Clients from Firestore
    const { clients: voucherClients, loading: vouchersLoading } = useVoucherClients()

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

    // Stats hook - painel usa panelDate, form usa data_manual
    const panelTargetDate = panelDate || today
    const { stats, loading: statsLoading, dynamicGoal } = useBarberStats(
        activeBarber?.id,
        activeTab === 'painel' ? panelTargetDate : (formData.data_manual || today)
    )

    // Balance lookup for Voucher + valor_por_uso
    useEffect(() => {
        if (formData.forma_pagamento === 'Vale Presente' && formData.cliente_nome) {
            const fetchBalance = async () => {
                setFetchingBalance(true)
                try {
                    // Buscar dados do cliente no clientes_vale
                    const clientKey = formData.cliente_nome.toLowerCase().trim()
                    const clientDoc = await getDocs(query(collection(db, 'clientes_vale'), where('nome', '==', formData.cliente_nome)))
                    let valorPorUso = null
                    if (!clientDoc.empty) {
                        const clientData = clientDoc.docs[0].data()
                        valorPorUso = clientData.valor_por_uso || null
                    }
                    setVoucherValorPorUso(valorPorUso)

                    // Autopreencher valor, descrição e travar formulário
                    if (valorPorUso) {
                        setFormData(prev => ({ ...prev, valor_bruto: valorPorUso.toString(), servico_descricao: 'Uso Vale Presente', tipo: 'servico' }))
                        setSelectedPresets([])
                        setShowCustomDesc(false)
                    }

                    // Calcular saldo
                    const q = query(
                        collection(db, 'lancamentos'),
                        where('cliente_nome', '==', formData.cliente_nome)
                    )
                    const snap = await getDocs(q)
                    const items = snap.docs.map(d => d.data())
                    const credits = items.filter(i => i.tipo === 'venda_vale').reduce((sum, i) => sum + 4, 0)
                    const debits = items.filter(i => i.forma_pagamento === 'Vale Presente').length
                    setVoucherBalance(credits - debits)
                } catch (e) {
                    console.error("Error fetching voucher balance:", e)
                } finally {
                    setFetchingBalance(false)
                }
            }
            fetchBalance()
        } else {
            setVoucherBalance(null)
            setVoucherValorPorUso(null)
        }
    }, [formData.forma_pagamento, formData.cliente_nome])


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

        // Se pagamento é Vale Presente com valor fixo, não alterar o valor
        const isValeFixo = formData.forma_pagamento === 'Vale Presente' && voucherValorPorUso

        if (newPresets.length > 0) {
            const desc = newPresets.map(p => p.desc).join(' + ')
            const total = newPresets.reduce((sum, p) => sum + p.value, 0)
            const planos = newPresets.filter(p => p.label.includes('plano'))
            const avulsos = newPresets.filter(p => !p.label.includes('plano'))
            const onlyPlano = planos.length > 0 && avulsos.length === 0
            const noPlano = planos.length === 0
            setFormData({ ...formData, servico_descricao: desc, valor_bruto: isValeFixo ? formData.valor_bruto : total.toString(), tipo: 'servico', forma_pagamento: onlyPlano ? 'Assinante' : ((formData.forma_pagamento === 'Assinante' && (noPlano || avulsos.length > 0)) ? 'Dinheiro' : formData.forma_pagamento) })
        } else {
            setFormData({ ...formData, servico_descricao: '', valor_bruto: isValeFixo ? formData.valor_bruto : '' })
        }
    }

    const handleCustomService = () => {
        const isValeFixo = formData.forma_pagamento === 'Vale Presente' && voucherValorPorUso
        setSelectedPresets([])
        setShowCustomDesc(true)
        setFormData({ ...formData, servico_descricao: '', valor_bruto: isValeFixo ? formData.valor_bruto : '' })
    }

    const handleDeleteLaunch = (id) => setDeleteConfirmation(id)

    const executeDeletion = async () => {
        if (!deleteConfirmation) return
        setLoading(true)
        try {
            await deleteDoc(doc(db, 'lancamentos', deleteConfirmation))
            setDeleteConfirmation(null)
        } catch (e) {
            alert('Erro ao excluir: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    const openEditLaunch = (item) => {
        setEditingLaunch(item.id)
        setEditForm({
            valor_bruto: item.valor_bruto,
            forma_pagamento: item.forma_pagamento,
            servico_descricao: item.servico_descricao,
            cliente_nome: item.cliente_nome || ''
        })
    }

    const executeEditLaunch = async () => {
        if (!editingLaunch) return
        setLoading(true)
        try {
            await updateDoc(doc(db, 'lancamentos', editingLaunch), {
                valor_bruto: parseFloat(editForm.valor_bruto),
                forma_pagamento: editForm.forma_pagamento,
                servico_descricao: editForm.servico_descricao,
                cliente_nome: editForm.cliente_nome,
            })
            setEditingLaunch(null)
        } catch (e) {
            alert('Erro ao editar: ' + e.message)
        } finally {
            setLoading(false)
        }
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
        if (needsSubscriber && clienteInfo?.status_assinatura === 'cancelada') {
            return alert('Assinatura CANCELADA: cobrar como avulso.')
        }
        if (needsSubscriber && subscribers.length > 0) {
            const match = subscribers.find(s => s.name.toLowerCase() === formData.cliente_nome.toLowerCase())
            if (!match) {
                return alert(`"${formData.cliente_nome}" não está na lista de assinantes. Selecione um assinante válido.`)
            }
            if (match.status !== 'ativo') {
                return alert(`"${formData.cliente_nome}" está com assinatura ${match.rawStatus || 'INATIVA'}. Só é possível lançar como Assinante para status "Paga fora do sistema" ou "Capturada na Operadora".`)
            }
        }

        const PAGAMENTOS_REAIS = ['Dinheiro', 'Pix', 'Crédito', 'Débito']
        if (['venda_vale', 'venda_assinatura', 'renovacao_celcoin'].includes(formData.tipo) && !PAGAMENTOS_REAIS.includes(formData.forma_pagamento)) {
            return alert('Venda de Assinatura ou Vale Presente só pode ser feita com pagamento real (Dinheiro, Pix, Crédito ou Débito).')
        }

        const temCliente = !!formData.cliente_id || !!normalizeTelefone55(formData.cliente_telefone)
        if (formData.cliente_telefone && !normalizeTelefone55(formData.cliente_telefone) && usaTelefoneDigitado) {
            return alert('Telefone inválido. Informe DDD + número.')
        }

        if (isAssinVenda && (!formData.cliente_nome || !temCliente)) {
            return alert('Para venda de Assinatura: selecione o cliente da lista ou informe Nome e Telefone.')
        }

        if (isAssinVenda && !selectedPlan) {
            return alert('Selecione o plano da assinatura.')
        }

        if (formData.tipo === 'venda_vale' && (!formData.cliente_nome || !temCliente)) {
            return alert('Para venda de Vale Presente: selecione o cliente da lista ou informe Nome e Telefone.')
        }

        if (formData.forma_pagamento === 'Vale Presente' && (!formData.cliente_nome)) {
            return alert('Selecione um cliente cadastrado para utilizar o Vale Presente.')
        }

        if (formData.forma_pagamento === 'Vale Presente' && voucherBalance !== null && voucherBalance <= 0) {
            return alert('Atenção: Este cliente não possui saldo de Vale Presente disponível.')
        }

        isSubmittingRef.current = true
        setLoading(true)
        try {
            if (!activeBarber) throw new Error('Nenhum barbeiro selecionado.')

            // Telefone digitado (venda): cadastra se for novo e usa o código; senão, o código da lista
            let clienteId = formData.cliente_id || null
            if (tel55Digitado) {
                const c = await cadastrarClienteBalcao({ nome: formData.cliente_nome, telefone: tel55Digitado, unidade: storeToUnidade(activeBarber.store), barbeiro: activeBarber.name })
                clienteId = c.cliente_id
            }

            // Registrar cliente de vale se for venda de vale
            if (formData.tipo === 'venda_vale') {
                const valorTotal = parseFloat(formData.valor_bruto)
                const valorPorUso = parseFloat((valorTotal / 4).toFixed(2))
                const clientRef = doc(db, 'clientes_vale', formData.cliente_nome.toLowerCase().trim())
                await setDoc(clientRef, {
                    nome: formData.cliente_nome.trim(),
                    cliente_id: clienteId,
                    valor_por_uso: valorPorUso,
                    valor_total: valorTotal,
                    updated_at: serverTimestamp()
                }, { merge: true })
            }

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
                cliente_id: clienteId,
                agendamento_id: agendamentoSel?.agendamento_id || null,
                barbeiro_agendado: agendamentoSel?.barbeiro_agendado || null,
                subscriber_code: formData.subscriber_code || null,
                created_at: serverTimestamp(),
                ...(isRenovacao ? { plano: selectedPlan.label, status_celcoin: 'pendente' } : {})
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
            } else if (splitPayment && (formData.tipo === 'servico' || formData.tipo === 'produto')) {
                const valorTotal = parseFloat(formData.valor_bruto)
                const valor1 = parseFloat(splitValor1)
                if (isNaN(valor1) || valor1 <= 0 || valor1 >= valorTotal) {
                    return alert(`Valor da 1ª forma deve ser maior que 0 e menor que o total (R$ ${valorTotal.toFixed(2)}).`)
                }
                if (formData.forma_pagamento === splitForma2) {
                    return alert('As duas formas de pagamento devem ser diferentes.')
                }
                const valor2 = parseFloat((valorTotal - valor1).toFixed(2))
                const comissao1 = calcComissao(valor1, formData.forma_pagamento, formData.tipo)
                const comissao2 = calcComissao(valor2, splitForma2, formData.tipo)

                await addDoc(collection(db, 'lancamentos'), {
                    ...baseEntry,
                    servico_descricao: formData.servico_descricao,
                    valor_bruto: valor1,
                    forma_pagamento: formData.forma_pagamento,
                    comissao_barbeiro: comissao1,
                    tipo: formData.tipo
                })
                await addDoc(collection(db, 'lancamentos'), {
                    ...baseEntry,
                    servico_descricao: formData.servico_descricao,
                    valor_bruto: valor2,
                    forma_pagamento: splitForma2,
                    comissao_barbeiro: comissao2,
                    tipo: formData.tipo
                })

                alert(`2 lançamentos salvos para ${activeBarber.name}!\n• R$ ${valor1.toFixed(2)} (${formData.forma_pagamento})\n• R$ ${valor2.toFixed(2)} (${splitForma2})`)
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

            // Assinante de balcão: o servidor grava assinantes/{telefone} e avisa o Make
            // (Celcoin nunca muda; Abacatepay só admin renova)
            if (formData.tipo === 'venda_assinatura' && clienteId) {
                try {
                    const r = await chamarFuncao('venderAssinaturaBalcao', {
                        cliente_id: clienteId,
                        nome: formData.cliente_nome.trim(),
                        plano: selectedPlan.label,
                        plano_id: selectedPlan.id,
                        valor: parseFloat(formData.valor_bruto),
                        barbeiro: activeBarber.name,
                        loja: activeBarber.store,
                        forma_pagamento: formData.forma_pagamento,
                    })
                    if (r.resultado === 'bloqueado') {
                        alert(`Lançamento salvo, mas o cadastro de assinante NÃO foi alterado: este cliente é assinante ${r.origem}. Avise o Adriano.`)
                    }
                } catch (err) {
                    console.error('venderAssinaturaBalcao:', err)
                    alert('Lançamento salvo, mas o cadastro de assinante não foi atualizado: ' + err.message + '. Avise o Adriano.')
                }
            }

            // Make.com — compra ou uso de vale presente (o servidor inclui o telefone)
            if (formData.tipo === 'venda_vale' || formData.forma_pagamento === 'Vale Presente') {
                const webhookData = {
                    evento: formData.tipo === 'venda_vale' ? 'compra_vale' : 'uso_vale',
                    cliente_id: clienteId,
                    cliente_nome: formData.cliente_nome.trim(),
                    valor: parseFloat(formData.valor_bruto),
                    barbeiro: activeBarber.name,
                    loja: activeBarber.store,
                }
                // Adicionar info extra para cada tipo
                if (formData.tipo === 'venda_vale') {
                    webhookData.valor_pacote = parseFloat(formData.valor_bruto)
                    webhookData.valor_por_visita = parseFloat((parseFloat(formData.valor_bruto) / 4).toFixed(2))
                    webhookData.creditos = 4
                }
                if (formData.forma_pagamento === 'Vale Presente') {
                    webhookData.saldo_restante = (voucherBalance || 0) - 1
                    webhookData.servico = formData.servico_descricao
                }
                chamarFuncao('notificarVale', webhookData).catch(err => console.error('notificarVale:', err))
            }

            setFormData({ ...formData, servico_descricao: '', valor_bruto: '', data_manual: '', cliente_nome: '', cliente_id: '', cliente_telefone: '', subscriber_code: '' })
            setSelectedPresets([])
            setShowCustomDesc(false)
            setVoucherBalance(null)
            setSelectedPlan(null)
            setAgendamentoSel(null)
            setSplitPayment(false)
            setSplitValor1('')
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
                                    {BARBERS.filter(b => !b.inactive).map(b => (
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
                            {/* Se é uso de vale, venda de vale ou venda de assinatura, mostrar descrição travada */}
                            {(formData.forma_pagamento === 'Vale Presente' && voucherValorPorUso) || formData.tipo === 'venda_vale' || isAssinVenda ? (
                                <div className={`${isAssinVenda ? 'bg-purple-950/20 border-purple-700/50' : formData.tipo === 'venda_vale' ? 'bg-cyan-950/20 border-cyan-700/50' : 'bg-pink-950/20 border-pink-700/50'} border rounded-lg px-4 py-3`}>
                                    <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${isAssinVenda ? 'text-purple-400' : formData.tipo === 'venda_vale' ? 'text-cyan-400' : 'text-pink-400'}`}>
                                        {isRenovacao ? 'Renovação de assinante Celcoin' : formData.tipo === 'venda_assinatura' ? 'Venda de Assinatura' : formData.tipo === 'venda_vale' ? 'Venda de Pacote Vale Presente' : 'Serviço do Vale Presente'}
                                    </div>
                                    <div className="text-sm text-gray-200">
                                        {formData.servico_descricao || (isRenovacao ? 'Renovação assinatura Celcoin' : formData.tipo === 'venda_assinatura' ? 'Venda de assinatura' : formData.tipo === 'venda_vale' ? 'Compra de pacote' : 'Uso Vale Presente')}
                                    </div>
                                </div>
                            ) : (
                                <>
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
                                </>
                            )}
                        </div>

                        {/* Custom description (only when "Outro" selected and NOT vale usage) */}
                        {showCustomDesc && !(formData.forma_pagamento === 'Vale Presente' && voucherValorPorUso) && formData.tipo !== 'venda_vale' && !isAssinVenda && (
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
                                    <label className="block text-xs text-gray-500 mb-1">
                                        Valor (R$)
                                        {formData.forma_pagamento === 'Vale Presente' && voucherValorPorUso && (
                                            <span className="text-pink-400 ml-1">(fixo pelo vale)</span>
                                        )}
                                    </label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-3 top-2.5 text-gray-500" size={16} />
                                        <input type="number" step="0.01"
                                            className={`w-full bg-gray-950 border rounded-lg py-2.5 pl-9 pr-3 text-gray-200 outline-none text-lg font-bold ${formData.forma_pagamento === 'Vale Presente' && voucherValorPorUso ? 'border-pink-700/50 bg-pink-950/20 cursor-not-allowed' : 'border-gray-800 focus:border-cyan-500'}`}
                                            value={formData.valor_bruto}
                                            onChange={e => setFormData({ ...formData, valor_bruto: e.target.value })}
                                            readOnly={formData.forma_pagamento === 'Vale Presente' && !!voucherValorPorUso}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                                    <select
                                        className={`w-full bg-gray-950 border rounded-lg py-2.5 px-3 text-gray-200 outline-none ${formData.forma_pagamento === 'Vale Presente' && voucherValorPorUso ? 'border-pink-700/50 bg-pink-950/20 cursor-not-allowed' : 'border-gray-800 focus:border-cyan-500'}`}
                                        value={formData.tipo}
                                        onChange={e => {
                                            const newTipo = e.target.value
                                            if (newTipo === 'venda_vale') {
                                                setSelectedPresets([])
                                                setShowCustomDesc(false)
                                                setFormData({ ...formData, tipo: newTipo, servico_descricao: 'Compra de pacote' })
                                            } else if (newTipo === 'venda_assinatura' || newTipo === 'renovacao_celcoin') {
                                                setSelectedPresets([])
                                                setShowCustomDesc(false)
                                                setSelectedPlan(null)
                                                setFormData({ ...formData, tipo: newTipo, servico_descricao: newTipo === 'renovacao_celcoin' ? 'Renovação assinatura Celcoin' : 'Venda de assinatura', valor_bruto: '' })
                                            } else {
                                                setSelectedPlan(null)
                                                setFormData({ ...formData, tipo: newTipo, servico_descricao: newTipo === 'servico' ? '' : formData.servico_descricao })
                                            }
                                        }}
                                        disabled={formData.forma_pagamento === 'Vale Presente' && !!voucherValorPorUso}
                                    >
                                        <option value="servico">Servico</option>
                                        <option value="produto">Produto</option>
                                        <option value="venda_vale">Venda Vale Presente</option>
                                        <option value="venda_assinatura">Venda Assinatura</option>
                                        <option value="renovacao_celcoin">Renovação assinante Celcoin</option>
                                    </select>
                                </div>
                            </div>

                            {/* Captura de Telefone (para Venda de Vale e Venda de Assinatura) */}
                            {(formData.tipo === 'venda_vale' || isAssinVenda) && (
                                <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                                    <label className="block text-xs text-cyan-400 font-bold uppercase tracking-wider">
                                        Telefone do Cliente {formData.cliente_id ? '(cliente já selecionado na lista)' : '(Obrigatório)'}
                                    </label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-2.5 text-cyan-600" size={16} />
                                        <input
                                            placeholder="(00) 00000-0000"
                                            className="w-full bg-gray-950 border border-cyan-900/50 rounded-lg py-2.5 pl-10 pr-3 text-gray-200 outline-none focus:border-cyan-500"
                                            value={formData.cliente_telefone}
                                            onChange={e => setFormData({ ...formData, cliente_telefone: e.target.value })}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Seleção de Plano (apenas para Venda de Assinatura) */}
                            {isAssinVenda && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                    <label className="block text-xs text-purple-400 font-bold uppercase tracking-wider">Plano</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {SUBSCRIPTION_PLANS.map(plan => (
                                            <button
                                                key={plan.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedPlan(plan)
                                                    setFormData({ ...formData, valor_bruto: plan.value.toString(), servico_descricao: `${isRenovacao ? 'Renovação assinatura Celcoin' : 'Venda de assinatura'} - ${plan.label}` })
                                                }}
                                                className={`py-3 px-3 rounded-lg text-sm font-bold transition-all active:scale-95 ${selectedPlan?.id === plan.id
                                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/30 ring-1 ring-purple-400/30'
                                                    : 'bg-gray-950 border border-gray-800 text-gray-300 hover:border-purple-600'
                                                }`}
                                            >
                                                <div>{plan.label}</div>
                                                <div className={`text-xs mt-0.5 ${selectedPlan?.id === plan.id ? 'text-purple-200' : 'text-gray-600'}`}>R$ {plan.value}/mês</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Client Name */}
                            {(() => {
                                const isAssinante = formData.forma_pagamento === 'Assinante'
                                const planos = selectedPresets.filter(p => p.label.includes('plano'))
                                const avulsos = selectedPresets.filter(p => !p.label.includes('plano'))
                                const isMixed = planos.length > 0 && avulsos.length > 0
                                const needsSubscriber = isAssinante || isMixed

                                if (needsSubscriber) {
                                    const filtered = subscribers.filter(s =>
                                        s.status === 'ativo' &&
                                        s.name.toLowerCase().includes(subscriberSearch.toLowerCase())
                                    )
                                    const activeCount = subscribers.filter(s => s.status === 'ativo').length
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
                                                        onClick={() => { setFormData({ ...formData, cliente_nome: '', cliente_id: '', cliente_telefone: '', subscriber_code: '' }); setSubscriberSearch('') }}
                                                        className="text-gray-500 hover:text-red-400 text-xs px-2 py-0.5 rounded bg-gray-800 hover:bg-red-900/30 transition-colors"
                                                    >trocar</button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="relative">
                                                        <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
                                                        <input
                                                            placeholder={`Buscar assinante (${activeCount} ativos)`}
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
                                                                            setFormData({ ...formData, cliente_nome: sub.name, cliente_id: sub.cliente_id || '', cliente_telefone: '', subscriber_code: sub.code || '' })
                                                                            setSubscriberSearch('')
                                                                            setShowSubscriberDropdown(false)
                                                                        }}
                                                                        className="w-full text-left px-3 py-2 hover:bg-purple-900/20 transition-colors flex items-center justify-between gap-2 border-b border-gray-800/50 last:border-0"
                                                                    >
                                                                        <span className="text-sm text-gray-200 truncate">{sub.name} {sub.code && <span className="text-gray-600">#{sub.code}</span>}</span>
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

                                if (formData.forma_pagamento === 'Vale Presente') {
                                    const filtered = voucherClients.filter(c =>
                                        c.nome.toLowerCase().includes(voucherSearch.toLowerCase())
                                    )
                                    return (
                                        <div className="relative">
                                            <label className="block text-xs text-gray-500 mb-1 flex items-center justify-between">
                                                <div className="flex items-center gap-1">
                                                    <CreditCard size={12} className="text-pink-400" />
                                                    Cliente Vale <span className="text-red-400">*</span>
                                                </div>
                                                {voucherBalance !== null && (
                                                    <span className={`font-bold ${voucherBalance > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                        {fetchingBalance ? '...' : `Saldo: ${voucherBalance} usos`}
                                                    </span>
                                                )}
                                            </label>
                                            {formData.cliente_nome ? (
                                                <div className="flex items-center gap-2 bg-pink-900/20 border border-pink-700/50 rounded-lg py-2 px-3">
                                                    <div className="flex-1">
                                                        <div className="text-pink-300 text-sm font-bold">{formData.cliente_nome}</div>
                                                    </div>
                                                    <button type="button"
                                                        onClick={() => {
                                                            setFormData({ ...formData, cliente_nome: '', cliente_id: '', cliente_telefone: '', valor_bruto: '' })
                                                            setVoucherSearch('')
                                                            setVoucherBalance(null)
                                                            setVoucherValorPorUso(null)
                                                        }}
                                                        className="text-gray-500 hover:text-red-400 text-xs px-2 py-0.5 rounded bg-gray-800 hover:bg-red-900/30 transition-colors"
                                                    >trocar</button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="relative">
                                                        <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
                                                        <input
                                                            placeholder="Buscar cliente do vale..."
                                                            className="w-full bg-gray-950 border border-pink-700/50 rounded-lg py-2 pl-8 pr-3 text-gray-200 outline-none focus:border-pink-500 text-sm"
                                                            value={voucherSearch}
                                                            onChange={e => { setVoucherSearch(e.target.value); setShowVoucherDropdown(true) }}
                                                            onFocus={() => setShowVoucherDropdown(true)}
                                                        />
                                                    </div>
                                                    {showVoucherDropdown && (
                                                        <div className="absolute z-50 w-full mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
                                                            {filtered.length === 0 ? (
                                                                <div className="px-3 py-4 text-center">
                                                                    <p className="text-gray-500 text-xs mb-2">Nenhum cliente de vale encontrado</p>
                                                                    {voucherSearch && (
                                                                        <button type="button"
                                                                            onClick={() => {
                                                                                setFormData({ ...formData, cliente_nome: voucherSearch })
                                                                                setShowVoucherDropdown(false)
                                                                            }}
                                                                            className="text-[10px] bg-gray-800 text-gray-300 px-2 py-1 rounded hover:bg-gray-700"
                                                                        >Usar "{voucherSearch}" (avulso)</button>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                filtered.map((cl, i) => (
                                                                    <button type="button" key={i}
                                                                        onClick={() => {
                                                                            setFormData({ ...formData, cliente_nome: cl.nome, cliente_id: cl.cliente_id || '', cliente_telefone: '' })
                                                                            setVoucherSearch('')
                                                                            setShowVoucherDropdown(false)
                                                                        }}
                                                                        className="w-full text-left px-3 py-2 hover:bg-pink-900/20 transition-colors flex items-center justify-between gap-2 border-b border-gray-800/50 last:border-0"
                                                                    >
                                                                        <div>
                                                                            <div className="text-sm text-gray-200 font-medium">{cl.nome}</div>
                                                                        </div>
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
                                    <ClientePicker
                                        value={formData.cliente_nome ? { nome: formData.cliente_nome, cliente_id: formData.cliente_id } : null}
                                        unidade={storeToUnidade(activeBarber?.store)}
                                        barbeiroNome={activeBarber?.name}
                                        hoje={today}
                                        onChange={c => {
                                            setFormData({ ...formData, cliente_nome: c?.nome || '', cliente_id: c?.cliente_id || '', cliente_telefone: '' })
                                            setAgendamentoSel(c?.agendamento_id ? c : null)
                                        }}
                                    />
                                )
                            })()}

                            {clienteInfo?.status_assinatura === 'cancelada' && (
                                <div className="text-sm font-bold text-red-200 bg-red-900/50 border border-red-700 rounded-lg px-3 py-2">
                                    Assinatura CANCELADA: cobrar como avulso
                                </div>
                            )}
                            {clienteInfo?.status_assinatura === 'pagamento_recusado' && (
                                <div className="text-sm font-bold text-yellow-200 bg-yellow-900/40 border border-yellow-700 rounded-lg px-3 py-2">
                                    Pagamento da assinatura recusado: falar com o Adriano antes de atender como assinante
                                </div>
                            )}
                            {formData.tipo === 'venda_assinatura' && clienteInfo?.celcoin && (
                                <div className="text-sm font-bold text-purple-200 bg-purple-900/40 border border-purple-700 rounded-lg px-3 py-2">
                                    Cliente da Celcoin: use Renovação assinante Celcoin
                                </div>
                            )}

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
                                                    const noPlano = planos.length === 0
                                                    const isVendaVale = formData.tipo === 'venda_vale'
                                                    const isVendaAssinatura = isAssinVenda
                                                    const isVendaEspecial = isVendaVale || isVendaAssinatura
                                                    const disabled = (onlyPlano && pm !== 'Assinante') || (isMixed && (pm === 'Assinante' || pm === 'Vale Presente')) || (noPlano && pm === 'Assinante') || (isVendaEspecial && (pm === 'Vale Presente' || pm === 'Assinante'))
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

                            {/* Split Payment */}
                            {(formData.tipo === 'servico' || formData.tipo === 'produto') &&
                             formData.forma_pagamento !== 'Vale Presente' &&
                             formData.forma_pagamento !== 'Assinante' &&
                             selectedPresets.filter(p => p.label.includes('plano')).length === 0 && (
                                <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={splitPayment}
                                            onChange={e => {
                                                setSplitPayment(e.target.checked)
                                                if (e.target.checked && formData.valor_bruto) {
                                                    const half = (parseFloat(formData.valor_bruto) / 2).toFixed(2)
                                                    setSplitValor1(half)
                                                }
                                            }}
                                            className="w-4 h-4 accent-cyan-500"
                                        />
                                        <span className="text-xs text-gray-300 font-semibold uppercase tracking-wider">Mesclar forma de pagamento</span>
                                    </label>
                                    {splitPayment && (
                                        <div className="space-y-2 pt-1">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="block text-[10px] text-gray-500 mb-1">Valor em {formData.forma_pagamento}</label>
                                                    <input type="number" step="0.01"
                                                        className="w-full bg-gray-900 border border-gray-800 rounded-lg py-2 px-2 text-gray-200 outline-none focus:border-cyan-500 text-sm"
                                                        value={splitValor1}
                                                        onChange={e => setSplitValor1(e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] text-gray-500 mb-1">Restante</label>
                                                    <div className="w-full bg-gray-900 border border-gray-800 rounded-lg py-2 px-2 text-gray-400 text-sm">
                                                        {formData.valor_bruto && splitValor1
                                                            ? `R$ ${(parseFloat(formData.valor_bruto) - parseFloat(splitValor1 || 0)).toFixed(2)}`
                                                            : '—'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-1">2ª forma de pagamento</label>
                                                <div className="grid grid-cols-4 gap-1.5">
                                                    {['Dinheiro', 'Pix', 'Crédito', 'Débito'].filter(pm => pm !== formData.forma_pagamento).map(pm => (
                                                        <button type="button" key={pm}
                                                            onClick={() => setSplitForma2(pm)}
                                                            className={`text-xs py-2 px-1 rounded-lg border transition-all ${splitForma2 === pm
                                                                ? 'bg-cyan-900/40 border-cyan-500 text-cyan-400 font-bold'
                                                                : 'bg-gray-900 border-gray-800 text-gray-400'}`}
                                                        >
                                                            {pm}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

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

                                    // Determinar se pode editar/excluir (apenas Admin pode editar passado, outros apenas o dia atual)
                                    const launchDateStr = new Date(item.data.seconds * 1000).toISOString().split('T')[0];
                                    const canEditDelete = isAdmin || launchDateStr === today;

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
                                            {canEditDelete && (
                                                <div className="flex gap-1 ml-2">
                                                    <button onClick={() => openEditLaunch(item)} type="button" className="text-gray-500 hover:text-cyan-400 p-1 rounded hover:bg-gray-800 transition-colors">
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button onClick={() => handleDeleteLaunch(item.id)} type="button" className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-gray-800 transition-colors">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            )}
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
                    {/* Date Selector */}
                    <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl p-2">
                        <button
                            onClick={() => {
                                const d = new Date(panelTargetDate)
                                d.setDate(d.getDate() - 1)
                                setPanelDate(d.toISOString().split('T')[0])
                            }}
                            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <input
                            type="date"
                            className="flex-1 bg-gray-950 border border-gray-800 rounded-lg py-2 px-3 text-gray-200 text-center text-sm outline-none focus:border-cyan-500 scheme-dark"
                            value={panelTargetDate}
                            max={today}
                            onChange={e => setPanelDate(e.target.value)}
                        />
                        <button
                            onClick={() => {
                                if (panelTargetDate < today) {
                                    const d = new Date(panelTargetDate)
                                    d.setDate(d.getDate() + 1)
                                    const next = d.toISOString().split('T')[0]
                                    setPanelDate(next > today ? '' : next)
                                }
                            }}
                            disabled={panelTargetDate >= today}
                            className={`p-2 rounded-lg transition-colors ${panelTargetDate >= today ? 'bg-gray-800/50 text-gray-600 cursor-not-allowed' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}
                        >
                            <ChevronRight size={18} />
                        </button>
                        {panelDate && (
                            <button
                                onClick={() => setPanelDate('')}
                                className="text-xs text-cyan-400 hover:text-cyan-300 px-2 py-1 whitespace-nowrap"
                            >
                                Hoje
                            </button>
                        )}
                    </div>

                    {activeBarber && (
                        <BarberDailyView
                            key={activeBarber.id + panelTargetDate}
                            barberId={activeBarber.id}
                            barberName={activeBarber.name}
                            isAdmin={isAdmin}
                            selectedDate={panelTargetDate}
                            stats={stats}
                            statsLoading={statsLoading}
                            dynamicGoal={dynamicGoal}
                            isViewingPast={panelTargetDate < today}
                        />
                    )}
                    <BarberRanking currentBarberId={activeBarber?.id} />
                </div>
            )}

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
                            <button onClick={() => setDeleteConfirmation(null)} type="button"
                                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-2.5 rounded-xl">Cancelar</button>
                            <button onClick={executeDeletion} disabled={loading} type="button"
                                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl disabled:opacity-50">
                                {loading ? 'Excluindo...' : 'Sim, Excluir'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editingLaunch && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
                        <div className="bg-gradient-to-r from-cyan-900/20 to-gray-900 p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <Pencil size={18} className="text-cyan-400" /> Editar Lançamento
                            </h3>
                            <button onClick={() => setEditingLaunch(null)} type="button" className="text-gray-500 hover:text-white p-1">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Descrição</label>
                                <input type="text"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500"
                                    value={editForm.servico_descricao}
                                    onChange={e => setEditForm(prev => ({ ...prev, servico_descricao: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Cliente</label>
                                <input type="text"
                                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500"
                                    value={editForm.cliente_nome}
                                    onChange={e => setEditForm(prev => ({ ...prev, cliente_nome: e.target.value }))}
                                />
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Valor Bruto</label>
                                    <input type="number" step="0.01"
                                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500"
                                        value={editForm.valor_bruto}
                                        onChange={e => setEditForm(prev => ({ ...prev, valor_bruto: e.target.value }))}
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Pagamento</label>
                                    <select
                                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan-500"
                                        value={editForm.forma_pagamento}
                                        onChange={e => setEditForm(prev => ({ ...prev, forma_pagamento: e.target.value }))}
                                    >
                                        <option value="Dinheiro">Dinheiro</option>
                                        <option value="Pix">Pix</option>
                                        <option value="Crédito">Crédito</option>
                                        <option value="Débito">Débito</option>
                                        <option value="Vale Presente">Vale Presente</option>
                                        <option value="Assinante">Assinante</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-800 bg-gray-900">
                            <button onClick={executeEditLaunch} disabled={loading} type="button"
                                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 rounded-xl shadow-lg disabled:opacity-50">
                                {loading ? 'Salvando...' : 'Salvar Alterações'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
