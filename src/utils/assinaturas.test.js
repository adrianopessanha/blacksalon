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
    assert.deepEqual(by.A.grupos, ['alertas']) // 9 visitas em dias seguidos: mesma semana e mais de 5 no ciclo
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

import { pontoTendencia } from './assinaturas.js'

test('tendência: mês sem lançamento mostra sem dado; mês atual usa ativos de hoje', () => {
    const vazio = pontoTendencia(resultadoMes({ mes: '2025-11' }), null, 2)
    assert.equal(vazio.comissoes, null)
    assert.equal(vazio.atendimentos, null)
    const atual = pontoTendencia(resultadoMes({ mes: '2026-10', lancamentos: [atend('2026-10-05T15:00:00Z', 10)] }), null, 1, 86)
    assert.equal(atual.ativos, 86)
    assert.equal(atual.ativosHoje, true)
    assert.equal(atual.comissoes, 10)
    assert.equal(pontoTendencia(resultadoMes({ mes: '2026-11' }), { ativos: 80 }, 0, 86).ativosHoje, false)
})

import { agruparVisitas, alertasDoCiclo, piorCaso } from './assinaturas.js'

test('pior caso com 5 visitas: positivo em todos os planos', () => {
    assert.equal(piorCaso(planoDe({ plano: 'Cabelo e Barba' })), 43.3)
    assert.equal(piorCaso(planoDe({ plano: 'Corte Ilimitado' })), 30.76)
    assert.equal(piorCaso(planoDe({ plano: 'Corte de Cria' })), 24.49)
    assert.equal(piorCaso(planoDe({ plano: '2 × Corte de Cria' })), 49.57)
})

const V = (dia, desc, b = 'Wellington') => ({ l: { data: new Date(`2026-10-${dia}T15:00:00Z`), servico_descricao: desc, barbeiro_nome: b, comissao_barbeiro: 10 } })
const CB = planoDe({ plano: 'Cabelo e Barba' }), CRIA = planoDe({ plano: 'Corte de Cria' })

test('Cabelo e Barba: barba num dia e cabelo noutro na mesma semana = 1 visita (comissões somam)', () => {
    // Anderson: 14/10 (ter) barba, 16/10 (qui) corte -> 1 visita; 20/10 (seg) nova semana
    const g = agruparVisitas([V('14', 'Barba plano'), V('16', 'Corte+barba plano'), V('20', 'Corte+barba plano')], CB)
    assert.equal(g.length, 2)
    assert.equal(g[0].dividida, true)
    assert.equal(g[0].comissao, 20)
    // barba + barba na mesma semana não é exceção
    assert.equal(agruparVisitas([V('14', 'Barba plano'), V('16', 'Barba plano')], CB).length, 2)
    assert.deepEqual(alertasDoCiclo({}, g, []), [])
})

test('exceção só vale para Cabelo e Barba e para serviços complementares', () => {
    assert.equal(agruparVisitas([V('14', 'Barba plano'), V('16', 'Corte maq plano')], CRIA).length, 2)
    assert.equal(agruparVisitas([V('14', 'Corte maq plano'), V('16', 'Corte maq plano')], CB).length, 2)
    const al = alertasDoCiclo({}, agruparVisitas([V('14', 'Corte maq plano', 'Jonatas'), V('16', 'Corte maq plano', 'Veloso')], CB), [])
    assert.equal(al[0].tipo, 'mesma_semana')
    assert.deepEqual(al[0].visitas.map(v => `${v.dia} ${v.barbeiro}`), ['2026-10-14 Jonatas', '2026-10-16 Veloso'])
})

test('alerta de atendimento com pagamento recusado (depois da data da recusa, se houver)', () => {
    const det = [V('10', 'Corte'), V('20', 'Corte')]
    const al = alertasDoCiclo({ status_assinatura: 'pagamento_recusado', data_recusa: '2026-10-15' }, agruparVisitas(det, CRIA), det)
    const r = al.find(a => a.tipo === 'recusado_atendido')
    assert.deepEqual(r.visitas.map(v => v.dia), ['2026-10-20'])
    assert.equal(alertasDoCiclo({ status_assinatura: 'ativa' }, agruparVisitas(det, CRIA), det).length, 0)
})
import { statusEfetivo } from './assinaturas.js'

