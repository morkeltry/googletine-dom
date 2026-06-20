// Generate a fresh Tempo testnet wallet.  Usage: node scripts/wallet.mjs
import { createWallet, explorerAddr } from './tempo.mjs';
const w = createWallet();
console.log('address    ', w.address);
console.log('privateKey ', w.privateKey);
console.log('explorer   ', explorerAddr(w.address));
console.log('\nKeep the private key secret — put it in .env, never commit it.');
