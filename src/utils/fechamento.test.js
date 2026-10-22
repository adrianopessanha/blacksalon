import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ultimoSabadoFim, saldoAte } from './fechamento.js'

test('último sábado: terça volta ao sábado anterior; domingo volta 1 dia; sábado não corta', () => {
    const ter = ultimoSabadoFim(new Date(2026, 9, 20, 20, 30))
    assert.deepEqual([ter.getDate(), ter.getHours(), ter.getMinutes()], [17, 23, 59])
    assert.equal(ultimoSabadoFim(new Date(2026, 9, 18, 10, 0)).getDate(), 17)
    assert.equal(ultimoSabadoFim(new Date(2026, 9, 17, 18, 0)), null)
})

const L = (dia, hora, com, tipo = 'servico') => ({ data: new Date(2026, 9, dia, hora), comissao_barbeiro: com, tipo })

test('saldo até sábado: depois do último fechamento, até sábado 23:59, adiantamento desconta', () => {
    const lanc = [
        L(10, 18, -500, 'fechamento_comissao'),
        L(13, 12, 100), L(15, 12, 200), L(16, 12, -20, 'adiantamento'), L(17, 18, 50),
        L(18, 12, 80), L(20, 12, 40), L(20, 13, -10, 'adiantamento'),
    ]
    assert.equal(saldoAte(lanc, ultimoSabadoFim(new Date(2026, 9, 20, 20))), 330)
})

test('sem nenhum fechamento: começa no dia 1º do mês, como o Painel', () => {
    const lanc = [L(5 - 10, 12, 999), L(2, 12, 100), L(16, 12, 50), L(19, 12, 70)]
    assert.equal(saldoAte(lanc, ultimoSabadoFim(new Date(2026, 9, 20, 20)), new Date(2026, 9, 20, 20)), 150)
})

test('semana já fechada no sábado: saldo até sábado é zero', () => {
    const lanc = [L(13, 12, 100), L(17, 23, -100, 'fechamento_comissao'), L(18, 12, 80)]
    assert.equal(saldoAte(lanc, ultimoSabadoFim(new Date(2026, 9, 20, 20))), 0)
})
