// Taxas estimadas das vendas online (2 contas Celcoin e AbacatePay), como se todas
// tivessem antecipação. Altere aqui; o resto do app usa só estes valores.
export const TAXAS_ONLINE = {
    percentual: 0.0315, // 3,15% do bruto
    fixo: 0.59,         // R$ 0,59 por cobrança
    antecipacao: 0.03,  // 3% do bruto
}

// Arredonda para cima no centavo (ex.: R$ 80 -> R$ 5,51)
export function taxaOnline(valor, cfg = TAXAS_ONLINE) {
    const v = parseFloat(valor) || 0
    if (v <= 0) return 0
    const centavos = (v * cfg.percentual + cfg.fixo + v * cfg.antecipacao) * 100
    return Math.ceil(Math.round(centavos * 1e6) / 1e6) / 100
}
