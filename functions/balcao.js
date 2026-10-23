// Venda de assinatura no balcão: o que gravar em assinantes/{telefone}.
// Celcoin: só a função da Celcoin atualiza. Abacatepay: só admin renova, mantendo a origem.

// Vencimento: mesmo dia do mês seguinte (31/01 -> 03/03, como o Date do JS)
function vencimentoDe(hoje) {
    const [y, m, d] = hoje.split("-").map(Number);
    return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

// atual: dados gravados hoje (ou null). Retorna { resultado, origem, upd } (upd null = não grava)
function decidirVendaBalcao({ atual, admin, nome, telefone, plano, valor, hoje }) {
    const origem = atual ? atual.origem || null : null;
    const vencimento = vencimentoDe(hoje);
    if (origem === "abacatepay") {
        if (!admin) return { resultado: "bloqueado", origem, upd: null };
        return {
            resultado: "renovado",
            origem,
            upd: { status_assinatura: "ativa", status_original: "Paga fora do sistema", vencimento, ciclo_desde: hoje },
        };
    }
    if (origem && origem !== "balcao") return { resultado: "bloqueado", origem, upd: null };
    return {
        resultado: atual ? "renovado" : "criado",
        origem: "balcao",
        upd: {
            nome,
            telefone,
            plano,
            valor,
            origem: "balcao",
            status_assinatura: "ativa",
            status_original: "Paga fora do sistema",
            vencimento,
            // Nova venda reativa e reinicia o ciclo na data da venda (mesmo documento: nunca duplica)
            ciclo_desde: hoje,
            ...(atual && atual.inicio_contrato ? {} : { inicio_contrato: hoje }),
        },
    };
}

module.exports = { decidirVendaBalcao, vencimentoDe };
