const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { defineSecret } = require("firebase-functions/params");
const { timingSafeEqual } = require("crypto");
const { parseAgendamento } = require("./agendamento");
const { parsePagamento, atualizacaoCliente, atualizacaoAssinante, escolherCandidato, decidirEvento, semStatus } = require("./assinatura");
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { visaoPublica } = require("./publico");
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { calcularResumo, mesAnterior } = require("./resumo");
const { getFunctions } = require("firebase-admin/functions");
const { motivoParaNaoEnviar, pesquisaHoje, reservadaPorOutro, montarPayload, idTarefa } = require("./pesquisa");
const { cidDe, cidDeAssinante, normalizarTelefone, TELEFONE_RE, CID_RE, DEP_RE, ID_ASSINANTE_RE } = require("./clienteId");
const { decidirVendaBalcao } = require("./balcao");
const { edicaoAssinante, entradasHistorico, proximoIdDependente, novoDependente, idPagamentoMovido } = require("./edicaoAssinante");
const { contaDoMes, mesesParaGerar, addMeses } = require("./recorrentes");

const MAKE_SECRET = defineSecret("MAKE_SECRET");
// Deve bater com o campo webhookSecret que o Make envia no corpo JSON
const VALE_WEBHOOK_SECRET_NOVO = defineSecret("VALE_WEBHOOK_SECRET_NOVO");
// Gera o código opaco do cliente (c_...) a partir do telefone
const CLIENTE_ID_SECRET = defineSecret("CLIENTE_ID_SECRET");

initializeApp();
const db = getFirestore();

// ==========================================
// Telefone do cliente: só em clientes_privado/{código} (só admin lê).
// Tudo o que o barbeiro lê usa o código (cliente_id).
// ==========================================
const codigoDe = (tel55) => cidDe(tel55, CLIENTE_ID_SECRET.value());
// Assinante: telefone ou dependente sem telefone ({pagador}-dep1)
const codigoAssinante = (id) => cidDeAssinante(id, CLIENTE_ID_SECRET.value());
const privadoRef = (cid) => db.collection("clientes_privado").doc(cid);
const dadosPrivados = (telefone) => ({ telefone, atualizado_em: FieldValue.serverTimestamp() });

// Telefone trocado na aba Assinaturas: o número antigo leva ao novo (busca, Booksy e Celcoin)
async function telefoneAtual(tel55) {
    let tel = tel55;
    for (let i = 0; i < 3 && TELEFONE_RE.test(String(tel || "")); i++) {
        const snap = await privadoRef(codigoDe(tel)).get();
        const novo = snap.exists ? snap.data().movido_para : null;
        if (!TELEFONE_RE.test(String(novo || "")) || novo === tel) break;
        tel = novo;
    }
    return tel;
}

// Lançamento novo traz cliente_id; o app antigo (ainda em cache) traz cliente_telefone
function codigoDoLancamento(lanc) {
    if (CID_RE.test(String(lanc?.cliente_id || ""))) return lanc.cliente_id;
    return TELEFONE_RE.test(String(lanc?.cliente_telefone || "")) ? codigoDe(lanc.cliente_telefone) : null;
}

async function telefoneDoCodigo(cid) {
    if (!CID_RE.test(String(cid || ""))) return null;
    const snap = await privadoRef(cid).get();
    // Dependente sem telefone guarda o próprio ID no lugar do telefone: não serve para mensagem nem venda
    const tel = snap.exists ? snap.data().telefone || null : null;
    return TELEFONE_RE.test(String(tel || "")) ? tel : null;
}

// Hora de São Paulo nos avisos ao Make
const dataBR = (d) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const horaBR = (d) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
const diaSP = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
// Formato dos webhooks do Make: DDD + número, sem 55
const telefoneMake = (tel55) => (tel55 ? String(tel55).replace(/^55/, "") : "");

// ==========================================
// BARBEIRO PADRÃO para vendas do site (Adriano - admin)
// ==========================================
const DEFAULT_BARBER = {
    id: "adriano",
    name: "Adriano Pessanha",
    store: "loja-02",
};

