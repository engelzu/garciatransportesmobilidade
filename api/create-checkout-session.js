/**
 * Vercel Serverless Function - Criar Sessão de Checkout do Stripe
 * 
 * Endpoint: https://seu-projeto.vercel.app/api/create-checkout-session
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Apenas POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
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

        // Obter a URL de origem para success/cancel
        const origin = req.headers.origin || req.headers.referer || 'https://garciatransportesmobilidade.vercel.app';

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
                        },
                        unit_amount: Math.round(amount * 100), // Stripe usa centavos
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: `${origin}/passageiro.html?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/passageiro.html?payment=cancel`,
            client_reference_id: userId,
            customer_email: userEmail,
            metadata: {
                userId: userId,
                amount: amount.toString(),
                type: 'wallet_credit'
            }
        });

        res.status(200).json({ 
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
};
