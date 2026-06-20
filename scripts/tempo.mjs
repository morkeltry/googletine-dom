// Tempo "Moderato" testnet helpers — wallet creation, faucet funding, balances.
// No heavy deps: viem for key generation, raw JSON-RPC for chain reads.
//
// These power the AlgoMate agent's wallet: the backend holds the key and pays a
// real micro-transaction per video view. Testnet only — no real funds settle.

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

export const TEMPO = {
  chainId: 42431,
  rpc: 'https://rpc.moderato.tempo.xyz',
  explorer: 'https://explore.testnet.tempo.xyz',
  faucet: 'https://docs.tempo.xyz/api/faucet',
  token: '0x20c0000000000000000000000000000000000000', // pathUSD (TIP-20)
  decimals: 6,
};

export function createWallet() {
  const privateKey = generatePrivateKey();
  const { address } = privateKeyToAccount(privateKey);
  return { address, privateKey };
}

export function addressOf(privateKey) {
  return privateKeyToAccount(privateKey).address;
}

export async function rpc(method, params) {
  const r = await fetch(TEMPO.rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

// Ask the Tempo faucet for testnet tokens (1,000,000 each of pathUSD/Alpha/Beta/Theta).
// Returns the funding tx hashes.
export async function fundAddress(address) {
  const r = await fetch(TEMPO.faucet, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`faucet ${r.status}: ${j.error || 'failed'}`);
  return (j.data || []).map((x) => x.hash);
}

// TIP-20 balanceOf(address) -> display units.
export async function tokenBalance(address, token = TEMPO.token, decimals = TEMPO.decimals) {
  const data = '0x70a08231' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const hex = await rpc('eth_call', [{ to: token, data }, 'latest']);
  return Number(BigInt(hex)) / 10 ** decimals;
}

export async function nativeBalance(address) {
  return BigInt(await rpc('eth_getBalance', [address, 'latest']));
}

export const explorerTx = (hash) => `${TEMPO.explorer}/tx/${hash}`;
export const explorerAddr = (a) => `${TEMPO.explorer}/address/${a}`;
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));
