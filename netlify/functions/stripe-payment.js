const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Apenas POST permitido
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { amount, userId, userEmail } = req.body;

        // Validações
        if (!amount || amount <= 0) {
            return res.status(400).json({ error: 'Valor inválido' });
        }

        if (!userId) {
            return res.status(400).json({ error: 'ID do usuário não fornecido' });
        }

        // Verificar chave Stripe
        if (!process.env.STRIPE_SECRET_KEY) {
            return res.status(500).json({ error: 'Chave Stripe não configurada' });
        }

        console.log('💰 Creating session for:', { amount, userId, userEmail });

        // Criar sessão Stripe
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'brl',
                    product_data: {
                        name: 'Créditos Garcia Mobilidade',
                        description: `Adicionar R$ ${amount.toFixed(2)} à carteira`,
                    },
                    unit_amount: Math.round(amount * 100), // centavos
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${req.headers.origin}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}?payment=cancel`,
            client_reference_id: userId,
            customer_email: userEmail,
            metadata: {
                userId: userId,
                amount: amount.toString(),
                type: 'wallet_credit'
            }
        });

        console.log('✅ Session created:', session.id);

        return res.json({
            sessionId: session.id,
            url: session.url
        });

    } catch (error) {
        console.error('❌ Stripe Error:', error);
        
        return res.status(500).json({
            error: 'Erro ao processar pagamento',
            message: error.message
        });
    }
};
