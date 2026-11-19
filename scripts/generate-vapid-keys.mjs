// Prints a fresh VAPID key pair for worker/push. Run once:
//   node scripts/generate-vapid-keys.mjs
// PUBLIC goes in worker/push/wrangler.toml and in the VITE_VAPID_PUBLIC_KEY
// build secret. PRIVATE goes only in `wrangler secret put VAPID_PRIVATE_KEY`.
// Never commit the private key. Changing the pair later invalidates every
// existing subscription (devices must turn notifications off and on again).
import { webcrypto as crypto } from 'node:crypto'

const b64url = (bytes) => Buffer.from(bytes).toString('base64url')
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)

console.log(`PUBLIC  (VAPID_PUBLIC_KEY / VITE_VAPID_PUBLIC_KEY):\n${b64url(pub)}\n`)
console.log(`PRIVATE (wrangler secret VAPID_PRIVATE_KEY, keep secret):\n${jwk.d}`)
