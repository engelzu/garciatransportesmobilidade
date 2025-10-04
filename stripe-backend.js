/**
 * BACKEND PARA STRIPE - Garcia Mobilidade
 * 
 * Este é um servidor Node.js simples que processa pagamentos do Stripe com segurança.
 * A chave secreta do Stripe NUNCA deve estar no frontend!
 * 
 * INSTALAÇÃO:
 * 1. npm init -y
 * 2. npm install express stripe cors dotenv
 * 3. Crie arquivo .env com: STRIPE_SECRET_KEY=sk_test_sua_chave_secreta
 * 4. node stripe-backend.js
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_51SEJCBFyO4P04Uv0iSN9Jn46XLbJ5dkLeE55hTlD9TILyyxlpKPbfIPfazGjwJQGhzlHyiuLekkVMxiJPCglVqEg00x8xiB14d');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Endpoint para criar sessão de checkout
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { amount, userId, userEmail } = req.body;

        // Validações
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Valor inválido' });
        }

        if (!userId) {
            return res.status(400).json({ error: 'ID do usuário não fornecido' });
        }

        // Criar sessão do Stripe
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'brl',
                        product_data: {
                            name: 'Créditos Garcia Mobilidade',
                            description: `Adicionar R$ ${amount.toFixed(2)} à carteira`,
                            images: ['https://via.placeholder.com/300x200?text=Garcia+Mobilidade'],
                        },
                        unit_amount: Math.round(amount * 100), // Stripe usa centavos
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${req.headers.origin || 'http://localhost'}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin || 'http://localhost'}?payment=cancel`,
            client_reference_id: userId,
            customer_email: userEmail,
            metadata: {
                userId: userId,
                amount: amount.toString(),
                type: 'wallet_credit'
            }
        });

        res.json({ 
            sessionId: session.id,
            url: session.url 
        });

    } catch (error) {
        console.error('Erro ao criar sessão:', error);
        res.status(500).json({ 
            error: 'Erro ao processar pagamento',
            message: error.message 
        });
    }
});

// Webhook do Stripe (para confirmar pagamentos automaticamente)
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('Erro na verificação do webhook:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Processar evento
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            console.log('✅ Pagamento confirmado:', session);
            
            // Aqui você pode:
            // 1. Inserir a transação no Supabase
            // 2. Enviar notificação ao usuário
            // 3. Atualizar saldo automaticamente
            
            const userId = session.client_reference_id;
            const amount = parseFloat(session.metadata.amount);
            
            console.log(`Adicionar R$ ${amount} ao usuário ${userId}`);
            
            // TODO: Integrar com Supabase aqui
            // const { error } = await supabase
            //     .from('wallet_transactions')
            //     .insert({
            //         profile_id: userId,
            //         amount: amount,
            //         transaction_type: 'credit',
            //         description: 'Créditos adicionados via Stripe',
            //         stripe_session_id: session.id
            //     });
            
            break;

        case 'payment_intent.payment_failed':
            console.error('❌ Pagamento falhou:', event.data.object);
            break;

        default:
            console.log(`Evento não tratado: ${event.type}`);
    }

    res.json({ received: true });
});

// Endpoint para verificar status de pagamento
app.get('/check-payment/:sessionId', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
        
        res.json({
            status: session.payment_status,
            amount: session.amount_total / 100,
            userId: session.client_reference_id
        });
    } catch (error) {
        console.error('Erro ao verificar pagamento:', error);
        res.status(500).json({ error: 'Erro ao verificar pagamento' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor Stripe rodando!' });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor Stripe rodando na porta ${PORT}`);
    console.log(`📍 Endpoint: http://localhost:${PORT}/create-checkout-session`);
    console.log(`🔐 Usando chave: ${process.env.STRIPE_SECRET_KEY ? '***' + process.env.STRIPE_SECRET_KEY.slice(-10) : 'NÃO CONFIGURADA'}`);
});

module.exports = app;
