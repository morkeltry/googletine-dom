// Fund an address from the Tempo faucet.  Usage: node scripts/fund.mjs 0x<address>
import { fundAddress, explorerTx } from './tempo.mjs';
const addr = process.argv[2];
if (!/^0x[0-9a-fA-F]{40}$/.test(addr || '')) { console.error('usage: node scripts/fund.mjs 0x<address>'); process.exit(1); }
const hashes = await fundAddress(addr);
console.log(`Funded ${addr} — ${hashes.length} tx:`);
for (const h of hashes) console.log('  ' + explorerTx(h));
