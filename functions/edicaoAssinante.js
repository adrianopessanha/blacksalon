// Edição de assinante pelo admin (aba Assinaturas): o que muda e o histórico (quem, quando, campo, antes/depois).
const { TELEFONE_RE, DEP_RE } = require("./clienteId");
const { vencimentoDe } = require("./balcao");

const FORMAS = ["celcoin", "balcao", "pix_manual"];
const STATUS = ["ativa", "pagamento_recusado", "vencido", "cancelada", "aguardando_pagamento", "inativa"];
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const formaDe = (a) => a.forma_cobranca || (a.origem === "balcao" ? "balcao" : a.origem || "celcoin");
const texto = (v) => String(v ?? "").trim();

// Cada campo editável: valor normalizado ou erro
const CAMPOS = {
    nome: (v) => (texto(v) ? [texto(v)] : [null, "Nome não pode ficar vazio."]),
    plano: (v) => [texto(v) || null],
    inicio_contrato: (v) => (!texto(v) ? [null] : DATA_RE.test(texto(v)) ? [texto(v)] : [null, "Início do contrato no formato AAAA-MM-DD."]),
    ciclo_desde: (v) => (!texto(v) ? [null] : DATA_RE.test(texto(v)) ? [texto(v)] : [null, "Início do ciclo no formato AAAA-MM-DD."]),
    valor: (v) => {
        if (v === "" || v == null) return [null];
        const n = Number(String(v).replace(",", "."));
        return Number.isFinite(n) && n >= 0 ? [Math.round(n * 100) / 100] : [null, "Valor inválido."];
    },
    forma_cobranca: (v) => (FORMAS.includes(v) ? [v] : [null, "Forma de pagamento: Celcoin, balcão ou Pix manual."]),
    status_assinatura: (v) => (STATUS.includes(v) ? [v] : [null, "Status inválido."]),
    // Pagador: telefone de outro assinante (dependente sem telefone não paga por ninguém)
    pagador: (v) => (!texto(v) ? [null] : TELEFONE_RE.test(texto(v)) ? [texto(v)] : [null, "Pagador inválido."]),
    observacao: (v) => [texto(v).slice(0, 1000) || null],
};
const valorAtual = (atual, k) => (k === "forma_cobranca" ? formaDe(atual) : atual[k] ?? null);

// novos: campos enviados pela tela. Retorna { upd, mudancas: [{ campo, antes, depois }], erros }
function edicaoAssinante(atual, novos, id) {
    const upd = {}, mudancas = [], erros = [];
    for (const [campo, bruto] of Object.entries(novos || {})) {
        if (!CAMPOS[campo]) { erros.push(`Campo não editável: ${campo}`); continue; }
        const [v, erro] = CAMPOS[campo](bruto);
        if (erro) { erros.push(erro); continue; }
        if (campo === "pagador" && DEP_RE.test(id) && v !== (atual.pagador ?? null)) { erros.push("Dependente sem telefone: o pagador é fixo."); continue; }
        if (campo === "pagador" && v === id) { erros.push("O assinante não pode ser pagador dele mesmo."); continue; }
        const antes = valorAtual(atual, campo);
        if (v === antes) continue;
        upd[campo] = v;
        mudancas.push({ campo, antes, depois: v });
    }
    // Balcão: o vencimento acompanha o início do ciclo (mesma regra da venda)
    const forma = upd.forma_cobranca || formaDe(atual);
    if (forma === "balcao" && upd.ciclo_desde && !erros.length) {
        const venc = vencimentoDe(upd.ciclo_desde);
        if (venc !== (atual.vencimento ?? null)) {
            upd.vencimento = venc;
            mudancas.push({ campo: "vencimento", antes: atual.vencimento ?? null, depois: venc });
        }
    }
    return { upd, mudancas, erros };
}

const entradasHistorico = (mudancas, por, em) => mudancas.map((m) => ({ em, por, campo: m.campo, antes: m.antes ?? null, depois: m.depois ?? null }));

// Próximo ID livre de dependente: {pagador}-dep1, -dep2...
function proximoIdDependente(pagador, idsExistentes) {
    const usados = idsExistentes
        .map((id) => String(id).match(new RegExp(`^${pagador}-dep(\\d+)$`)))
        .filter(Boolean)
        .map((m) => Number(m[1]));
    return `${pagador}-dep${usados.length ? Math.max(...usados) + 1 : 1}`;
}

// Documento de assinante do dependente: segue o pagador (status, forma, ciclo); sem valor próprio
function novoDependente({ pagador, pagadorDados, nome, plano, hoje }) {
    return {
        nome,
        plano: plano || null,
        pagador,
        telefone_contato: pagador,
        dependente_sem_telefone: true,
        origem: pagadorDados.origem || null,
        forma_cobranca: formaDe(pagadorDados),
        inicio_contrato: hoje,
        valor: null,
        status_assinatura: null,
    };
}

// ID novo do pagamento da Celcoin depois da troca de telefone ({código}_{transação})
const idPagamentoMovido = (id, cidAntigo, cidNovo) => (String(id).startsWith(cidAntigo + "_") ? cidNovo + String(id).slice(cidAntigo.length) : null);

module.exports = { edicaoAssinante, entradasHistorico, proximoIdDependente, novoDependente, idPagamentoMovido, formaDe, FORMAS, STATUS };
