import { test } from 'node:test'
import assert from 'node:assert/strict'
import { precisaDeAcao, mensagemWhatsApp, linkWhatsApp, contatoValido, primeiroNome } from './acaoAssinantes.js'

const hoje = new Date('2026-10-28T15:00:00-03:00')
const ciclo = { inicio: new Date('2026-10-10T00:00:00-03:00'), fim: new Date('2026-11-09T23:59:59-03:00') }
const s = (extra) => ({ nome: 'joão da silva', telefone: '5521900000001', plano: { id: 'cria', label: 'Corte de Cria', preco: 80 }, ciclo, grupos: [], alertas: [], pagou: null, status_assinatura: 'ativa', statusAtual: 'ativa', ...extra })

test('grupos: recusado, vencido, conferir (não pagou sem recusa/vencimento), pagou e não veio, fora da regra', () => {
    const g = precisaDeAcao([
        s({ nome: 'A', grupos: ['recusado'], status_assinatura: 'pagamento_recusado', statusAtual: 'pagamento_recusado', data_recusa: '2026-10-25', pagou: false }),
        s({ nome: 'B', statusAtual: 'vencido', grupos: ['vencido'], vencimento: '2026-10-20' }),
        s({ nome: 'C', pagou: false }),
        s({ nome: 'D', pagou: false, status_assinatura: 'cancelada', statusAtual: 'cancelada' }),
        s({ nome: 'E', pagou: true, grupos: ['pagou_nao_veio'] }),
        s({ nome: 'F', alertas: [{ texto: 'x', visitas: [] }] }),
        s({ nome: 'G', pagou: false, dependenteDe: 'C' }),
    ], hoje)
    const por = Object.fromEntries(g.map(x => [x.id, x.itens.map(i => i.s.nome)]))
    assert.deepEqual(por, { recusado: ['A'], vencido: ['B'], conferir: ['C'], pagou_nao_veio: ['E'], fora_regra: ['F'] })
    assert.equal(g[0].itens[0].dias, 3)
    assert.deepEqual(precisaDeAcao([s({})], hoje), [])
})

test('mensagens: primeiro nome, plano, data e link; sem link usa o texto sem link', () => {
    const sem = mensagemWhatsApp('recusado', s({}))
    assert.ok(sem.startsWith('Fala, João!'))
    assert.ok(!sem.includes('[link]') && !sem.includes('http'))
    const com = mensagemWhatsApp('recusado', s({ link_pagamento: 'https://pay.x/1' }))
    assert.ok(com.includes('https://pay.x/1'))
    assert.ok(mensagemWhatsApp('vencido', s({ vencimento: '2026-10-20' })).includes('Seu plano Corte de Cria venceu dia 20/10.'))
    assert.ok(mensagemWhatsApp('vencido', s({ vencimento: '2026-10-20', plano: { id: 'outro_90' } })).includes('Seu plano venceu dia 20/10.'))
    assert.equal(mensagemWhatsApp('fora_regra', s({})), null)
    assert.equal(linkWhatsApp('55 21 90000-0001', 'Oi, tudo?'), 'https://wa.me/5521900000001?text=Oi%2C%20tudo%3F')
    assert.equal(primeiroNome('  MARIA clara'), 'Maria')
})

test('"contatado em" só vale depois do motivo atual', () => {
    assert.equal(contatoValido('2026-10-26', '2026-10-25'), '2026-10-26')
    assert.equal(contatoValido('2026-09-20', '2026-10-25'), null)
    assert.equal(contatoValido(null, '2026-10-25'), null)
})
