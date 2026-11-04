import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularFinanceiro, calcularRateio, contasAPagar, valorSugerido, grupoDe, receitaAssinaturaOnline, rateioAtendimentos, doMesCompetencia } from './financeiro.js'

const barbers = [{ id: 'veloso', store: 'loja-01' }, { id: 'jonatas', store: 'loja-02' }]
const serv = (barbeiro, valor, forma, com) => ({ barbeiro_id: barbeiro, tipo: 'servico', valor_bruto: valor, forma_pagamento: forma, comissao_barbeiro: com })
// Loja 01 fatura 250, Loja 02 fatura 750 → rateio 25% / 75%
const lancamentos = [serv('veloso', 250, 'Pix', 100), serv('jonatas', 500, 'Dinheiro', 200), serv('jonatas', 250, 'Crédito', 100)]
const fin = (extra) => ({ amount: 100, status: 'pago', ...extra })
const financeiro = [
    fin({ id: 'a1', categoria: 'aluguel_imovel', store_id: 'loja01', amount: 1000 }),
    fin({ id: 'a2', categoria: 'aluguel_imovel', store_id: 'loja02', amount: 2700 }),
    fin({ id: 'c', categoria: 'outros', store_id: 'global', amount: 400 }), // contador
    fin({ id: 'das', categoria: 'impostos', store_id: 'global', amount: 330 }),
    fin({ id: 'luz', categoria: 'energia', store_id: 'loja02', amount: 1300, status: 'pendente' }),
    fin({ id: 'prov', categoria: 'energia', store_id: 'loja02', amount: 999, status: 'provisionado' }),
    fin({ id: 'pl', categoria: 'pro_labore', store_id: 'global', amount: 20 }),
]

test('rateio pelo faturamento próprio de cada loja', () => {
    const r = calcularRateio({ lancamentos, financeiro, barbers })
    assert.equal(r.loja01, 0.25)
    assert.equal(r.loja02, 0.75)
    assert.deepEqual(calcularRateio({}), { loja01: 0.5, loja02: 0.5, faturamento: { loja01: 0, loja02: 0 } })
})

test('Geral entra pela fatia em cada loja e as lojas somam o total (antes entrava inteiro nas duas)', () => {
    const { dre } = calcularFinanceiro({ lancamentos, financeiro, barbers })
    assert.equal(dre.loja01.despOperacionais, 1000 + 400 * 0.25)
    assert.equal(dre.loja02.despOperacionais, 2700 + 1300 + 400 * 0.75)
    assert.equal(dre.consolidado.despOperacionais, 1000 + 2700 + 1300 + 400)
    assert.equal(dre.loja01.impostos + dre.loja02.impostos, dre.consolidado.impostos)
    assert.equal(Math.round((dre.loja01.lucroFinal + dre.loja02.lucroFinal) * 100) / 100, Math.round(dre.consolidado.lucroFinal * 100) / 100)
    // Linha única de rateio na loja
    const geral = dre.loja02.despOperacionaisLinhas.find(l => l.geral)
    assert.equal(geral.label, 'Despesas gerais (rateio 25% / 75%)')
    assert.equal(geral.total, 300)
    assert.ok(!dre.consolidado.despOperacionaisLinhas.some(l => l.geral))
})

test('consolidado: mesmas fórmulas de antes (comissão, taxa de cartão 5%/2%, provisionado fora)', () => {
    const { dre } = calcularFinanceiro({ lancamentos, financeiro, barbers })
    const c = dre.consolidado
    assert.equal(c.receitaVendas, 1000)
    assert.equal(c.comissaoReceita, 400)
    assert.equal(c.taxaCartao, 250 * 0.05)
    assert.equal(c.receitaLiquida, 1000 - 330)
    assert.equal(c.lucroFinal, 1000 - 330 - 400 - 12.5 - 5400)
})

test('pago x previsto e pró-labore depois do resultado', () => {
    const { dre, caixa } = calcularFinanceiro({ lancamentos, financeiro, barbers })
    const c = dre.consolidado
    assert.equal(c.despOperacionaisPrevisto, 1300)
    assert.equal(c.lucroFinalPago, c.lucroFinal + 1300)
    assert.equal(c.proLabore, 20)
    assert.equal(c.sobra, c.lucroFinal - 20)
    assert.ok(!c.despOperacionaisLinhas.some(l => l.label.startsWith('Pró')))
    assert.equal(c.despOperacionaisLinhas.find(l => l.label === 'Energia').previsto, 1300)
    // Caixa: só o pago sai (pró-labore inclusive), provisionado e pendente não
    assert.equal(caixa.consolidado.despesasManuais, 1000 + 2700 + 400 + 330 + 20)
})

test('lançamento antigo sem categoria segue o finance_category', () => {
    assert.equal(grupoDe({ finance_category: 'despesa_operacional' }), 'despesa_operacional')
    assert.equal(grupoDe({ categoria: 'pro_labore', finance_category: 'despesa_operacional' }), 'pro_labore')
    assert.equal(grupoDe({}), null)
})