// ==========================================
// WEBHOOK: Receber vendas de Vale Presente do site
// POST /webhookValePresente
// ==========================================
exports.webhookValePresente = onRequest(
    {
        cors: true,
        region: "southamerica-east1",
        maxInstances: 10,
        invoker: "public",
        secrets: [VALE_WEBHOOK_SECRET_NOVO, CLIENTE_ID_SECRET],
    },
    async (req, res) => {
        // Apenas POST
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }

        try {
            const payload = req.body;

            // 1. Validar webhook secret
            if (!segredoConfere(payload?.webhookSecret, VALE_WEBHOOK_SECRET_NOVO.value())) {
                console.error("Webhook secret inválido");
                return res.status(401).json({ error: "Unauthorized - invalid webhook secret" });
            }

            // 2. Verificar se é evento billing.paid
            if (payload.event !== "billing.paid") {
                console.log("Evento ignorado:", payload.event);
                return res.status(200).json({ message: "Evento ignorado", event: payload.event });
            }

            // 3. Extrair dados do payload
            const billing = payload.data?.billing || payload.billing || {};
            const customer = payload.data?.billing?.customer || billing.customer || {};
            const metadata = customer.metadata || {};
            const payment = payload.data?.payment || payload.payment || {};
            const products = payload.data?.billing?.products || billing.products || [];

            const amountCents = billing.amount || payment.amount || 0;
            const amountBRL = amountCents / 100;

            const clientName = metadata.name || customer.name || "Cliente Site";
            const clientPhone = metadata.cellphone || metadata.phone || customer.cellphone || "";
            const clientEmail = metadata.email || customer.email || "";
            const clientTaxId = metadata.taxId || "";

            const paymentMethod = payment.method || "PIX";
            const formaPagamento = paymentMethod === "CARD" ? "Crédito" : "Pix";

            const productExternalId = products.length > 0 ? products[0].externalId : null;
            const billingId = billing.id || payload.id || "";

            const isDevMode = payload.devMode === true || payload.devMode === "true";

            console.log("=== Webhook Vale Presente Recebido ===");
            console.log("Cliente:", clientName);
            console.log("Telefone:", clientPhone);
            console.log("Valor (centavos):", amountCents);
            console.log("Valor (R$):", amountBRL);
            console.log("Pagamento:", formaPagamento);
            console.log("DevMode:", isDevMode);
            console.log("Billing ID:", billingId);

            // 4. Idempotência
            if (billingId) {
                const existingQuery = await db
                    .collection("lancamentos")
                    .where("webhook_billing_id", "==", billingId)
                    .limit(1)
                    .get();

                if (!existingQuery.empty) {
                    console.log("Billing já processado:", billingId);
                    return res.status(200).json({
                        message: "Billing já processado anteriormente",
                        billingId,
                    });
                }
            }

            // 5. Calcular valor por uso (4 créditos por pacote)
            const valorPorUso = parseFloat((amountBRL / 4).toFixed(2));
            const tel55 = normalizarTelefone(clientPhone);
            const cid = tel55 ? codigoDe(tel55) : null;
            // Telefone, e-mail e CPF só em clientes_privado (só admin). Sem telefone válido: documento pela cobrança.
            const pessoais = { email: clientEmail.trim() || null, cpf: clientTaxId || null };
            const idPrivado = cid || (billingId ? `vale_${String(billingId).replace(/\//g, "_")}` : null);
            if (idPrivado) {
                await privadoRef(idPrivado).set({ ...(cid ? dadosPrivados(tel55) : { atualizado_em: FieldValue.serverTimestamp() }), ...pessoais }, { merge: true });
            }

            // 6. Registrar/atualizar cliente em clientes_vale (sem telefone, e-mail ou CPF)
            const clientKey = clientName.toLowerCase().trim();
            const clientRef = db.collection("clientes_vale").doc(clientKey);

            await clientRef.set(
                {
                    nome: clientName.trim(),
                    cliente_id: cid,
                    valor_por_uso: valorPorUso,
                    valor_total: amountBRL,
                    origem: "site_vale_presente",
                    updated_at: FieldValue.serverTimestamp(),
                },
                { merge: true }
            );

            // 7. Registrar lançamento de venda de vale
            const now = new Date();
            const lancamento = {
                data: Timestamp.fromDate(now),
                barbeiro_id: DEFAULT_BARBER.id,
                barbeiro_nome: DEFAULT_BARBER.name,
                loja_id: DEFAULT_BARBER.store,
                cliente_nome: clientName.trim(),
                cliente_id: cid,
                servico_descricao: "Compra de pacote",
                valor_bruto: amountBRL,
                forma_pagamento: formaPagamento,
                comissao_barbeiro: 0,
                tipo: "venda_vale",
                subscriber_code: null,
                created_at: FieldValue.serverTimestamp(),
                webhook_billing_id: billingId,
                webhook_origem: "site_vale_presente",
                webhook_dev_mode: isDevMode,
                webhook_product_id: productExternalId,
                webhook_payment_method: paymentMethod,
            };

            const docRef = await db.collection("lancamentos").add(lancamento);
            console.log("Lançamento criado com ID:", docRef.id);

            // 8. Notificar webhook Make.com
            try {
                const webhookData = {
                    evento: "compra_vale",
                    cliente_nome: clientName.trim(),
                    cliente_telefone: clientPhone.trim(),
                    valor: amountBRL,
                    barbeiro: DEFAULT_BARBER.name,
                    loja: DEFAULT_BARBER.store,
                    data: dataBR(now),
                    hora: horaBR(now),
                    data_hora_iso: now.toISOString(),
                    valor_pacote: amountBRL,
                    valor_por_visita: valorPorUso,
                    creditos: 4,
                    origem: "site_vale_presente",
                    forma_pagamento: formaPagamento,
                };

                await fetch(
                    "https://hook.us1.make.com/foskacjnw4sc883k1r7m82dsc4nmuhk3",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(webhookData),
                    }
                );
                console.log("Webhook Make.com notificado com sucesso");
            } catch (makeErr) {
                console.error("Erro ao notificar Make.com:", makeErr);
            }

            // 9. Responder com sucesso
            return res.status(200).json({
                success: true,
                message: "Venda de vale presente registrada com sucesso",
                lancamento_id: docRef.id,
                cliente: clientName.trim(),
                valor: amountBRL,
                creditos: 4,
                valor_por_uso: valorPorUso,
                dev_mode: isDevMode,
            });
        } catch (error) {
            console.error("Erro no webhook:", error);
            return res.status(500).json({
                error: "Internal server error",
                message: error.message,
            });
        }
    }
);

// ==========================================
// Reservas do Booksy enviadas pelo Make
// POST /registrarAgendamento  (header x-make-secret)
// ==========================================
function segredoConfere(recebido, esperado) {
    const a = Buffer.from(String(recebido || ""));
    const b = Buffer.from(String(esperado || ""));
    return a.length === b.length && b.length > 0 && timingSafeEqual(a, b);
}

