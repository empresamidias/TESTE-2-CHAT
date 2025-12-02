import React from 'react';
import { Message, SenderType } from '../types';
import { User, Bot, Server, Terminal } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.sender === SenderType.USER;
  const isSystem = message.sender === SenderType.SYSTEM;

  if (isSystem) {
    return (
      <div className="flex justify-center my-4 opacity-75">
        <div className="bg-slate-800 text-slate-400 text-xs px-3 py-1 rounded-full flex items-center gap-2">
            <Server size={12} />
            {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] md:max-w-[70%] ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-3`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-blue-600' : 'bg-emerald-600'}`}>
          {isUser ? <User size={16} text-white /> : <Bot size={16} text-white />}
        </div>

        {/* Bubble */}
        <div className="flex flex-col gap-1 min-w-0">
          <div className={`px-4 py-2 rounded-2xl text-sm leading-relaxed shadow-md ${
            isUser 
              ? 'bg-blue-600 text-white rounded-tr-none' 
              : 'bg-slate-700 text-slate-100 rounded-tl-none'
          }`}>
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
          </div>
          
          <span className={`text-[10px] text-slate-500 ${isUser ? 'text-right' : 'text-left'}`}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>

          {/* REQUIRED DEBUG BLOCK for Inbound Messages */}
          {message.debugInfo && (
             <div className="mt-2 p-3 bg-black/40 border border-slate-600 rounded-md font-mono text-xs text-green-400 overflow-x-auto">
                <div className="flex items-center gap-2 mb-1 text-slate-400 border-b border-slate-700 pb-1">
                    <Terminal size={12} />
                    <span>[Webhook Recebido]</span>
                </div>
                <div className="mb-1">Status: <span className="text-white">{message.debugInfo.status}</span></div>
                <div>Corpo recebido:</div>
                <pre className="text-slate-300 opacity-80 mt-1 whitespace-pre-wrap break-all">
                    {JSON.stringify(message.debugInfo.body, null, 2)}
                </pre>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};