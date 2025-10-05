const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // GET - Teste de saúde
    if (req.method === 'GET') {
        return res.json({
            status: 'OK',
            message: 'API Stripe funcionando!',
            timestamp: new Date().toISOString(),
            hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
            keyLength: process.env.STRIPE_SECRET_KEY?.length || 0,
            keyPreview: process.env.STRIPE_SECRET_KEY ? 
                process.env.STRIPE_SECRET_KEY.substring(0, 20) + '...' + process.env.STRIPE_SECRET_KEY.slice(-4) : 
                'NÃO CONFIGURADA'
        });
    }

    // POST - Criar sessão de pagamento
    if (req.method === 'POST') {
        try {
            const { amount, email, userId } = req.body;

            // Validações básicas
            if (!amount || amount <= 0) {
                return res.status(400).json({ 
                    error: 'Valor inválido',
                    received: { amount, email, userId }
                });
            }

            if (!email) {
                return res.status(400).json({ 
                    error: 'Email obrigatório',
                    received: { amount, email, userId }
                });
            }

            // Verificar chave Stripe
            if (!process.env.STRIPE_SECRET_KEY) {
                return res.status(500).json({ 
                    error: 'Chave Stripe não configurada no servidor',
                    debug: {
                        hasKey: false,
                        envVars: Object.keys(process.env).filter(key => key.includes('STRIPE'))
                    }
                });
            }

            console.log('🔑 Stripe Key Preview:', process.env.STRIPE_SECRET_KEY.substring(0, 20) + '...' + process.env.STRIPE_SECRET_KEY.slice(-4));
            console.log('💰 Creating session for:', { amount, email, userId });

            // Criar sessão Stripe
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'brl',
                        product_data: {
                            name: '🧪 Teste Garcia Mobilidade',
                            description: `Teste de pagamento - R$ ${amount.toFixed(2)}`,
                        },
                        unit_amount: Math.round(amount * 100), // centavos
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                success_url: `${req.headers.origin || 'http://localhost'}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${req.headers.origin || 'http://localhost'}?payment=cancel`,
                client_reference_id: userId,
                customer_email: email,
                metadata: {
                    userId: userId,
                    amount: amount.toString(),
                    type: 'teste_stripe',
                    timestamp: new Date().toISOString()
                }
            });

            console.log('✅ Session created:', session.id);

            return res.json({
                success: true,
                sessionId: session.id,
                url: session.url,
                debug: {
                    amount: amount,
                    email: email,
                    userId: userId,
                    sessionId: session.id
                }
            });

        } catch (error) {
            console.error('❌ Stripe Error:', error);
            
            return res.status(500).json({
                error: 'Erro ao criar sessão de pagamento',
                message: error.message,
                type: error.type || 'unknown',
                debug: {
                    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
                    keyLength: process.env.STRIPE_SECRET_KEY?.length || 0,
                    errorCode: error.code,
                    errorType: error.type
                }
            });
        }
    }

    // Método não permitido
    return res.status(405).json({ 
        error: 'Method not allowed',
        allowed: ['GET', 'POST', 'OPTIONS'],
        received: req.method
    });
};