exports.registrarAgendamento = onRequest(
    {
        region: "southamerica-east1",
        maxInstances: 10,
        invoker: "public",
        secrets: [MAKE_SECRET, CLIENTE_ID_SECRET],
    },
    async (req, res) => {
        if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
        if (!segredoConfere(req.get("x-make-secret"), MAKE_SECRET.value())) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const ag = parseAgendamento(req.body);
        if (!ag.ok) return res.status(422).json({ error: "Dados insuficientes", motivos: ag.erros });

        try {
            ag.telefone = await telefoneAtual(ag.telefone);
            const cid = codigoDe(ag.telefone);
            const agId = `${cid}_${ag.sufixo}`;
            const agRef = db.collection("agendamentos").doc(agId);
            const clienteRef = db.collection("clientes").doc(cid);
            const inicio = Timestamp.fromDate(ag.inicio);

            const novo = await db.runTransaction(async (tx) => {
                const existente = await tx.get(agRef);
                const dados = {
                    cliente_id: cid,
                    nome: ag.nome,
                    unidade: ag.unidade,
                    barbeiro: ag.barbeiro,
                    data: ag.data,
                    hora: ag.hora,
                    origem: "booksy",
                };
                // Reenvio do mesmo e-mail atualiza, mas mantém o criado_em original
                if (!existente.exists) dados.criado_em = FieldValue.serverTimestamp();
                tx.set(agRef, dados, { merge: true });
                tx.set(clienteRef, {
                    nome: ag.nome,
                    unidade: ag.unidade,
                    ultimo_barbeiro: ag.barbeiro,
                    ultimo_agendamento: inicio,
                    origem: "booksy",
                    atualizado_em: FieldValue.serverTimestamp(),
                }, { merge: true });
                tx.set(privadoRef(cid), dadosPrivados(ag.telefone), { merge: true });
                return !existente.exists;
            });

            return res.status(200).json({
                success: true,
                id: agId,
                novo,
                nome: ag.nome,
                data: ag.data,
                hora: ag.hora,
                barbeiro: ag.barbeiro,
                unidade: ag.unidade,
            });
        } catch (error) {
            console.error("registrarAgendamento:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
);

// ==========================================
// Pagamentos de assinatura da Celcoin enviados pelo Make
// POST /registrarPagamentoAssinatura  (header x-make-secret)
// ==========================================
const tsMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : null);
// Cobrança gravada antes do histórico: o próprio status vira a 1ª entrada
const historicoDe = (c) => c.historico || [{ status: c.status_celcoin || null, tipo: c.tipo || null, data_status: c.data_pagamento || null, recebido_em: c.recebido_em || null }];

exports.registrarPagamentoAssinatura = onRequest(
    {
        region: "southamerica-east1",
        maxInstances: 10,
        invoker: "public",
        secrets: [MAKE_SECRET, CLIENTE_ID_SECRET],
    },
    async (req, res) => {
        if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
        if (!segredoConfere(req.get("x-make-secret"), MAKE_SECRET.value())) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const p = parsePagamento(req.body);
        if (!p.ok) return res.status(422).json({ error: "Dados insuficientes", motivos: p.erros });

        try {
            // Assinante que trocou de telefone: a Celcoin ainda pode mandar o número antigo
            p.telefone = await telefoneAtual(p.telefone);
            const cid = codigoDe(p.telefone);
            // ID sem telefone: o lançamento guarda esse ID em pagamento_assinatura_id
            const pagId = `${cid}_${p.sufixo}`;
            const pagRef = db.collection("pagamentos_assinatura").doc(pagId);
            const clienteRef = db.collection("clientes").doc(cid);

            const resultado = await db.runTransaction(async (tx) => {
                const existente = await tx.get(pagRef);
                const anterior = existente.exists ? existente.data() : null;
                const cliente = await tx.get(clienteRef);
                const assinanteRef = db.collection("assinantes").doc(p.telefone);
                const assinanteAtual = await tx.get(assinanteRef);
                const ass = assinanteAtual.exists ? assinanteAtual.data() : null;
                const planosCelcoin = await tx.get(db.collection("configuracoes").doc("planos_celcoin"));

                // Data/hora do status na Celcoin (Transaction.statusDate); sem ela, a hora de chegada
                const dataMs = p.dataPagamento ? p.dataPagamento.getTime() : Date.now();
                const historico = anterior ? historicoDe(anterior) : [];
                const decisao = decidirEvento(
                    p,
                    dataMs,
                    anterior ? { dataMs: tsMs(anterior.data_pagamento), historico: historico.map((h) => ({ status: h.status, dataMs: tsMs(h.data_status) })) } : null,
                    ass ? { statusMs: tsMs(ass.status_evento_em), aprovadoMs: tsMs(ass.ultimo_aprovado_em), aprovadoTx: ass.ultimo_aprovado_tx || null } : null
                );
                if (decisao.duplicado) return { duplicado: true, situacao: anterior.situacao };

                let situacao = "registrado";
                let lancamentoId = anterior?.lancamento_id || null;

                if (p.classe === "baixa_manual" && decisao.atualizaCobranca && !lancamentoId) {
                    const pendentes = await tx.get(db.collection("lancamentos")
                        .where("cliente_id", "==", cid)
                        .where("tipo", "==", "renovacao_celcoin")
                        .where("status_celcoin", "==", "pendente"));
                    const escolhido = escolherCandidato(
                        pendentes.docs.map((d) => ({ id: d.id, valor: d.data().valor_bruto, dataMs: tsMs(d.data().data) })),
                        p.valor,
                        Date.now()
                    );
                    if (escolhido) {
                        lancamentoId = escolhido.id;
                        situacao = "vinculado";
                        tx.update(db.collection("lancamentos").doc(escolhido.id), {
                            status_celcoin: "baixado",
                            transacao_id: p.transacaoId,
                            pagamento_assinatura_id: pagId,
                            codigo_cliente: p.codigoCliente,
                            // E-mail e CPF ficam só no pagamento (só admin); o barbeiro lê lançamentos
                        });
                    } else {
                        situacao = "baixa_sem_lancamento";
                    }
                } else if (p.classe === "baixa_manual" && lancamentoId) {
                    situacao = "vinculado";
                } else if (p.classe === "cartao_aprovado") {
                    situacao = "receita_celcoin";
                }

                const dataStatus = Timestamp.fromMillis(dataMs);
                const entrada = { status: p.status, tipo: p.classe, data_status: dataStatus, recebido_em: Timestamp.now() };
                // Status mais recente da cobrança (pela data da Celcoin); um mais velho só entra no histórico
                tx.set(pagRef, decisao.atualizaCobranca ? {
                    transacao_id: p.transacaoId,
                    telefone: p.telefone,
                    cliente_id: cid,
                    nome: p.nome,
                    valor: p.valor,
                    plano: p.plano,
                    status_celcoin: p.status,
                    pago_fora: p.pagoFora,
                    tipo: p.classe,
                    receita: p.classe === "cartao_aprovado",
                    situacao,
                    lancamento_id: lancamentoId,
                    unidade: cliente.exists ? (cliente.data().unidade || null) : null,
                    codigo_cliente: p.codigoCliente,
                    email: p.email,
                    documento: p.documento,
                    data_pagamento: dataStatus,
                    data: p.dataStr,
                    ...(anterior ? { atualizado_em: FieldValue.serverTimestamp() } : { recebido_em: FieldValue.serverTimestamp() }),
                    // O que o Make mandou, para conferência (coleção só admin)
                    recebido: Object.fromEntries(Object.entries(req.body || {}).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : v])),
                    historico: [...historico, entrada],
                } : { historico: [...historico, entrada], atualizado_em: FieldValue.serverTimestamp() }, { merge: true });

                const upd = decisao.mudaAssinante ? atualizacaoCliente(p) : { celcoin: true };
                if (upd.ultimo_pagamento_assinatura instanceof Date) {
                    upd.ultimo_pagamento_assinatura = Timestamp.fromDate(upd.ultimo_pagamento_assinatura);
                }
                if (!cliente.exists && p.nome) upd.nome = p.nome;
                tx.set(clienteRef, { ...upd, atualizado_em: FieldValue.serverTimestamp() }, { merge: true });
                tx.set(privadoRef(cid), dadosPrivados(p.telefone), { merge: true });
                const updAss = atualizacaoAssinante(p, planosCelcoin.exists ? planosCelcoin.data() : {}, ass ? ass.status_assinatura : null, ass ? ass.plano : null);
                tx.set(assinanteRef, {
                    ...(decisao.mudaAssinante ? updAss : semStatus(updAss)),
                    ...(decisao.mudaAssinante && updAss.status_assinatura ? { status_evento_em: dataStatus } : {}),
                    ...(decisao.novoAprovado ? { ultimo_aprovado_em: dataStatus, ultimo_aprovado_tx: p.transacaoId } : {}),
                    // Assinante novo da Celcoin: o 1º evento marca o início (define o dia do ciclo)
                    ...(ass && ass.inicio_contrato ? {} : { inicio_contrato: p.dataStr || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) }),
                    ultima_atualizacao: FieldValue.serverTimestamp(),
                }, { merge: true });

                return { duplicado: false, situacao, lancamento_id: lancamentoId, vale_para_status: decisao.mudaAssinante };
            });

            return res.status(200).json({ success: true, id: pagId, tipo: p.classe, ...resultado });
        } catch (error) {
            console.error("registrarPagamentoAssinatura:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
);

// Renovação lançada DEPOIS da baixa: liga à baixa sem lançamento do mesmo cliente
exports.vincularRenovacaoCelcoin = onDocumentCreated(
    { document: "lancamentos/{id}", region: "southamerica-east1", secrets: [CLIENTE_ID_SECRET] },
    async (event) => {
        const lanc = event.data?.data();
        if (!lanc || lanc.tipo !== "renovacao_celcoin" || lanc.status_celcoin !== "pendente") return;
        const cid = codigoDoLancamento(lanc);
        if (!cid) return;
        const lancRef = event.data.ref;

        await db.runTransaction(async (tx) => {
            const atual = await tx.get(lancRef);
            if (!atual.exists || atual.data().status_celcoin !== "pendente") return;
            const baixas = await tx.get(db.collection("pagamentos_assinatura")
                .where("cliente_id", "==", cid)
                .where("situacao", "==", "baixa_sem_lancamento"));
            const escolhido = escolherCandidato(
                baixas.docs.map((d) => ({ id: d.id, valor: d.data().valor, dataMs: tsMs(d.data().data_pagamento), dados: d.data() })),
                lanc.valor_bruto,
                tsMs(lanc.data) || Date.now()
            );
            if (!escolhido) return;
            tx.update(lancRef, {
                status_celcoin: "baixado",
                transacao_id: escolhido.dados.transacao_id,
                pagamento_assinatura_id: escolhido.id,
                codigo_cliente: escolhido.dados.codigo_cliente || null,
            });
            tx.update(db.collection("pagamentos_assinatura").doc(escolhido.id), {
                situacao: "vinculado",
                lancamento_id: lancRef.id,
            });
        });
    }
);

// ==========================================
// Pesquisa de satisfação: 1h depois do lançamento do atendimento
// ==========================================
const PESQUISA_SECRET = defineSecret("PESQUISA_WEBHOOK_SECRET");
const PESQUISA_URL = "https://hook.us1.make.com/1dcpfjyqxsj3vnehi7a3n23mvybsjrw4";

exports.agendarPesquisaSatisfacao = onDocumentCreated(
    { document: "lancamentos/{id}", region: "southamerica-east1", secrets: [CLIENTE_ID_SECRET] },
    async (event) => {
        const dados = event.data?.data();
        if (!dados) return;
        const lanc = { ...dados, cliente_id: codigoDoLancamento(dados) };
        const agora = Date.now();
        const motivo = motivoParaNaoEnviar(lanc, agora);
        if (motivo) return;

        const fila = getFunctions().taskQueue("locations/southamerica-east1/functions/enviarPesquisaSatisfacao");
        try {
            await fila.enqueue(
                { lancamentoId: event.params.id, clienteId: lanc.cliente_id },
                { scheduleDelaySeconds: 3600, id: idTarefa(lanc.cliente_id, new Date(agora)) }
            );
        } catch (err) {
            // Mesmo cliente no mesmo dia (ex.: atendimento dividido em 2 lançamentos): já existe task
            if (err?.code === "functions/task-already-exists") return;
            throw err;
        }
    }
);

exports.enviarPesquisaSatisfacao = onTaskDispatched(
    {
        region: "southamerica-east1",
        retryConfig: { maxAttempts: 3, minBackoffSeconds: 60 },
        rateLimits: { maxConcurrentDispatches: 5 },
        secrets: [PESQUISA_SECRET, CLIENTE_ID_SECRET],
    },
    async (req) => {
        const { lancamentoId, clienteId } = req.data || {};
        // Task enfileirada antes da troca para código ainda traz o telefone
        const cid = clienteId || (TELEFONE_RE.test(String(req.data?.telefone || "")) ? codigoDe(req.data.telefone) : null);
        if (!lancamentoId || !cid) return;
        const telefone = await telefoneDoCodigo(cid);
        if (!telefone) return;

        const lancRef = db.collection("lancamentos").doc(lancamentoId);
        const clienteRef = db.collection("clientes").doc(cid);

        // Reserva o envio para não mandar duas pesquisas ao mesmo cliente ao mesmo tempo
        const lanc = await db.runTransaction(async (tx) => {
            const [l, c] = await Promise.all([tx.get(lancRef), tx.get(clienteRef)]);
            if (!l.exists || codigoDoLancamento(l.data()) !== cid) return null;
            if (l.data().pesquisaEnviadaEm) return null;
            const agora = Date.now();
            if (pesquisaHoje(c.data(), agora) || reservadaPorOutro(c.data(), lancamentoId, agora)) return null;
            tx.set(clienteRef, { pesquisaReservadaEm: Timestamp.now(), pesquisaReservadaPor: lancamentoId }, { merge: true });
            return l.data();
        });
        if (!lanc) return;

        let resp;
        try {
            resp = await fetch(PESQUISA_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-pesquisa-secret": PESQUISA_SECRET.value() },
                body: JSON.stringify(montarPayload(lancamentoId, lanc, telefone)),
            });
        } catch (err) {
            resp = null;
            console.error("pesquisa: falha de rede", err);
        }

        if (!resp || !resp.ok) {
            await clienteRef.set({ pesquisaReservadaEm: FieldValue.delete(), pesquisaReservadaPor: FieldValue.delete() }, { merge: true });
            // Erro faz o Cloud Tasks tentar de novo (até 3 tentativas no total)
            throw new Error(`Make respondeu ${resp ? resp.status : "sem resposta"}`);
        }

        const batch = db.batch();
        batch.set(clienteRef, {
            ultimaPesquisaEm: FieldValue.serverTimestamp(),
            pesquisaReservadaEm: FieldValue.delete(),
            pesquisaReservadaPor: FieldValue.delete(),
        }, { merge: true });
        batch.update(lancRef, { pesquisaEnviadaEm: FieldValue.serverTimestamp() });
        await batch.commit();
    }
);

// ==========================================
// Resumo mensal de assinaturas (resumos_assinatura/{AAAA-MM})
// ==========================================
async function gerarResumo(mes, { usarAtivosAtuais }) {
    const [y, m] = mes.split("-").map(Number);
    const ini = new Date(`${mes}-01T00:00:00-03:00`);
    const fim = new Date(new Date(y, m, 1).toLocaleDateString("en-CA") + "T00:00:00-03:00");
    const [assin, lanc, pags, conf, fin, atual] = await Promise.all([
        db.collection("assinantes").get(),
        db.collection("lancamentos").where("data", ">=", Timestamp.fromDate(ini)).where("data", "<", Timestamp.fromDate(fim)).get(),
        db.collection("pagamentos_assinatura").where("data", ">=", `${mes}-01`).where("data", "<=", `${mes}-31`).get(),
        db.collection("configuracoes").doc("assinaturas_liquido_real").get(),
        db.collection("financeiro").where("finance_category", "==", "receita_celcoin").get(),
        db.collection("resumos_assinatura").doc(mes).get(),
    ]);
    const assinantes = assin.docs.map((d) => d.data());
    const financeiro = fin.docs.map((d) => d.data())
        .filter((f) => f.status !== "provisionado" && (f.competence_month === mes || String(f.date || "").startsWith(mes)))
        .reduce((s, f) => s + (parseFloat(f.amount) || 0), 0);
    const lapis = conf.exists ? conf.data()[mes] : null;
    // Ativos no fim do mês só existe no momento em que o mês fecha; ao recalcular, mantém o valor gravado
    const ativos = usarAtivosAtuais
        ? assinantes.filter((a) => a.status_assinatura === "ativa").length
        : (atual.exists ? atual.data().ativos ?? null : null);
    const resumo = calcularResumo({
        mes, assinantes, ativos,
        lancamentosMes: lanc.docs.map((d) => d.data()),
        pagamentos: pags.docs.map((d) => d.data()),
        liquidoReal: lapis ?? null,
        liquidoFinanceiro: financeiro > 0 ? financeiro : null,
    });
    await db.collection("resumos_assinatura").doc(mes).set({
        ...resumo,
        gerado_em: FieldValue.serverTimestamp(),
        ...(usarAtivosAtuais ? {} : { recalculado_em: FieldValue.serverTimestamp() }),
    }, { merge: true });
    return resumo;
}

exports.resumoMensalAssinaturas = onSchedule(
    { schedule: "0 3 1 * *", timeZone: "America/Sao_Paulo", region: "southamerica-east1" },
    async () => {
        const mes = mesAnterior(new Date());
        const r = await gerarResumo(mes, { usarAtivosAtuais: true });
        console.log("resumo de assinaturas gravado", mes, JSON.stringify(r));
    }
);

// Chamáveis do app: só contas em usuarios/{uid}
async function exigirUsuario(request) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Faça login.");
    const u = await db.collection("usuarios").doc(uid).get();
    if (!u.exists) throw new HttpsError("permission-denied", "Usuário sem acesso.");
    return { uid, admin: u.data().admin === true };
}

