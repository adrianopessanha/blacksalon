// Resumo mensal de assinaturas. ATENÇÃO: as regras de receita/taxa espelham
// src/utils/assinaturas.js (resultadoMes) e src/config/taxas.js. Mudou lá, mude aqui.

const TAXAS_ONLINE = { percentual: 0.0315, fixo: 0.59, antecipacao: 0.03 };
const TAXA_MAQUININHA = { "Crédito": 0.05, "Débito": 0.02 };
const FORMAS_REAIS = ["Dinheiro", "Pix", "Débito", "Crédito"];
const CELCOIN_AUTO_DESDE = "2026-11";

const n = (v) => parseFloat(v) || 0;
const r2 = (v) => Math.round(v * 100) / 100;

function taxaOnline(valor) {
    const v = n(valor);
    if (v <= 0) return 0;
    const centavos = (v * TAXAS_ONLINE.percentual + TAXAS_ONLINE.fixo + v * TAXAS_ONLINE.antecipacao) * 100;
    return Math.ceil(Math.round(centavos * 1e6) / 1e6) / 100;
}

function mesAnterior(date) {
    const sp = new Date(date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const d = new Date(sp.getFullYear(), sp.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// lancamentosMes: lançamentos do mês (atendimento de assinante e renovação no balcão)
function calcularResumo({ mes, assinantes, lancamentosMes, pagamentos, liquidoReal, liquidoFinanceiro, ativos }) {
    const doMes = pagamentos.filter((p) => String(p.data || "").startsWith(mes));
    const online = doMes.filter((p) => p.receita);
    const cobradoOnline = r2(online.reduce((s, p) => s + n(p.valor), 0));
    const taxasOnline = r2(online.reduce((s, p) => s + taxaOnline(p.valor), 0));

    let fonte, liquidoOnline = null;
    if (liquidoReal != null) { fonte = "extrato"; liquidoOnline = n(liquidoReal); }
    else if (mes < CELCOIN_AUTO_DESDE && liquidoFinanceiro != null) { fonte = "financeiro"; liquidoOnline = n(liquidoFinanceiro); }
    else if (mes >= CELCOIN_AUTO_DESDE) { fonte = "automatico"; liquidoOnline = cobradoOnline - taxasOnline; }
    else fonte = "sem_dado";

    const balcao = lancamentosMes.filter((l) => ["venda_assinatura", "renovacao_celcoin"].includes(l.tipo) && !l.webhook_origem && FORMAS_REAIS.includes(l.forma_pagamento));
    const balcaoBruto = r2(balcao.reduce((s, l) => s + n(l.valor_bruto), 0));
    const balcaoTaxas = r2(balcao.reduce((s, l) => s + n(l.valor_bruto) * (TAXA_MAQUININHA[l.forma_pagamento] || 0), 0));
    const atend = lancamentosMes.filter((l) => l.forma_pagamento === "Assinante" && (l.tipo === "servico" || !l.tipo));
    const comissoes = r2(atend.reduce((s, l) => s + n(l.comissao_barbeiro), 0));
    // Pix manual (fora da Celcoin): recebido no mês enquanto ativo, sem taxa
    const pixManual = r2(assinantes.filter((a) => a.forma_cobranca === "pix_manual" && a.status_assinatura === "ativa"
        && (!a.inicio_contrato || a.inicio_contrato.slice(0, 7) <= mes)).reduce((s, a) => s + n(a.valor), 0));
    const receita = fonte === "sem_dado" ? null : r2(liquidoOnline + balcaoBruto - balcaoTaxas + pixManual);

    const tels = (tipo) => new Set(doMes.filter((p) => p.tipo === tipo).map((p) => p.telefone)).size;
    return {
        mes,
        ativos: ativos ?? null,
        novos: assinantes.filter((a) => String(a.inicio_contrato || "").startsWith(mes)).length,
        cancelados: tels("cancelada"),
        recusados: tels("recusado"),
        fonte_receita: fonte,
        cobrado_online: cobradoOnline,
        balcao: balcaoBruto,
        pix_manual: pixManual,
        receita,
        taxas: r2((fonte === "automatico" ? taxasOnline : 0) + balcaoTaxas),
        comissoes,
        atendimentos: atend.length,
        lucro: receita == null ? null : r2(receita - comissoes),
    };
}

module.exports = { calcularResumo, mesAnterior, taxaOnline };
