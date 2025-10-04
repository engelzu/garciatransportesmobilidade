/**
 * VERCEL SERVERLESS FUNCTION - Garcia Mobilidade
 * Arquivo: /api/create-checkout-session.js
 * 
 * Este arquivo deve ser colocado na pasta /api/ do seu projeto Vercel
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Permitir apenas POST
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

        // Verificar se a chave do Stripe está configurada
        if (!process.env.STRIPE_SECRET_KEY) {
            console.error('STRIPE_SECRET_KEY não configurada');
            return res.status(500).json({ error: 'Configuração do servidor incompleta' });
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
            success_url: `${req.headers.origin || req.headers.host}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin || req.headers.host}?payment=cancel`,
            client_reference_id: userId,
            customer_email: userEmail,
            metadata: {
                userId: userId,
                amount: amount.toString(),
                type: 'wallet_credit'
            }
        });

        console.log('✅ Sessão criada:', session.id);

        res.json({ 
            sessionId: session.id,
            url: session.url 
        });

    } catch (error) {
        console.error('❌ Erro ao criar sessão:', error);
        res.status(500).json({ 
            error: 'Erro ao processar pagamento',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