exports.recalcularResumoAssinaturas = onCall(
    { region: "southamerica-east1" },
    async (request) => {
        const { admin } = await exigirUsuario(request);
        if (!admin) throw new HttpsError("permission-denied", "Só admin.");
        const mes = String(request.data?.mes || "");
        if (!/^\d{4}-\d{2}$/.test(mes)) throw new HttpsError("invalid-argument", "Mês no formato AAAA-MM.");
        return await gerarResumo(mes, { usarAtivosAtuais: false });
    }
);

// ==========================================
// Assinante de balcão vencido: no dia seguinte ao vencimento sem nova "Venda Assinatura"
// (a nova venda reativa o mesmo documento e reinicia o ciclo)
// ==========================================
exports.vencerAssinantesBalcao = onSchedule(
    { schedule: "30 3 * * *", timeZone: "America/Sao_Paulo", region: "southamerica-east1" },
    async () => {
        const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
        const ativos = await db.collection("assinantes").where("status_assinatura", "==", "ativa").get();
        const batch = db.batch();
        let n = 0;
        for (const d of ativos.docs) {
            const a = d.data();
            const forma = a.forma_cobranca || (a.origem === "balcao" ? "balcao" : a.origem || "celcoin");
            if (forma !== "balcao" || !a.vencimento || a.vencimento >= hoje) continue;
            batch.update(d.ref, { status_assinatura: "vencido", data_vencido: hoje, ultima_atualizacao: FieldValue.serverTimestamp() });
            n++;
        }
        if (n) await batch.commit();
        console.log("assinantes de balcão vencidos hoje:", n);
    }
);

