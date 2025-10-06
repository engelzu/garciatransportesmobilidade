// Importa a sua função original que já existe
const webhookHandler = require('../webhook.js');

// Exporta a função para ser usada nesta nova rota
module.exports = webhookHandler;
