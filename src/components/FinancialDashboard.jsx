import { useState, useEffect, useMemo } from 'react'
import { db, collection, query, where, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, onSnapshot } from '../firebase'
import { Timestamp } from 'firebase/firestore'
import { DollarSign, TrendingUp, TrendingDown, Wallet, Calendar, Copy, Trash2, PlusCircle, CheckCircle, Clock, Download, Store, CreditCard, Banknote, Smartphone, ChevronDown, ChevronUp, Minus, Plus, Equal } from 'lucide-react'
import { BARBERS, STORES } from '../data/barbers'

// ==========================================
// CONSTANTES
// ==========================================

const fmt = (val) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const DRE_CATEGORIES = [
    { id: 'imposto', label: 'Imposto', group: 'impostos' },
    { id: 'despesa_venda', label: 'Despesa de Venda', group: 'despesas_venda' },
    { id: 'despesa_operacional', label: 'Despesa Operacional', group: 'despesas_operacionais' },
    { id: 'receita_celcoin', label: 'Receita - Assinatura Celcoin', group: 'receita_vendas' },
    { id: 'receita_diversa', label: 'Receita Diversa', group: 'diversas' },
    { id: 'despesa_diversa', label: 'Despesa Diversa', group: 'diversas' }
]

const SUB_CATEGORIES = {
    imposto: ['DAS', 'ICMS', 'ISSQN', 'Outros impostos'],
    despesa_venda: ['Custo produto vendido', 'Frete'],
    despesa_operacional: [
        'Aluguel', 'Água', 'Luz', 'Internet', 'Salário', 'Pró-labore',
        'Contador', 'Marketing', 'App Booksy', 'TV a cabo', 'Sistema gestão',
        'FGTS', 'INSS', 'Material de consumo', 'Material de adm',
        'Manutenção e reformas', 'Custo dos produtos utilizados'
    ],
    receita_celcoin: ['Assinatura mensal', 'Assinatura trimestral', 'Assinatura semestral', 'Assinatura anual'],
    receita_diversa: ['Rendimento financeiro', 'Outras receitas'],
    despesa_diversa: ['Tarifas bancárias', 'Juros e multas', 'Outras despesas']
}

const STORE_OPTIONS = [
    { id: 'loja01', label: 'Loja 01' },
    { id: 'loja02', label: 'Loja 02' },
    { id: 'global', label: 'Global (ambas)' }
]

const STATUS_OPTIONS = [
    { id: 'pago', label: 'Pago', color: 'green' },
    { id: 'pendente', label: 'Pendente', color: 'yellow' },
    { id: 'provisionado', label: 'Provisionado', color: 'blue' }
]

