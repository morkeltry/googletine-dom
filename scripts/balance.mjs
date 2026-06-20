// Show balances for an address.  Usage: node scripts/balance.mjs 0x<address>
import { tokenBalance, nativeBalance, explorerAddr } from './tempo.mjs';
const addr = process.argv[2];
if (!/^0x[0-9a-fA-F]{40}$/.test(addr || '')) { console.error('usage: node scripts/balance.mjs 0x<address>'); process.exit(1); }
const [bal, gas] = await Promise.all([tokenBalance(addr), nativeBalance(addr)]);
console.log(`${addr}`);
console.log(`  pathUSD ${bal.toLocaleString()}`);
console.log(`  gas     ${gas > 0n ? 'ok' : 'none'}`);
console.log(`  ${explorerAddr(addr)}`);