// ==========================================
// Visão reduzida para os barbeiros: assinantes_publico/{código do cliente}, sem telefone
// Atualiza a cada mudança no cadastro, inclusive os dependentes de um pagador.
// Também garante clientes_privado/{código} (cadastro feito à mão pelo admin).
// ==========================================
exports.sincronizarAssinantePublico = onDocumentWritten(
    { document: "assinantes/{telefone}", region: "southamerica-east1", secrets: [CLIENTE_ID_SECRET] },
    async (event) => {
        const tel = event.params.telefone;
        if (!ID_ASSINANTE_RE.test(tel)) return console.error("assinantes: ID fora do formato 55+DDD+número (ou -depN)");
        const cid = codigoAssinante(tel);
        const depois = event.data?.after;
        const pubRef = db.collection("assinantes_publico").doc(cid);
        const dependentes = TELEFONE_RE.test(tel)
            ? (await db.collection("assinantes").where("pagador", "==", tel).get()).docs.filter((d) => ID_ASSINANTE_RE.test(d.id))
            : [];
        const gravarPublico = (id, dados, pagador = null) => {
            const c = codigoAssinante(id);
            return db.collection("assinantes_publico").doc(c).set(visaoPublica({ ...dados, cliente_id: c }, pagador));
        };

        if (!depois?.exists) {
            await pubRef.delete();
            for (const d of dependentes) await gravarPublico(d.id, d.data());
            return;
        }
        // Dependente sem telefone: o "telefone" do código é o próprio ID (as telas do admin ligam por ele);
        // o telefone do pagador fica só como contato
        await privadoRef(cid).set(DEP_RE.test(tel)
            ? { ...dadosPrivados(tel), telefone_contato: depois.data().telefone_contato || null, dependente: true }
            : dadosPrivados(tel), { merge: true });
        const a = { ...depois.data(), cliente_id: cid };
        let pagador = null;
        if (TELEFONE_RE.test(String(a.pagador || ""))) {
            const p = await db.collection("assinantes").doc(a.pagador).get();
            if (p.exists) pagador = { ...p.data(), cliente_id: codigoDe(p.id) };
        }
        await pubRef.set(visaoPublica(a, pagador));
        for (const d of dependentes) await gravarPublico(d.id, d.data(), a);
    }
);

