import { useState, useEffect, useMemo } from 'react'
import { db, collection, query, where, addDoc, deleteDoc, updateDoc, doc, serverTimestamp, onSnapshot } from '../firebase'
import { Timestamp, arrayUnion } from 'firebase/firestore'
import { DollarSign, TrendingUp, TrendingDown, Wallet, Copy, Trash2, PlusCircle, CheckCircle, Clock, Download, CreditCard, Banknote, Smartphone, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Pencil, X, Check } from 'lucide-react'
import { BARBERS } from '../data/barbers'
import { CATEGORIAS, categoriaDe, LOJAS, rotuloLoja, FORMAS_PAGAMENTO, grupoDe, ehReceitaManual, calcularFinanceiro, doMesCompetencia } from '../utils/financeiro'
import { ContasAPagar, PagueiModal, ContasRecorrentes } from './FinanceiroContas'

// ==========================================
// CONSTANTES
// ==========================================

const fmt = (val) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const STATUS_OPTIONS = [
    { id: 'pago', label: 'Pago', color: 'green' },
    { id: 'pendente', label: 'A pagar (previsto)', color: 'yellow' },
    { id: 'provisionado', label: 'Provisionado', color: 'blue' }
]

// A partir deste mês a receita de cartão da Celcoin vem de pagamentos_assinatura
// (webhook), e não é mais digitada à mão em receita_celcoin.
const CELCOIN_AUTO_DESDE = '2026-11'
const pctTxt = (p) => `${Math.round((p || 0) * 100)}%`
const ROTULO_FONTE = { extrato: 'líquido do extrato, lápis da aba Assinaturas', manual: 'digitado no Financeiro', automatico: 'pagamentos aprovados', sem_dado: 'sem dado' }
const rotuloCategoria = (item) => categoriaDe(item.categoria)?.label || item.finance_category || item.finance_type || 'Sem categoria'

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export function FinancialDashboard() {
    const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
    const [loading, setLoading] = useState(true)
    const [revenueData, setRevenueData] = useState([])
    const [financialData, setFinancialData] = useState([])
    const [movementsData, setMovementsData] = useState([])
    const [celcoinData, setCelcoinData] = useState([])
    const [activeTab, setActiveTab] = useState('consolidado')
    const [processing, setProcessing] = useState(false)
    const [deleteId, setDeleteId] = useState(null)
    const [deleteCollection, setDeleteCollection] = useState('financeiro')
    const [editingId, setEditingId] = useState(null)
    const [editData, setEditData] = useState({})
    // Todos os lançamentos manuais (contas a pagar olha todos os meses) e as recorrências
    const [allFinance, setAllFinance] = useState([])
    const [recorrencias, setRecorrencias] = useState([])
    const [pagando, setPagando] = useState(null)
    const [lapis, setLapis] = useState(null)
    const [assinantes, setAssinantes] = useState([])

    // Form
    const [newEntry, setNewEntry] = useState({
        description: '',
        amount: '',
        store_id: 'loja01',
        categoria: 'outros',
        forma_pagamento: 'Pix',
        nao_recorrente: false,
        status: 'pago',
        date: new Date().toISOString().slice(0, 10),
        due_date: '',
        payment_date: new Date().toISOString().slice(0, 10),
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
            const todos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
            setAllFinance(todos)
            // Só competência: cada lançamento aparece apenas no mês da competência
            const docs = doMesCompetencia(todos, month)
            setFinancialData(docs.sort((a, b) => (b.date || '').localeCompare(a.date || '')))
        })
        // Líquido do extrato Celcoin (lápis da aba Assinaturas) e assinantes no Pix manual
        const unsubLapis = onSnapshot(doc(db, 'configuracoes', 'assinaturas_liquido_real'), (snap) => {
            setLapis(snap.exists() ? snap.data()[month] ?? null : null)
        }, (err) => console.error('lápis:', err))
        const unsubAssin = onSnapshot(collection(db, 'assinantes'), (snapshot) => {
            setAssinantes(snapshot.docs.map(d => d.data()))
        }, (err) => console.error('assinantes:', err))
        const unsubRec = onSnapshot(collection(db, 'contas_recorrentes'), (snapshot) => {
            setRecorrencias(snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')))
        }, (err) => console.error('contas_recorrentes:', err))

        // 3. Movimentações de Capital
        const movementQ = query(collection(db, 'movimentacoes'))
        const unsubMovements = onSnapshot(movementQ, (snapshot) => {
            const docs = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(d => d.date >= month + '-01' && d.date <= month + '-31')
            setMovementsData(docs.sort((a, b) => (b.date || '').localeCompare(a.date || '')))
        })

        // 4. Cartão aprovado da Celcoin (automático a partir do corte)
        let unsubCelcoin = () => {}
        if (month >= CELCOIN_AUTO_DESDE) {
            const celcoinQ = query(collection(db, 'pagamentos_assinatura'), where('receita', '==', true))
            unsubCelcoin = onSnapshot(celcoinQ, (snapshot) => {
                setCelcoinData(snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => String(d.data || '').startsWith(month)))
            }, (err) => console.error('Celcoin error:', err))
        } else {
            setCelcoinData([])
        }

        return () => { unsubRevenue(); unsubFinance(); unsubLapis(); unsubAssin(); unsubRec(); unsubMovements(); unsubCelcoin() }
    }, [month])

    // ==========================================
    // DRE E FLUXO DE CAIXA (utils/financeiro: Geral rateado pelo faturamento de cada loja)
    // ==========================================

    const calculo = useMemo(() => calcularFinanceiro({ mes: month, lancamentos: revenueData, financeiro: financialData, celcoin: celcoinData, barbers: BARBERS, lapis, assinantes }),
        [month, revenueData, financialData, celcoinData, lapis, assinantes])
    const dre = calculo.dre
    const cashFlow = calculo.caixa
    const rateio = calculo.rateio
    const assinatura = calculo.assinatura

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
                // Categoria padronizada; finance_category = linha do DRE (as outras telas leem esse campo)
                categoria: newEntry.categoria,
                finance_category: categoriaDe(newEntry.categoria).grupo,
                forma_pagamento: newEntry.forma_pagamento || null,
                nao_recorrente: !!newEntry.nao_recorrente,
                status: newEntry.status,
                date: newEntry.date,
                due_date: newEntry.due_date || null,
                payment_date: newEntry.status === 'pago' ? (newEntry.payment_date || newEntry.date) : null,
                competence_month: newEntry.competence_month,
                created_at: serverTimestamp()
            })
            setNewEntry({ ...newEntry, description: '', amount: '', due_date: '', nao_recorrente: false, payment_date: newEntry.status === 'pago' ? new Date().toISOString().slice(0, 10) : '' })
        } catch (e) {
            alert("Erro: " + e.message)
        } finally {
            setProcessing(false)
        }
    }

    const startEdit = (item) => {
        setEditingId(item.id)
        setEditData({
            description: item.description || '',
            amount: (item.amount || item.value || 0).toString(),
            store_id: item.store_id || 'loja01',
            categoria: item.categoria || 'outros',
            forma_pagamento: item.forma_pagamento || '',
            nao_recorrente: !!item.nao_recorrente,
            status: item.status || 'pago',
            date: item.date || '',
            due_date: item.due_date || '',
            payment_date: item.payment_date || '',
            competence_month: item.competence_month || ''
        })
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditData({})
    }

    const saveEdit = async (id) => {
        if (!editData.description || !editData.amount) return alert("Preencha descrição e valor.")
        setProcessing(true)
        try {
            const val = parseFloat(editData.amount.toString().replace(',', '.'))
            if (isNaN(val) || val <= 0) { alert("Valor inválido!"); setProcessing(false); return }

            await updateDoc(doc(db, 'financeiro', id), {
                description: editData.description,
                amount: val,
                store_id: editData.store_id,
                categoria: editData.categoria,
                finance_category: categoriaDe(editData.categoria).grupo,
                forma_pagamento: editData.forma_pagamento || null,
                nao_recorrente: !!editData.nao_recorrente,
                status: editData.status,
                date: editData.date,
                due_date: editData.due_date || null,
                payment_date: editData.status === 'pago' ? (editData.payment_date || editData.date) : null,
                competence_month: editData.competence_month
            })
            setEditingId(null)
            setEditData({})
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
        try {
            // Conta gerada por recorrência: o mês vira "pulado" para não ser gerada de novo
            const item = deleteCollection === 'financeiro' ? financialData.find(d => d.id === deleteId) : null
            if (item?.recorrencia_id) await updateDoc(doc(db, 'contas_recorrentes', item.recorrencia_id), { pulados: arrayUnion(item.competence_month) })
            await deleteDoc(doc(db, deleteCollection, deleteId)); setDeleteId(null)
        }
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
        const updates = { status: next }
        // Preenche data de pagamento automaticamente ao marcar como pago
        if (next === 'pago' && !item.payment_date) {
            updates.payment_date = new Date().toISOString().slice(0, 10)
        }
        // Limpa data de pagamento se não está pago
        if (next !== 'pago') {
            updates.payment_date = null
        }
        try { await updateDoc(doc(db, 'financeiro', item.id), updates) }
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
        const report = { period: month, rateio, dre: dre[activeTab], cashFlow: cashFlow[activeTab], entries: financialData }
        navigator.clipboard.writeText(JSON.stringify(report, null, 2))
        alert("Copiado para IA!")
    }

    const handleExportJSON = () => {
        const report = { metadata: { generated_at: new Date().toISOString(), period: month }, rateio, dre, cashFlow, entries: financialData, movements: movementsData }
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
                    <div className="flex items-center gap-1">
                        <button onClick={() => {
                            const [y, m] = month.split('-').map(Number)
                            const prev = new Date(y, m - 2, 1)
                            setMonth(prev.toISOString().slice(0, 7))
                        }} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
                            <ChevronLeft size={18} />
                        </button>
                        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                            className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-white text-sm" />
                        <button onClick={() => {
                            const [y, m] = month.split('-').map(Number)
                            const next = new Date(y, m, 1)
                            setMonth(next.toISOString().slice(0, 7))
                        }} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors">
                            <ChevronRight size={18} />
                        </button>
                    </div>
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

            {/* CONTAS A PAGAR (todos os meses) */}
            <ContasAPagar financeiro={allFinance} onPagar={setPagando} />
            {pagando && <PagueiModal conta={pagando} financeiro={allFinance} onFechar={() => setPagando(null)} />}

            {/* RESUMO POR LOJA */}
            <ResumoPorLoja dre={dre} rateio={rateio} />

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
                            <DreLine label="Venda de assinaturas no balcão" value={activeDre.vendaAssinaturaLoja} auto />
                            <DreLine label={`Assinaturas online: Celcoin (${ROTULO_FONTE[assinatura.fonte]}) + Pix manual${activeTab === 'consolidado' ? '' : ` · ${pctTxt(assinatura.atendimentos[activeTab])} pelos atendimentos de assinante`}`}
                                value={activeDre.vendaCelcoin} auto />
                            {assinatura.ignorados.length > 0 && (
                                <div className="px-4 py-1 text-[11px] text-yellow-400">
                                    ⚠ {assinatura.ignorados.length} lançamento(s) de "Receita – assinatura Celcoin" no Financeiro não entraram ({fmt(assinatura.ignorados.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0))}), para não contar duas vezes com {assinatura.fonte === 'extrato' ? 'o lápis da aba Assinaturas' : 'os pagamentos aprovados'}.
                                </div>
                            )}
                            <DreLine label="Venda de vale presente" value={activeDre.vendaVale} auto />
                            <DreLine label="Venda de produtos" value={activeDre.vendaProduto} auto />
                        </DreSection>

                        {/* (-) Impostos */}
                        <DreSection sign="-" label="Impostos" total={activeDre.impostos} previsto={activeDre.impostosPrevisto} color="red">
                            {activeDre.impostosLinhas.map(l => <DreLine key={l.label} label={l.label} value={l.total} previsto={l.previsto} />)}
                            {activeDre.impostosLinhas.length === 0 && <DreLine label="Nenhum imposto lançado" value={0} muted />}
                        </DreSection>

                        {/* (=) Receita Líquida */}
                        <DreTotal label="Receita Líquida" value={activeDre.receitaLiquida} />

                        {/* (-) Despesas de Vendas */}
                        <DreSection sign="-" label="Despesas de Vendas" total={activeDre.totalDespVenda} color="red">
                            <DreLine label="Comissão (Din/Pix/Cartão)" value={activeDre.comissaoReceita} auto />
                            <DreLine label="Comissão (Assinante/Vale)" value={activeDre.comissaoAssinVale} auto />
                            <DreLine label="Comissão produtos (R$5/un)" value={activeDre.comissaoProduto} auto />
                            <DreLine label="Taxa de cartão" value={activeDre.taxaCartao} auto />
                            {activeDre.despVendaLinhas.map(l => <DreLine key={l.label} label={l.label} value={l.total} previsto={l.previsto} />)}
                        </DreSection>

                        {/* (=) Lucro Bruto */}
                        <DreTotal label="Lucro Bruto" value={activeDre.lucroBruto} />

                        {/* (-) Despesas Operacionais */}
                        <DreSection sign="-" label="Despesas Operacionais" total={activeDre.despOperacionais} previsto={activeDre.despOperacionaisPrevisto} color="orange">
                            {activeDre.despOperacionaisLinhas.map(l => <DreLine key={l.label} label={l.label} value={l.total} previsto={l.previsto} destaque={l.geral} />)}
                            {activeDre.despOperacionaisLinhas.length === 0 && <DreLine label="Nenhuma despesa operacional" value={0} muted />}
                        </DreSection>

                        {/* (=) Lucro Operacional */}
                        <DreTotal label="Lucro Operacional" value={activeDre.lucroOperacional} highlight />

                        {/* (+/-) Receitas/Despesas Diversas */}
                        <DreSection sign="+/-" label="Receitas/Despesas Diversas" total={activeDre.saldoDiversas} color="blue">
                            {activeDre.diversasLinhas.map(l => <DreLine key={(l.positivo ? '+' : '-') + l.label} label={l.label} value={l.total} previsto={l.previsto} positive={l.positivo} />)}
                            {activeDre.diversasLinhas.length === 0 && <DreLine label="Nenhum lançamento" value={0} muted />}
                        </DreSection>

                        {/* (=) Lucro/Prejuízo Final */}
                        <DreTotal label="Resultado (lucro/prejuízo final)" value={activeDre.lucroFinal} highlight final />
                        <div className="px-5 py-2 flex items-center justify-between bg-gray-950/20">
                            <span className="text-xs text-gray-400">Resultado sem não recorrentes {activeDre.naoRecorrentesDespesas > 0 && <span className="text-gray-600">(volta {fmt(activeDre.naoRecorrentesDespesas)} de despesas que não se repetem)</span>}</span>
                            <span className={`text-sm font-bold ${activeDre.lucroFinalSemNaoRecorrentes >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>{fmt(activeDre.lucroFinalSemNaoRecorrentes)}</span>
                        </div>

                        {/* Depois do resultado: pró-labore (retirada do dono, não é despesa operacional) */}
                        <DreSection sign="-" label="Pró-labore (retirada do dono)" total={activeDre.proLabore} previsto={activeDre.proLaborePrevisto} color="red">
                            {activeDre.proLaboreLinhas.map(l => <DreLine key={l.label} label={l.label} value={l.total} previsto={l.previsto} destaque={l.geral} />)}
                            {activeDre.proLaboreLinhas.length === 0 && <DreLine label="Nenhuma retirada lançada" value={0} muted />}
                        </DreSection>
                        <DreTotal label="Sobra depois do pró-labore" value={activeDre.sobra} highlight />

                        {/* Pago x previsto */}
                        <div className="px-5 py-3 bg-gray-950/40 text-xs space-y-1">
                            <div className="flex justify-between text-gray-400"><span>Já pago / recebido (sem o previsto)</span><span className="font-semibold text-gray-200">{fmt(activeDre.lucroFinalPago)}</span></div>
                            <div className="flex justify-between text-yellow-400/90"><span>Previsto: contas a pagar</span><span>− {fmt(activeDre.despesasPrevistas)}</span></div>
                            {activeDre.receitasPrevistas > 0 && <div className="flex justify-between text-green-400/90"><span>Previsto: receitas a receber</span><span>+ {fmt(activeDre.receitasPrevistas)}</span></div>}
                            <div className="text-[10px] text-gray-600">O resultado acima inclui o previsto (competência). "Já pago" mostra só o que já aconteceu, antes do pró-labore.</div>
                        </div>
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
                        {activeCash.celcoinPago > 0 && <CashCard label="Assinaturas online" value={activeCash.celcoinPago} icon={Wallet} color="purple" />}
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

            {/* CONTAS RECORRENTES */}
            <ContasRecorrentes recorrencias={recorrencias} financeiro={allFinance} mes={month} />

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
                        className="col-span-2 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500" />
                    <input type="text" placeholder="R$ Valor" value={newEntry.amount}
                        onChange={e => setNewEntry({ ...newEntry, amount: e.target.value })}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500" />
                    <select value={newEntry.categoria}
                        onChange={e => setNewEntry({ ...newEntry, categoria: e.target.value })}
                        title={categoriaDe(newEntry.categoria)?.dica || ''}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500">
                        {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    <select value={newEntry.store_id}
                        onChange={e => setNewEntry({ ...newEntry, store_id: e.target.value })}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500">
                        {LOJAS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <select value={newEntry.forma_pagamento}
                        onChange={e => setNewEntry({ ...newEntry, forma_pagamento: e.target.value })}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500">
                        {FORMAS_PAGAMENTO.map(f => <option key={f}>{f}</option>)}
                    </select>
                    <label className="flex items-center gap-2 text-sm text-gray-300 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2" title="Ex.: manutenção pós-furto. O DRE mostra o resultado com e sem esses lançamentos.">
                        <input type="checkbox" checked={newEntry.nao_recorrente} onChange={e => setNewEntry({ ...newEntry, nao_recorrente: e.target.checked })} className="accent-cyan-500" />
                        Não recorrente
                    </label>
                    <select value={newEntry.status}
                        onChange={e => setNewEntry({ ...newEntry, status: e.target.value })}
                        className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500">
                        {STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <div className="flex flex-col">
                        <label className="text-[10px] text-gray-500 mb-0.5">Data Lançamento</label>
                        <input type="date" value={newEntry.date}
                            onChange={e => setNewEntry({ ...newEntry, date: e.target.value })}
                            className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500" />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-[10px] text-gray-500 mb-0.5">Vencimento</label>
                        <input type="date" value={newEntry.due_date}
                            onChange={e => setNewEntry({ ...newEntry, due_date: e.target.value })}
                            className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500" />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-[10px] text-gray-500 mb-0.5">Data Pagamento</label>
                        <input type="date" value={newEntry.payment_date}
                            onChange={e => setNewEntry({ ...newEntry, payment_date: e.target.value })}
                            disabled={newEntry.status !== 'pago'}
                            className={`bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500 ${newEntry.status !== 'pago' ? 'opacity-40 cursor-not-allowed' : ''}`} />
                    </div>
                    <div className="flex flex-col">
                        <label className="text-[10px] text-gray-500 mb-0.5">Mês Competência</label>
                        <input type="month" value={newEntry.competence_month}
                            onChange={e => setNewEntry({ ...newEntry, competence_month: e.target.value })}
                            className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-cyan-500" />
                    </div>
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
                                <th className="px-4 py-3 font-medium">Lançamento</th>
                                <th className="px-4 py-3 font-medium">Vencimento</th>
                                <th className="px-4 py-3 font-medium">Pagamento</th>
                                <th className="px-4 py-3 font-medium">Competência</th>
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
                                <tr><td colSpan="10" className="px-4 py-8 text-center text-gray-500">Nenhum lançamento manual neste mês</td></tr>
                            ) : financialData.map(item => editingId === item.id ? (
                                <tr key={item.id} className="bg-cyan-950/20 border-l-2 border-cyan-500">
                                    <td className="px-2 py-1.5">
                                        <input type="date" value={editData.date}
                                            onChange={e => setEditData({ ...editData, date: e.target.value })}
                                            className="bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-white text-xs w-full outline-none focus:border-cyan-500" />
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <input type="date" value={editData.due_date}
                                            onChange={e => setEditData({ ...editData, due_date: e.target.value })}
                                            className="bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-white text-xs w-full outline-none focus:border-cyan-500" />
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <input type="date" value={editData.payment_date}
                                            onChange={e => setEditData({ ...editData, payment_date: e.target.value })}
                                            disabled={editData.status !== 'pago'}
                                            className={`bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-white text-xs w-full outline-none focus:border-cyan-500 ${editData.status !== 'pago' ? 'opacity-40' : ''}`} />
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <input type="month" value={editData.competence_month}
                                            onChange={e => setEditData({ ...editData, competence_month: e.target.value })}
                                            className="bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-white text-xs w-full outline-none focus:border-cyan-500" />
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <input type="text" value={editData.description}
                                            onChange={e => setEditData({ ...editData, description: e.target.value })}
                                            className="bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-white text-xs w-full outline-none focus:border-cyan-500" />
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <select value={editData.categoria}
                                            onChange={e => setEditData({ ...editData, categoria: e.target.value })}
                                            className="bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-white text-xs w-full outline-none focus:border-cyan-500">
                                            {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <select value={editData.store_id}
                                            onChange={e => setEditData({ ...editData, store_id: e.target.value })}
                                            className="bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-white text-xs w-full outline-none focus:border-cyan-500">
                                            {LOJAS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                        </select>
                                        <select value={editData.forma_pagamento}
                                            onChange={e => setEditData({ ...editData, forma_pagamento: e.target.value })}
                                            className="mt-1 bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-white text-xs w-full outline-none focus:border-cyan-500">
                                            <option value="">Forma —</option>
                                            {FORMAS_PAGAMENTO.map(f => <option key={f}>{f}</option>)}
                                        </select>
                                        <label className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">
                                            <input type="checkbox" checked={editData.nao_recorrente} onChange={e => setEditData({ ...editData, nao_recorrente: e.target.checked })} className="accent-cyan-500" />
                                            não recorrente
                                        </label>
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <input type="text" value={editData.amount}
                                            onChange={e => setEditData({ ...editData, amount: e.target.value })}
                                            className="bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-white text-xs w-20 text-right outline-none focus:border-cyan-500" />
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <select value={editData.status}
                                            onChange={e => setEditData({ ...editData, status: e.target.value })}
                                            className="bg-gray-950 border border-gray-700 rounded px-1.5 py-1 text-white text-xs w-full outline-none focus:border-cyan-500">
                                            {STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-2 py-1.5 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => saveEdit(item.id)} disabled={processing}
                                                className="text-green-400 hover:text-green-300 p-1 rounded hover:bg-green-900/20 disabled:opacity-50">
                                                <Check size={14} />
                                            </button>
                                            <button onClick={cancelEdit}
                                                className="text-gray-400 hover:text-gray-200 p-1 rounded hover:bg-gray-800">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                <tr key={item.id} className="hover:bg-gray-800/30 transition-colors">
                                    <td className="px-4 py-2.5 text-gray-500 text-xs">{item.date ? new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                                    <td className="px-4 py-2.5 text-xs">
                                        {item.due_date ? (() => {
                                            const today = new Date().toISOString().slice(0, 10)
                                            const isOverdue = item.status !== 'pago' && item.due_date < today
                                            const isNear = item.status !== 'pago' && !isOverdue && item.due_date <= new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
                                            return <span className={isOverdue ? 'text-red-400 font-bold' : isNear ? 'text-yellow-400 font-medium' : 'text-gray-400'}>
                                                {new Date(item.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                {isOverdue && ' ⚠'}
                                            </span>
                                        })() : <span className="text-gray-600">-</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs">
                                        {item.payment_date
                                            ? <span className="text-green-400">{new Date(item.payment_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                            : <span className="text-gray-600">-</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs">
                                        {item.competence_month ? (() => {
                                            const [y, m] = item.competence_month.split('-')
                                            const mName = new Date(y, m - 1).toLocaleString('pt-BR', { month: 'short' }).replace('.', '')
                                            return <span className={item.competence_month !== month ? 'text-yellow-400 font-medium' : 'text-gray-500'}>{mName}/{y}</span>
                                        })() : '-'}
                                    </td>
                                    <td className="px-4 py-2.5 font-medium">{item.description}</td>
                                    <td className="px-4 py-2.5">
                                        <span className={`text-xs px-2 py-0.5 rounded border ${getCategoryStyle(grupoDe(item))}`}>
                                            {rotuloCategoria(item)}
                                        </span>
                                        {item.recorrencia_id && <span className="ml-1 text-[10px] text-cyan-500">recorrente</span>}
                                        {item.nao_recorrente && <span className="ml-1 text-[10px] text-orange-400">não recorrente</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-400 text-xs">{rotuloLoja(item.store_id)}{item.forma_pagamento ? <span className="block text-gray-600">{item.forma_pagamento}</span> : null}</td>
                                    <td className={`px-4 py-2.5 text-right font-bold ${ehReceitaManual(item) ? 'text-green-400' : 'text-red-400'}`}>
                                        {ehReceitaManual(item) ? '+' : '-'} {fmt(parseFloat(item.amount || item.value || 0))}
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        <StatusBadge status={item.status} onClick={() => toggleStatus(item)} />
                                        {item.status === 'pendente' && !ehReceitaManual(item) && (
                                            <button type="button" onClick={() => setPagando(item)} className="block mx-auto mt-1 text-[10px] font-bold text-emerald-400 underline">Paguei</button>
                                        )}
                                    </td>
                                    <td className="px-4 py-2.5 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button onClick={() => startEdit(item)}
                                                className="text-gray-500 hover:text-cyan-400 p-1 rounded hover:bg-cyan-900/10">
                                                <Pencil size={14} />
                                            </button>
                                            <button onClick={() => confirmDelete(item.id)} className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-red-900/10">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
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

// Resumo das duas lojas e do total; o Geral entra em cada loja pelo rateio do faturamento
function ResumoPorLoja({ dre, rateio }) {
    const cols = [['loja01', 'Loja 01'], ['loja02', 'Loja 02'], ['consolidado', 'Total']]
    const linhas = [
        ['Receita de vendas', 'receitaVendas'],
        ['Impostos', 'impostos', true],
        ['Despesas de vendas', 'totalDespVenda', true],
        ['Despesas operacionais', 'despOperacionais', true],
        ['Resultado', 'lucroFinal', false, true],
        ['Resultado sem não recorrentes', 'lucroFinalSemNaoRecorrentes'],
        ['Pró-labore', 'proLabore', true],
        ['Sobra', 'sobra', false, true],
    ]
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h3 className="font-bold text-gray-200 text-sm">Resultado por loja</h3>
                <span className="text-[11px] text-gray-500">Despesas gerais: rateio {pctTxt(rateio.loja01)} Loja 01 / {pctTxt(rateio.loja02)} Loja 02 (faturamento do mês)</span>
            </div>
            <table className="w-full text-xs">
                <thead><tr className="text-gray-500">
                    <th className="text-left font-medium py-1"></th>
                    {cols.map(([id, r]) => <th key={id} className="text-right font-medium py-1">{r}</th>)}
                </tr></thead>
                <tbody className="text-gray-300">
                    {linhas.map(([rotulo, campo, menos, total]) => (
                        <tr key={campo} className={total ? 'border-t border-gray-800 font-bold' : ''}>
                            <td className="py-1 pr-2">{rotulo}</td>
                            {cols.map(([id]) => {
                                const v = dre[id][campo]
                                return <td key={id} className={`py-1 text-right whitespace-nowrap ${total ? (v >= 0 ? 'text-green-400' : 'text-red-400') : ''}`}>{menos && v ? '− ' : ''}{fmt(v)}</td>
                            })}
                        </tr>
                    ))}
                    <tr className="text-gray-500">
                        <td className="py-1 pr-2">· das quais gerais (rateio)</td>
                        {cols.map(([id]) => <td key={id} className="py-1 text-right whitespace-nowrap">{id === 'consolidado' ? '' : fmt(dre[id].geralOperacional)}</td>)}
                    </tr>
                </tbody>
            </table>
        </div>
    )
}

function DreSection({ sign, label, total, previsto, color, children }) {
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
                    {previsto > 0 && <span className="text-[10px] text-yellow-400">pago {fmt(total - previsto)} · previsto {fmt(previsto)}</span>}
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

function DreLine({ label, value, auto, muted, positive, previsto, destaque }) {
    return (
        <div className="flex items-center justify-between py-1.5 px-4">
            <div className="flex items-center gap-2">
                <span className={`text-xs ${muted ? 'text-gray-600 italic' : destaque ? 'text-cyan-300' : 'text-gray-400'}`}>{label}</span>
                {auto && <span className="text-[9px] bg-purple-900/40 text-purple-400 px-1 rounded">AUTO</span>}
                {previsto > 0 && <span className="text-[9px] bg-yellow-900/40 text-yellow-400 px-1 rounded">{previsto >= value ? 'PREVISTO' : `PREVISTO ${fmt(previsto)}`}</span>}
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
        despesa_diversa: 'bg-purple-900/30 text-purple-400 border-purple-800/50',
        pro_labore: 'bg-pink-900/30 text-pink-400 border-pink-800/50'
    }
    return map[cat] || 'bg-gray-800 text-gray-400 border-gray-700'
}