test('semana do calendário: 6 dias de diferença em semanas diferentes não é alerta; sexta e segunda seguinte também não', () => {
    // 16/10 (sex) e 22/10 (qui): semanas 11-17 e 18-24
    assert.equal(alertasDoCiclo({}, agruparVisitas([V('16', 'Corte'), V('22', 'Corte')], CRIA), []).length, 0)
    // 13/10 (ter) e 17/10 (sáb): mesma semana
    assert.equal(alertasDoCiclo({}, agruparVisitas([V('13', 'Corte'), V('17', 'Corte')], CRIA), [])[0].tipo, 'mesma_semana')
})

test('balcão vencido: status vencido no dia seguinte ao vencimento, sem "não pagou"; Pix manual nunca vence', () => {
    const a = { telefone: 'Z', nome: 'Zé', valor: 80, origem: 'balcao', status_assinatura: 'ativa', inicio_contrato: '2026-09-10', vencimento: '2026-10-10' }
    assert.equal(statusEfetivo(a, new Date('2026-10-10T15:00:00Z')), 'ativa')
    assert.equal(statusEfetivo(a, new Date('2026-10-11T15:00:00Z')), 'vencido')
    assert.equal(statusEfetivo({ ...a, forma_cobranca: 'pix_manual' }, new Date('2026-11-30T15:00:00Z')), 'ativa')
    const [s] = situacaoAssinantes({ assinantes: [a], lancamentos: [atend(new Date(2026, 9, 15, 12).toISOString(), 10, { cliente_telefone: 'Z' })], pagamentos: [], mes: '2026-10', hoje: new Date(2026, 9, 20) })
    assert.equal(s.pagou, null)
    assert.equal(s.resultado, null)
    assert.ok(s.grupos.includes('vencido'))
    assert.equal(s.alertas.find(x => x.tipo === 'vencido_atendido').visitas[0].dia, '2026-10-15')
})

test('ciclo reinicia na data da última venda (ciclo_desde), sem mudar o início do contrato', () => {
    const [s] = situacaoAssinantes({ assinantes: [{ telefone: 'Y', nome: 'Y', valor: 80, origem: 'balcao', status_assinatura: 'ativa', inicio_contrato: '2025-01-05', ciclo_desde: '2026-10-20', vencimento: '2026-11-20' }], lancamentos: [], pagamentos: [], mes: '2026-10', hoje: new Date(2026, 9, 22) })
    assert.equal(s.ciclo.inicio.getDate(), 20)
})
test('pagamento dias antes do vencimento vale para o ciclo que começa (baixa manual de 23/10, ciclo dia 24)', () => {
    const a = { telefone: '5521900000001', nome: 'Pedro', plano: 'Corte de Cria', valor: 80, origem: 'celcoin', status_assinatura: 'ativa', inicio_contrato: '2026-08-24' }
    const pagamentos = [{ telefone: a.telefone, tipo: 'baixa_manual', receita: false, valor: 80, data: '2026-10-23' }]
    const [s] = situacaoAssinantes({ assinantes: [a], lancamentos: [], pagamentos, mes: '2026-10', hoje: new Date('2026-10-28T15:00:00-03:00') })
    assert.equal(s.ciclo.inicio.getDate(), 24)
    assert.equal(s.pagou, true)
    // O mesmo pagamento não conta para o ciclo anterior (24/09 a 23/10)
    const [ant] = situacaoAssinantes({ assinantes: [a], lancamentos: [], pagamentos, mes: '2026-10', hoje: new Date('2026-10-20T15:00:00-03:00') })
    assert.equal(ant.ciclo.inicio.getDate(), 24)
    assert.equal(ant.ciclo.inicio.getMonth(), 8)
    assert.notEqual(ant.pagou, true)
    // Cartão aprovado alguns dias depois do início ainda é do ciclo atual
    const [tarde] = situacaoAssinantes({ assinantes: [a], lancamentos: [], pagamentos: [{ telefone: a.telefone, receita: true, valor: 80, data: '2026-10-27' }], mes: '2026-10', hoje: new Date('2026-10-28T15:00:00-03:00') })
    assert.equal(tarde.pagou, true)
})
