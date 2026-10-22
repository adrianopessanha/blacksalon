const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { defineSecret } = require("firebase-functions/params");
const { timingSafeEqual } = require("crypto");
const { parseAgendamento } = require("./agendamento");
const { parsePagamento, atualizacaoCliente, atualizacaoAssinante, escolherCandidato } = require("./assinatura");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
const { getFunctions } = require("firebase-admin/functions");
const { motivoParaNaoEnviar, pesquisaHoje, reservadaPorOutro, montarPayload, idTarefa } = require("./pesquisa");

const MAKE_SECRET = defineSecret("MAKE_SECRET");
// Deve bater com o campo webhookSecret que o Make envia no corpo JSON
const VALE_WEBHOOK_SECRET_NOVO = defineSecret("VALE_WEBHOOK_SECRET_NOVO");

initializeApp();
const db = getFirestore();

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
        secrets: [VALE_WEBHOOK_SECRET_NOVO],
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

            // 6. Registrar/atualizar cliente em clientes_vale
            const clientKey = clientName.toLowerCase().trim();
            const clientRef = db.collection("clientes_vale").doc(clientKey);

            await clientRef.set(
                {
                    nome: clientName.trim(),
                    telefone: clientPhone.trim(),
                    email: clientEmail.trim(),
                    cpf: clientTaxId,
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
                cliente_telefone: clientPhone.trim(),
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
                webhook_email: clientEmail,
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
                    data: now.toLocaleDateString("pt-BR"),
                    hora: now.toLocaleTimeString("pt-BR"),
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
        secrets: [MAKE_SECRET],
    },
    async (req, res) => {
        if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
        if (!segredoConfere(req.get("x-make-secret"), MAKE_SECRET.value())) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const ag = parseAgendamento(req.body);
        if (!ag.ok) return res.status(422).json({ error: "Dados insuficientes", motivos: ag.erros });

        try {
            const agRef = db.collection("agendamentos").doc(ag.id);
            const clienteRef = db.collection("clientes").doc(ag.telefone);
            const inicio = Timestamp.fromDate(ag.inicio);

            const novo = await db.runTransaction(async (tx) => {
                const existente = await tx.get(agRef);
                const dados = {
                    telefone: ag.telefone,
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
                    telefone: ag.telefone,
                    unidade: ag.unidade,
                    ultimo_barbeiro: ag.barbeiro,
                    ultimo_agendamento: inicio,
                    origem: "booksy",
                    atualizado_em: FieldValue.serverTimestamp(),
                }, { merge: true });
                return !existente.exists;
            });

            return res.status(200).json({
                success: true,
                id: ag.id,
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

exports.registrarPagamentoAssinatura = onRequest(
    {
        region: "southamerica-east1",
        maxInstances: 10,
        invoker: "public",
        secrets: [MAKE_SECRET],
    },
    async (req, res) => {
        if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
        if (!segredoConfere(req.get("x-make-secret"), MAKE_SECRET.value())) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const p = parsePagamento(req.body);
        if (!p.ok) return res.status(422).json({ error: "Dados insuficientes", motivos: p.erros });

        try {
            const pagRef = db.collection("pagamentos_assinatura").doc(p.id);
            const clienteRef = db.collection("clientes").doc(p.telefone);

            const resultado = await db.runTransaction(async (tx) => {
                const existente = await tx.get(pagRef);
                if (existente.exists) return { duplicado: true, situacao: existente.data().situacao };

                const cliente = await tx.get(clienteRef);
                let situacao = "registrado";
                let lancamentoId = null;

                if (p.classe === "baixa_manual") {
                    const pendentes = await tx.get(db.collection("lancamentos")
                        .where("cliente_telefone", "==", p.telefone)
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
                            pagamento_assinatura_id: p.id,
                            codigo_cliente: p.codigoCliente,
                            email: p.email,
                            documento: p.documento,
                        });
                    } else {
                        situacao = "baixa_sem_lancamento";
                    }
                } else if (p.classe === "cartao_aprovado") {
                    situacao = "receita_celcoin";
                }

                tx.set(pagRef, {
                    transacao_id: p.transacaoId,
                    telefone: p.telefone,
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
                    data_pagamento: p.dataPagamento ? Timestamp.fromDate(p.dataPagamento) : FieldValue.serverTimestamp(),
                    data: p.dataStr,
                    recebido_em: FieldValue.serverTimestamp(),
                });

                const upd = atualizacaoCliente(p);
                if (upd.ultimo_pagamento_assinatura instanceof Date) {
                    upd.ultimo_pagamento_assinatura = Timestamp.fromDate(upd.ultimo_pagamento_assinatura);
                }
                if (!cliente.exists && p.nome) upd.nome = p.nome;
                tx.set(clienteRef, { ...upd, atualizado_em: FieldValue.serverTimestamp() }, { merge: true });
                tx.set(db.collection("assinantes").doc(p.telefone), {
                    ...atualizacaoAssinante(p),
                    ultima_atualizacao: FieldValue.serverTimestamp(),
                }, { merge: true });

                return { duplicado: false, situacao, lancamento_id: lancamentoId };
            });

            return res.status(200).json({ success: true, id: p.id, tipo: p.classe, ...resultado });
        } catch (error) {
            console.error("registrarPagamentoAssinatura:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
);

// Renovação lançada DEPOIS da baixa: liga à baixa sem lançamento do mesmo telefone
exports.vincularRenovacaoCelcoin = onDocumentCreated(
    { document: "lancamentos/{id}", region: "southamerica-east1" },
    async (event) => {
        const lanc = event.data?.data();
        if (!lanc || lanc.tipo !== "renovacao_celcoin" || lanc.status_celcoin !== "pendente" || !lanc.cliente_telefone) return;
        const lancRef = event.data.ref;

        await db.runTransaction(async (tx) => {
            const atual = await tx.get(lancRef);
            if (!atual.exists || atual.data().status_celcoin !== "pendente") return;
            const baixas = await tx.get(db.collection("pagamentos_assinatura")
                .where("telefone", "==", lanc.cliente_telefone)
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
                email: escolhido.dados.email || null,
                documento: escolhido.dados.documento || null,
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
    { document: "lancamentos/{id}", region: "southamerica-east1" },
    async (event) => {
        const lanc = event.data?.data();
        const agora = Date.now();
        const motivo = motivoParaNaoEnviar(lanc, agora);
        if (motivo) return;

        const fila = getFunctions().taskQueue("locations/southamerica-east1/functions/enviarPesquisaSatisfacao");
        try {
            await fila.enqueue(
                { lancamentoId: event.params.id, telefone: lanc.cliente_telefone },
                { scheduleDelaySeconds: 3600, id: idTarefa(lanc.cliente_telefone, new Date(agora)) }
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
        secrets: [PESQUISA_SECRET],
    },
    async (req) => {
        const { lancamentoId, telefone } = req.data || {};
        if (!lancamentoId || !telefone) return;

        const lancRef = db.collection("lancamentos").doc(lancamentoId);
        const clienteRef = db.collection("clientes").doc(telefone);

        // Reserva o envio para não mandar duas pesquisas ao mesmo cliente ao mesmo tempo
        const lanc = await db.runTransaction(async (tx) => {
            const [l, c] = await Promise.all([tx.get(lancRef), tx.get(clienteRef)]);
            if (!l.exists || l.data().cliente_telefone !== telefone) return null;
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
                body: JSON.stringify(montarPayload(lancamentoId, lanc)),
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
