import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Settings, Activity, Plug, AlertCircle, RefreshCw, ArrowDownToLine, Terminal } from 'lucide-react';
import { ConnectionStatus, Message, SenderType } from './types';
import { ChatMessage } from './components/ChatMessage';

const App: React.FC = () => {
  // --- State ---
  const [webhookUrl, setWebhookUrl] = useState<string>('');
  const [inputUrl, setInputUrl] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.IDLE);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [showConfig, setShowConfig] = useState<boolean>(true);
  const [debugInput, setDebugInput] = useState<string>('{\n  "message": "Olá do N8N!",\n  "data": {\n    "key": "value"\n  }\n}');

  // Ref for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- 1. ABERTURA DE CONEXÃO (GET) ---
  const connectToWebhook = async (url: string) => {
    setConnectionStatus(ConnectionStatus.CONNECTING);
    setRetryCount(0);
    
    // Helper for delay
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    let attempts = 0;
    const maxAttempts = 3;
    let connected = false;

    while (attempts < maxAttempts && !connected) {
      try {
        attempts++;
        console.log(`[GET] Tentativa de conexão ${attempts}/${maxAttempts} para ${url}`);
        
        // Strict GET request to validate connection
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });

        if (response.status === 200) {
          connected = true;
          setConnectionStatus(ConnectionStatus.CONNECTED);
          setWebhookUrl(url);
          setShowConfig(false);
          addSystemMessage(`Conexão estabelecida com sucesso via GET (Status 200). Webhook ativo.`);
        } else {
            throw new Error(`Status ${response.status}`);
        }
      } catch (error) {
        console.warn(`[GET] Falha na tentativa ${attempts}:`, error);
        setRetryCount(attempts);
        if (attempts < maxAttempts) {
            await wait(1500); // Wait before retry
        }
      }
    }

    if (!connected) {
      setConnectionStatus(ConnectionStatus.ERROR);
      // Fail after 3 attempts
      addSystemMessage("Falha ao conectar ao servidor após 3 tentativas. Verifique a URL e se o workflow aceita GET.");
    }
  };

  const handleConfigSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    connectToWebhook(inputUrl);
  };

  // --- Helper: Add Message ---
  const addMessage = (text: string, sender: SenderType, debugInfo?: any) => {
    const newMessage: Message = {
      id: Date.now().toString() + Math.random().toString(),
      text,
      sender,
      timestamp: new Date(),
      debugInfo
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const addSystemMessage = (text: string) => {
    addMessage(text, SenderType.SYSTEM);
  };

  // --- 2. ENVIO DE MENSAGEM (POST) ---
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || connectionStatus !== ConnectionStatus.CONNECTED) return;

    const textToSend = inputText;
    setInputText(''); // Clear input immediately for UX

    // 1. Add User Message immediately
    addMessage(textToSend, SenderType.USER);

    try {
      // 2. Send POST
      console.log(`[POST] Enviando mensagem para ${webhookUrl}`);
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: textToSend,
          timestamp: new Date().toISOString(),
          chatId: 'react-client-session-001'
        }),
      });

      // 3. Check Status 200 strict rule
      if (response.status === 200) {
        // SUCCESS condition: Status 200
        // We do NOT wait for body. We do NOT error if body is empty.
        console.log('[POST] Sucesso. Status 200 recebido.');
        // No UI action needed other than keeping the flow active.
        // The chat waits for asynchronous response via "Inbound".
      } else {
        // Error only if status != 200
        addSystemMessage(`Erro no envio: Servidor respondeu com status ${response.status}`);
      }
    } catch (error) {
      console.error('[POST] Erro de rede:', error);
      addSystemMessage("Erro de conexão ao tentar enviar mensagem.");
    }
  };

  // --- 4. & 5. RECEBENDO MENSAGENS (Inbound Simulation) ---
  // Since we cannot run a real server in the browser, this function simulates 
  // the "POST /webhook-inbound" endpoint logic requested.
  const handleSimulateInbound = () => {
    try {
      const parsedBody = JSON.parse(debugInput);
      
      // LOGIC REQUESTED:
      // 1. Show full JSON in console
      console.group("[Webhook Inbound Simulated]");
      console.log("Status: 200");
      console.log("Full Body:", parsedBody);
      console.groupEnd();

      // 2. Determine text to show (fallback to stringified body if no "message" or "text" field)
      const textDisplay = parsedBody.message || parsedBody.text || parsedBody.output || JSON.stringify(parsedBody);

      // 3. Show debug block in chat
      const debugData = {
        status: 200,
        body: parsedBody,
        timestamp: new Date().toISOString()
      };

      addMessage(textDisplay, SenderType.BOT, debugData);

    } catch (e) {
      alert("JSON inválido para simulação.");
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-900 text-slate-100 font-sans">
      
      {/* --- Main Chat Area --- */}
      <div className="flex-1 flex flex-col h-full relative">
        
        {/* Header */}
        <header className="h-16 border-b border-slate-700 bg-slate-800/50 flex items-center justify-between px-6 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] ${
              connectionStatus === ConnectionStatus.CONNECTED ? 'bg-emerald-500 shadow-emerald-500/50' : 
              connectionStatus === ConnectionStatus.CONNECTING ? 'bg-yellow-500 animate-pulse' :
              connectionStatus === ConnectionStatus.ERROR ? 'bg-red-500' : 'bg-slate-500'
            }`} />
            <div>
              <h1 className="font-semibold text-lg tracking-wide text-white">N8N Webhook Chat</h1>
              <p className="text-xs text-slate-400">
                {connectionStatus === ConnectionStatus.CONNECTED ? 'Conectado (Aguardando eventos)' :
                 connectionStatus === ConnectionStatus.CONNECTING ? `Conectando... (${retryCount}/3)` :
                 connectionStatus === ConnectionStatus.ERROR ? 'Erro de conexão' : 'Desconectado'}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setShowConfig(!showConfig)}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
            title="Configurações de Conexão"
          >
            <Settings size={20} />
          </button>
        </header>

        {/* Setup Overlay */}
        {showConfig && (
          <div className="absolute inset-0 z-20 bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-800 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-md w-full">
              <div className="flex items-center gap-3 mb-6 text-emerald-400">
                <Plug size={32} />
                <h2 className="text-2xl font-bold text-white">Configurar Webhook</h2>
              </div>
              
              <p className="text-slate-400 mb-6 leading-relaxed">
                Insira a URL do seu Webhook N8N. O sistema fará um teste <strong>GET</strong> obrigatório para validar a conexão antes de liberar o chat.
              </p>

              <form onSubmit={handleConfigSubmit}>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-2 tracking-wider">Webhook URL</label>
                <input 
                  type="url" 
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://n8n.seu-dominio.com/webhook/..."
                  className="w-full bg-slate-900 border border-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-lg px-4 py-3 text-white mb-4 transition-all outline-none"
                  required
                />
                
                {connectionStatus === ConnectionStatus.ERROR && (
                  <div className="flex items-center gap-2 text-red-400 text-sm mb-4 bg-red-400/10 p-3 rounded border border-red-400/20">
                    <AlertCircle size={16} />
                    <span>Falha na conexão. Verifique se o workflow aceita GET.</span>
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={connectionStatus === ConnectionStatus.CONNECTING}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/20"
                >
                  {connectionStatus === ConnectionStatus.CONNECTING ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      Validando...
                    </>
                  ) : (
                    <>
                      <Activity size={18} />
                      Conectar e Validar
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scroll-smooth custom-scrollbar">
          {messages.length === 0 && !showConfig && (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
              <Activity size={48} className="opacity-20" />
              <p>Conexão validada. Envie uma mensagem para iniciar.</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-slate-800 border-t border-slate-700">
          <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-3">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={connectionStatus === ConnectionStatus.CONNECTED ? "Digite sua mensagem para o webhook..." : "Aguardando conexão..."}
              disabled={connectionStatus !== ConnectionStatus.CONNECTED}
              className="flex-1 bg-slate-900 text-white placeholder-slate-500 border border-slate-600 focus:border-blue-500 rounded-xl px-4 py-3 outline-none transition-all disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={connectionStatus !== ConnectionStatus.CONNECTED || !inputText.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white p-3 rounded-xl transition-all shadow-lg flex items-center justify-center w-14"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>

      {/* --- Inbound Simulation / Debug Panel --- */}
      {/* 
         NOTA DE IMPLEMENTAÇÃO:
         Como este é um app Frontend (React), não existe um servidor para hospedar o endpoint "POST /webhook-inbound".
         Para cumprir os requisitos de lógica (recebimento, processamento, debug),
         criamos este painel que SIMULA a chegada de um webhook externo.
      */}
      <div className="w-full md:w-80 lg:w-96 bg-slate-950 border-l border-slate-800 flex flex-col overflow-hidden">
        <div className="p-4 bg-slate-900 border-b border-slate-800 font-semibold text-slate-300 flex items-center gap-2">
            <Terminal size={18} className="text-purple-400" />
            <span>Simulador Inbound</span>
        </div>
        
        <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 text-sm text-slate-400">
            <h3 className="text-slate-200 font-semibold mb-2">Endpoint Virtual</h3>
            <code className="block bg-black p-2 rounded text-xs font-mono text-purple-300 mb-2">POST /webhook-inbound</code>
            <p className="text-xs">
              Como o navegador não recebe POSTs diretos, use esta área para simular a resposta assíncrona do N8N.
            </p>
          </div>

          <div className="flex-1 flex flex-col">
            <label className="text-xs uppercase font-bold text-slate-500 mb-2">JSON Payload (Simulado)</label>
            <textarea
              value={debugInput}
              onChange={(e) => setDebugInput(e.target.value)}
              className="flex-1 w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs font-mono text-emerald-300 focus:border-purple-500 outline-none resize-none"
              spellCheck={false}
            />
          </div>

          <button
            onClick={handleSimulateInbound}
            disabled={connectionStatus !== ConnectionStatus.CONNECTED}
            className="w-full bg-purple-700 hover:bg-purple-600 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg"
          >
            <ArrowDownToLine size={18} />
            Simular Recebimento
          </button>
        </div>
      </div>

    </div>
  );
};

export default App;