// Copied from Roamies 0.1.41 by Ken Kai, AGPL-3.0-only: https://github.com/KenKaiii/Roamies (tauri/sidecar/safety.mjs: only checkUrl and what it needs, copied unchanged)
const verdict = (level, reason = '') => ({ level, reason });
export const SAFE = 'safe', ASK = 'ask', BLOCK = 'block';
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f:]*\]?|\[?fe80:[0-9a-f:]*\]?)$/i;

/** An IP address that isn't on the public internet: this computer, the local network, link-local (cloud metadata),
 *  carrier-grade NAT, multicast and reserved ranges, also written as IPv4 inside IPv6 (::ffff:127.0.0.1). */
export function isPrivateAddress(ip) {
  let a = String(ip ?? '').toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const mapped = a.match(/^(?:0*:)*:?ffff:(?:0+:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) { const hi = parseInt(mapped[1], 16), lo = parseInt(mapped[2], 16); a = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`; }
  const v4 = a.match(/^(?:.*:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [b0, b1] = [Number(v4[1]), Number(v4[2])];
    return b0 === 0 || b0 === 10 || b0 === 127 || (b0 === 100 && b1 >= 64 && b1 <= 127) || (b0 === 169 && b1 === 254) || (b0 === 172 && b1 >= 16 && b1 <= 31)
      || (b0 === 192 && (b1 === 168 || (b1 === 0 && Number(v4[3]) === 0))) || (b0 === 198 && (b1 === 18 || b1 === 19)) || b0 >= 224;
  }
  if (!a.includes(':')) return false;
  return a === '::' || a === '::1' || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || /^ff/.test(a) || /^64:ff9b:/.test(a) || /^0*:/.test(a) && /^[0:]*(:1)?$/.test(a);
}

/** web_fetch: public web pages only, so a web page can't steer Sidekick into the user's router or local apps.
 *  checkFetch also checks the addresses a name resolves to, before each request and redirect hop. */
export function checkUrl(url) {
  let u;
  try { u = new URL(String(url)); } catch { return verdict(BLOCK, "That isn't a valid link."); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return verdict(BLOCK, 'I only fetch http and https pages.');
  if (u.username || u.password) return verdict(BLOCK, 'Links with passwords in them are blocked.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (PRIVATE_HOST.test(u.hostname) || ((/^[\d.]+$/.test(host) || host.includes(':')) && isPrivateAddress(host))) return verdict(BLOCK, `${u.hostname} is on your own computer or network, so I won't fetch it.`);
  return verdict(SAFE);
}
