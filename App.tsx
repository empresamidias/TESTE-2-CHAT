import React, { useState, useRef, useEffect } from 'react';
import { Send, Settings, Activity, Plug, AlertCircle, RefreshCw, ArrowDownToLine, Terminal, Radio } from 'lucide-react';
import { ConnectionStatus, Message, SenderType } from './types';
import { ChatMessage } from './components/ChatMessage';

// URL fixa do Relay Server (Ngrok) atualizada
const RELAY_WS_URL = 'wss://747a2340fb66.ngrok-free.app';
// URL HTTP para exibição nas instruções
const RELAY_HTTP_URL = 'https://747a2340fb66.ngrok-free.app';

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
  
  // Estado para conexão do Relay (Inbound)
  const [inboundConnected, setInboundConnected] = useState<boolean>(false);

  // Ref for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- WebSocket Connection (INBOUND) ---
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;

    const connectWs = () => {
      console.log(`[WS] Conectando ao Relay: ${RELAY_WS_URL}`);
      try {
        ws = new WebSocket(RELAY_WS_URL);

        ws.onopen = () => {
          console.log('[WS] Conectado ao servidor de retransmissão.');
          setInboundConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Ignorar mensagens de sistema internas do WS se não forem payload
            if (data.type === 'SYSTEM') {
               console.log('[WS System]', data.text);
               return;
            }

            console.group("[Webhook Inbound Real-time]");
            console.log("Payload:", data);
            console.groupEnd();

            // Lógica de exibição (Texto ou fallback)
            const textDisplay = data.message || data.text || data.output || JSON.stringify(data);

            const debugInfo = {
              status: 200,
              body: data,
              timestamp: new Date().toISOString()
            };

            addMessage(textDisplay, SenderType.BOT, debugInfo);

          } catch (e) {
            console.error('[WS] Erro ao processar mensagem:', e);
          }
        };

        ws.onclose = () => {
          console.log('[WS] Desconectado. Tentando reconectar em 5s...');
          setInboundConnected(false);
          reconnectTimer = setTimeout(connectWs, 5000);
        };

        ws.onerror = (err) => {
          console.error('[WS] Erro na conexão:', err);
          ws?.close();
        };

      } catch (error) {
        console.error('[WS] Falha crítica na inicialização:', error);
        reconnectTimer = setTimeout(connectWs, 5000);
      }
    };

    connectWs();

    return () => {
      if (ws) ws.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []); // Executa apenas uma vez ao montar o componente

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
    setMessages(prev => {
        // Evitar duplicatas exatas em curto espaço de tempo (opcional, mas bom para histórico)
        const isDuplicate = prev.some(m => 
            m.text === text && 
            m.sender === sender && 
            (new Date().getTime() - new Date(m.timestamp).getTime() < 1000)
        );
        if (isDuplicate) return prev;

        const newMessage: Message = {
            id: Date.now().toString() + Math.random().toString(),
            text,
            sender,
            timestamp: new Date(),
            debugInfo
        };
        return [...prev, newMessage];
    });
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

  // --- SIMULATION (MANUAL FALLBACK) ---
  const handleSimulateInbound = () => {
    try {
      const parsedBody = JSON.parse(debugInput);
      const textDisplay = parsedBody.message || parsedBody.text || parsedBody.output || JSON.stringify(parsedBody);
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
          <div className="flex items-center gap-4">
            
            {/* Status do Chat (Outbound) */}
            <div className="flex items-center gap-2" title="Conexão Webhook (Envio)">
                <div className={`w-3 h-3 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] ${
                connectionStatus === ConnectionStatus.CONNECTED ? 'bg-emerald-500 shadow-emerald-500/50' : 
                connectionStatus === ConnectionStatus.CONNECTING ? 'bg-yellow-500 animate-pulse' :
                connectionStatus === ConnectionStatus.ERROR ? 'bg-red-500' : 'bg-slate-500'
                }`} />
                <div className="flex flex-col">
                    <h1 className="font-semibold text-sm tracking-wide text-white leading-tight">N8N Webhook Chat</h1>
                    <span className="text-[10px] text-slate-400">Outbound</span>
                </div>
            </div>

            <div className="h-6 w-px bg-slate-700 mx-2"></div>

            {/* Status do Inbound (Relay) */}
             <div className="flex items-center gap-2" title={`Inbound Relay: ${RELAY_WS_URL}`}>
                <Radio size={14} className={inboundConnected ? "text-emerald-400 animate-pulse" : "text-slate-600"} />
                <div className="flex flex-col">
                    <span className={`text-xs font-medium ${inboundConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {inboundConnected ? 'Inbound Online' : 'Inbound Offline'}
                    </span>
                    <span className="text-[10px] text-slate-500 hidden md:inline">Relay Server</span>
                </div>
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
              
              <div className="text-slate-400 mb-6 leading-relaxed text-sm space-y-2">
                <p>1. Insira a URL do seu Webhook N8N (<strong>Outbound</strong>) abaixo.</p>
                <p>2. No seu N8N, configure o último nó para fazer um POST para a URL de resposta (<strong>Inbound</strong>):</p>
                <div className="bg-black/50 p-3 rounded border border-slate-600 font-mono text-xs text-emerald-300 break-all select-all">
                    {RELAY_HTTP_URL}/api/webhook-receiver
                </div>
                <p className="text-xs text-slate-500 italic mt-1">Certifique-se que o server.js está rodando.</p>
              </div>

              <form onSubmit={handleConfigSubmit}>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-2 tracking-wider">Webhook N8N URL (Seu Endpoint)</label>
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
              {!inboundConnected && (
                 <p className="text-xs text-red-400 bg-red-900/20 px-3 py-1 rounded">
                    Atenção: Servidor de recebimento (Relay) desconectado.
                 </p>
              )}
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
              placeholder={connectionStatus === ConnectionStatus.CONNECTED ? "Digite sua mensagem..." : "Aguardando conexão..."}
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

      {/* --- Debug Panel (Opcional agora, mas mantido para testes manuais) --- */}
      <div className="hidden lg:flex w-80 bg-slate-950 border-l border-slate-800 flex-col overflow-hidden">
        <div className="p-4 bg-slate-900 border-b border-slate-800 font-semibold text-slate-300 flex items-center gap-2">
            <Terminal size={18} className="text-purple-400" />
            <span>Debug / Manual</span>
        </div>
        
        <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-800 text-sm text-slate-400">
            <h3 className="text-slate-200 font-semibold mb-2">Relay Status</h3>
            <div className="flex items-center gap-2 mb-2">
                <div className={`w-2 h-2 rounded-full ${inboundConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-xs font-mono">{RELAY_HTTP_URL}</span>
            </div>
            <p className="text-xs">
              O chat tenta conectar automaticamente. Use o simulador abaixo se não estiver usando o server.js.
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