test('contas a pagar: atrasadas, hoje e próximos 7 dias, com total', () => {
    const c = contasAPagar([
        fin({ id: '1', status: 'pendente', due_date: '2026-11-01', amount: 50 }),
        fin({ id: '2', status: 'pendente', due_date: '2026-11-05', amount: 70 }),
        fin({ id: '3', status: 'pendente', due_date: '2026-11-12', amount: 30 }),
        fin({ id: '4', status: 'pendente', due_date: '2026-11-13', amount: 999 }),
        fin({ id: '5', status: 'pago', due_date: '2026-11-01' }),
        fin({ id: '6', status: 'pendente', due_date: '2026-11-02', categoria: 'receita_diversa' }),
    ], '2026-11-05')
    assert.deepEqual([c.atrasadas.total, c.hoje.total, c.proximos7.total], [50, 70, 30])
})

test('conta variável sugere o valor pago no mês anterior', () => {
    const lista = [fin({ recorrencia_id: 'luz', competence_month: '2026-10', amount: 1180 })]
    assert.equal(valorSugerido({ recorrencia_id: 'luz', valor_tipo: 'estimado', competence_month: '2026-11', amount: 1300 }, lista), 1180)
    assert.equal(valorSugerido({ recorrencia_id: 'luz', valor_tipo: 'fixo', competence_month: '2026-11', amount: 1300 }, lista), 1300)
    assert.equal(valorSugerido({ recorrencia_id: 'luz', valor_tipo: 'estimado', competence_month: '2027-01', amount: 1300 }, lista), 1300)
})

test('receita de assinatura online sem contar duas vezes: extrato até out/2026, aprovados de nov em diante', () => {
    const manual = [fin({ id: 'm', categoria: 'receita_celcoin', amount: 9940, store_id: 'global' })]
    assert.deepEqual(receitaAssinaturaOnline({ mes: '2026-03', financeiro: manual }), { fonte: 'manual', valor: 9940, ignorados: [] })
    const out = receitaAssinaturaOnline({ mes: '2026-10', lapis: 5873.39, financeiro: manual })
    assert.equal(out.fonte, 'extrato'); assert.equal(out.valor, 5873.39); assert.equal(out.ignorados.length, 1) // conflito: manual ignorado
    const nov = receitaAssinaturaOnline({ mes: '2026-11', lapis: 1, celcoin: [{ valor: 80 }, { valor: 140 }], financeiro: manual })
    assert.equal(nov.fonte, 'automatico'); assert.equal(nov.valor, 220); assert.equal(nov.ignorados.length, 1)
    assert.equal(receitaAssinaturaOnline({ mes: '2026-09' }).fonte, 'sem_dado')
})

test('assinatura online (Celcoin + Pix manual) dividida pelos atendimentos de assinante; despesas gerais pelo faturamento', () => {
    const atend = (barbeiro) => ({ barbeiro_id: barbeiro, tipo: 'servico', forma_pagamento: 'Assinante', valor_bruto: 20, comissao_barbeiro: 10 })
    const lancs = [...lancamentos, atend('veloso'), atend('jonatas'), atend('jonatas'), atend('jonatas')]
    assert.deepEqual(rateioAtendimentos(lancs, barbers).atendimentos, { loja01: 1, loja02: 3 })
    const assinantes = [{ forma_cobranca: 'pix_manual', status_assinatura: 'ativa', valor: 160, inicio_contrato: '2023-04-24' }]
    const r = calcularFinanceiro({ mes: '2026-10', lancamentos: lancs, financeiro, barbers, lapis: 840, assinantes })
    assert.equal(r.assinatura.total, 1000)
    assert.equal(r.dre.loja01.vendaCelcoin, 250)
    assert.equal(r.dre.loja02.vendaCelcoin, 750)
    assert.equal(r.dre.consolidado.vendaCelcoin, 1000)
    // Faturamento da loja = vendas dela + a fatia da assinatura online: 250+250 / 750+750
    assert.equal(r.rateio.loja01, 0.25)
})

test('só competência: o lançamento aparece apenas no mês da competência', () => {
    const lista = [{ id: 'net', competence_month: '2026-09', date: '2026-10-02' }, { id: 'velho', date: '2026-10-05' }]
    assert.deepEqual(doMesCompetencia(lista, '2026-10').map(d => d.id), ['velho'])
    assert.deepEqual(doMesCompetencia(lista, '2026-09').map(d => d.id), ['net'])
})

test('resultado sem não recorrentes devolve a despesa que entrou só desta vez (com o peso da loja)', () => {
    const lista = [...financeiro, fin({ id: 'furto', categoria: 'manutencao', store_id: 'loja02', amount: 3050, nao_recorrente: true }), fin({ id: 'g', categoria: 'outros', store_id: 'global', amount: 400, nao_recorrente: true })]
    const { dre } = calcularFinanceiro({ lancamentos, financeiro: lista, barbers })
    assert.equal(dre.consolidado.naoRecorrentesDespesas, 3450)
    assert.equal(dre.consolidado.lucroFinalSemNaoRecorrentes, dre.consolidado.lucroFinal + 3450)
    assert.equal(dre.loja02.naoRecorrentesDespesas, 3050 + 400 * 0.75)
})