// Helpers de classificação (mesma lógica do ReportsDashboard)
const isFinancial = (item) => ['adiantamento', 'fechamento_comissao'].includes(item.tipo)
const isNonCashRevenue = (item) => ['Assinante', 'Vale Presente'].includes(item.forma_pagamento)
const isService = (item) => !isFinancial(item)
const isRevenue = (item) => !isFinancial(item) && !isNonCashRevenue(item)

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export function FinancialDashboard() {
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
    const [loading, setLoading] = useState(true)
    const [revenueData, setRevenueData] = useState([])
    const [financialData, setFinancialData] = useState([])
    const [movementsData, setMovementsData] = useState([])
    const [activeTab, setActiveTab] = useState('consolidado')
    const [processing, setProcessing] = useState(false)
    const [deleteId, setDeleteId] = useState(null)
    const [deleteCollection, setDeleteCollection] = useState('financeiro')

    // Form
    const [newEntry, setNewEntry] = useState({
        description: '',
        amount: '',
        store_id: 'loja01',
        finance_category: 'despesa_operacional',
        status: 'pago',
        date: new Date().toISOString().slice(0, 10),
        competence_month: new Date().toISOString().slice(0, 7)
    })

    // Movimentações de Capital
    const [newMovement, setNewMovement] = useState({
        description: '',
        amount: '',
        movement_type: 'entrada',
        status: 'pago',
        date: new Date().toISOString().slice(0, 10)
    })
    const [processingMovement, setProcessingMovement] = useState(false)
    const [deleteMovementId, setDeleteMovementId] = useState(null)

    // ==========================================
    // DATA LISTENERS
    // ==========================================

    useEffect(() => {
        setLoading(true)
        const [y, m] = month.split('-')
        const start = new Date(y, m - 1, 1)
        const end = new Date(y, m, 0, 23, 59, 59)

        // 1. Lancamentos (receitas + comissões automáticas)
        const revenueQ = query(
            collection(db, 'lancamentos'),
            where('data', '>=', Timestamp.fromDate(start)),
            where('data', '<=', Timestamp.fromDate(end))
        )
        const unsubRevenue = onSnapshot(revenueQ, (snapshot) => {
            setRevenueData(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
            setLoading(false)
        }, (err) => { console.error("Revenue error:", err); setLoading(false) })

        // 2. Financeiro (lançamentos manuais)
        const financeQ = query(collection(db, 'financeiro'))
        const unsubFinance = onSnapshot(financeQ, (snapshot) => {
            const docs = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(d => d.competence_month === month || (d.date >= month + '-01' && d.date <= month + '-31'))
            setFinancialData(docs.sort((a, b) => (b.date || '').localeCompare(a.date || '')))
        })

        // 3. Movimentações de Capital
        const movementQ = query(collection(db, 'movimentacoes'))
        const unsubMovements = onSnapshot(movementQ, (snapshot) => {
            const docs = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(d => d.date >= month + '-01' && d.date <= month + '-31')
            setMovementsData(docs.sort((a, b) => (b.date || '').localeCompare(a.date || '')))
        })

        return () => { unsubRevenue(); unsubFinance(); unsubMovements() }
    }, [month])

    // ==========================================
    // DRE CALCULATIONS
    // ==========================================

    const dre = useMemo(() => {
        const normalizeStore = (d) => {
            const barber = BARBERS.find(b => b.id === d.barbeiro_id)
            const store = barber?.store || d.loja_id || 'loja-01'
            return store.replace('loja-', 'loja').replace('-', '')
        }

        const calcStore = (storeFilter) => {
            // Filter lancamentos by store
            const storeLanc = storeFilter === 'consolidado'
                ? revenueData
                : revenueData.filter(d => normalizeStore(d) === storeFilter)

            const services = storeLanc.filter(d => isService(d))
            const revenueItems = storeLanc.filter(d => isRevenue(d))

            // storeFinance (mover antes da receita para usar com Celcoin)
            const storeFinance = storeFilter === 'consolidado'
                ? financialData
                : financialData.filter(d => d.store_id === storeFilter || d.store_id === 'global')

            // (+) Receita de Vendas (4 sub-linhas + Celcoin manual)
            const vendaServico = revenueItems
                .filter(d => d.tipo === 'servico' || !d.tipo)
                .reduce((s, d) => s + (parseFloat(d.valor_bruto) || 0), 0)
            const vendaAssinaturaLoja = revenueItems
                .filter(d => d.tipo === 'venda_assinatura')
                .reduce((s, d) => s + (parseFloat(d.valor_bruto) || 0), 0)
            const vendaCelcoin = storeFinance
                .filter(d => d.finance_category === 'receita_celcoin' && d.status !== 'provisionado')
                .reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
            const vendaAssinaturas = vendaAssinaturaLoja + vendaCelcoin
            const vendaVale = revenueItems
                .filter(d => d.tipo === 'venda_vale')
                .reduce((s, d) => s + (parseFloat(d.valor_bruto) || 0), 0)
            const vendaProduto = revenueItems
                .filter(d => d.tipo === 'produto')
                .reduce((s, d) => s + (parseFloat(d.valor_bruto) || 0), 0)
            const receitaVendas = vendaServico + vendaAssinaturas + vendaVale + vendaProduto

            // (-) Impostos (manual)
            const impostos = storeFinance
                .filter(d => d.finance_category === 'imposto' && d.status !== 'provisionado')
                .reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
            const impostosDetail = storeFinance
                .filter(d => d.finance_category === 'imposto' && d.status !== 'provisionado')

            // (=) Receita Líquida
            const receitaLiquida = receitaVendas - impostos

            // (-) Despesas de Vendas
            // Comissão de serviços com receita (din/pix/cartão) - só tipo servico
            const comissaoReceita = services
                .filter(d => d.tipo === 'servico' || !d.tipo)
                .filter(d => !isNonCashRevenue(d))
                .reduce((s, d) => s + (parseFloat(d.comissao_barbeiro) || 0), 0)
            // Comissão de serviços assinante/vale - só tipo servico
            const comissaoAssinVale = services
                .filter(d => d.tipo === 'servico' || !d.tipo)
                .filter(d => isNonCashRevenue(d))
                .reduce((s, d) => s + (parseFloat(d.comissao_barbeiro) || 0), 0)
            // Comissão de produtos (R$5 fixo por venda)
            const comissaoProduto = services
                .filter(d => d.tipo === 'produto')
                .reduce((s, d) => {
                    const com = parseFloat(d.comissao_barbeiro) || 0
                    return s + (com > 0 ? com : 5)
                }, 0)
            // Taxa cartão (automático)
            const taxaCartao = revenueItems.reduce((s, d) => {
                const pm = d.forma_pagamento?.toLowerCase() || ''
                const val = parseFloat(d.valor_bruto) || 0
                if (pm.includes('crédit') || pm.includes('credit') || pm === 'crédito' || pm === 'credito') return s + val * 0.05
                if (pm.includes('débit') || pm.includes('debit') || pm === 'débito' || pm === 'debito') return s + val * 0.02
                return s
            }, 0)
            // Despesas de venda manuais
            const despVendaManual = storeFinance
                .filter(d => d.finance_category === 'despesa_venda' && d.status !== 'provisionado')
                .reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
            const despVendaManualDetail = storeFinance
                .filter(d => d.finance_category === 'despesa_venda' && d.status !== 'provisionado')

            const totalDespVenda = comissaoReceita + comissaoAssinVale + comissaoProduto + taxaCartao + despVendaManual

            // (=) Lucro Bruto
            const lucroBruto = receitaLiquida - totalDespVenda

            // (-) Despesas Operacionais (fixas - manual)
            const despOperacionais = storeFinance
                .filter(d => d.finance_category === 'despesa_operacional' && d.status !== 'provisionado')
                .reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
            const despOperacionaisDetail = storeFinance
                .filter(d => d.finance_category === 'despesa_operacional' && d.status !== 'provisionado')

            // (=) Lucro Operacional
            const lucroOperacional = lucroBruto - despOperacionais

            // (+/-) Receitas/Despesas Diversas
            const receitasDiversas = storeFinance
                .filter(d => d.finance_category === 'receita_diversa' && d.status !== 'provisionado')
                .reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
            const despesasDiversas = storeFinance
                .filter(d => d.finance_category === 'despesa_diversa' && d.status !== 'provisionado')
                .reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
            const diversasDetail = storeFinance
                .filter(d => (d.finance_category === 'receita_diversa' || d.finance_category === 'despesa_diversa') && d.status !== 'provisionado')

            const saldoDiversas = receitasDiversas - despesasDiversas

            // (=) Lucro/Prejuízo Final
            const lucroFinal = lucroOperacional + saldoDiversas

            return {
                vendaServico, vendaAssinaturas, vendaVale, vendaProduto, vendaCelcoin, receitaVendas,
                impostos, impostosDetail,
                receitaLiquida,
                comissaoReceita, comissaoAssinVale, comissaoProduto, taxaCartao, despVendaManual, despVendaManualDetail, totalDespVenda,
                lucroBruto,
                despOperacionais, despOperacionaisDetail,
                lucroOperacional,
                receitasDiversas, despesasDiversas, diversasDetail, saldoDiversas,
                lucroFinal
            }
        }

        return {
            loja01: calcStore('loja01'),
            loja02: calcStore('loja02'),
            consolidado: calcStore('consolidado')
        }
    }, [revenueData, financialData])

    // Fluxo de Caixa
    const cashFlow = useMemo(() => {
        const calcCash = (storeFilter) => {
            const normalizeStore = (d) => {
                const barber = BARBERS.find(b => b.id === d.barbeiro_id)
                const store = barber?.store || d.loja_id || 'loja-01'
                return store.replace('loja-', 'loja').replace('-', '')
            }

            const storeLanc = storeFilter === 'consolidado'
                ? revenueData
                : revenueData.filter(d => normalizeStore(d) === storeFilter)

            const services = storeLanc.filter(d => isService(d))
            const revenueItems = storeLanc.filter(d => isRevenue(d))

            // Entradas imediatas (dinheiro + pix + débito)
            const dinheiro = revenueItems.filter(d => d.forma_pagamento?.toLowerCase().includes('dinheiro'))
                .reduce((s, d) => s + (parseFloat(d.valor_bruto) || 0), 0)
            const pix = revenueItems.filter(d => d.forma_pagamento?.toLowerCase().includes('pix'))
                .reduce((s, d) => s + (parseFloat(d.valor_bruto) || 0), 0)
            const debito = revenueItems.filter(d => {
                const pm = d.forma_pagamento?.toLowerCase() || ''
                return pm.includes('débit') || pm.includes('debit') || pm === 'débito' || pm === 'debito'
            }).reduce((s, d) => s + (parseFloat(d.valor_bruto) || 0), 0)

            // Crédito (antecipação já embutida no desconto - cai na conta na hora)
            const credito = revenueItems.filter(d => {
                const pm = d.forma_pagamento?.toLowerCase() || ''
                return pm.includes('crédit') || pm.includes('credit') || pm === 'crédito' || pm === 'credito'
            }).reduce((s, d) => s + (parseFloat(d.valor_bruto) || 0), 0)

            // Celcoin (entrada manual paga)
            const storeFinance = storeFilter === 'consolidado'
                ? financialData
                : financialData.filter(d => d.store_id === storeFilter || d.store_id === 'global')
            const celcoinPago = storeFinance
                .filter(d => d.finance_category === 'receita_celcoin' && d.status === 'pago')
                .reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)

            const totalEntradas = dinheiro + pix + debito + credito + celcoinPago

            // Saídas do mês
            const despesasManuais = storeFinance
                .filter(d => d.status === 'pago' && d.finance_category !== 'receita_diversa' && d.finance_category !== 'receita_celcoin')
                .reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)

            // Comissões automáticas (saída)
            const comissaoServicos = services
                .filter(d => d.tipo === 'servico' || !d.tipo)
                .reduce((s, d) => s + (parseFloat(d.comissao_barbeiro) || 0), 0)
            const comissaoProdutos = services
                .filter(d => d.tipo === 'produto')
                .reduce((s, d) => {
                    const com = parseFloat(d.comissao_barbeiro) || 0
                    return s + (com > 0 ? com : 5)
                }, 0)
            const comissaoTotal = comissaoServicos + comissaoProdutos

            // Taxa cartão automática (saída)
            const taxaCartao = revenueItems.reduce((s, d) => {
                const pm = d.forma_pagamento?.toLowerCase() || ''
                const val = parseFloat(d.valor_bruto) || 0
                if (pm.includes('crédit') || pm.includes('credit') || pm === 'crédito' || pm === 'credito') return s + val * 0.05
                if (pm.includes('débit') || pm.includes('debit') || pm === 'débito' || pm === 'debito') return s + val * 0.02
                return s
            }, 0)

            const totalSaidas = despesasManuais + comissaoTotal + taxaCartao

            return { dinheiro, pix, debito, credito, celcoinPago, totalEntradas, despesasManuais, comissaoTotal, taxaCartao, totalSaidas }
        }

        return {
            loja01: calcCash('loja01'),
            loja02: calcCash('loja02'),
            consolidado: calcCash('consolidado')
        }
    }, [revenueData, financialData])

    // Capital stats
    const capitalStats = useMemo(() => {
        const entradas = movementsData
            .filter(d => d.movement_type === 'entrada' && d.status === 'pago')
            .reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
        const saidas = movementsData
            .filter(d => d.movement_type === 'saida' && d.status === 'pago')
            .reduce((s, d) => s + (parseFloat(d.amount) || 0), 0)
        return { entradas, saidas, saldo: entradas - saidas }
    }, [movementsData])

    // ==========================================
    // HANDLERS
    // ==========================================

    const handleAddEntry = async () => {
        if (!newEntry.description || !newEntry.amount) return alert("Preencha descrição e valor.")
        setProcessing(true)
        try {
            const val = parseFloat(newEntry.amount.toString().replace(',', '.'))
            if (isNaN(val) || val <= 0) { alert("Valor inválido!"); setProcessing(false); return }

            await addDoc(collection(db, 'financeiro'), {
                description: newEntry.description,
                amount: val,
                store_id: newEntry.store_id,
                finance_category: newEntry.finance_category,
                status: newEntry.status,
                date: newEntry.date,
                competence_month: newEntry.competence_month,
                created_at: serverTimestamp()
            })
            setNewEntry({ ...newEntry, description: '', amount: '' })
        } catch (e) {
            alert("Erro: " + e.message)
        } finally {
            setProcessing(false)
        }
    }

    const handleAddMovement = async () => {
        if (!newMovement.description || !newMovement.amount) return alert("Preencha descrição e valor.")
        setProcessingMovement(true)
        try {
            const val = parseFloat(newMovement.amount.toString().replace(',', '.'))
            if (isNaN(val) || val <= 0) { alert("Valor inválido!"); setProcessingMovement(false); return }

            await addDoc(collection(db, 'movimentacoes'), {
                description: newMovement.description,
                amount: val,
                movement_type: newMovement.movement_type,
                store_id: 'global',
                source: 'manual',
                status: newMovement.status,
                date: newMovement.date,
                created_at: serverTimestamp()
            })
            setNewMovement({ ...newMovement, description: '', amount: '' })
        } catch (e) {
            alert("Erro: " + e.message)
        } finally {
            setProcessingMovement(false)
        }
    }

    const confirmDelete = (id, col = 'financeiro') => { setDeleteId(id); setDeleteCollection(col) }
    const executeDelete = async () => {
        if (!deleteId) return
        try { await deleteDoc(doc(db, deleteCollection, deleteId)); setDeleteId(null) }
        catch (e) { alert("Erro: " + e.message) }
    }

    const confirmDeleteMovement = (id) => setDeleteMovementId(id)
    const executeDeleteMovement = async () => {
        if (!deleteMovementId) return
        try { await deleteDoc(doc(db, 'movimentacoes', deleteMovementId)); setDeleteMovementId(null) }
        catch (e) { alert("Erro: " + e.message) }
    }

    const toggleStatus = async (item) => {
        const cycle = ['pago', 'pendente', 'provisionado']
        const next = cycle[(cycle.indexOf(item.status) + 1) % cycle.length]
        try { await updateDoc(doc(db, 'financeiro', item.id), { status: next }) }
        catch (e) { alert("Erro: " + e.message) }
    }

    const toggleMovementStatus = async (item) => {
        const cycle = ['pago', 'pendente', 'provisionado']
        const next = cycle[(cycle.indexOf(item.status || 'pago') + 1) % cycle.length]
        try { await updateDoc(doc(db, 'movimentacoes', item.id), { status: next }) }
        catch (e) { alert("Erro: " + e.message) }
    }

    // Export
    const handleExportAI = () => {
        const report = { period: month, dre: dre[activeTab], cashFlow: cashFlow[activeTab], entries: financialData }
        navigator.clipboard.writeText(JSON.stringify(report, null, 2))
        alert("Copiado para IA!")
    }

    const handleExportJSON = () => {
        const report = { metadata: { generated_at: new Date().toISOString(), period: month }, dre, cashFlow, entries: financialData, movements: movementsData }
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `financeiro_${month}.json`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    // ==========================================
    // RENDER
    // ==========================================

    const activeDre = dre[activeTab]
    const activeCash = cashFlow[activeTab]

    return (
        <div className="space-y-6 pb-20">
            {/* HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-900 p-4 rounded-2xl border border-gray-800">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Wallet className="text-cyan-500" size={22} /> Painel Financeiro
                    </h2>
                    <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-white text-sm" />
                </div>
                <div className="flex gap-2">
                    <button onClick={handleExportAI} className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg text-sm font-medium">
                        <Copy size={14} /> Copiar IA
                    </button>
                    <button onClick={handleExportJSON} className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-medium">
                        <Download size={14} /> JSON RAW
                    </button>
                </div>
            </div>

            {/* TABS */}
            <div className="flex gap-2">
                {[
                    { id: 'consolidado', label: 'Consolidado' },
                    { id: 'loja01', label: 'Loja 01' },
                    { id: 'loja02', label: 'Loja 02' }
                ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                            ? 'bg-cyan-600 text-white shadow-lg'
                            : 'bg-gray-900 text-gray-400 border border-gray-800 hover:text-gray-200'
                            }`}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* DRE */}
            {activeDre && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-800">
                        <h3 className="font-bold text-gray-200 flex items-center gap-2">
                            <TrendingUp size={18} className="text-cyan-500" /> DRE - Demonstrativo de Resultado
                        </h3>
                    </div>

                    <div className="divide-y divide-gray-800/50">
                        {/* (+) Receita de Vendas */}
                        <DreSection sign="+" label="Receita de Vendas" total={activeDre.receitaVendas} color="green">
                            <DreLine label="Venda de serviços" value={activeDre.vendaServico} auto />
                            <DreLine label="Venda de assinaturas" value={activeDre.vendaAssinaturas} auto />
                            <DreLine label="Venda de vale presente" value={activeDre.vendaVale} auto />
                            <DreLine label="Venda de produtos" value={activeDre.vendaProduto} auto />
                        </DreSection>

                        {/* (-) Impostos */}
                        <DreSection sign="-" label="Impostos" total={activeDre.impostos} color="red">
                            {activeDre.impostosDetail.map(d => (
                                <DreLine key={d.id} label={d.description} value={parseFloat(d.amount) || 0} />
                            ))}
                            {activeDre.impostosDetail.length === 0 && <DreLine label="Nenhum imposto lançado" value={0} muted />}
                        </DreSection>

                        {/* (=) Receita Líquida */}
                        <DreTotal label="Receita Líquida" value={activeDre.receitaLiquida} />

                        {/* (-) Despesas de Vendas */}
                        <DreSection sign="-" label="Despesas de Vendas" total={activeDre.totalDespVenda} color="red">
                            <DreLine label="Comissão (Din/Pix/Cartão)" value={activeDre.comissaoReceita} auto />
                            <DreLine label="Comissão (Assinante/Vale)" value={activeDre.comissaoAssinVale} auto />
                            <DreLine label="Comissão produtos (R$5/un)" value={activeDre.comissaoProduto} auto />
                            <DreLine label="Taxa de cartão" value={activeDre.taxaCartao} auto />
                            {activeDre.despVendaManualDetail.map(d => (
                                <DreLine key={d.id} label={d.description} value={parseFloat(d.amount) || 0} />
                            ))}
                        </DreSection>

                        {/* (=) Lucro Bruto */}
                        <DreTotal label="Lucro Bruto" value={activeDre.lucroBruto} />

                        {/* (-) Despesas Operacionais */}
                        <DreSection sign="-" label="Despesas Operacionais (fixas)" total={activeDre.despOperacionais} color="orange">
                            {activeDre.despOperacionaisDetail.map(d => (
                                <DreLine key={d.id} label={d.description} value={parseFloat(d.amount) || 0} />
                            ))}
                            {activeDre.despOperacionaisDetail.length === 0 && <DreLine label="Nenhuma despesa operacional" value={0} muted />}
                        </DreSection>

                        {/* (=) Lucro Operacional */}
                        <DreTotal label="Lucro Operacional" value={activeDre.lucroOperacional} highlight />

                        {/* (+/-) Receitas/Despesas Diversas */}
                        <DreSection sign="+/-" label="Receitas/Despesas Diversas" total={activeDre.saldoDiversas} color="blue">
                            {activeDre.diversasDetail.map(d => (
                                <DreLine key={d.id} label={d.description} value={parseFloat(d.amount) || 0}
                                    positive={d.finance_category === 'receita_diversa'} />
                            ))}
                            {activeDre.diversasDetail.length === 0 && <DreLine label="Nenhum lançamento" value={0} muted />}
                        </DreSection>

                        {/* (=) Lucro/Prejuízo Final */}
                        <DreTotal label="Lucro/Prejuízo Final" value={activeDre.lucroFinal} highlight final />
                    </div>
                </div>
            )}

            {/* FLUXO DE CAIXA */}
            {activeCash && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                    <h3 className="font-bold text-gray-200 mb-4 flex items-center gap-2">
                        <Wallet size={18} className="text-green-500" /> Fluxo de Caixa
                    </h3>
                    {/* Entradas */}
                    <p className="text-xs text-green-500 font-semibold mb-2 uppercase tracking-wider">Entradas</p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        <CashCard label="Dinheiro" value={activeCash.dinheiro} icon={Banknote} color="green" />
                        <CashCard label="Pix" value={activeCash.pix} icon={Smartphone} color="cyan" />
                        <CashCard label="Débito" value={activeCash.debito} icon={CreditCard} color="orange" />
                        <CashCard label="Crédito" value={activeCash.credito} icon={CreditCard} color="yellow" />
                        {activeCash.celcoinPago > 0 && <CashCard label="Celcoin" value={activeCash.celcoinPago} icon={Wallet} color="purple" />}
                    </div>

                    {/* Saídas */}
                    <p className="text-xs text-red-500 font-semibold mb-2 mt-4 uppercase tracking-wider">Saídas</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <CashCard label="Comissões" value={activeCash.comissaoTotal} icon={DollarSign} color="red" />
                        <CashCard label="Taxa Cartão" value={activeCash.taxaCartao} icon={CreditCard} color="red" />
                        <CashCard label="Despesas Pagas" value={activeCash.despesasManuais} icon={TrendingDown} color="red" />
                    </div>

                    {/* Resumo */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                        <div className="bg-green-900/20 border border-green-800/50 rounded-xl p-4 text-center">
                            <span className="text-xs text-green-500 block mb-1">Total Entradas</span>
                            <span className="text-xl font-bold text-green-400">{fmt(activeCash.totalEntradas)}</span>
                        </div>
                        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 text-center">
                            <span className="text-xs text-red-500 block mb-1">Total Saídas</span>
                            <span className="text-xl font-bold text-red-400">{fmt(activeCash.totalSaidas)}</span>
                        </div>
                        <div className={`border rounded-xl p-4 text-center ${(activeCash.totalEntradas - activeCash.totalSaidas) >= 0 ? 'bg-cyan-900/20 border-cyan-800/50' : 'bg-red-900/20 border-red-800/50'}`}>
                            <span className="text-xs text-gray-400 block mb-1">Saldo de Caixa</span>
                            <span className={`text-xl font-bold ${(activeCash.totalEntradas - activeCash.totalSaidas) >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                                {fmt(activeCash.totalEntradas - activeCash.totalSaidas)}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* FORMULÁRIO LANÇAMENTO */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                    <h3 className="font-bold text-gray-200 flex items-center gap-2">
                        <PlusCircle size={18} className="text-cyan-500" /> Novo Lançamento
                    </h3>
                </div>
                <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <input type="text" placeholder="Descrição..." value={newEntry.description}
                        onChange={e => setNewEntry({ ...newEntry, description: e.target.value })}
                        className="col-span-2 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500"
                        list="subcategories" />
                    <datalist id="subcategories">
                        {(SUB_CATEGORIES[newEntry.finance_category] || []).map(s => (
                            <option key={s} value={s} />
                        ))}
                    </datalist>
                    <input type="text" placeholder="R$ Valor" value={newEntry.amount}
                        onChange={e => setNewEntry({ ...newEntry, amount: e.target.value })}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500" />
                    <select value={newEntry.finance_category}
                        onChange={e => setNewEntry({ ...newEntry, finance_category: e.target.value })}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500">
                        {DRE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    <select value={newEntry.store_id}
                        onChange={e => setNewEntry({ ...newEntry, store_id: e.target.value })}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500">
                        {STORE_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <select value={newEntry.status}
                        onChange={e => setNewEntry({ ...newEntry, status: e.target.value })}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500">
                        {STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <input type="date" value={newEntry.date}
                        onChange={e => setNewEntry({ ...newEntry, date: e.target.value })}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500" />
                    <button onClick={handleAddEntry} disabled={processing}
                        className="col-span-2 sm:col-span-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg py-2.5 flex items-center justify-center gap-2 font-medium disabled:opacity-50">
                        <PlusCircle size={18} /> {processing ? 'Salvando...' : 'Adicionar'}
                    </button>
                </div>

                {/* LISTA LANÇAMENTOS */}
                <div className="overflow-x-auto border-t border-gray-800">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-950 text-gray-500 text-xs">
                            <tr>
                                <th className="px-4 py-3 font-medium">Data</th>
                                <th className="px-4 py-3 font-medium">Descrição</th>
                                <th className="px-4 py-3 font-medium">Categoria</th>
                                <th className="px-4 py-3 font-medium">Loja</th>
                                <th className="px-4 py-3 font-medium text-right">Valor</th>
                                <th className="px-4 py-3 font-medium text-center">Status</th>
                                <th className="px-4 py-3 font-medium text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50 text-gray-300">
                            {financialData.length === 0 ? (
                                <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-500">Nenhum lançamento manual neste mês</td></tr>
                            ) : financialData.map(item => (
                                <tr key={item.id} className="hover:bg-gray-800/30 transition-colors">
                                    <td className="px-4 py-2.5 text-gray-500 text-xs">{item.date ? new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                                    <td className="px-4 py-2.5 font-medium">{item.description}</td>
                                    <td className="px-4 py-2.5">
                                        <span className={`text-xs px-2 py-0.5 rounded border ${getCategoryStyle(item.finance_category)}`}>
                                            {DRE_CATEGORIES.find(c => c.id === item.finance_category)?.label || item.finance_category || item.finance_type || 'Outro'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-400 text-xs">{STORE_OPTIONS.find(s => s.id === item.store_id)?.label || item.store_id}</td>
                                    <td className={`px-4 py-2.5 text-right font-bold ${(item.finance_category === 'receita_diversa' || item.finance_category === 'receita_celcoin') ? 'text-green-400' : 'text-red-400'}`}>
                                        {(item.finance_category === 'receita_diversa' || item.finance_category === 'receita_celcoin') ? '+' : '-'} {fmt(parseFloat(item.amount || item.value || 0))}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        <StatusBadge status={item.status} onClick={() => toggleStatus(item)} />
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                        <button onClick={() => confirmDelete(item.id)} className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-red-900/10">
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MOVIMENTAÇÕES DE CAPITAL */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800 flex justify-between items-center">
                    <h3 className="font-bold text-gray-200 flex items-center gap-2">
                        <Wallet size={18} className="text-yellow-500" /> Movimentações de Capital
                    </h3>
                    <span className="text-[10px] text-gray-500">Não afetam lucro operacional</span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 p-4 bg-gray-950/30 border-b border-gray-800">
                    <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-3 text-center">
                        <span className="text-[10px] text-green-500 block mb-1">Entradas</span>
                        <span className="text-lg font-bold text-green-400">{fmt(capitalStats.entradas)}</span>
                    </div>
                    <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3 text-center">
                        <span className="text-[10px] text-red-500 block mb-1">Saídas</span>
                        <span className="text-lg font-bold text-red-400">{fmt(capitalStats.saidas)}</span>
                    </div>
                    <div className={`border rounded-lg p-3 text-center ${capitalStats.saldo >= 0 ? 'bg-cyan-900/20 border-cyan-800/50' : 'bg-red-900/20 border-red-800/50'}`}>
                        <span className="text-[10px] text-gray-400 block mb-1">Saldo</span>
                        <span className={`text-lg font-bold ${capitalStats.saldo >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>{fmt(capitalStats.saldo)}</span>
                    </div>
                </div>

                {/* Form */}
                <div className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 border-b border-gray-800">
                    <input type="text" placeholder="Descrição..." value={newMovement.description}
                        onChange={e => setNewMovement({ ...newMovement, description: e.target.value })}
                        className="col-span-2 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-yellow-500" />
                    <input type="text" placeholder="R$ Valor" value={newMovement.amount}
                        onChange={e => setNewMovement({ ...newMovement, amount: e.target.value })}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-yellow-500" />
                    <select value={newMovement.movement_type}
                        onChange={e => setNewMovement({ ...newMovement, movement_type: e.target.value })}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-yellow-500">
                        <option value="entrada">Entrada</option>
                        <option value="saida">Saída</option>
                    </select>
                    <input type="date" value={newMovement.date}
                        onChange={e => setNewMovement({ ...newMovement, date: e.target.value })}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-yellow-500" />
                    <button onClick={handleAddMovement} disabled={processingMovement}
                        className="col-span-2 sm:col-span-5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg py-2.5 flex items-center justify-center gap-2 font-medium disabled:opacity-50">
                        <PlusCircle size={18} /> {processingMovement ? 'Salvando...' : 'Registrar'}
                    </button>
                </div>

                {/* Movement List */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-950 text-gray-500 text-xs">
                            <tr>
                                <th className="px-4 py-3 font-medium">Data</th>
                                <th className="px-4 py-3 font-medium">Descrição</th>
                                <th className="px-4 py-3 font-medium text-center">Tipo</th>
                                <th className="px-4 py-3 font-medium text-right">Valor</th>
                                <th className="px-4 py-3 font-medium text-center">Status</th>
                                <th className="px-4 py-3 font-medium text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50 text-gray-300">
                            {movementsData.length === 0 ? (
                                <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-500">Nenhuma movimentação neste mês</td></tr>
                            ) : movementsData.map(item => (
                                <tr key={item.id} className="hover:bg-gray-800/30">
                                    <td className="px-4 py-2.5 text-gray-500 text-xs">{item.date ? new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                                    <td className="px-4 py-2.5 font-medium">{item.description}</td>
                                    <td className="px-4 py-2.5 text-center">
                                        <span className={`text-xs px-2 py-0.5 rounded border ${item.movement_type === 'entrada' ? 'bg-green-900/30 text-green-400 border-green-800/50' : 'bg-red-900/30 text-red-400 border-red-800/50'}`}>
                                            {item.movement_type === 'entrada' ? '+ Entrada' : '- Saída'}
                                        </span>
                                    </td>
                                    <td className={`px-4 py-2.5 text-right font-bold ${item.movement_type === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>
                                        {fmt(parseFloat(item.amount || 0))}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        <StatusBadge status={item.status || 'pago'} onClick={() => toggleMovementStatus(item)} />
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                        <button onClick={() => confirmDeleteMovement(item.id)} className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-red-900/10">
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* DELETE MODALS */}
            {deleteId && <DeleteModal onCancel={() => setDeleteId(null)} onConfirm={executeDelete} />}
            {deleteMovementId && <DeleteModal onCancel={() => setDeleteMovementId(null)} onConfirm={executeDeleteMovement} label="movimentação" />}
        </div>
    )
}

// ==========================================
// DRE SUB-COMPONENTS
// ==========================================

function DreSection({ sign, label, total, color, children }) {
    const [open, setOpen] = useState(true)
    const signColors = { '+': 'text-green-500', '-': 'text-red-500', '+/-': 'text-blue-500' }

    return (
        <div>
            <button onClick={() => setOpen(!open)}
                className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-800/30 transition-colors text-left">
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${signColors[sign]}`}>({sign})</span>
                    <span className="text-sm font-semibold text-gray-300">{label}</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold ${total > 0 ? (sign === '+' || sign === '+/-' ? 'text-gray-200' : 'text-red-400') : 'text-gray-500'}`}>
                        {fmt(total)}
                    </span>
                    {open ? <ChevronUp size={14} className="text-gray-600" /> : <ChevronDown size={14} className="text-gray-600" />}
                </div>
            </button>
            {open && <div className="bg-gray-950/30 px-5 py-2 space-y-0.5">{children}</div>}
        </div>
    )
}

function DreLine({ label, value, auto, muted, positive }) {
    return (
        <div className="flex items-center justify-between py-1.5 px-4">
            <div className="flex items-center gap-2">
                <span className={`text-xs ${muted ? 'text-gray-600 italic' : 'text-gray-400'}`}>{label}</span>
                {auto && <span className="text-[9px] bg-purple-900/40 text-purple-400 px-1 rounded">AUTO</span>}
            </div>
            <span className={`text-xs font-medium ${muted ? 'text-gray-600' : positive ? 'text-green-400' : 'text-gray-300'}`}>
                {fmt(value)}
            </span>
        </div>
    )
}

function DreTotal({ label, value, highlight, final: isFinal }) {
    return (
        <div className={`px-5 py-3 flex items-center justify-between ${highlight ? 'bg-gray-800/40' : 'bg-gray-950/20'} ${isFinal ? 'border-t-2 border-cyan-800/50' : ''}`}>
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-cyan-500">(=)</span>
                <span className={`text-sm font-bold ${isFinal ? 'text-white' : 'text-gray-200'}`}>{label}</span>
            </div>
            <span className={`font-bold ${isFinal ? 'text-lg' : 'text-sm'} ${value >= 0 ? (isFinal ? 'text-green-400' : 'text-cyan-400') : 'text-red-400'}`}>
                {fmt(value)}
            </span>
        </div>
    )
}

function CashCard({ label, value, icon: Icon, color }) {
    const colorMap = {
        green: 'text-green-400 bg-green-900/20 border-green-800/50',
        cyan: 'text-cyan-400 bg-cyan-900/20 border-cyan-800/50',
        orange: 'text-orange-400 bg-orange-900/20 border-orange-800/50',
        yellow: 'text-yellow-400 bg-yellow-900/20 border-yellow-800/50'
    }
    return (
        <div className={`border rounded-xl p-3 ${colorMap[color]}`}>
            <div className="flex items-center gap-1.5 mb-1">
                <Icon size={12} />
                <span className="text-[10px]">{label}</span>
            </div>
            <span className="text-lg font-bold">{fmt(value)}</span>
        </div>
    )
}

function StatusBadge({ status, onClick }) {
    const colors = {
        pago: 'bg-green-900/30 text-green-400 border-green-800/50',
        pendente: 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50',
        provisionado: 'bg-blue-900/30 text-blue-400 border-blue-800/50'
    }
    return (
        <span onClick={onClick}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border cursor-pointer hover:scale-105 transition-transform select-none ${colors[status] || colors.pago}`}>
            {status === 'pago' ? <CheckCircle size={10} /> : <Clock size={10} />}
            {(status || 'pago').toUpperCase()}
        </span>
    )
}

function DeleteModal({ onCancel, onConfirm, label = 'lançamento' }) {
    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl">
                <h3 className="text-lg font-bold text-white mb-2">Excluir {label}?</h3>
                <p className="text-gray-400 mb-6">Essa ação não pode ser desfeita.</p>
                <div className="flex gap-3 justify-end">
                    <button onClick={onCancel} className="px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-800">Cancelar</button>
                    <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium">Sim, Excluir</button>
                </div>
            </div>
        </div>
    )
}

function getCategoryStyle(cat) {
    const map = {
        imposto: 'bg-red-900/30 text-red-400 border-red-800/50',
        despesa_venda: 'bg-orange-900/30 text-orange-400 border-orange-800/50',
        despesa_operacional: 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50',
        receita_celcoin: 'bg-cyan-900/30 text-cyan-400 border-cyan-800/50',
        receita_diversa: 'bg-green-900/30 text-green-400 border-green-800/50',
        despesa_diversa: 'bg-purple-900/30 text-purple-400 border-purple-800/50'
    }
    return map[cat] || 'bg-gray-800 text-gray-400 border-gray-700'
}