// ==========================================
// App antigo ainda em cache pode gravar telefone no lançamento: troca pelo código
// ==========================================
exports.removerTelefoneLancamento = onDocumentCreated(
    { document: "lancamentos/{id}", region: "southamerica-east1", secrets: [CLIENTE_ID_SECRET] },
    async (event) => {
        const l = event.data?.data();
        if (!l || (l.cliente_telefone === undefined && l.assinante_telefone === undefined)) return;
        const upd = { cliente_telefone: FieldValue.delete(), assinante_telefone: FieldValue.delete() };
        for (const [campoTel, campoId] of [["cliente_telefone", "cliente_id"], ["assinante_telefone", "assinante_id"]]) {
            const tel55 = normalizarTelefone(l[campoTel]);
            if (!tel55 || l[campoId]) continue;
            upd[campoId] = codigoDe(tel55);
            await privadoRef(upd[campoId]).set(dadosPrivados(tel55), { merge: true });
        }
        await event.data.ref.update(upd);
    }
);

// ==========================================
// Chamáveis do app (barbeiro e admin)
// ==========================================

// Telefone digitado -> código e nome. Nunca devolve telefone.
// criar: cadastra no balcão se ainda não existir (pede nome).
exports.resolverCliente = onCall(
    { region: "southamerica-east1", secrets: [CLIENTE_ID_SECRET] },
    async (request) => {
        await exigirUsuario(request);
        const d = request.data || {};
        const digitado = normalizarTelefone(d.telefone);
        if (!digitado) throw new HttpsError("invalid-argument", "Telefone inválido: informe DDD + número.");
        // Número antigo de assinante que trocou de telefone também encontra o cadastro
        const tel55 = await telefoneAtual(digitado);
        const cid = codigoDe(tel55);
        const ref = db.collection("clientes").doc(cid);
        const snap = await ref.get();
        if (snap.exists) {
            await privadoRef(cid).set(dadosPrivados(tel55), { merge: true });
            return { cid, nome: snap.data().nome || null, existe: true };
        }
        // Código sem cadastro: serve para achar o assinante na Consulta Club
        if (!d.criar) return { cid, nome: null, existe: false };
        const nome = String(d.nome || "").trim();
        if (!nome) throw new HttpsError("invalid-argument", "Informe o nome do cliente.");
        const batch = db.batch();
        // Só cria: não sobrescreve dados do Booksy/Celcoin
        batch.create(ref, {
            nome,
            unidade: d.unidade || null,
            ultimo_barbeiro: d.barbeiro || null,
            ultimo_agendamento: null,
            origem: "balcao",
            criado_em: FieldValue.serverTimestamp(),
            atualizado_em: FieldValue.serverTimestamp(),
        });
        batch.set(privadoRef(cid), dadosPrivados(tel55), { merge: true });
        try {
            await batch.commit();
        } catch (err) {
            if (err.code !== 6) throw err; // 6 = ALREADY_EXISTS: cadastrado no mesmo instante por outro aparelho
        }
        return { cid, nome, existe: false };
    }
);

const MAKE_ASSINATURA_URL = "https://hook.us1.make.com/qym41xlme1xcqlqcp4eekavzx53h9mut";
const MAKE_VALE_URL = "https://hook.us1.make.com/foskacjnw4sc883k1r7m82dsc4nmuhk3";

async function avisarMake(url, dados) {
    try {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
        if (!r.ok) console.error("Make respondeu", r.status);
    } catch (err) {
        console.error("Make sem resposta:", err);
    }
}

// Venda de assinatura no balcão: grava assinantes/{telefone} e avisa o Make.
// O lançamento já foi gravado pelo app.
exports.venderAssinaturaBalcao = onCall(
    { region: "southamerica-east1", secrets: [CLIENTE_ID_SECRET] },
    async (request) => {
        const { admin } = await exigirUsuario(request);
        const d = request.data || {};
        const telefone = await telefoneDoCodigo(d.cliente_id);
        if (!telefone) throw new HttpsError("failed-precondition", "Cliente sem telefone cadastrado.");
        const nome = String(d.nome || "").trim();
        const plano = String(d.plano || "").trim();
        const valor = Number(d.valor);
        if (!nome || !plano || !(valor > 0)) throw new HttpsError("invalid-argument", "Nome, plano e valor são obrigatórios.");

        const agora = new Date();
        const ref = db.collection("assinantes").doc(telefone);
        const atual = await ref.get();
        const r = decidirVendaBalcao({ atual: atual.exists ? atual.data() : null, admin, nome, telefone, plano, valor, hoje: diaSP(agora) });
        if (r.upd) await ref.set({ ...r.upd, ultima_atualizacao: FieldValue.serverTimestamp() }, { merge: true });

        const tel = telefoneMake(telefone);
        await avisarMake(MAKE_ASSINATURA_URL, {
            evento: "venda_assinatura",
            cliente_nome: nome,
            telefone: tel,
            cliente_telefone: tel,
            plano,
            plano_id: d.plano_id || null,
            valor,
            status: "Paga fora do sistema",
            barbeiro: d.barbeiro || null,
            loja: d.loja || null,
            forma_pagamento: d.forma_pagamento || null,
            data: dataBR(agora),
            hora: horaBR(agora),
            data_hora_iso: agora.toISOString(),
        });
        return { resultado: r.resultado, origem: r.origem };
    }
);

