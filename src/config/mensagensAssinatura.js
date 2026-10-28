// Mensagens de WhatsApp da aba Assinaturas (bloco "Precisa de ação").
// Pode editar à vontade. Marcadores trocados na hora de enviar:
//   [nome]  primeiro nome do assinante
//   [plano] nome do plano
//   [data]  data do vencimento (DD/MM)

export const MENSAGENS_WHATSAPP = {
    recusado: 'Fala, [nome]! Tudo certo? A mensalidade do seu plano não passou no cartão. Pode ter sido limite ou cartão vencido, acontece. Me responde aqui que eu te mando o link pra regularizar e continuar cortando com a gente. Qualquer coisa me chama!',

    vencido: 'Fala, [nome]! Seu plano [plano] venceu dia [data]. Quando passar aqui é só renovar no balcão, que a gente já te atende. Tamo junto!',

    pagou_nao_veio: 'Fala, [nome]! Seu plano tá ativo e você ainda não veio esse mês. Bora marcar? É só agendar pelo Booksy.',

    conferir: 'Fala, [nome]! Tudo certo? Tô conferindo as mensalidades e não achei o pagamento do seu plano [plano] deste mês. Se já pagou, me manda o comprovante por aqui que eu ajusto. Valeu!',
}
