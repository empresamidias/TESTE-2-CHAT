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

// Buffer para armazenar as últimas mensagens (Histórico recente)
const messageBuffer = [];
const MAX_BUFFER_SIZE = 50;

console.log('--------------------------------------------------');
console.log(' N8N Chat Relay Server');
console.log('--------------------------------------------------');

// Endpoint solicitado: POST /api/webhook-receiver
app.post('/api/webhook-receiver', (req, res) => {
    let payloadData = req.body;
    console.log(`[POST] Recebido webhook bruto:`, JSON.stringify(payloadData).substring(0, 150));

    // --- LÓGICA DE EXTRAÇÃO DE JSON ANINHADO ---
    // Objetivo: Converter { oi: '{"message": "oi"}' } em { "message": "oi" }
    try {
        const keys = Object.keys(payloadData);
        // Se o objeto tem chaves, verificamos se alguma delas contém uma string JSON
        if (keys.length > 0) {
            for (const key of keys) {
                const value = payloadData[key];
                // Verifica se é string e parece um JSON (começa com {)
                if (typeof value === 'string' && value.trim().startsWith('{')) {
                    try {
                        const parsedInner = JSON.parse(value);
                        // Se o JSON interno tem campos relevantes de mensagem, promovemos ele
                        // para ser o payload principal
                        if (parsedInner && (parsedInner.message || parsedInner.text || parsedInner.output)) {
                            console.log(`[RELAY] JSON aninhado detectado na chave '${key}'. Extraindo payload.`);
                            payloadData = parsedInner;
                            break; // Encontramos o payload real, paramos de procurar
                        }
                    } catch (e) {
                        // Não era um JSON válido, ignoramos e mantemos o original
                    }
                }
            }
        }
    } catch (err) {
        console.error('[RELAY] Erro ao processar payload:', err);
    }
    // -------------------------------------------

    const payloadString = JSON.stringify(payloadData);
    
    // Armazena no buffer (para clientes que conectarem depois)
    messageBuffer.push(payloadString);
    if (messageBuffer.length > MAX_BUFFER_SIZE) {
        messageBuffer.shift(); // Remove a mais antiga se passar do limite
    }

    let clientsCount = 0;

    // Retransmite para todos os clientes (Chat) conectados via WebSocket
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payloadString);
            clientsCount++;
        }
    });

    console.log(`[RELAY] Enviado para ${clientsCount} cliente(s). Armazenado no buffer (${messageBuffer.length} msgs).`);
    
    // Responde 200 OK para o N8N não dar erro
    res.status(200).send('OK');
});

// Health Check
app.get('/', (req, res) => {
    res.send({ status: 'active', clients: wss.clients.size, bufferSize: messageBuffer.length });
});

// Gerenciamento de Conexões WS
wss.on('connection', (ws) => {
    console.log('[WS] Novo cliente conectado (Chat Front-end)');

    ws.send(JSON.stringify({
        type: 'SYSTEM',
        text: 'Conectado ao servidor de retransmissão.'
    }));

    // ENVIAR HISTÓRICO: Se houver mensagens no buffer, envia para o novo cliente imediatamente
    if (messageBuffer.length > 0) {
        console.log(`[WS] Enviando ${messageBuffer.length} mensagens do histórico para o novo cliente.`);
        messageBuffer.forEach((msg) => {
            ws.send(msg);
        });
    }

    ws.on('close', () => console.log('[WS] Cliente desconectado'));
    ws.on('error', (err) => console.error('[WS] Erro:', err));
});

server.listen(PORT, () => {
    console.log(`\nServidor rodando na porta ${PORT}`);
    console.log(`\nPARA TESTAR: Envie um POST para a URL do seu Ngrok:`);
    console.log(`POST https://SEU_NGROK_URL/api/webhook-receiver`);
    console.log(`Body: { "oi": "{\\"message\\": \\"Olá mundo\\"}" }`);
    console.log(`--------------------------------------------------\n`);
});