// Compra ou uso de vale no balcão: avisa o Make com o telefone lido aqui
exports.notificarVale = onCall(
    { region: "southamerica-east1", secrets: [CLIENTE_ID_SECRET] },
    async (request) => {
        await exigirUsuario(request);
        const d = request.data || {};
        if (!["compra_vale", "uso_vale"].includes(d.evento)) throw new HttpsError("invalid-argument", "Evento inválido.");
        const tel = telefoneMake(await telefoneDoCodigo(d.cliente_id));
        const agora = new Date();
        const dados = {
            evento: d.evento,
            cliente_nome: String(d.cliente_nome || "").trim(),
            telefone: tel,
            cliente_telefone: tel,
            valor: Number(d.valor) || 0,
            barbeiro: d.barbeiro || null,
            loja: d.loja || null,
            data: dataBR(agora),
            hora: horaBR(agora),
            data_hora_iso: agora.toISOString(),
        };
        for (const k of ["valor_pacote", "valor_por_visita", "creditos", "saldo_restante", "servico"]) {
            if (d[k] !== undefined) dados[k] = d[k];
        }
        await avisarMake(MAKE_VALE_URL, dados);
        return { ok: true };
    }
);

// ==========================================
// Aba Assinaturas (só admin): editar assinante, trocar telefone e dependente sem telefone
// ==========================================
const quemEditou = (request) => request.auth?.token?.email || request.auth?.uid || null;

async function exigirAdmin(request) {
    const u = await exigirUsuario(request);
    if (!u.admin) throw new HttpsError("permission-denied", "Só admin.");
    return u;
}

// Campos do cadastro, com histórico (quem, quando, campo, antes/depois). O telefone muda em trocarTelefoneAssinante.
exports.editarAssinante = onCall(
    { region: "southamerica-east1" },
    async (request) => {
        await exigirAdmin(request);
        const id = String(request.data?.id || "");
        if (!ID_ASSINANTE_RE.test(id)) throw new HttpsError("invalid-argument", "Assinante inválido.");
        const ref = db.collection("assinantes").doc(id);
        const snap = await ref.get();
        if (!snap.exists) throw new HttpsError("not-found", "Assinante não encontrado.");
        const { upd, mudancas, erros } = edicaoAssinante(snap.data(), request.data?.campos, id);
        if (erros.length) throw new HttpsError("invalid-argument", erros.join(" "));
        if (!mudancas.length) return { mudancas: [] };
        if (upd.pagador) {
            const p = await db.collection("assinantes").doc(upd.pagador).get();
            if (!p.exists) throw new HttpsError("invalid-argument", "Pagador não encontrado.");
            if (p.data().pagador) throw new HttpsError("invalid-argument", `${p.data().nome || "Esse pagador"} já é dependente de outra pessoa.`);
            const deps = await db.collection("assinantes").where("pagador", "==", id).limit(1).get();
            if (!deps.empty) throw new HttpsError("invalid-argument", "Quem tem dependentes não pode ser dependente de outra pessoa.");
        }
        const em = new Date().toISOString();
        await ref.update({
            ...upd,
            // Status mudado à mão: evento da Celcoin mais antigo que isso não volta atrás
            ...(upd.status_assinatura ? { status_evento_em: Timestamp.fromDate(new Date(em)) } : {}),
            historico_edicoes: FieldValue.arrayUnion(...entradasHistorico(mudancas, quemEditou(request), em)),
            ultima_atualizacao: FieldValue.serverTimestamp(),
        });
        return { mudancas };
    }
);

// Troca de telefone: sem confirmar, só devolve o resumo do que vai ser movido.
// Confirmado: o assinante vai para o ID novo e tudo que apontava para o número antigo acompanha.
exports.trocarTelefoneAssinante = onCall(
    { region: "southamerica-east1", secrets: [CLIENTE_ID_SECRET], timeoutSeconds: 300 },
    async (request) => {
        await exigirAdmin(request);
        const d = request.data || {};
        const de = String(d.de || "");
        const para = normalizarTelefone(d.para);
        if (!TELEFONE_RE.test(de)) throw new HttpsError("invalid-argument", "Assinante inválido (dependente sem telefone não troca de telefone).");
        if (!para) throw new HttpsError("invalid-argument", "Telefone novo inválido: informe DDD + número.");
        if (para === de) throw new HttpsError("invalid-argument", "O telefone novo é igual ao atual.");

        const antigoRef = db.collection("assinantes").doc(de);
        const novoRef = db.collection("assinantes").doc(para);
        const [antigo, novo] = await Promise.all([antigoRef.get(), novoRef.get()]);
        if (!antigo.exists) throw new HttpsError("not-found", "Assinante não encontrado.");
        if (novo.exists) throw new HttpsError("already-exists", `Já existe assinante com o telefone novo: ${novo.data().nome || para}.`);

        const cidA = codigoDe(de), cidN = codigoDe(para);
        const col = (c) => db.collection(c);
        const [lancCli, lancAss, pags, ags, vales, deps, cliA, cliN, privA, privN] = await Promise.all([
            col("lancamentos").where("cliente_id", "==", cidA).get(),
            col("lancamentos").where("assinante_id", "==", cidA).get(),
            col("pagamentos_assinatura").where("telefone", "==", de).get(),
            col("agendamentos").where("cliente_id", "==", cidA).get(),
            col("clientes_vale").where("cliente_id", "==", cidA).get(),
            col("assinantes").where("pagador", "==", de).get(),
            col("clientes").doc(cidA).get(),
            col("clientes").doc(cidN).get(),
            privadoRef(cidA).get(),
            privadoRef(cidN).get(),
        ]);
        const lancs = new Map([...lancCli.docs, ...lancAss.docs].map((x) => [x.id, x]));
        const resumo = {
            de, para,
            nome: antigo.data().nome || null,
            lancamentos: lancs.size,
            pagamentos: pags.size,
            agendamentos: ags.size,
            vales: vales.size,
            dependentes: deps.docs.map((x) => x.data().nome || x.id),
            cadastro_cliente: cliA.exists,
            cliente_novo_existe: cliN.exists,
        };
        if (!d.confirmar) return { resumo };

        // Escritas em lotes de até 400; o assinante e os dependentes vão no último
        const ops = [];
        for (const l of lancs.values()) {
            const upd = {};
            if (l.data().cliente_id === cidA) upd.cliente_id = cidN;
            if (l.data().assinante_id === cidA) upd.assinante_id = cidN;
            ops.push((b) => b.update(l.ref, upd));
        }
        for (const p of pags.docs) {
            const novoId = idPagamentoMovido(p.id, cidA, cidN);
            if (!novoId) { ops.push((b) => b.update(p.ref, { telefone: para, cliente_id: cidN })); continue; }
            const dados = { ...p.data(), telefone: para, cliente_id: cidN };
            ops.push((b) => b.set(col("pagamentos_assinatura").doc(novoId), dados));
            ops.push((b) => b.delete(p.ref));
            const ligados = await col("lancamentos").where("pagamento_assinatura_id", "==", p.id).get();
            for (const l of ligados.docs) ops.push((b) => b.update(l.ref, { pagamento_assinatura_id: novoId }));
        }
        for (const a of ags.docs) ops.push((b) => b.update(a.ref, { cliente_id: cidN }));
        for (const v of vales.docs) ops.push((b) => b.update(v.ref, { cliente_id: cidN }));
        if (cliA.exists) {
            // O que já existe no código novo vale mais; o antigo só completa (inclui pesquisa e Booksy)
            ops.push((b) => b.set(col("clientes").doc(cidN), { ...cliA.data(), ...(cliN.exists ? cliN.data() : {}), atualizado_em: FieldValue.serverTimestamp() }));
            ops.push((b) => b.delete(cliA.ref));
        }
        const pa = privA.exists ? privA.data() : {};
        const pn = privN.exists ? privN.data() : {};
        ops.push((b) => b.set(privadoRef(cidN), { ...dadosPrivados(para), email: pn.email || pa.email || null, cpf: pn.cpf || pa.cpf || null }, { merge: true }));
        ops.push((b) => b.set(privadoRef(cidA), { movido_para: para, movido_em: FieldValue.serverTimestamp() }, { merge: true }));

        const em = new Date().toISOString();
        const a = antigo.data();
        const finais = [
            ...deps.docs.map((x) => (b) => b.update(x.ref, { pagador: para, ...(DEP_RE.test(x.id) ? { telefone_contato: para } : {}) })),
            (b) => b.set(novoRef, {
                ...a,
                ...(a.telefone !== undefined ? { telefone: para } : {}),
                telefones_anteriores: [...(a.telefones_anteriores || []), de],
                historico_edicoes: [...(a.historico_edicoes || []), ...entradasHistorico([{ campo: "telefone", antes: de, depois: para }], quemEditou(request), em)],
                ultima_atualizacao: FieldValue.serverTimestamp(),
            }),
            (b) => b.delete(antigoRef),
        ];
        for (let i = 0; i < ops.length; i += 400) {
            const b = db.batch();
            ops.slice(i, i + 400).forEach((f) => f(b));
            await b.commit();
        }
        const b = db.batch();
        finais.forEach((f) => f(b));
        await b.commit();
        return { resumo, movido: true };
    }
);

