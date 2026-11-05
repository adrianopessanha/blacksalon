// Venda de assinatura no balcão: o contrato novo fica em contratos.js (vendaBalcao).

// Vencimento: mesmo dia do mês seguinte (31/01 -> 03/03, como o Date do JS)
function vencimentoDe(hoje) {
    const [y, m, d] = hoje.split("-").map(Number);
    return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

module.exports = { vencimentoDe };
