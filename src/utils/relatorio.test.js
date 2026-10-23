import { test } from 'node:test'
import assert from 'node:assert/strict'
import { taxaOnline } from '../config/taxas.js'
import { entrou, comissoes, sobrou, atendimentos, porBarbeiro, vendasNaoServico, formasPagamento, aPagarSemana, periodoAnterior } from './relatorio.js'

const lojaDe = (d) => d.loja_id
const S = (loja, forma, valor, com, extra = {}) => ({ tipo: 'servico', loja_id: loja, forma_pagamento: forma, valor_bruto: valor, comissao_barbeiro: com, barbeiro_id: extra.b || 'jonatas', barbeiro_nome: extra.b || 'jonatas', ...extra })

test('taxas online: exemplos do dono', () => {
    assert.equal(taxaOnline(80), 5.51)
    assert.equal(taxaOnline(100), 6.74)
    assert.equal(taxaOnline(140), 9.20)
    assert.equal(taxaOnline(0), 0)
})

// Cenário com a mesma estrutura de 22/10: caixa 30 + 840, comissões 285,65 + 155 + 18,75
const dia = [
    S('loja-01', 'Débito', 30, 14.7),
    S('loja-02', 'Dinheiro', 180, 90), S('loja-02', 'Pix', 160, 80), S('loja-02', 'Débito', 80, 39.2), S('loja-02', 'Crédito', 130, 61.75),
    { tipo: 'venda_vale', loja_id: 'loja-02', forma_pagamento: 'Crédito', valor_bruto: 150, comissao_barbeiro: 0, barbeiro_id: 'adriano' },
    { tipo: 'renovacao_celcoin', loja_id: 'loja-02', forma_pagamento: 'Pix', valor_bruto: 140, comissao_barbeiro: 0, barbeiro_id: 'adriano' },
    ...Array.from({ length: 12 }, () => S('loja-02', 'Assinante', 0, 155 / 12)),
    S('loja-02', 'Vale Presente', 37.5, 18.75),
    { tipo: 'adiantamento', loja_id: 'loja-02', forma_pagamento: 'Adiantamento', valor_bruto: 0, comissao_barbeiro: -10, barbeiro_id: 'jonatas' },
    { tipo: 'adiantamento', loja_id: 'loja-02', forma_pagamento: 'Adiantamento', valor_bruto: 0, comissao_barbeiro: -20, barbeiro_id: 'wellington' },
]

test('entrou: caixa 30 + 840 = 870, adiantamentos à parte, online sempre presente', () => {
    const e = entrou(dia, [], lojaDe)
    assert.equal(e['loja-01'].caixa, 30)
    assert.equal(e['loja-02'].caixa, 840)
    assert.equal(e.total.caixa, 870)
    assert.equal(e.total.online, 0)
    assert.equal(e.total.total, 870)
    assert.equal(e['loja-02'].adiantamentos, 30)
})

test('comissões 285,65 + 155 + 18,75 = 459,40; sobrou 410,60 sem descontar adiantamento', () => {
    const c = comissoes(dia, lojaDe)
    assert.equal(c.total.pago.valor, 285.65)
    assert.equal(c.total.assinante.valor, 155)
    assert.equal(c.total.assinante.qtd, 12)
    assert.equal(c.total.vale.valor, 18.75)
    assert.equal(c.total.total, 459.4)
    assert.equal(sobrou(entrou(dia, [], lojaDe), c).total, 410.6)
})

test('venda pelo site vai para online, não para o caixa; pagamento sem unidade só no total', () => {
    const e = entrou([{ tipo: 'venda_vale', loja_id: 'loja-02', forma_pagamento: 'Pix', valor_bruto: 150, webhook_origem: 'site_vale_presente' }],
        [{ receita: true, valor: 100, unidade: '01' }, { receita: true, valor: 80, unidade: null }, { receita: false, valor: 999 }], lojaDe)
    assert.equal(e['loja-02'].caixa, 0)
    assert.equal(e['loja-02'].online, 150)
    assert.equal(e['loja-01'].online, 100)
    assert.equal(e.total.online, 330)
})

test('atendimentos, ticket só dos pagos e vendas fora do serviço', () => {
    const a = atendimentos(dia)
    assert.deepEqual([a.pago, a.assinante, a.vale, a.total], [5, 12, 1, 18])
    assert.equal(a.ticket, 116)
    const v = vendasNaoServico(dia)
    assert.deepEqual(v.assinatura, { qtd: 1, valor: 140 })
    assert.deepEqual(v.vale, { qtd: 1, valor: 150 })
})

test('formas de pagamento só caixa, somando 100%', () => {
    const f = formasPagamento(dia)
    assert.equal(f.total, 870)
    assert.equal(Math.round(f.formas.reduce((s, x) => s + x.pct, 0)), 100)
    assert.ok(!f.formas.some(x => ['Assinante', 'Vale Presente'].includes(x.forma)))
})

test('por barbeiro sem "resultado"; a pagar = comissão − adiantamentos', () => {
    const b = porBarbeiro(dia)
    assert.ok(!('resultado' in b[0]))
    const p = aPagarSemana(dia)
    const w = p.find(x => x.id === 'wellington')
    assert.deepEqual([w.comissao, w.adiantamentos, w.aPagar], [0, 20, -20])
})

test('período anterior: 1 dia -> mesma dia da semana anterior; intervalo -> mesmo tamanho', () => {
    assert.deepEqual(periodoAnterior('2026-10-22', '2026-10-22'), { inicio: '2026-10-15', fim: '2026-10-15', mesmoDiaSemana: true })
    assert.deepEqual(periodoAnterior('2026-10-01', '2026-10-10'), { inicio: '2026-09-21', fim: '2026-09-30', mesmoDiaSemana: false })
})
