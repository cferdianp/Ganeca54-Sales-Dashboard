/* Ganeca - membuka data dashboard terenkripsi (PBKDF2-SHA256 -> AES-256-CTR + HMAC-SHA256). */
(function (g) {
  "use strict";
  const enc = new TextEncoder();

  function b64(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function keB64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function gabung(...bagian) {
    const n = bagian.reduce((a, b) => a + b.length, 0);
    const out = new Uint8Array(n);
    let o = 0;
    for (const b of bagian) { out.set(b, o); o += b.length; }
    return out;
  }

  /** Kata sandi -> 64 byte kunci (32 enkripsi + 32 MAC). */
  async function turunkan(sandi, amplop) {
    const dasar = await crypto.subtle.importKey("raw", enc.encode(sandi), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: b64(amplop.salt), iterations: amplop.iter }, dasar, 512);
    return new Uint8Array(bits);
  }

  /** Buka amplop dengan kunci 64 byte. Melempar Error("SANDI") kalau kunci salah. */
  async function buka(amplop, kunci) {
    if (amplop.v !== 1) throw new Error("VERSI");
    const salt = b64(amplop.salt), iv = b64(amplop.iv), ct = b64(amplop.ct), mac = b64(amplop.mac);
    const kMac = await crypto.subtle.importKey("raw", kunci.slice(32, 64), { name: "HMAC", hash: "SHA-256" },
      false, ["verify"]);
    const sah = await crypto.subtle.verify("HMAC", kMac, mac, gabung(enc.encode("ganeca-v1"), salt, iv, ct));
    if (!sah) throw new Error("SANDI");
    const kEnc = await crypto.subtle.importKey("raw", kunci.slice(0, 32), { name: "AES-CTR" }, false, ["decrypt"]);
    const isi = await crypto.subtle.decrypt({ name: "AES-CTR", counter: iv, length: 64 }, kEnc, ct);
    const aliran = new Blob([isi]).stream().pipeThrough(new DecompressionStream("deflate"));
    return JSON.parse(await new Response(aliran).text());
  }

  g.GanecaKripto = { turunkan, buka, b64, keB64 };
})(typeof window !== "undefined" ? window : globalThis);
