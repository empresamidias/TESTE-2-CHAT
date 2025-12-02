const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');

// Configuração
const PORT = 3000;
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Servidor HTTP + WebSocket
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

console.log('--------------------------------------------------');
console.log(' N8N Chat Relay Server');
console.log('--------------------------------------------------');

// Endpoint solicitado: POST /api/webhook-receiver
app.post('/api/webhook-receiver', (req, res) => {
    console.log(`[POST] Recebido webhook do N8N na rota /api/webhook-receiver:`, JSON.stringify(req.body).substring(0, 100) + '...');

    const payload = JSON.stringify(req.body);
    let clientsCount = 0;

    // Retransmite para todos os clientes (Chat) conectados via WebSocket
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
            clientsCount++;
        }
    });

    console.log(`[RELAY] Enviado para ${clientsCount} cliente(s) conectado(s).`);
    
    // Responde 200 OK para o N8N não dar erro
    res.status(200).send('OK');
});

// Health Check
app.get('/', (req, res) => {
    res.send({ status: 'active', clients: wss.clients.size });
});

// Gerenciamento de Conexões WS
wss.on('connection', (ws) => {
    console.log('[WS] Novo cliente conectado (Chat Front-end)');

    ws.send(JSON.stringify({
        type: 'SYSTEM',
        text: 'Conectado ao servidor de retransmissão.'
    }));

    ws.on('close', () => console.log('[WS] Cliente desconectado'));
    ws.on('error', (err) => console.error('[WS] Erro:', err));
});

server.listen(PORT, () => {
    console.log(`\nServidor rodando na porta ${PORT}`);
    console.log(`1. Endpoint para o N8N: [URL_DO_NGROK]/api/webhook-receiver`);
    console.log(`--------------------------------------------------\n`);
});