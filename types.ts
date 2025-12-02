export enum SenderType {
  USER = 'USER',
  BOT = 'BOT',
  SYSTEM = 'SYSTEM'
}

export interface DebugInfo {
  status: number;
  body: unknown;
  timestamp: string;
}

export interface Message {
  id: string;
  text: string;
  sender: SenderType;
  timestamp: Date;
  debugInfo?: DebugInfo; // For displaying the required debug block
}

export enum ConnectionStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export interface WebhookConfig {
  url: string;
}