// ==========================================
// Financeiro: contas recorrentes viram "a pagar" em financeiro/rec_{id}_{AAAA-MM}
// ==========================================
async function gerarContasRecorrentes(hojeISO) {
    const recs = await db.collection("contas_recorrentes").get();
    let criadas = 0;
    for (const r of recs.docs) {
        const rec = { id: r.id, ...r.data() };
        for (const mes of mesesParaGerar(hojeISO)) {
            const ref = db.collection("financeiro").doc(`rec_${rec.id}_${mes}`);
            if ((await ref.get()).exists) continue;
            // Conta variável: previsão = o que foi pago no mês anterior
            const ant = rec.valor_tipo === "estimado" ? await db.collection("financeiro").doc(`rec_${rec.id}_${addMeses(mes, -1)}`).get() : null;
            const valorAnterior = ant?.exists && ant.data().status === "pago" ? Number(ant.data().amount) || null : null;
            const conta = contaDoMes(rec, mes, valorAnterior);
            if (!conta) continue;
            try {
                await ref.create({ ...conta.dados, created_at: FieldValue.serverTimestamp() });
                criadas++;
            } catch (err) {
                if (err.code !== 6) throw err; // 6 = ALREADY_EXISTS: gerada ao mesmo tempo pela outra chamada
            }
        }
    }
    return criadas;
}

exports.gerarContasRecorrentesDiario = onSchedule(
    { schedule: "10 4 * * *", timeZone: "America/Sao_Paulo", region: "southamerica-east1" },
    async () => console.log("contas recorrentes geradas:", await gerarContasRecorrentes(diaSP(new Date())))
);

// Chamado pelo app logo depois de cadastrar ou editar uma recorrência
exports.gerarContasRecorrentesAgora = onCall(
    { region: "southamerica-east1" },
    async (request) => {
        await exigirAdmin(request);
        return { criadas: await gerarContasRecorrentes(diaSP(new Date())) };
    }
);

// Dependente sem telefone próprio (ex.: filho): ID {telefone do pagador}-dep{n}; status segue o pagador
exports.adicionarDependente = onCall(
    { region: "southamerica-east1", secrets: [CLIENTE_ID_SECRET] },
    async (request) => {
        await exigirAdmin(request);
        const d = request.data || {};
        const pagador = String(d.pagador || "");
        const nome = String(d.nome || "").trim();
        if (!TELEFONE_RE.test(pagador)) throw new HttpsError("invalid-argument", "Pagador inválido.");
        if (!nome) throw new HttpsError("invalid-argument", "Informe o nome do dependente.");
        const pag = await db.collection("assinantes").doc(pagador).get();
        if (!pag.exists) throw new HttpsError("not-found", "Pagador não encontrado.");
        if (pag.data().pagador) throw new HttpsError("invalid-argument", "Esse assinante já é dependente de outra pessoa.");
        const existentes = await db.collection("assinantes").where("pagador", "==", pagador).get();
        const id = proximoIdDependente(pagador, existentes.docs.map((x) => x.id));
        const em = new Date().toISOString();
        await db.collection("assinantes").doc(id).create({
            ...novoDependente({ pagador, pagadorDados: pag.data(), nome, plano: String(d.plano || "").trim(), hoje: diaSP(new Date()) }),
            historico_edicoes: entradasHistorico([{ campo: "criado", antes: null, depois: `dependente de ${pag.data().nome || pagador}` }], quemEditou(request), em),
            criado_em: FieldValue.serverTimestamp(),
            ultima_atualizacao: FieldValue.serverTimestamp(),
        });
        return { id, cliente_id: codigoAssinante(id) };
    }
);