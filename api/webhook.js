const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Inicializar cliente Supabase com as variáveis de ambiente
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY // Usar a chave ANON, pois este é um processo de backend seguro
);

module.exports = async (req, res) => {
    // Apenas o método POST é permitido
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error('❌ Erro Crítico: A variável de ambiente STRIPE_WEBHOOK_SECRET não está configurada.');
        return res.status(500).json({ error: 'Webhook secret não configurado no servidor.' });
    }

    let event;

    try {
        // A Vercel já faz o parse do body, então usamos req.body diretamente
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        console.log(`✅ Assinatura do Webhook verificada com sucesso. Evento: ${event.type}`);
    } catch (err) {
        console.error(`❌ Falha na verificação da assinatura do webhook: ${err.message}`);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    // Processar o evento 'checkout.session.completed'
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        console.log('💰 Processando evento checkout.session.completed para a sessão:', session.id);

        try {
            // Extrair metadados importantes da sessão do Stripe
            const userId = session.client_reference_id; // ID do usuário do Supabase
            const amount = parseFloat(session.metadata.amount); // Valor do crédito
            const paymentStatus = session.payment_status;

            // Validação dos dados recebidos
            if (paymentStatus !== 'paid') {
                console.log(`🔔 Sessão ${session.id} não foi paga ainda (${paymentStatus}). Ignorando.`);
                return res.json({ received: true, message: 'Sessão não paga, nada a fazer.' });
            }

            if (!userId || !amount || amount <= 0) {
                console.error('❌ Dados ausentes ou inválidos na sessão do Stripe:', { userId, amount });
                return res.status(400).json({ error: 'Metadados da sessão do Stripe ausentes ou inválidos.' });
            }

            // **AÇÃO PRINCIPAL: Inserir o crédito na tabela `wallet_transactions`**
            const { data, error } = await supabase
                .from('wallet_transactions')
                .insert({
                    profile_id: userId,
                    amount: amount,
                    transaction_type: 'credit',
                    description: `Crédito de R$ ${amount.toFixed(2)} via Stripe`,
                    // O Stripe já garante que este evento só é enviado uma vez.
                });

            if (error) {
                console.error('❌ Erro ao inserir a transação no Supabase:', error);
                // Lançar o erro para que a resposta seja 500 e o Stripe possa tentar novamente.
                throw new Error(`Erro no Supabase: ${error.message}`);
            }

            console.log(`✅ Sucesso! Crédito de R$ ${amount.toFixed(2)} adicionado para o usuário ${userId}. Transação ID: ${data ? data[0].id : 'N/A'}`);

        } catch (error) {
            console.error('❌ Erro ao processar o webhook:', error);
            // Retorna um erro 500 para que o Stripe tente reenviar o webhook mais tarde.
            return res.status(500).json({ error: 'Erro interno ao processar o webhook.' });
        }
    } else {
        console.log(`🔔 Evento não tratado recebido: ${event.type}`);
    }

    // Responda ao Stripe para confirmar o recebimento do evento
    res.json({ received: true });
};
