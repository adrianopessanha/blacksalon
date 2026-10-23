import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resultadoMes, planoDe, situacaoAssinantes, pontoEquilibrio, porPlano, tendencia, taxaBalcao } from './assinaturas.js'

const ts = (iso) => ({ toDate: () => new Date(iso) })
const atend = (iso, com, extra = {}) => ({ tipo: 'servico', forma_pagamento: 'Assinante', comissao_barbeiro: com, data: ts(iso), ...extra })
const renov = (iso, valor, forma, extra = {}) => ({ tipo: 'renovacao_celcoin', forma_pagamento: forma, valor_bruto: valor, comissao_barbeiro: 0, data: ts(iso), ...extra })

test('mês antigo sem lápis: sem dado de receita (não mostra prejuízo)', () => {
    const r = resultadoMes({ mes: '2026-10', lancamentos: [atend('2026-10-05T15:00:00Z', 10), renov('2026-10-06T15:00:00Z', 140, 'Pix')], hoje: new Date('2026-10-22T15:00:00Z') })
    assert.equal(r.semDado, true)
    assert.equal(r.sobrou, null)
    assert.equal(r.comissoes, 10)
    assert.equal(r.balcaoBruto, 140)
})

test('mês antigo com lápis: extrato + balcão (cartão com taxa de maquininha) − comissões', () => {
    const r = resultadoMes({
        mes: '2026-10', liquidoReal: 1000, hoje: new Date('2026-11-05T15:00:00Z'),
        lancamentos: [atend('2026-10-05T15:00:00Z', 300), renov('2026-10-06T15:00:00Z', 140, 'Crédito'), renov('2026-10-07T15:00:00Z', 100, 'Pix')],
    })
    assert.equal(r.fonteOnline, 'extrato')
    assert.equal(r.balcaoTaxas, 7)
    assert.equal(r.receita, 1233)
    assert.equal(r.sobrou, 933)
    assert.equal(r.lucro, true)
})

test('março usa o valor do Financeiro; novembro é automático com taxas.js', () => {
    assert.equal(resultadoMes({ mes: '2026-03', liquidoFinanceiro: 9940 }).fonteOnline, 'financeiro')
    const nov = resultadoMes({ mes: '2026-11', pagamentos: [{ receita: true, valor: 140, data: '2026-11-03' }, { receita: false, valor: 140, data: '2026-11-03' }], hoje: new Date('2026-11-10T15:00:00Z') })
    assert.equal(nov.cobradoOnline, 140)
    assert.equal(nov.taxasOnline, 9.2)
    assert.equal(nov.receita, 130.8)
    assert.ok(nov.previsao)
})

test('taxa de maquininha: crédito 5%, débito 2%, Pix e dinheiro zero', () => {
    assert.deepEqual([taxaBalcao('Crédito', 100), taxaBalcao('Débito', 100), taxaBalcao('Pix', 100), taxaBalcao('Dinheiro', 100)], [5, 2, 0, 0])
})

test('plano: R$ 80 sem nome vira "R$ 80 (Cria ou Barba)"; R$ 160 vira Outro', () => {
    assert.equal(planoDe({ valor: 80 }).label, 'R$ 80 (Cria ou Barba)')
    assert.equal(planoDe({ valor: 140 }).label, 'Cabelo e Barba')
    assert.equal(planoDe({ plano: 'Plano Corte de Cria', valor: 80 }).label, 'Corte de Cria')
    assert.equal(planoDe({ valor: 160 }).label, 'Outro (R$ 160)')
})

test('ponto de equilíbrio: Cabelo e Barba R$ 140 aguenta 7 visitas de R$ 17,50', () => {
    assert.equal(pontoEquilibrio(planoDe({ valor: 140 })), 7)
    assert.equal(pontoEquilibrio(planoDe({ valor: 100 })), 7)
    assert.equal(pontoEquilibrio(planoDe({ valor: 80 })), 7)
})

test('situação: prejuízo, pagou e não veio, recusado, cancelado atendendo', () => {
    const hoje = new Date(2026, 10, 20)
    const assinantes = [
        { telefone: 'A', nome: 'Ana', valor: 80, origem: 'balcao', status_assinatura: 'ativa', inicio_contrato: '2026-01-05' },
        { telefone: 'B', nome: 'Beto', valor: 140, origem: 'balcao', status_assinatura: 'ativa', inicio_contrato: '2026-01-05' },
        { telefone: 'C', nome: 'Caio', valor: 100, origem: 'celcoin', status_assinatura: 'pagamento_recusado', inicio_contrato: '2026-01-05' },
        { telefone: 'D', nome: 'Davi', valor: 100, origem: 'celcoin', status_assinatura: 'cancelada', inicio_contrato: '2026-01-05' },
    ]
    const lanc = [
        renov(new Date(2026, 10, 6, 12).toISOString(), 80, 'Pix', { cliente_telefone: 'A' }),
        ...Array.from({ length: 9 }, (_, i) => atend(new Date(2026, 10, 7 + i, 12).toISOString(), 10, { cliente_telefone: 'A' })),
        renov(new Date(2026, 10, 6, 12).toISOString(), 140, 'Dinheiro', { cliente_telefone: 'B' }),
        atend(new Date(2026, 10, 8, 12).toISOString(), 12.5, { cliente_telefone: 'D' }),
    ]
    const s = situacaoAssinantes({ assinantes, lancamentos: lanc, pagamentos: [], mes: '2026-11', hoje })
    const by = Object.fromEntries(s.map(x => [x.telefone, x]))
    assert.deepEqual(by.A.grupos, ['prejuizo'])
    assert.equal(by.A.resultado, -10)
    assert.deepEqual(by.B.grupos, ['pagou_nao_veio'])
    assert.ok(by.C.grupos.includes('recusado'))
    assert.ok(by.D.grupos.includes('cancelado_atendendo'))
    const planos = porPlano(s)
    assert.equal(planos.find(p => p.plano.label === 'R$ 80 (Cria ou Barba)').visitas, 9)
})

