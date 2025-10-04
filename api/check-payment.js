/**
 * Vercel Serverless Function - Verificar Status de Pagamento
 * 
 * Endpoint: https://seu-projeto.vercel.app/api/check-payment?session_id=cs_test_xxx
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Apenas GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const { session_id } = req.query;

        if (!session_id) {
            return res.status(400).json({ error: 'session_id não fornecido' });
        }

        // Buscar sessão no Stripe
        const session = await stripe.checkout.sessions.retrieve(session_id);
        
        res.status(200).json({
            status: session.payment_status,
            amount: session.amount_total / 100,
            userId: session.client_reference_id,
            metadata: session.metadata
        });

    } catch (error) {
        console.error('Erro ao verificar pagamento:', error);
        res.status(500).json({ 
            error: 'Erro ao verificar pagamento',
            message: error.message 
        });
    }
};
