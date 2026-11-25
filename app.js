/* Ganeca - Sales Dashboard (Shopee dan non-Shopee) */
(function () {
  "use strict";

  const DATA_URL = "data/ganeca.enc.json";
  const KUNCI_SIMPAN = "ganeca-kunci-v1";
  const PILIHAN_SIMPAN = "ganeca-pilihan-v1";
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mqGerak = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const GERAK = () => !mqGerak.matches;
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

  // ------------------------------------------------------------------ format
  const fmtAngka = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
  const fmtDes = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
  const fmtPct = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus",
    "September", "Oktober", "November", "Desember"];

  function rp(x) { return (x < 0 ? "-Rp" : "Rp") + fmtAngka.format(Math.abs(Math.round(x))); }
  function rpRingkas(x) {
    const a = Math.abs(x), t = x < 0 ? "-" : "";
    if (a >= 1e9) return t + "Rp" + fmtDes.format(a / 1e9) + " miliar";
    if (a >= 1e6) return t + "Rp" + fmtDes.format(a / 1e6) + " juta";
    if (a >= 1e3) return t + "Rp" + fmtAngka.format(a / 1e3) + " ribu";
    return rp(x);
  }
  function pct(x) { return fmtPct.format(x * 100) + "%"; }
  function durasi(hari) {
    const menit = Math.round(Math.abs(hari) * 1440);
    if (menit < 60) return menit + " menit";
    const j = Math.floor(menit / 60), m = menit % 60;
    if (menit < 1440) return j + " jam" + (m ? " " + m + " menit" : "");
    const h = Math.floor(menit / 1440), jj = Math.floor((menit % 1440) / 60);
    return h + " hari" + (jj ? " " + jj + " jam" : "");
  }
  function durasiSumbu(hari) {
    if (hari < 1 / 24) return Math.round(hari * 1440) + " menit";
    if (hari < 1) return fmtDes.format(Math.round(hari * 24 * 10) / 10) + " jam";
    return fmtDes.format(Math.round(hari * 10) / 10) + " hari";
  }
  const FORMAT = {
    rp: { teks: rp, sumbu: rpRingkas },
    pcs: { teks: (x) => fmtDes.format(x) + " pcs", sumbu: (x) => fmtDes.format(x) },
    pct: { teks: pct, sumbu: (x) => fmtAngka.format(x * 100) + "%" },
    durasi: { teks: durasi, sumbu: durasiSumbu },
  };

  // tanggal: nilai serial Excel (waktu WIB) -> Date yang field UTC-nya = jam dinding WIB
  const keTanggal = (s) => new Date(Math.round((s - 25569) * 86400000));
  const keSerial = (y, m, d) => Date.UTC(y, m, d) / 86400000 + 25569;
  function tglTeks(s) { const d = keTanggal(s); return d.getUTCDate() + " " + BULAN[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function isoTgl(s) { return keTanggal(s).toISOString().slice(0, 10); }
  function dibuatTeks(t) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(t || "");
    return m ? `${+m[3]} ${BULAN[+m[2] - 1]} ${m[1]}, pukul ${m[4]}.${m[5]} WIB` : t;
  }
  function hariIniWIB() { const d = new Date(Date.now() + 7 * 3600000); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; }

  // ------------------------------------------------------------------ status
  // PESANAN: Shopee, NON: non-Shopee yang sudah lunas, BELUM: non-Shopee belum lunas (tampil terpisah)
  // Kapan penjualan non-Shopee dihitung (DASAR_NON):
  //   "kirim": saat barang dikirim, konsinyasi saat dibayar penerima titipan (pengakuan pendapatan SAK EMKM)
  //   "lunas": pada Tanggal Lunas; "kas": tiap pembayaran pada tanggalnya, termasuk DP (basis kas)
  // DASAR: yang benar-benar dipakai (turun ke "lunas" kalau datanya tidak lengkap).
  const DASAR_NON = "kirim";
  let DATA = null, PESANAN = [], NON = [], BELUM = [], SEMUA = [], PRODUK = [], ADA_NON = false, SUDAH_DIBUAT = false;
  let KAS_NON = [], DASAR = "lunas";
  const pilihan = muatPilihan();
  const grafik = {};
  const SUMBER = [["semua", "Semua"], ["shopee", "Shopee"], ["non", "Non-Shopee"]];
  /** Sumber yang berlaku: tanpa data non-Shopee, selalu Shopee. */
  const sumber = () => (ADA_NON && SUMBER.some(([k]) => k === pilihan.sumber) ? pilihan.sumber : (ADA_NON ? "semua" : "shopee"));

  function muatPilihan() {
    const dasar = { periode: "semua", tanpaRetur: false, stat: {}, ukuran: "pcs", sku: null, sumber: "semua", ukuranSaluran: "pa" };
    try { return Object.assign(dasar, JSON.parse(localStorage.getItem(PILIHAN_SIMPAN) || "{}")); }
    catch (e) { return dasar; }
  }
  function simpanPilihan() { try { localStorage.setItem(PILIHAN_SIMPAN, JSON.stringify(pilihan)); } catch (e) { /* abaikan */ } }

  // ------------------------------------------------------------------ gerak
  /** Angka berjalan dari nilai sebelumnya ke nilai baru. */
  function hitungNaik(el, nilai, fmt) {
    el._fmt = fmt; el._target = nilai;
    const dari = typeof el._nilai === "number" && isFinite(el._nilai) ? el._nilai : 0;
    el._nilai = nilai;
    cancelAnimationFrame(el._raf);
    const tersembunyi = el.closest(".muncul:not(.terlihat)");
    if (!GERAK() || typeof nilai !== "number" || !isFinite(nilai) || tersembunyi || dari === nilai) {
      el.textContent = fmt(nilai); return;
    }
    el.classList.remove("letup"); void el.offsetWidth; el.classList.add("letup");
    const t0 = performance.now(), lama = 900;
    const langkah = (t) => {
      const p = Math.min(1, (t - t0) / lama), e = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(p < 1 ? dari + (nilai - dari) * e : nilai);
      if (p < 1) el._raf = requestAnimationFrame(langkah);
    };
    el._raf = requestAnimationFrame(langkah);
  }

  function ulangGerak(el) {
    el.querySelectorAll("canvas").forEach((cv) => {
      const c = window.Chart && Chart.getChart(cv);
      if (c) { c.$tiba = false; c.reset(); c.update(); }
    });
    el.querySelectorAll("[data-hitung]").forEach((n) => {
      if (typeof n._target === "number") { n._nilai = 0; hitungNaik(n, n._target, n._fmt); }
    });
    el.querySelectorAll(".seg, .isi").forEach((s) => {
      const prop = s.classList.contains("seg") ? "flexGrow" : "width";
      const v = s.style[prop];
      s.style.transition = "none"; s.style[prop] = prop === "width" ? "0%" : "0";
      void s.offsetWidth;
      s.style.transition = ""; s.style[prop] = v;
    });
  }

  const pengamat = "IntersectionObserver" in window ? new IntersectionObserver((entri) => {
    for (const e of entri) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      pengamat.unobserve(el);
      el.classList.add("terlihat");
      ulangGerak(el);
      setTimeout(() => el.style.removeProperty("--tunda"), 1200);
    }
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.12 }) : null;

  function daftarkanMuncul(el, tunda) {
    if (!pengamat || !GERAK()) return;
    el.classList.add("muncul");
    el.style.setProperty("--tunda", (tunda || 0) + "ms");
    pengamat.observe(el);
  }

  /** Penanda pilihan yang bergeser di bawah tombol aktif. */
  function pasangIndikator(wadah) {
    if (!wadah) return;
    let ind = wadah.querySelector(":scope > .indikator");
    const baru = !ind;
    if (baru) {
      ind = document.createElement("span"); ind.className = "indikator"; ind.setAttribute("aria-hidden", "true");
      wadah.prepend(ind);
    }
    const aktif = wadah.querySelector('button[aria-checked="true"]');
    if (!aktif || !aktif.offsetWidth) { ind.style.opacity = "0"; return; }
    const lompat = baru || ind.style.opacity === "0" || !GERAK();
    if (lompat) ind.style.transition = "none";
    ind.style.opacity = "1";
    ind.style.width = aktif.offsetWidth + "px";
    ind.style.height = aktif.offsetHeight + "px";
    ind.style.transform = `translate(${aktif.offsetLeft}px, ${aktif.offsetTop}px)`;
    if (lompat) { void ind.offsetWidth; ind.style.transition = ""; }
    if (wadah.scrollWidth > wadah.clientWidth) {
      const kiri = aktif.offsetLeft, kanan = kiri + aktif.offsetWidth;
      if (kiri < wadah.scrollLeft || kanan > wadah.scrollLeft + wadah.clientWidth) {
        wadah.scrollTo({ left: Math.max(0, kiri - 24), behavior: GERAK() && !baru ? "smooth" : "auto" });
      }
    }
  }

  // ------------------------------------------------------------------ data
  function siapkan(data) {
    const ix = Object.fromEntries(data.kolom.map((k, i) => [k, i]));
    PESANAN = data.pesanan.map((a) => ({
      no: a[ix.no], p: a[ix.p], m: a[ix.m], o: a[ix.o], i: a[ix.i], j: a[ix.j],
      q: a[ix.q], r: a[ix.r], s: a[ix.s], v: a[ix.v], w: a[ix.w], pa: a[ix.pa], av: a[ix.av],
      ax: a[ix.ax], ay: a[ix.ay], bk: a[ix.bk], retur: !!a[ix.retur], t: null, u: null,
      src: "s", k: "s" + a[ix.no], saluran: "Shopee",
    }));
    // Selisih antar waktu: dihitung ulang menurut urutan waktu yang sebenarnya
    const urutM = PESANAN.filter((x) => typeof x.m === "number").sort((a, b) => a.m - b.m);
    for (let k = 1; k < urutM.length; k++) urutM[k].t = urutM[k].m - urutM[k - 1].m;
    const urutO = PESANAN.filter((x) => typeof x.o === "number").sort((a, b) => a.o - b.o);
    for (let k = 1; k < urutO.length; k++) urutO[k].u = urutO[k].o - urutO[k - 1].o;
    const px = Object.fromEntries(data.kolom_produk.map((k, i) => [k, i]));
    PRODUK = data.produk.map((a) => ({ k: "s" + a[px.no], no: a[px.no], sku: a[px.sku], varian: a[px.var], beli: a[px.beli],
      kembali: a[px.kembali], sub: a[px.sub] }));
    // penjualan non-Shopee: penghasilan = PENGHASILAN AKHIR (Basis Kas); tanggal menurut DASAR
    NON = []; BELUM = [];
    const ns = data.non_shopee;
    DASAR = "lunas";
    if (ns && Array.isArray(ns.pesanan)) {
      const nx = Object.fromEntries(ns.kolom.map((k, i) => [k, i]));
      if (DASAR_NON === "kirim" && nx.kirim !== undefined && nx.o !== undefined) DASAR = "kirim";
      if (DASAR_NON === "kas" && Array.isArray(ns.bayar) && Array.isArray(ns.kolom_bayar)) DASAR = "kas";
      for (const a of ns.pesanan) {
        const o = { src: "n", k: "n" + a[nx.no], no: a[nx.no], p: null, lunas: a[nx.p], bayar1: a[nx.bayar1],
          saluran: a[nx.saluran] || "Lainnya", cara: a[nx.cara], v: a[nx.v], w: a[nx.w], pa: a[nx.pa],
          selisih: a[nx.selisih], status: a[nx.status], retur: !!a[nx.retur], piutang: 0 };
        const belumLunas = o.status === "Belum Lunas";
        if (DASAR === "kirim") {
          o.kirim = a[nx.kirim]; o.konsinyasi = /consign|konsinyasi/i.test(o.cara || "");
          // konsinyasi: barang masih milik Eca sampai penerima titipan membayar
          const t = o.konsinyasi ? (belumLunas ? null : o.lunas) : o.kirim;
          if (typeof t !== "number") { BELUM.push(o); continue; }
          o.p = t;
          // sudah dikirim tetapi belum lunas: dihitung penuh sebesar tagihan, sisanya piutang
          const tagihan = a[nx.o];
          if (belumLunas && typeof tagihan === "number") { o.piutang = Math.max(0, tagihan - (o.pa || 0)); o.pa = tagihan; }
          NON.push(o);
        } else if (typeof o.lunas === "number" && !belumLunas) { o.p = o.lunas; NON.push(o); }
        else BELUM.push(o);
      }
      const qx = Object.fromEntries(ns.kolom_produk.map((k, i) => [k, i]));
      for (const a of ns.produk) {
        PRODUK.push({ k: "n" + a[qx.no], no: a[qx.no], sku: a[qx.sku], varian: a[qx.var], beli: a[qx.beli],
          kembali: a[qx.kembali], sub: a[qx.sub] });
      }
    }
    ADA_NON = NON.length + BELUM.length > 0;
    SEMUA = PESANAN.concat(NON);
    siapkanKas(ns);
  }

  /** Penghasilan Akhir non-Shopee per tanggal. Basis kas: tiap pembayaran pada tanggalnya (DP pesanan belum lunas
   *  ikut), sisanya (misalnya ongkir yang dibayar Eca) pada Tanggal Lunas. Dasar lain: seluruhnya pada tanggal pesanan. */
  function siapkanKas(ns) {
    KAS_NON = [];
    const per = new Map();
    if (DASAR === "kas") {
      const bx = Object.fromEntries(ns.kolom_bayar.map((k, i) => [k, i]));
      for (const a of ns.bayar) {
        const t = a[bx.t], v = a[bx.nominal];
        if (typeof t !== "number" || typeof v !== "number") continue;
        if (!per.has(a[bx.no])) per.set(a[bx.no], []);
        per.get(a[bx.no]).push({ t, v });
      }
    }
    const tambah = (o, belum, t, pa) => KAS_NON.push({ src: "n", k: o.k, no: o.no, saluran: o.saluran, retur: o.retur, belum, t, pa });
    for (const o of NON.concat(DASAR === "kas" ? BELUM : [])) {
      if (typeof o.pa !== "number") continue;
      const belum = !NON.includes(o), bayar = per.get(o.no) || [];
      let sisa = o.pa;
      for (const b of bayar) { tambah(o, belum, b.t, b.v); sisa -= b.v; }
      const tSisa = belum ? (bayar.length ? Math.max(...bayar.map((b) => b.t)) : null) : o.p;
      if (Math.abs(sisa) >= 0.005 && typeof tSisa === "number") tambah(o, belum, tSisa, sisa);
    }
  }

  /** Penghasilan Akhir pada saringan sekarang: Shopee per pesanan (Waktu Selesai), non-Shopee per pembayaran. */
  function kas(baris) {
    const [a, b] = rentangPeriode();
    const hasil = baris.filter((x) => x.src === "s" && typeof x.pa === "number")
      .map((x) => ({ src: "s", saluran: x.saluran, belum: false, t: x.p, pa: x.pa }));
    if (sumber() === "shopee") return hasil;
    return hasil.concat(KAS_NON.filter((x) => x.t >= a && x.t < b && !(pilihan.tanpaRetur && x.retur)));
  }
  const jumlahPA = (uang, f) => uang.reduce((a, x) => a + (!f || f(x) ? x.pa : 0), 0);

  const cocokSumber = (x) => { const s = sumber(); return s === "semua" || (s === "shopee") === (x.src === "s"); };
  function namaPesanan(x) {
    if (x.src === "n") return `Pesanan non-Shopee ke-${x.no}`;
    return ADA_NON ? `Pesanan Shopee ke-${x.no}` : `Pesanan ke-${x.no}`;
  }

  function rentangPeriode() {
    const [y, m, d] = hariIniWIB();
    const besok = keSerial(y, m, d + 1);
    switch (pilihan.periode) {
      case "30h": return [keSerial(y, m, d - 29), besok, "30 hari terakhir"];
      case "bulan_ini": return [keSerial(y, m, 1), keSerial(y, m + 1, 1), BULAN[m] + " " + y];
      case "bulan_lalu": { const t = new Date(Date.UTC(y, m - 1, 1));
        return [keSerial(y, m - 1, 1), keSerial(y, m, 1), BULAN[t.getUTCMonth()] + " " + t.getUTCFullYear()]; }
      case "3bln": return [keSerial(y, m - 2, 1), keSerial(y, m + 1, 1), "3 bulan terakhir"];
      case "tahun_ini": return [keSerial(y, 0, 1), keSerial(y + 1, 0, 1), "Tahun " + y];
      case "rentang": {
        const a = $("dari").value, b = $("sampai").value;
        const pa = a ? a.split("-").map(Number) : null, pb = b ? b.split("-").map(Number) : null;
        const s0 = pa ? keSerial(pa[0], pa[1] - 1, pa[2]) : -Infinity;
        const s1 = pb ? keSerial(pb[0], pb[1] - 1, pb[2] + 1) : Infinity;
        return [s0, s1, (a ? tglTeks(s0) : "awal") + " – " + (b ? tglTeks(s1 - 1) : "akhir")];
      }
      default: return [-Infinity, Infinity, "Semua data"];
    }
  }

  function tersaring() {
    const [a, b] = rentangPeriode();
    return SEMUA.filter((x) => cocokSumber(x) && typeof x.p === "number" && x.p >= a && x.p < b && !(pilihan.tanpaRetur && x.retur));
  }

  function statistik(baris, kunci) {
    const isi = baris.filter((x) => typeof x[kunci] === "number" && isFinite(x[kunci]));
    if (!isi.length) return null;
    const urut = isi.map((x) => x[kunci]).sort((a, b) => a - b);
    let min = isi[0], maks = isi[0], total = 0;
    for (const x of isi) {
      if (x[kunci] < min[kunci]) min = x;
      if (x[kunci] > maks[kunci]) maks = x;
      total += x[kunci];
    }
    const n = urut.length, h = Math.floor(n / 2);
    const median = n % 2 ? urut[h] : (urut[h - 1] + urut[h]) / 2;
    return { n, min: min[kunci], minX: min, maks: maks[kunci], maksX: maks, median, rata: total / n, total, urut };
  }

  // ------------------------------------------------------------------ grafik
  function warna() {
    const cs = getComputedStyle(document.documentElement);
    const g = (v) => cs.getPropertyValue(v).trim();
    return { seri1: g("--seri-1"), seri2: g("--seri-2"), garis: g("--garis"), sumbu: g("--sumbu"),
      tinta: g("--tinta"), tinta2: g("--tinta-2"), redup: g("--tinta-redup"), permukaan: g("--permukaan"),
      grafik: g("--grafik"), lokasi1: g("--lokasi-1"), lokasi2: g("--lokasi-2"), heroTinta: g("--hero-tinta") || "#ffffff" };
  }
  /** "#rrggbb" -> "rgba(r,g,b,a)" */
  function rgba(hex, a) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex).trim());
    return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(255,255,255,${a})`;
  }

  function animasiBatang() {
    if (!GERAK()) return false;
    return {
      duration: 800, easing: "easeOutQuart",
      delay: (c) => (c.type === "data" && c.mode === "default" && !c.chart.$tiba ? Math.min(c.dataIndex * 35, 600) : 0),
      onComplete: (c) => { c.chart.$tiba = true; },
    };
  }

  function grafikBatang(id, label, nilai, opsi) {
    const W = warna(), isi = W.grafik;
    const options = {
      responsive: true, maintainAspectRatio: false, animation: animasiBatang(),
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: W.permukaan, titleColor: W.tinta, bodyColor: W.tinta2, borderColor: W.garis, borderWidth: 1,
        padding: 10, cornerRadius: 10, displayColors: false, callbacks: opsi.tooltip } },
      scales: {
        x: { grid: { display: false }, border: { color: W.sumbu }, ticks: { color: W.redup, font: { size: 10 },
          maxRotation: 0, autoSkip: true, autoSkipPadding: 8 } },
        y: { beginAtZero: true, grid: { color: W.garis, lineWidth: 1 }, border: { display: false },
          ticks: { color: W.redup, font: { size: 10 }, maxTicksLimit: 4, callback: opsi.sumbuY || ((v) => v) } },
      },
    };
    const ch = grafik[id];
    if (ch) {
      ch.data.labels = label;
      Object.assign(ch.data.datasets[0], { data: nilai, backgroundColor: isi, hoverBackgroundColor: isi });
      ch.options = options;
      ch.update();
      return;
    }
    grafik[id] = new Chart($(id), {
      type: "bar",
      data: { labels: label, datasets: [{ data: nilai, backgroundColor: isi, hoverBackgroundColor: isi,
        borderRadius: 4, borderSkipped: "start", maxBarThickness: 24, categoryPercentage: 0.9, barPercentage: 0.92 }] },
      options,
    });
  }

  function hapusGrafik(id) { if (grafik[id]) { grafik[id].destroy(); delete grafik[id]; } }

  /** Batang per periode; dua seri (Shopee + non-Shopee) ditumpuk, dengan celah 2px di antaranya. */
  function grafikTren(id, label, seri, opsi) {
    const W = warna(), banyak = seri.length > 1;
    if (grafik[id] && grafik[id].data.datasets.length !== seri.length) hapusGrafik(id);
    const atas = (i) => banyak && seri[1].data[i] > 0;
    const datasets = seri.map((s, k) => ({
      label: s.nama, data: s.data, backgroundColor: s.warna, hoverBackgroundColor: s.warna,
      borderSkipped: "start", maxBarThickness: 24, categoryPercentage: 0.9, barPercentage: 0.92,
      borderRadius: k === 0 && banyak ? (c) => (atas(c.dataIndex) ? 0 : 4) : 4,
      borderWidth: k === 0 && banyak ? (c) => (atas(c.dataIndex) && seri[0].data[c.dataIndex] > 0 ? { top: 2 } : 0) : 0,
      borderColor: W.permukaan,
    }));
    const options = {
      responsive: true, maintainAspectRatio: false, animation: animasiBatang(),
      interaction: banyak ? { mode: "index", intersect: false } : { mode: "nearest", intersect: true },
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: W.permukaan, titleColor: W.tinta, bodyColor: W.tinta2, footerColor: W.tinta, borderColor: W.garis,
        borderWidth: 1, padding: 10, cornerRadius: 10, displayColors: banyak, boxWidth: 10, boxHeight: 10, boxPadding: 4,
        callbacks: {
          title: opsi.judul,
          label: (it) => (banyak ? it.dataset.label + ": " : "") + opsi.teks(it.raw),
          footer: banyak ? (it) => "Total: " + opsi.teks(it.reduce((a, x) => a + x.raw, 0)) : undefined,
        } } },
      scales: {
        x: { stacked: banyak, grid: { display: false }, border: { color: W.sumbu }, ticks: { color: W.redup, font: { size: 10 },
          maxRotation: 0, autoSkip: true, autoSkipPadding: 8 } },
        y: { stacked: banyak, beginAtZero: true, grid: { color: W.garis, lineWidth: 1 }, border: { display: false },
          ticks: { color: W.redup, font: { size: 10 }, maxTicksLimit: 4, callback: opsi.sumbuY } },
      },
    };
    const ch = grafik[id];
    if (ch) {
      ch.data.labels = label;
      datasets.forEach((d, k) => Object.assign(ch.data.datasets[k], d));
      ch.options = options;
      ch.update();
      return;
    }
    grafik[id] = new Chart($(id), { type: "bar", data: { labels: label, datasets }, options });
  }

  /** Legenda kecil "Shopee / Non-Shopee" di kartu, hanya saat dua sumber tampil bersama. */
  function legendaSumber(el, tampil) {
    const W = warna();
    el.hidden = !tampil;
    el.innerHTML = tampil ? `<span><i style="background:${W.seri1}"></i>Shopee</span><span><i style="background:${W.seri2}"></i>Non-Shopee</span>` : "";
  }

  function garisMini(label, nilai) {
    const cv = $("garis-mini");
    if (!cv) return;
    if (!nilai.length) { hapusGrafik("garis-mini"); return; }
    const tinta = warna().heroTinta;
    const isi = (ctx) => {
      const { chart } = ctx, area = chart.chartArea;
      if (!area) return rgba(tinta, 0.15);
      const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, rgba(tinta, /^#?f/i.test(tinta) ? 0.38 : 0.2)); g.addColorStop(1, rgba(tinta, 0));
      return g;
    };
    const titik = (c) => (c.dataIndex === nilai.length - 1 ? 3.5 : 0);
    if (GERAK()) { cv.classList.remove("gambar"); void cv.offsetWidth; cv.classList.add("gambar"); }
    const ch = grafik["garis-mini"];
    if (ch) {
      Object.assign(ch.data.datasets[0], { data: nilai, pointRadius: titik, backgroundColor: isi,
        borderColor: rgba(tinta, 0.95), pointBackgroundColor: tinta });
      ch.data.labels = label;
      ch.options.animation = GERAK() ? { duration: 900, easing: "easeOutQuart" } : false;
      ch.update(); return;
    }
    grafik["garis-mini"] = new Chart(cv, {
      type: "line",
      data: { labels: label, datasets: [{ data: nilai, borderColor: rgba(tinta, 0.95), borderWidth: 2,
        tension: 0.35, fill: true, backgroundColor: isi, pointRadius: titik, pointBackgroundColor: tinta,
        pointBorderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false, events: [],
        animation: GERAK() ? { duration: 900, easing: "easeOutQuart" } : false,
        layout: { padding: { top: 8, right: 8, left: 0, bottom: 0 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
      },
    });
  }

  function histogram(id, stat, fmt) {
    const u = stat.urut;
    const q = (p) => u[Math.min(u.length - 1, Math.max(0, Math.round(p * (u.length - 1))))];
    let lo = q(0.02), hi = q(0.98);
    if (hi <= lo) { lo = u[0]; hi = u[u.length - 1]; }
    const nb = hi > lo ? 10 : 1, lebar = (hi - lo) / nb || 1;
    const hit = new Array(nb).fill(0);
    for (const v of u) hit[Math.min(nb - 1, Math.max(0, Math.floor((v - lo) / lebar)))]++;
    const batas = hit.map((_, k) => [lo + k * lebar, lo + (k + 1) * lebar]);
    const label = batas.map((b) => fmt.sumbu(b[0]));
    grafikBatang(id, label, hit, {
      sumbuY: (v) => (Number.isInteger(v) ? v : ""),
      tooltip: {
        title: (it) => {
          const k = it[0].dataIndex, b = batas[k];
          if (k === nb - 1 && u[u.length - 1] > hi) return "≥ " + fmt.teks(b[0]);
          if (k === 0 && u[0] < lo) return "≤ " + fmt.teks(b[1]);
          return fmt.teks(b[0]) + " – " + fmt.teks(b[1]);
        },
        label: (it) => it.raw + " pesanan",
      },
    });
  }

  // ------------------------------------------------------------------ ringkasan
  const IKON = {
    naik: '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>',
    label: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    tas: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    kotak: '<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    persen: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    pai: '<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15.5 3.7A9 9 0 0 1 20.3 8.5H15.5z"/>',
    jam: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
  };
  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const KPI = [
    { id: "pa", kelas: "utama", label: "Penghasilan Akhir", ikon: IKON.naik, fmt: rp },
    { id: "v", kelas: "lebar", label: "Total Nominal Seluruh Produk", ikon: IKON.label, fmt: rp },
    { id: "rasio", kelas: "lebar persen", label: "Porsi Potongan Shopee", ikon: IKON.persen,
      fmt: (x) => (isFinite(x) ? fmtPct.format(x * 100) + "%" : "–") },
    { id: "n", label: "Jumlah pesanan", ikon: IKON.tas, fmt: (x) => fmtAngka.format(x) },
    { id: "w", label: "Jumlah pcs bersih", ikon: IKON.kotak, fmt: (x) => fmtDes.format(Math.round(x * 100) / 100) },
    { id: "porsi", kelas: "lebar porsi", label: "Porsi Penghasilan Shopee dan Non-Shopee", ikon: IKON.pai },
  ];

  // bintang kecil berkelip di kartu utama (posisi dan jeda tetap supaya tidak "melompat")
  const BINTANG = [[78, 12, 0], [90, 34, 1.1], [64, 22, 2.3], [84, 58, 0.6], [56, 8, 1.8], [94, 76, 2.7]]
    .map(([x, y, d], i) => `<span class="bintang" aria-hidden="true" style="left:${x}%;top:${y}%;animation-delay:${d}s;width:${8 + (i % 3) * 3}px;height:${8 + (i % 3) * 3}px">`
      + '<svg viewBox="0 0 20 20"><path d="M10 0l2.4 7.6L20 10l-7.6 2.4L10 20l-2.4-7.6L0 10l7.6-2.4z"/></svg></span>').join("");

  function buatKPI() {
    $("kpi").innerHTML = KPI.map((k) => `<div class="kartu ${k.kelas || ""}" id="kartu-${k.id}">
      <div class="baris-label"><span class="ikon">${svg(k.ikon)}</span><span class="label">${k.label}${k.id === "rasio"
        ? ' <span class="lencana" id="lencana-rasio">Khusus Shopee</span>' : ""}</span></div>
      ${k.id === "porsi" ? `<div class="seg-batang tipis" role="img" id="porsi-batang"><div class="seg"></div><div class="seg"></div></div>
        <div class="legenda">${["Shopee", "Non-Shopee"].map((nama) =>
          `<span><i></i>${nama} <b data-hitung></b> <span class="jml"></span></span>`).join("")}</div>`
        : `<div class="nilai" id="kpi-${k.id}" data-hitung></div>`}
      ${k.id === "rasio" ? '<div class="meter" aria-hidden="true"><span class="isi" id="kpi-meter"></span></div>' : ""}
      <div class="ket" id="kpi-ket-${k.id}"></div>
      ${k.kelas === "utama" ? '<div class="garis-mini"><canvas id="garis-mini" aria-hidden="true"></canvas></div>' + BINTANG : ""}</div>`).join("");
    [...$("kpi").children].forEach((el, i) => { daftarkanMuncul(el, i * 70); pasangMiring(el); });
  }

  /** Kartu miring sedikit mengikuti kursor (hanya mouse). */
  function pasangMiring(el) {
    if (!GERAK() || !window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    el.classList.add("miring");
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.setProperty("--ry", ((x - 0.5) * 7).toFixed(2) + "deg");
      el.style.setProperty("--rx", ((0.5 - y) * 7).toFixed(2) + "deg");
      el.style.setProperty("--gx", (x * 100).toFixed(1) + "%");
      el.style.setProperty("--gy", (y * 100).toFixed(1) + "%");
    });
    el.addEventListener("pointerleave", () => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); });
  }

  function gambarKPI(baris) {
    const s = sumber(), n = baris.length, uang = kas(baris);
    const jum = (rows, k) => rows.reduce((a, x) => a + (typeof x[k] === "number" ? x[k] : 0), 0);
    const sh = baris.filter((x) => x.src === "s"), nn = baris.filter((x) => x.src === "n");
    const nilai = { pa: jumlahPA(uang), v: jum(baris, "v"), n, w: jum(baris, "w") };
    const dp = jumlahPA(uang, (x) => x.belum), piutang = baris.reduce((a, x) => a + (x.piutang || 0), 0);
    const catatan = dp ? `Termasuk DP belum lunas ${rp(dp)}` : piutang ? `Termasuk piutang ${rp(piutang)}` : "";
    // porsi biaya Shopee dari nilai produk: selalu dari pesanan Shopee saja
    const vS = jum(sh, "v"), paS = jum(sh, "pa");
    nilai.rasio = vS ? 1 - paS / vS : NaN;
    for (const k of KPI) if (k.fmt) hitungNaik($("kpi-" + k.id), nilai[k.id], k.fmt);
    const rata = n ? `ata-rata ${rp(jum(baris, "pa") / n)} per pesanan` : "";
    $("kpi-ket-pa").textContent = catatan ? `${catatan}${rata ? " · r" + rata : ""}`
      : (rata ? "R" + rata : "Tidak ada pesanan pada periode ini");
    $("kpi-ket-v").textContent = n ? `Rata-rata ${rp(nilai.v / n)} per pesanan` : "";
    $("kpi-ket-n").textContent = s === "semua" ? `${fmtAngka.format(sh.length)} Shopee · ${fmtAngka.format(nn.length)} non-Shopee`
      : (pilihan.tanpaRetur ? "Tanpa pesanan retur" : "Termasuk pesanan retur");
    $("kpi-ket-w").textContent = n ? `Rata-rata ${fmtDes.format(nilai.w / n)} pcs per pesanan` : "";
    $("kpi-ket-rasio").textContent = vS ? `Potongan ${rp(vS - paS)} dari ${rp(vS)}` : (n ? "Tidak ada pesanan Shopee pada periode ini" : "");
    const meter = $("kpi-meter");
    void meter.offsetWidth;
    meter.style.width = (isFinite(nilai.rasio) ? Math.max(0, Math.min(1, nilai.rasio)) * 100 : 0) + "%";
    // tampilan kartu menurut sumber; kartu utama setinggi kolom kanan
    $("kartu-rasio").hidden = s === "non";
    $("lencana-rasio").hidden = s !== "semua";
    $("kartu-porsi").hidden = s !== "semua";
    $("kpi").style.setProperty("--baris", s === "semua" ? 4 : s === "shopee" ? 3 : 2);
    if (s === "semua") gambarPorsi(paS, jumlahPA(uang, (x) => x.src === "n"));
  }

  function gambarPorsi(paS, paN) {
    const W = warna(), nilai = [Math.max(0, paS), Math.max(0, paN)], warnaSeg = [W.seri1, W.seri2];
    const tot = nilai[0] + nilai[1], el = $("kartu-porsi");
    el.querySelectorAll(".seg").forEach((sg, k) => {
      sg.style.background = warnaSeg[k];
      sg.style.flexGrow = tot ? String(nilai[k]) : "0";
    });
    el.querySelectorAll(".seg")[1].style.boxShadow = nilai[0] && nilai[1] ? "" : "none";
    $("porsi-batang").setAttribute("aria-label", tot ? `Shopee ${pct(nilai[0] / tot)}, non-Shopee ${pct(nilai[1] / tot)}` : "Tidak ada data");
    el.querySelectorAll(".legenda i").forEach((e, k) => { e.style.background = warnaSeg[k]; });
    el.querySelectorAll(".legenda b").forEach((e, k) => hitungNaik(e, tot ? nilai[k] / tot : NaN, (v) => (isFinite(v) ? pct(v) : "–")));
    el.querySelectorAll(".legenda .jml").forEach((e, k) => { e.textContent = rp(nilai[k]); });
    $("kpi-ket-porsi").textContent = tot ? `Dari Penghasilan Akhir ${rp(tot)} pada periode ini` : "Tidak ada pesanan pada periode ini";
  }

  // ------------------------------------------------------------------ belum dihitung / belum lunas (non-Shopee)
  function gambarBelum() {
    const el = $("belum");
    const piutang = NON.filter((x) => x.piutang > 0);
    const tampil = BELUM.length + piutang.length > 0 && sumber() !== "shopee";
    el.hidden = !tampil;
    if (!tampil) return;
    const angka = (v) => (typeof v === "number" ? v : 0);
    const sisaDari = (x) => Math.max(0, angka(x.selisih));
    const diterima = BELUM.reduce((a, x) => a + angka(x.pa), 0);
    const sisa = BELUM.reduce((a, x) => a + sisaDari(x), 0);
    const totPiutang = piutang.reduce((a, x) => a + x.piutang, 0);
    let judul, ket;
    if (DASAR === "kirim") {
      const semuaKirim = BELUM.every((x) => !x.konsinyasi);
      judul = [BELUM.length ? `${BELUM.length} pesanan non-Shopee belum ${semuaKirim ? "dikirim" : "dihitung"}` : "",
        piutang.length ? `${piutang.length} sudah dikirim, belum lunas` : ""].filter(Boolean).join(" · ");
      ket = (BELUM.length ? `Penjualan dihitung saat barang dikirim (konsinyasi: saat dibayar), sesuai pengakuan pendapatan SAK EMKM. `
        + `Uang yang sudah diterima dari pesanan ini (${rp(diterima)}) masih berupa uang muka pelanggan${sisa ? `, sisa tagihan ${rp(sisa)}` : ""}. ` : "")
        + (piutang.length ? `Pesanan yang sudah dikirim dihitung penuh; piutangnya ${rp(totPiutang)}.` : "");
    } else if (DASAR === "kas") {
      judul = `${BELUM.length} pesanan non-Shopee belum lunas`;
      ket = `Uang yang sudah diterima (${rp(diterima)}) sudah masuk Penghasilan Akhir pada tanggal pembayarannya. Jumlah pesanan, TNSP, dan pcs dihitung setelah lunas. Sisa tagihan ${rp(sisa)}.`;
    } else {
      judul = `${BELUM.length} pesanan non-Shopee belum lunas`;
      ket = `Belum ikut dihitung di dashboard sampai lunas. Sudah diterima ${rp(diterima)}, sisa tagihan ${rp(sisa)}.`;
    }
    const baris = (x, rinci) => `<li>
        <span class="no">#${esc(x.no)}</span>
        <span class="isi-belum"><span>${esc(x.saluran)}${x.cara ? " · " + esc(x.cara) : ""}${typeof x.bayar1 === "number" ? " · bayar pertama " + tglTeks(x.bayar1) : ""}</span>
        <span class="rp">${rinci}</span></span></li>`;
    el.innerHTML = `<div class="baris-label"><span class="ikon">${svg(IKON.jam)}</span><div>
        <h3>${judul}</h3><p class="ket">${ket.trim()}</p></div></div>
      <ul class="daftar-belum">${BELUM.map((x) => baris(x, sisaDari(x)
          ? `Diterima ${rp(angka(x.pa))} · sisa ${rp(sisaDari(x))} dari ${rp(angka(x.v))}`
          : x.konsinyasi ? "Konsinyasi · menunggu dibayar"
          : `Lunas ${rp(angka(x.pa))}${DASAR === "kirim" ? " · menunggu dikirim" : ""}`)).join("")}${
        piutang.map((x) => baris(x, `Dikirim ${tglTeks(x.p)} · piutang ${rp(x.piutang)} dari ${rp(angka(x.pa))}`)).join("")}</ul>`;
  }

  // ------------------------------------------------------------------ kartu statistik
  const METRIK = [
    { id: "q", grup: "grup-waktu", judul: "Selisih Waktu Bayar - Pesan", jenis: "durasi" },
    { id: "r", grup: "grup-waktu", judul: "Selisih Waktu Dikirim - Bayar", jenis: "durasi" },
    { id: "s", grup: "grup-waktu", judul: "Selisih Waktu Selesai - Dikirim", jenis: "durasi",
      catatan: "Waktu Selesai = waktu dana lepas." },
    { id: "t", grup: "grup-waktu", judul: "Selisih Antar Waktu Pesan", jenis: "durasi",
      catatan: "Jarak dari pesanan sebelumnya, diurutkan menurut waktu pesan." },
    { id: "u", grup: "grup-waktu", judul: "Selisih Antar Waktu Pengiriman", jenis: "durasi",
      catatan: "Jarak dari pengiriman sebelumnya, diurutkan menurut waktu kirim." },
    { id: "v", grup: "grup-nilai", judul: "Total Nominal Seluruh Produk", jenis: "rp", total: true },
    { id: "w", grup: "grup-nilai", judul: "Net Count Jumlah Pcs", jenis: "pcs", total: true },
    { id: "pa", grup: "grup-nilai", judul: "Penghasilan Akhir", jenis: "rp", total: true },
    { id: "av", grup: "grup-biaya", judul: "% Perbandingan Total Seluruh Biaya dengan Penghasilan Akhir", jenis: "pct" },
    { id: "ax", grup: "grup-biaya", judul: "Penghasilan yang Ekstra/(-Hilang) karena Pesan via Shopee", jenis: "rp", total: true },
    { id: "ay", grup: "grup-biaya", judul: "% Penghasilan yang Ekstra/(-Hilang) karena Pesan via Shopee", jenis: "pct" },
    { id: "bk", grup: "grup-biaya", judul: "Penghematan dengan Gratis Ongkir XTRA", jenis: "rp", total: true, na: true },
  ];
  const STAT_NAMA = { min: "Minimum", maks: "Maksimum", median: "Median", rata: "Rata-rata", total: "Total" };

  function buatKartu() {
    const urutan = {};
    for (const m of METRIK) {
      const el = document.createElement("article");
      el.className = "kartu angkat";
      el.innerHTML = `<div class="kepala-kartu"><h3>${m.judul}</h3><div class="segmen trek" role="radiogroup" aria-label="Nilai"></div></div>
        <p class="angka-besar" id="nilai-${m.id}" data-hitung></p><p class="angka-ket" id="ket-${m.id}"></p>
        <div class="kanvas"><canvas id="hist-${m.id}" aria-label="Sebaran ${m.judul}"></canvas></div>
        ${m.catatan || m.na ? `<p class="catatan" id="cat-${m.id}">${m.catatan || ""}</p>` : ""}`;
      const seg = el.querySelector(".segmen");
      for (const s of ["min", "maks", "median", "rata"].concat(m.total ? ["total"] : [])) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = STAT_NAMA[s]; b.dataset.stat = s; b.setAttribute("role", "radio");
        b.addEventListener("click", () => { pilihan.stat[m.id] = s; simpanPilihan(); gambarKartu(m, tersaring()); });
        seg.appendChild(b);
      }
      $(m.grup).appendChild(el);
      urutan[m.grup] = (urutan[m.grup] || 0) + 1;
      daftarkanMuncul(el, ((urutan[m.grup] - 1) % 3) * 80);
    }
  }

  function gambarKartu(m, baris) {
    const fmt = FORMAT[m.jenis];
    const st = statistik(baris, m.id);
    const pilih = pilihan.stat[m.id] || "median";
    const kartu = $("nilai-" + m.id).parentElement;
    const seg = kartu.querySelector(".segmen");
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.stat === pilih)));
    pasangIndikator(seg);
    if (m.na) {
      const na = baris.filter((x) => x.bk === "N/A").length;
      $("cat-" + m.id).textContent = na ? `${na} pesanan bernilai "N/A" tidak ikut dihitung.` : "";
    }
    if (!st) {
      hitungNaik($("nilai-" + m.id), NaN, () => "–");
      $("ket-" + m.id).textContent = "Tidak ada data pada periode ini";
      hapusGrafik("hist-" + m.id);
      return;
    }
    let ket = { min: namaPesanan(st.minX), maks: namaPesanan(st.maksX), median: `Nilai tengah dari ${st.n} pesanan`,
      rata: `Rata-rata dari ${st.n} pesanan`, total: `Jumlah dari ${st.n} pesanan` }[pilih];
    let angka = st[pilih];
    if (m.id === "pa" && pilih === "total") {
      // sama dengan kartu ringkasan: non-Shopee per tanggal uang diterima
      const uang = kas(baris), dp = jumlahPA(uang, (x) => x.belum);
      angka = jumlahPA(uang);
      if (dp) ket = `Jumlah dari ${st.n} pesanan, termasuk DP belum lunas ${rp(dp)}`;
      else if (Math.abs(angka - st.total) >= 0.5) ket = `Jumlah per tanggal uang diterima (${st.n} pesanan)`;
    }
    hitungNaik($("nilai-" + m.id), angka, fmt.teks);
    $("ket-" + m.id).textContent = ket;
    histogram("hist-" + m.id, st, fmt);
  }

  // ------------------------------------------------------------------ tren
  function gambarTren(baris) {
    const uang = kas(baris), kosong = !baris.length && !uang.length;
    document.querySelectorAll(".kanvas.tren").forEach((el) => el.classList.toggle("kosong", kosong));
    if (kosong) {
      ["tren-pa", "tren-n"].forEach(hapusGrafik);
      garisMini([], []);
      $("tren-satuan-1").textContent = $("tren-satuan-2").textContent = "";
      return;
    }
    const ps = baris.map((x) => x.p).concat(uang.map((x) => x.t));
    // sumbu waktu mengikuti periode yang dipilih (hari tanpa pesanan tetap tampil sebagai 0)
    const [a, b] = rentangPeriode();
    const [ty, tm, td] = hariIniWIB();
    const awal = isFinite(a) ? Math.min(a, Math.min(...ps)) : Math.min(...ps);
    const akhir = Math.max(Math.max(...ps), isFinite(b) ? Math.min(b - 1e-6, keSerial(ty, tm, td + 1) - 1e-6) : -Infinity);
    const harian = akhir - awal <= 45;
    const kunci = (s) => { const d = keTanggal(s); return harian ? isoTgl(Math.floor(s)) : d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"); };
    const label = [], idx = {};
    if (harian) {
      for (let s = Math.floor(awal); s <= Math.floor(akhir); s++) { idx[isoTgl(s)] = label.length; label.push(isoTgl(s)); }
    } else {
      const da = keTanggal(awal), db = keTanggal(akhir);
      for (let y = da.getUTCFullYear(), m = da.getUTCMonth(); y < db.getUTCFullYear() || (y === db.getUTCFullYear() && m <= db.getUTCMonth()); m === 11 ? (y++, m = 0) : m++) {
        const k = y + "-" + String(m + 1).padStart(2, "0"); idx[k] = label.length; label.push(k);
      }
    }
    // satu seri per sumber yang tampil; warna mengikuti sumbernya (Shopee biru, non-Shopee oranye)
    const W = warna(), s = sumber();
    const daftar = (s === "semua" ? [["s", "Shopee", W.seri1], ["n", "Non-Shopee", W.seri2]]
      : s === "shopee" ? [["s", "Shopee", W.seri1]] : [["n", "Non-Shopee", W.seri2]]);
    const seriPA = daftar.map(([src, nama, w]) => ({ src, nama, warna: w, data: new Array(label.length).fill(0) }));
    const seriN = daftar.map(([src, nama, w]) => ({ src, nama, warna: w, data: new Array(label.length).fill(0) }));
    const pa = new Array(label.length).fill(0);
    for (const x of baris) {
      const k = idx[kunci(x.p)], j = daftar.findIndex((d) => d[0] === x.src);
      if (j >= 0) seriN[j].data[k] += 1;
    }
    // Penghasilan Akhir: non-Shopee pada tanggal uang diterima
    for (const x of uang) {
      const k = idx[kunci(x.t)], j = daftar.findIndex((d) => d[0] === x.src);
      if (j < 0 || k === undefined) continue;
      seriPA[j].data[k] += x.pa; pa[k] += x.pa;
    }
    const tampil = label.map((k, ix) => { const p = k.split("-").map(Number);
      if (harian) return p[2] + " " + BULAN[p[1] - 1];
      return ix === 0 || p[1] === 1 ? [BULAN[p[1] - 1], String(p[0])] : BULAN[p[1] - 1]; });
    const judul = label.map((k) => { const p = k.split("-").map(Number);
      return harian ? p[2] + " " + BULAN[p[1] - 1] + " " + p[0] : BULAN[p[1] - 1] + " " + p[0]; });
    $("tren-satuan-1").textContent = $("tren-satuan-2").textContent = harian ? "per hari" : "per bulan";
    const judulTip = (it) => judul[it[0].dataIndex];
    grafikTren("tren-pa", tampil, seriPA, { sumbuY: (v) => rpRingkas(v), judul: judulTip, teks: rp });
    grafikTren("tren-n", tampil, seriN, { sumbuY: (v) => (Number.isInteger(v) ? v : ""), judul: judulTip,
      teks: (v) => fmtAngka.format(v) + " pesanan" });
    garisMini(judul, pa);
  }

  // ------------------------------------------------------------------ lokasi
  const LOKASI = [
    { judul: "% Pesanan di dalam/luar Jabodetabek", kunci: "i", nilai: [["Ya", "Dalam Jabodetabek"], ["Tidak", "Luar Jabodetabek"]] },
    { judul: "% Pesanan di dalam/luar Pulau Jawa", kunci: "j", nilai: [["Dalam", "Dalam Pulau Jawa"], ["Luar", "Luar Pulau Jawa"]] },
  ];

  function buatLokasi() {
    LOKASI.forEach((b, i) => {
      const el = document.createElement("article");
      el.className = "kartu angkat";
      el.innerHTML = `<h3>${b.judul}</h3><div class="seg-batang" role="img"><div class="seg"></div><div class="seg"></div></div>
        <div class="legenda">${b.nilai.map(([, nama]) =>
          `<span><i></i>${nama} <b data-hitung></b> <span class="jml"></span></span>`).join("")}</div>
        <p class="catatan"></p>`;
      $("lokasi").appendChild(el);
      daftarkanMuncul(el, i * 80);
    });
  }

  function gambarLokasi(baris) {
    const W = warna(), warnaSeg = [W.lokasi1, W.lokasi2];
    [...$("lokasi").children].forEach((el, i) => {
      const b = LOKASI[i];
      const hit = b.nilai.map(([v]) => baris.filter((x) => x[b.kunci] === v).length);
      const tot = hit[0] + hit[1], kosong = baris.length - tot;
      const seg = el.querySelectorAll(".seg");
      seg.forEach((s, k) => {
        s.style.background = warnaSeg[k];
        s.style.flexGrow = tot ? String(hit[k]) : "0";
        s.title = `${b.nilai[k][1]}: ${tot ? pct(hit[k] / tot) : "–"} (${hit[k]})`;
      });
      seg[1].style.boxShadow = hit[0] && hit[1] ? "" : "none";
      el.querySelector(".seg-batang").setAttribute("aria-label",
        b.nilai.map(([, nama], k) => nama + " " + (tot ? pct(hit[k] / tot) : "-")).join(", "));
      el.querySelectorAll(".legenda i").forEach((e, k) => { e.style.background = warnaSeg[k]; });
      el.querySelectorAll(".legenda b").forEach((e, k) =>
        hitungNaik(e, tot ? hit[k] / tot : NaN, (v) => (isFinite(v) ? pct(v) : "–")));
      el.querySelectorAll(".jml").forEach((e, k) => { e.textContent = `(${hit[k]})`; });
      el.querySelector(".catatan").textContent = kosong ? `${kosong} pesanan tanpa data alamat tidak ikut dihitung.` : "";
    });
  }

  // ------------------------------------------------------------------ produk
  const UKURAN = { pcs: "Pcs bersih", pesanan: "Jumlah pesanan", nominal: "Nominal" };
  function singkatSKU(s) { return s.replace(/^Indonesian Batik Motif /, "").replace(/^Indonesia Batik /, ""); }
  function nilaiUkuran(v) { return pilihan.ukuran === "nominal" ? rp(v) : fmtDes.format(v) + (pilihan.ukuran === "pcs" ? " pcs" : " pesanan"); }

  function agregat(rows, kunciFn) {
    const peta = new Map();
    for (const p of rows) {
      const k = kunciFn(p);
      if (!peta.has(k)) peta.set(k, { nama: k, pcs: 0, nominal: 0, pesanan: new Set() });
      const a = peta.get(k);
      a.pcs += (p.beli || 0) + (p.kembali || 0); a.nominal += p.sub || 0; a.pesanan.add(p.k);
    }
    return [...peta.values()].map((a) => ({ nama: a.nama, pcs: a.pcs, nominal: a.nominal, pesanan: a.pesanan.size }))
      .sort((a, b) => b[pilihan.ukuran] - a[pilihan.ukuran] || a.nama.localeCompare(b.nama));
  }

  function daftarBatang(el, items, tombol, aktif, total) {
    const porsi = pilihan.ukuran !== "pesanan" && total > 0;
    const maks = Math.max(1, ...items.map((x) => Math.max(0, x[pilihan.ukuran])));
    el.innerHTML = "";
    const isi = [];
    items.forEach((it, i) => {
      const b = document.createElement(tombol ? "button" : "div");
      b.className = "baris-batang"; b.setAttribute("role", "listitem");
      if (tombol) { b.type = "button"; b.setAttribute("aria-pressed", String(it.nama === aktif)); b.dataset.sku = it.nama; }
      const w = Math.max(0, it[pilihan.ukuran]) / maks * 100;
      b.innerHTML = `<span class="nama" title="${esc(it.nama)}">${esc(singkatSKU(it.nama) || "(tanpa varian)")}</span><span class="nilai">${nilaiUkuran(it[pilihan.ukuran])}${porsi
          ? ` <span class="porsi">${pct(it[pilihan.ukuran] / total)}</span>` : ""}</span>
        <span class="jalur"><span class="isi"></span></span>`;
      const bar = b.querySelector(".isi");
      bar.style.setProperty("--tunda", Math.min(i * 45, 500) + "ms");
      isi.push([bar, w]);
      if (tombol) b.addEventListener("click", () => { pilihan.sku = it.nama; simpanPilihan(); gambarProduk(tersaring(), true); });
      el.appendChild(b);
    });
    void el.offsetWidth;
    isi.forEach(([bar, w]) => { bar.style.width = w + "%"; });
  }

  function gambarProduk(baris, hanyaVarian) {
    const nos = new Set(baris.map((x) => x.k));
    const rows = PRODUK.filter((p) => nos.has(p.k));
    document.querySelectorAll("#ukuran-produk button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.u === pilihan.ukuran)));
    pasangIndikator($("ukuran-produk"));
    const sku = agregat(rows, (p) => p.sku);
    if (!sku.length) {
      $("sorot-produk").innerHTML = ""; $("daftar-sku").innerHTML = '<p class="sub">Tidak ada data pada periode ini.</p>';
      $("judul-varian").textContent = ""; $("daftar-varian").innerHTML = ""; return;
    }
    const atas = sku[0], bawah = sku[sku.length - 1];
    const seri = (nilai) => {
      const sama = sku.filter((x) => x[pilihan.ukuran] === nilai).map((x) => singkatSKU(x.nama));
      return esc(sama.slice(0, 3).join(", ")) + (sama.length > 3 ? ` <span class="ket">+${sama.length - 3} lainnya</span>` : "");
    };
    const kotak = (judul, it) => `<div><div class="label">${judul}</div><div class="nama">${seri(it[pilihan.ukuran])}</div><div class="ket">${nilaiUkuran(it[pilihan.ukuran])}</div></div>`;
    // total seluruh produk terjual pada periode ini (menurut ukuran yang dipilih)
    const total = pilihan.ukuran === "pesanan" ? new Set(rows.map((p) => p.k)).size
      : sku.reduce((a, x) => a + x[pilihan.ukuran], 0);
    const jmlVarian = new Set(rows.map((p) => p.sku + "\u0000" + p.varian)).size;
    const judulTotal = { pcs: "Total seluruh produk terjual", pesanan: "Total pesanan berisi produk",
      nominal: "Total nominal seluruh produk terjual" }[pilihan.ukuran];
    $("sorot-produk").innerHTML = `<div class="total"><div class="label">${judulTotal}</div>
        <div class="angka" id="total-produk" data-hitung></div>
        <div class="ket">dari ${sku.length} SKU Induk dan ${jmlVarian} varian${pilihan.ukuran === "pcs" ? " (pcs bersih, retur sudah dikurangi)" : ""}</div></div>` +
      kotak("Paling populer", atas) + (sku.length > 1 ? kotak("Paling tidak populer", bawah) : "");
    hitungNaik($("total-produk"), total, (v) => nilaiUkuran(pilihan.ukuran === "nominal" ? v : Math.round(v)));
    const aktif = sku.some((s) => s.nama === pilihan.sku) ? pilihan.sku : atas.nama;
    if (hanyaVarian) {
      $("daftar-sku").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sku === aktif)));
    } else {
      daftarBatang($("daftar-sku"), sku, true, aktif, total);
    }
    const varian = agregat(rows.filter((p) => p.sku === aktif), (p) => p.varian);
    const vA = varian[0], vB = varian[varian.length - 1];
    const namaV = (n) => varian.filter((x) => x[pilihan.ukuran] === n).map((x) => x.nama || "(tanpa varian)").join(", ");
    const totalSku = (sku.find((x) => x.nama === aktif) || {})[pilihan.ukuran] || 0;
    $("judul-varian").textContent = `Varian ${singkatSKU(aktif)} (${nilaiUkuran(totalSku)})` + (varian.length > 1 && vA[pilihan.ukuran] !== vB[pilihan.ukuran]
      ? ` · terpopuler ${namaV(vA[pilihan.ukuran])}; paling tidak populer ${namaV(vB[pilihan.ukuran])}` : "");
    daftarBatang($("daftar-varian"), varian, false, null, totalSku);
  }

  // ------------------------------------------------------------------ saluran penjualan
  const UKURAN_SALURAN = { pa: "Penghasilan Akhir", n: "Pesanan", w: "Pcs bersih" };
  function teksSaluran(v) {
    const u = pilihan.ukuranSaluran;
    return u === "pa" ? rp(v) : fmtDes.format(Math.round(v * 100) / 100) + (u === "n" ? " pesanan" : " pcs");
  }

  function gambarSaluran(baris) {
    const s = sumber();
    $("grup-saluran").hidden = s === "shopee";
    if (s === "shopee") return;
    const u = UKURAN_SALURAN[pilihan.ukuranSaluran] ? pilihan.ukuranSaluran : "pa";
    document.querySelectorAll("#ukuran-saluran button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.u === u)));
    pasangIndikator($("ukuran-saluran"));
    const peta = new Map();
    const ambil = (x) => {
      const kunci = x.src + "\u0000" + x.saluran;
      if (!peta.has(kunci)) peta.set(kunci, { nama: x.saluran, src: x.src, pa: 0, n: 0, w: 0 });
      return peta.get(kunci);
    };
    for (const x of baris) { const a = ambil(x); a.n += 1; a.w += typeof x.w === "number" ? x.w : 0; }
    for (const x of kas(baris)) ambil(x).pa += x.pa;
    const items = [...peta.values()].sort((a, b) => b[u] - a[u] || a.nama.localeCompare(b.nama));
    const el = $("daftar-saluran");
    if (!items.length) { el.innerHTML = '<p class="sub">Tidak ada pesanan pada periode ini.</p>'; return; }
    const total = items.reduce((a, x) => a + Math.max(0, x[u]), 0);
    const maks = Math.max(1, ...items.map((x) => Math.max(0, x[u])));
    el.innerHTML = "";
    const isi = [];
    items.forEach((it, i) => {
      const b = document.createElement("div");
      b.className = "baris-batang"; b.setAttribute("role", "listitem");
      b.innerHTML = `<span class="nama">${esc(it.nama)}${it.src === "n" && s === "semua" ? ' <span class="ket-sumber">non-Shopee</span>' : ""}</span>
        <span class="nilai">${teksSaluran(it[u])}${total > 0 ? ` <span class="porsi">${pct(Math.max(0, it[u]) / total)}</span>` : ""}</span>
        <span class="jalur"><span class="isi ${it.src === "n" ? "non" : "shopee"}"></span></span>`;
      const bar = b.querySelector(".isi");
      bar.style.setProperty("--tunda", Math.min(i * 45, 500) + "ms");
      isi.push([bar, Math.max(0, it[u]) / maks * 100]);
      el.appendChild(b);
    });
    void el.offsetWidth;
    isi.forEach(([bar, w]) => { bar.style.width = w + "%"; });
  }

  // ------------------------------------------------------------------ saringan
  const PERIODE = [["semua", "Semua"], ["30h", "30 hari"], ["bulan_ini", "Bulan ini"], ["bulan_lalu", "Bulan lalu"],
    ["3bln", "3 bulan"], ["tahun_ini", "Tahun ini"], ["rentang", "Rentang…"]];

  function buatSaringan() {
    if (ADA_NON) {
      for (const [k, nama] of SUMBER) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = nama; b.dataset.s = k; b.setAttribute("role", "radio");
        b.addEventListener("click", (e) => {
          if (sumber() === k) return;
          pilihan.sumber = k; simpanPilihan();
          gantiTema(b, e, gambarSemua);
        });
        $("sumber").appendChild(b);
      }
      $("sumber").hidden = false;
      for (const [k, nama] of Object.entries(UKURAN_SALURAN)) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = nama; b.dataset.u = k; b.setAttribute("role", "radio");
        b.addEventListener("click", () => { pilihan.ukuranSaluran = k; simpanPilihan(); gambarSaluran(tersaring()); });
        $("ukuran-saluran").appendChild(b);
      }
    }
    for (const [k, nama] of PERIODE) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = nama; b.dataset.p = k; b.setAttribute("role", "radio");
      b.addEventListener("click", () => { pilihan.periode = k; simpanPilihan(); gambarSemua(); });
      $("periode").appendChild(b);
    }
    for (const [k, nama] of Object.entries(UKURAN)) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = nama; b.dataset.u = k; b.setAttribute("role", "radio");
      b.addEventListener("click", () => { pilihan.ukuran = k; simpanPilihan(); gambarProduk(tersaring()); });
      $("ukuran-produk").appendChild(b);
    }
    $("tanpa-retur").checked = !!pilihan.tanpaRetur;
    $("tanpa-retur").addEventListener("change", (e) => { pilihan.tanpaRetur = e.target.checked; simpanPilihan(); gambarSemua(); });
    ["dari", "sampai"].forEach((id) => $(id).addEventListener("change", gambarSemua));
    const ps = SEMUA.map((x) => x.p).filter((x) => typeof x === "number");
    if (ps.length) {
      $("dari").min = $("sampai").min = isoTgl(Math.min(...ps));
      $("dari").value = isoTgl(Math.min(...ps)); $("sampai").value = isoTgl(Math.max(...ps));
    }
    // bayangan pada saringan saat menempel di atas
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => $("saringan").classList.toggle("melayang", !e.isIntersecting))
        .observe($("penanda-saringan"));
    }
    buatKPI(); buatLokasi(); buatKartu();
    document.querySelectorAll("#aplikasi h2").forEach((h) => daftarkanMuncul(h, 0));
    document.querySelectorAll(".grup > .grid > .kartu, .grup > .kartu").forEach((el, i) => {
      el.classList.add("angkat");
      if (!el.classList.contains("muncul")) daftarkanMuncul(el, (i % 2) * 80);
    });
  }

  /** Ganti tema dengan lingkaran warna baru yang melebar dari tombol (View Transitions); tanpa dukungan: langsung. */
  function gantiTema(tombol, e, ubah) {
    if (!GERAK() || !document.startViewTransition) { ubah(); return; }
    const r = tombol.getBoundingClientRect();
    const x = e && e.clientX ? e.clientX : r.left + r.width / 2, y = e && e.clientY ? e.clientY : r.top + r.height / 2;
    const jauh = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const akar = document.documentElement.style;
    akar.setProperty("--vt-x", x + "px"); akar.setProperty("--vt-y", y + "px"); akar.setProperty("--vt-r", Math.ceil(jauh) + "px");
    // warna langsung ke tema baru di dalam lingkaran (transisi warna biasa dimatikan sementara)
    const html = document.documentElement;
    html.classList.add("vt");
    try {
      const vt = document.startViewTransition(ubah);
      vt.finished.finally(() => html.classList.remove("vt"));
    } catch (err) { html.classList.remove("vt"); ubah(); }
  }

  function gambarSemua() {
    const s = sumber();
    document.documentElement.dataset.sumber = s;
    document.querySelectorAll("#sumber button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.s === s)));
    pasangIndikator($("sumber"));
    document.querySelectorAll("#periode button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.p === pilihan.periode)));
    pasangIndikator($("periode"));
    $("rentang").hidden = pilihan.periode !== "rentang";
    $("aplikasi").dataset.sumber = s;
    const nRetur = SEMUA.filter((x) => x.retur && cocokSumber(x)).length;
    $("label-retur").textContent = `Kecualikan retur (${nRetur} pesanan)`;
    const baris = tersaring();
    const [, , teks] = rentangPeriode();
    const tglNon = DASAR === "kirim" ? "Tanggal Pengiriman" : "Tanggal Lunas";
    const dasar = { semua: `Waktu Selesai (Shopee) dan ${tglNon} (non-Shopee)`, shopee: "Waktu Selesai (Dana Lepas)",
      non: tglNon }[s];
    const namaSumber = { semua: "", shopee: ADA_NON ? " Shopee" : "", non: " non-Shopee" }[s];
    $("ringkas-periode").textContent = `${teks} · ${fmtAngka.format(baris.length)} pesanan${namaSumber} menurut ${dasar}`;
    // bagian yang datanya hanya ada di Shopee: disembunyikan saat hanya non-Shopee, berlabel saat digabung
    const shopee = baris.filter((x) => x.src === "s");
    document.querySelectorAll(".khusus-shopee").forEach((el) => { el.hidden = s === "non"; });
    document.querySelectorAll(".lencana.khusus").forEach((el) => { el.hidden = s !== "semua"; });
    document.querySelectorAll(".legenda-sumber").forEach((el) => legendaSumber(el, s === "semua"));
    gambarKPI(baris);
    gambarBelum();
    gambarTren(baris);
    gambarSaluran(baris);
    if (s !== "non") gambarLokasi(shopee);
    for (const m of METRIK) {
      if (m.grup === "grup-nilai") gambarKartu(m, baris);
      else if (s !== "non") gambarKartu(m, shopee);
    }
    gambarProduk(baris);
  }

  // ------------------------------------------------------------------ masuk
  function tampil(id) {
    $("memuat").hidden = id !== "memuat"; $("masuk").hidden = id !== "masuk"; $("aplikasi").hidden = id !== "aplikasi";
  }

  function mulai(data) {
    DATA = data;
    siapkan(data);
    if (window.Chart) Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    const ps = SEMUA.map((x) => x.p).filter((x) => typeof x === "number");
    const jumlah = ADA_NON ? `${fmtAngka.format(PESANAN.length)} pesanan Shopee · ${fmtAngka.format(NON.length + BELUM.length)} non-Shopee`
      : `${fmtAngka.format(PESANAN.length)} pesanan`;
    $("info-data").innerHTML = `${jumlah} · ${ADA_NON ? "transaksi" : "dana lepas"} terakhir ${ps.length ? tglTeks(Math.max(...ps)) : "-"}` +
      (data.dibuat ? `<br><span class="denyut" aria-hidden="true"></span>Diperbarui ${esc(dibuatTeks(data.dibuat))}` : "");
    $("ket-dasar").textContent = {
      kirim: "Periode memakai Waktu Selesai (Dana Lepas) untuk Shopee dan Tanggal Pengiriman untuk non-Shopee (konsinyasi: Tanggal Lunas), sesuai pengakuan pendapatan SAK EMKM. Uang yang diterima sebelum barang dikirim belum dihitung.",
      lunas: "Periode memakai Waktu Selesai (Dana Lepas) untuk Shopee dan Tanggal Lunas untuk non-Shopee.",
      kas: "Periode memakai Waktu Selesai (Dana Lepas) untuk Shopee dan Tanggal Lunas untuk non-Shopee. Penghasilan Akhir non-Shopee dihitung pada tanggal uang diterima (basis kas), termasuk DP pesanan yang belum lunas.",
    }[DASAR];
    if (!ADA_NON) $("ket-dasar").textContent = "Periode memakai Waktu Selesai (Dana Lepas).";
    tampil("aplikasi");
    if (GERAK()) $("aplikasi").classList.add("tiba");
    if (!SUDAH_DIBUAT) { SUDAH_DIBUAT = true; buatSaringan(); }
    gambarSemua();
    let sudah = false;
    try { sudah = sessionStorage.getItem("ganeca-konfeti") === "1"; sessionStorage.setItem("ganeca-konfeti", "1"); } catch (e) { /* abaikan */ }
    if (!sudah) setTimeout(konfeti, 450);
  }

  /** Kelopak warna logo Ganeca memancar dari logo lalu jatuh. */
  function konfeti() {
    const logo = document.querySelector(".merek");
    if (!GERAK() || !logo || !logo.animate) return;
    const r = logo.getBoundingClientRect(), x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    const warnaK = ["#056839", "#fdce0a", "#ee4d2d", "#1d3461", "#2b8fd0", "#e4232c", "#fdce0a", "#056839"];
    for (let i = 0; i < 34; i++) {
      const k = document.createElement("span");
      k.className = "kelopak"; k.style.left = x0 + "px"; k.style.top = y0 + "px";
      k.style.background = warnaK[i % warnaK.length];
      document.body.appendChild(k);
      const sudut = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.9, cepat = 150 + Math.random() * 260;
      const dx = Math.cos(sudut) * cepat * 1.2, dy = Math.sin(sudut) * cepat * 0.5, putar = (Math.random() - 0.5) * 900;
      const anim = k.animate([
        { transform: "translate(-50%,-50%) scale(.2) rotate(0deg)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${putar / 2}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${dx * 1.3}px), calc(-50% + ${dy + 340}px)) scale(.8) rotate(${putar}deg)`, opacity: 0 },
      ], { duration: 1500 + Math.random() * 700, easing: "cubic-bezier(.2,.7,.4,1)" });
      anim.onfinish = () => k.remove();
    }
  }

  async function ambilAmplop() {
    const r = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (r.status === 404) throw new Error("BELUM_ADA");
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  function sibuk(ya) {
    const t = $("tombol-masuk");
    t.disabled = ya; t.classList.toggle("sibuk", ya);
    $("teks-masuk").textContent = ya ? "Membuka…" : "Buka dashboard";
  }

  function goyang(el) {
    el.classList.remove("goyang"); void el.offsetWidth; el.classList.add("goyang");
  }

  async function init() {
    let amplop;
    try { amplop = await ambilAmplop(); }
    catch (e) {
      tampil("masuk");
      $("tombol-masuk").disabled = true;
      $("pesan-masuk").textContent = e.message === "BELUM_ADA"
        ? "Data belum diunggah. Jalankan sinkron di laptop terlebih dahulu."
        : "Data tidak bisa dimuat. Periksa koneksi internet, lalu muat ulang halaman.";
      return;
    }
    try {
      const s = JSON.parse(localStorage.getItem(KUNCI_SIMPAN) || "null");
      if (s && s.salt === amplop.salt) {
        const data = await GanecaKripto.buka(amplop, GanecaKripto.b64(s.kunci));
        return mulai(data);
      }
    } catch (e) { try { localStorage.removeItem(KUNCI_SIMPAN); } catch (_) { /* abaikan */ } }

    tampil("masuk");
    $("form-masuk").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      sibuk(true); $("pesan-masuk").textContent = "";
      let data;
      try {
        const kunci = await GanecaKripto.turunkan($("sandi").value, amplop);
        data = await GanecaKripto.buka(amplop, kunci);
        if ($("ingat").checked) {
          try { localStorage.setItem(KUNCI_SIMPAN, JSON.stringify({ salt: amplop.salt, kunci: GanecaKripto.keB64(kunci) })); }
          catch (e) { /* abaikan */ }
        }
      } catch (e) {
        $("pesan-masuk").textContent = e.message === "SANDI" ? "Kata sandi salah." : "Data tidak bisa dibuka (" + e.message + ").";
        goyang($("form-masuk"));
        $("sandi").select();
        sibuk(false);
        return;
      }
      $("sandi").value = "";
      if (GERAK()) { $("form-masuk").classList.add("keluar-anim"); await tunggu(240); }
      sibuk(false);
      mulai(data);
    });
  }

  $("keluar").addEventListener("click", () => {
    try { localStorage.removeItem(KUNCI_SIMPAN); } catch (e) { /* abaikan */ }
    location.reload();
  });

  // gambar ulang saat tema perangkat berubah (warna grafik ikut), atur ulang penanda saat ukuran layar berubah
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (DATA) gambarSemua(); });
  }
  let jedaUkuran = 0;
  window.addEventListener("resize", () => {
    clearTimeout(jedaUkuran);
    jedaUkuran = setTimeout(() => { if (DATA) document.querySelectorAll(".trek").forEach(pasangIndikator); }, 120);
  });
  // riak saat tombol pilihan ditekan
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest && e.target.closest(".trek button");
    if (!b || !GERAK()) return;
    const r = b.getBoundingClientRect(), s = document.createElement("span");
    s.className = "riak"; s.style.left = (e.clientX - r.left) + "px"; s.style.top = (e.clientY - r.top) + "px";
    b.appendChild(s);
    setTimeout(() => s.remove(), 650);
  });
  init();
})();
