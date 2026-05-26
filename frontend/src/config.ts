export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
export const WS_URL  = import.meta.env.VITE_WS_URL  ?? 'ws://localhost:8000';

const _net = (import.meta.env.VITE_MANTLE_NETWORK ?? 'mainnet').toLowerCase().trim();

export const MANTLE_NETWORK = _net === 'mainnet'
  ? {
      chainId:          '0x1388',
      chainName:        'Mantle',
      rpcUrl:           'https://rpc.mantle.xyz',
      explorerUrl:      'https://explorer.mantle.xyz',
      displayName:      'Mantle',
    }
  : {
      chainId:          '0x138B',
      chainName:        'Mantle Sepolia Testnet',
      rpcUrl:           'https://rpc.sepolia.mantle.xyz',
      explorerUrl:      'https://sepolia.mantlescan.xyz',
      displayName:      'Mantle Sepolia Testnet',
    };