test('tendência: seta só quando há dado nos dois lados', () => {
    const serie = [{ v: 10 }, { v: 12 }, { v: 11 }, { v: 15 }, { v: null }]
    assert.deepEqual(tendencia(serie, 'v', 3), { vsAnterior: 1, vsMedia3: 1 })
    assert.deepEqual(tendencia(serie, 'v', 1), { vsAnterior: 1, vsMedia3: null })
    assert.deepEqual(tendencia(serie, 'v', 4), { vsAnterior: null, vsMedia3: null })
})

import { naoLigados, tipoLigacao } from './assinaturas.js'

test('Pix manual: entra na receita do mês sem taxa enquanto ativo, e conta como pago', () => {
    const raphael = { telefone: 'R', nome: 'Raphael', plano: 'Cabelo e Barba', valor: 160, forma_cobranca: 'pix_manual', status_assinatura: 'ativa', inicio_contrato: '2023-04-24' }
    const r = resultadoMes({ mes: '2026-11', assinantes: [raphael], hoje: new Date('2026-11-10T15:00:00Z') })
    assert.equal(r.pixManual, 160)
    assert.equal(r.receita, 160)
    const [s] = situacaoAssinantes({ assinantes: [raphael], lancamentos: [], pagamentos: [], mes: '2026-11', hoje: new Date(2026, 10, 10) })
    assert.equal(s.pagou, true)
    assert.equal(s.liquido, 160)
    assert.equal(resultadoMes({ mes: '2026-11', assinantes: [{ ...raphael, status_assinatura: 'cancelada' }] }).pixManual, 0)
})

test('dependente: visitas contam contra o pagador e ele não aparece como "não pagou"', () => {
    const hoje = new Date(2026, 10, 20)
    const w = { telefone: 'W', nome: 'Wallace', plano: '2 × Corte de Cria', valor: 160, origem: 'balcao', status_assinatura: 'ativa', inicio_contrato: '2026-01-05' }
    const c = { telefone: 'C', nome: 'Creyson', valor: 0, origem: 'balcao', status_assinatura: 'ativa', inicio_contrato: '2026-01-05', pagador: 'W' }
    const lanc = [
        renov(new Date(2026, 10, 6, 12).toISOString(), 160, 'Pix', { cliente_telefone: 'W' }),
        atend(new Date(2026, 10, 7, 12).toISOString(), 10, { cliente_telefone: 'W' }),
        atend(new Date(2026, 10, 8, 12).toISOString(), 10, { cliente_telefone: 'C' }),
        atend(new Date(2026, 10, 9, 12).toISOString(), 10, { cliente_telefone: 'C' }),
    ]
    const s = situacaoAssinantes({ assinantes: [w, c], lancamentos: lanc, pagamentos: [], mes: '2026-11', hoje })
    const W = s.find(x => x.telefone === 'W'), C = s.find(x => x.telefone === 'C')
    assert.equal(W.visitasTotais, 3)
    assert.equal(W.resultado, 130)
    assert.equal(C.dependenteDe, 'Wallace')
    assert.equal(C.pagou, true)
    assert.equal(C.resultado, null)
    assert.equal(porPlano(s).length, 1)
    assert.equal(planoDe(w).label, '2 × Corte de Cria')
})

test('ligação: manual vence telefone; só por nome fica "a conferir"; não ligados aparecem para vincular', () => {
    const a = { telefone: 'A', nome: 'Ana Souza', codigo_cliente: '10' }
    assert.equal(tipoLigacao(a, { assinante_telefone: 'A', cliente_telefone: 'X' }), 'manual')
    assert.equal(tipoLigacao(a, { assinante_telefone: 'B', cliente_nome: 'Ana Souza' }), null)
    assert.equal(tipoLigacao(a, { subscriber_code: '10' }), 'codigo')
    assert.equal(tipoLigacao(a, { cliente_nome: 'ana souza' }), 'nome')
    const s = situacaoAssinantes({ assinantes: [{ ...a, origem: 'balcao', status_assinatura: 'ativa' }], lancamentos: [atend(new Date(2026, 10, 7, 12).toISOString(), 10, { cliente_nome: 'Ana Souza' })], pagamentos: [], mes: '2026-11', hoje: new Date(2026, 10, 20) })
    assert.equal(s[0].aConferir, 1)
    const soltos = naoLigados([atend(new Date(2026, 10, 7, 12).toISOString(), 10, { cliente_nome: 'Fulano' })], [a], new Date(2026, 10, 1), new Date(2026, 10, 30))
    assert.equal(soltos.length, 1)
})
