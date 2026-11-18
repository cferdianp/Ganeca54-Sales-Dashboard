/* Ganeca - Sales Dashboard Shopee */
(function () {
  "use strict";

  const DATA_URL = "data/ganeca.enc.json";
  const KUNCI_SIMPAN = "ganeca-kunci-v1";
  const PILIHAN_SIMPAN = "ganeca-pilihan-v1";
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ------------------------------------------------------------------ format
  const fmtAngka = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
  const fmtDes = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
  const fmtPct = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus",
    "September", "Oktober", "November", "Desember"];

  function rp(x) { return (x < 0 ? "-Rp" : "Rp") + fmtAngka.format(Math.abs(Math.round(x))); }
  function rpRingkas(x) {
    const a = Math.abs(x), t = x < 0 ? "-" : "";
    if (a >= 1e9) return t + "Rp" + fmtDes.format(a / 1e9) + " M";
    if (a >= 1e6) return t + "Rp" + fmtDes.format(a / 1e6) + " jt";
    if (a >= 1e3) return t + "Rp" + fmtAngka.format(a / 1e3) + " rb";
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
    if (hari < 1 / 24) return Math.round(hari * 1440) + "m";
    if (hari < 1) return fmtDes.format(Math.round(hari * 24 * 10) / 10) + "j";
    return fmtDes.format(Math.round(hari * 10) / 10) + "h";
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
    return m ? `${+m[3]} ${BULAN[+m[2] - 1]} ${m[1]}, ${m[4]}.${m[5]} WIB` : t;
  }
  function hariIniWIB() { const d = new Date(Date.now() + 7 * 3600000); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; }

  // ------------------------------------------------------------------ status
  let DATA = null, PESANAN = [], PRODUK = [];
  const pilihan = muatPilihan();
  const grafik = {};

  function muatPilihan() {
    try { return Object.assign({ periode: "semua", tanpaRetur: false, stat: {}, ukuran: "pcs", sku: null },
      JSON.parse(localStorage.getItem(PILIHAN_SIMPAN) || "{}")); }
    catch (e) { return { periode: "semua", tanpaRetur: false, stat: {}, ukuran: "pcs", sku: null }; }
  }
  function simpanPilihan() { try { localStorage.setItem(PILIHAN_SIMPAN, JSON.stringify(pilihan)); } catch (e) { /* abaikan */ } }

  // ------------------------------------------------------------------ data
  function siapkan(data) {
    const ix = Object.fromEntries(data.kolom.map((k, i) => [k, i]));
    PESANAN = data.pesanan.map((a) => ({
      no: a[ix.no], p: a[ix.p], m: a[ix.m], o: a[ix.o], i: a[ix.i], j: a[ix.j],
      q: a[ix.q], r: a[ix.r], s: a[ix.s], v: a[ix.v], w: a[ix.w], pa: a[ix.pa], av: a[ix.av],
      ax: a[ix.ax], ay: a[ix.ay], bk: a[ix.bk], retur: !!a[ix.retur], t: null, u: null,
    }));
    // Selisih antar waktu: dihitung ulang menurut urutan waktu yang sebenarnya
    const urutM = PESANAN.filter((x) => typeof x.m === "number").sort((a, b) => a.m - b.m);
    for (let k = 1; k < urutM.length; k++) urutM[k].t = urutM[k].m - urutM[k - 1].m;
    const urutO = PESANAN.filter((x) => typeof x.o === "number").sort((a, b) => a.o - b.o);
    for (let k = 1; k < urutO.length; k++) urutO[k].u = urutO[k].o - urutO[k - 1].o;
    const px = Object.fromEntries(data.kolom_produk.map((k, i) => [k, i]));
    PRODUK = data.produk.map((a) => ({ no: a[px.no], sku: a[px.sku], varian: a[px.var], beli: a[px.beli],
      kembali: a[px.kembali], sub: a[px.sub] }));
  }

  function rentangPeriode() {
    const [y, m, d] = hariIniWIB();
    const besok = keSerial(y, m, d + 1);
    switch (pilihan.periode) {
      case "30h": return [keSerial(y, m, d - 29), besok, "30 hari terakhir"];
      case "bulan_ini": return [keSerial(y, m, 1), keSerial(y, m + 1, 1), BULAN_PANJANG[m] + " " + y];
      case "bulan_lalu": { const t = new Date(Date.UTC(y, m - 1, 1));
        return [keSerial(y, m - 1, 1), keSerial(y, m, 1), BULAN_PANJANG[t.getUTCMonth()] + " " + t.getUTCFullYear()]; }
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
    return PESANAN.filter((x) => typeof x.p === "number" && x.p >= a && x.p < b && !(pilihan.tanpaRetur && x.retur));
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
    return { n, min: min[kunci], minNo: min.no, maks: maks[kunci], maksNo: maks.no, median, rata: total / n, total, urut };
  }

  // ------------------------------------------------------------------ warna dari CSS
  function warna() {
    const cs = getComputedStyle(document.documentElement);
    const g = (v) => cs.getPropertyValue(v).trim();
    return { seri1: g("--seri-1"), seri2: g("--seri-2"), garis: g("--garis"), sumbu: g("--sumbu"),
      tinta: g("--tinta"), tinta2: g("--tinta-2"), redup: g("--tinta-redup"), permukaan: g("--permukaan") };
  }

  function grafikBatang(id, label, nilai, opsi) {
    const W = warna();
    const cfg = {
      type: "bar",
      data: { labels: label, datasets: [{ data: nilai, backgroundColor: W.seri1, hoverBackgroundColor: W.seri1,
        borderRadius: 4, borderSkipped: "start", maxBarThickness: 24, categoryPercentage: 0.9, barPercentage: 0.92 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: {
          backgroundColor: W.permukaan, titleColor: W.tinta, bodyColor: W.tinta2, borderColor: W.garis, borderWidth: 1,
          padding: 8, displayColors: false, callbacks: opsi.tooltip } },
        scales: {
          x: { grid: { display: false }, border: { color: W.sumbu }, ticks: { color: W.redup, font: { size: 10 },
            maxRotation: 0, autoSkip: true, autoSkipPadding: 6 } },
          y: { beginAtZero: true, grid: { color: W.garis, lineWidth: 1 }, border: { display: false },
            ticks: { color: W.redup, font: { size: 10 }, maxTicksLimit: 4, callback: opsi.sumbuY || ((v) => v) } },
        },
      },
    };
    if (grafik[id]) grafik[id].destroy();
    grafik[id] = new Chart($(id), cfg);
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
          const kiri = k === 0 && u[0] < lo ? "≤ " + fmt.teks(b[1]) : fmt.teks(b[0]) + " – " + fmt.teks(b[1]);
          return k === nb - 1 && u[u.length - 1] > hi ? "≥ " + fmt.teks(b[0]) : kiri;
        },
        label: (it) => it.raw + " pesanan",
      },
    });
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
    { id: "v", grup: "grup-nilai", judul: "Total Nominal Seluruh Produk (TNSP)", jenis: "rp", total: true },
    { id: "w", grup: "grup-nilai", judul: "Net Count Jumlah Pcs", jenis: "pcs", total: true },
    { id: "pa", grup: "grup-nilai", judul: "Penghasilan Akhir (PA)", jenis: "rp", total: true },
    { id: "av", grup: "grup-biaya", judul: "% Perbandingan Total Seluruh Biaya (TSB) dengan Penghasilan Akhir (PA)", jenis: "pct" },
    { id: "ax", grup: "grup-biaya", judul: "Penghasilan yang Ekstra/(-Hilang) karena Pesan via Shopee", jenis: "rp", total: true },
    { id: "ay", grup: "grup-biaya", judul: "% Penghasilan yang Ekstra/(-Hilang) karena Pesan via Shopee", jenis: "pct" },
    { id: "bk", grup: "grup-biaya", judul: "Penghematan dengan Gratis Ongkir XTRA", jenis: "rp", total: true, na: true },
  ];
  const STAT_NAMA = { min: "Min", maks: "Maks", median: "Median", rata: "Rata-rata", total: "Total" };

  function buatKartu() {
    for (const m of METRIK) {
      const el = document.createElement("article");
      el.className = "kartu";
      el.innerHTML = `<div class="kepala-kartu"><h3>${m.judul}</h3><div class="segmen" role="radiogroup" aria-label="Nilai"></div></div>
        <p class="angka-besar" id="nilai-${m.id}"></p><p class="angka-ket" id="ket-${m.id}"></p>
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
    }
  }

  function gambarKartu(m, baris) {
    const fmt = FORMAT[m.jenis];
    const st = statistik(baris, m.id);
    const pilih = pilihan.stat[m.id] || "median";
    const seg = $("nilai-" + m.id).parentElement.querySelectorAll(".segmen button");
    seg.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.stat === pilih)));
    if (m.na) {
      const na = baris.filter((x) => x.bk === "N/A").length;
      $("cat-" + m.id).textContent = na ? `${na} pesanan bernilai "N/A" tidak ikut dihitung.` : "";
    }
    if (!st) {
      $("nilai-" + m.id).textContent = "–";
      $("ket-" + m.id).textContent = "Tidak ada data pada periode ini";
      if (grafik["hist-" + m.id]) { grafik["hist-" + m.id].destroy(); delete grafik["hist-" + m.id]; }
      return;
    }
    $("nilai-" + m.id).textContent = fmt.teks(st[pilih]);
    const ket = { min: `Pesanan #${st.minNo}`, maks: `Pesanan #${st.maksNo}`, median: `Nilai tengah dari ${st.n} pesanan`,
      rata: `Rata-rata dari ${st.n} pesanan`, total: `Jumlah dari ${st.n} pesanan` }[pilih];
    $("ket-" + m.id).textContent = ket;
    histogram("hist-" + m.id, st, fmt);
  }

  // ------------------------------------------------------------------ bagian lain
  function gambarKPI(baris) {
    const n = baris.length;
    const jum = (k) => baris.reduce((a, x) => a + (typeof x[k] === "number" ? x[k] : 0), 0);
    const tnsp = jum("v"), pa = jum("pa"), pcs = jum("w");
    const kotak = [
      ["Jumlah pesanan", fmtAngka.format(n), pilihan.tanpaRetur ? "Tanpa pesanan retur" : ""],
      ["Total TNSP", rp(tnsp), n ? "Rata-rata " + rp(tnsp / n) : ""],
      ["Total PA", rp(pa), n ? "Rata-rata " + rp(pa / n) : ""],
      ["Total pcs", fmtDes.format(pcs), n ? "Rata-rata " + fmtDes.format(pcs / n) + " pcs" : ""],
    ];
    $("kpi").innerHTML = kotak.map(([l, v, k]) =>
      `<div class="kartu"><div class="label">${l}</div><div class="nilai">${v}</div><div class="ket">${k}</div></div>`).join("");
  }

  function gambarTren(baris) {
    const kosong = !baris.length;
    document.querySelectorAll(".kanvas.tren").forEach((el) => el.classList.toggle("kosong", kosong));
    if (kosong) {
      ["tren-pa", "tren-n"].forEach((id) => { if (grafik[id]) { grafik[id].destroy(); delete grafik[id]; } });
      $("tren-satuan-1").textContent = $("tren-satuan-2").textContent = "";
      return;
    }
    const ps = baris.map((x) => x.p);
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
      const a = keTanggal(awal), b = keTanggal(akhir);
      for (let y = a.getUTCFullYear(), m = a.getUTCMonth(); y < b.getUTCFullYear() || (y === b.getUTCFullYear() && m <= b.getUTCMonth()); m === 11 ? (y++, m = 0) : m++) {
        const k = y + "-" + String(m + 1).padStart(2, "0"); idx[k] = label.length; label.push(k);
      }
    }
    const pa = new Array(label.length).fill(0), n = new Array(label.length).fill(0);
    for (const x of baris) { const k = idx[kunci(x.p)]; pa[k] += x.pa || 0; n[k] += 1; }
    const tampil = label.map((k, ix) => { const p = k.split("-").map(Number);
      if (harian) return p[2] + " " + BULAN[p[1] - 1];
      return ix === 0 || p[1] === 1 ? [BULAN[p[1] - 1], String(p[0])] : BULAN[p[1] - 1]; });
    const judul = label.map((k) => { const p = k.split("-").map(Number);
      return harian ? p[2] + " " + BULAN_PANJANG[p[1] - 1] + " " + p[0] : BULAN_PANJANG[p[1] - 1] + " " + p[0]; });
    $("tren-satuan-1").textContent = $("tren-satuan-2").textContent = harian ? "per hari" : "per bulan";
    grafikBatang("tren-pa", tampil, pa, { sumbuY: (v) => rpRingkas(v),
      tooltip: { title: (it) => judul[it[0].dataIndex], label: (it) => rp(it.raw) } });
    grafikBatang("tren-n", tampil, n, { sumbuY: (v) => (Number.isInteger(v) ? v : ""),
      tooltip: { title: (it) => judul[it[0].dataIndex], label: (it) => it.raw + " pesanan" } });
  }

  function gambarLokasi(baris) {
    const W = warna();
    const bagian = [
      { judul: "% Pesanan di dalam/luar Jabodetabek", kunci: "i", nilai: [["Ya", "Dalam Jabodetabek"], ["Tidak", "Luar Jabodetabek"]] },
      { judul: "% Pesanan di dalam/luar Pulau Jawa", kunci: "j", nilai: [["Dalam", "Dalam Pulau Jawa"], ["Luar", "Luar Pulau Jawa"]] },
    ];
    $("lokasi").innerHTML = bagian.map((b) => {
      const hit = b.nilai.map(([v]) => baris.filter((x) => x[b.kunci] === v).length);
      const tot = hit[0] + hit[1], kosong = baris.length - tot;
      const warnaSeg = [W.seri1, W.seri2];
      const seg = tot ? hit.map((h, k) => h ? `<div style="flex:${h};background:${warnaSeg[k]}" title="${b.nilai[k][1]}: ${pct(h / tot)} (${h})"></div>` : "").join("")
        : `<div style="flex:1;background:${W.garis}"></div>`;
      const leg = b.nilai.map(([, nama], k) =>
        `<span><i style="background:${warnaSeg[k]}"></i>${nama} <b>${tot ? pct(hit[k] / tot) : "–"}</b> (${hit[k]})</span>`).join("");
      return `<article class="kartu"><h3>${b.judul}</h3><div class="seg-batang" role="img" aria-label="${b.nilai.map(([, nama], k) => nama + " " + (tot ? pct(hit[k] / tot) : "-")).join(", ")}">${seg}</div>
        <div class="legenda">${leg}</div>${kosong ? `<p class="catatan">${kosong} pesanan tanpa data alamat tidak ikut dihitung.</p>` : ""}</article>`;
    }).join("");
  }

  const UKURAN = { pcs: "Pcs bersih", pesanan: "Jumlah pesanan", nominal: "Nominal" };
  function singkatSKU(s) { return s.replace(/^Indonesian Batik Motif /, "").replace(/^Indonesia Batik /, ""); }
  function nilaiUkuran(v) { return pilihan.ukuran === "nominal" ? rp(v) : fmtDes.format(v) + (pilihan.ukuran === "pcs" ? " pcs" : " pesanan"); }

  function agregat(rows, kunciFn) {
    const peta = new Map();
    for (const p of rows) {
      const k = kunciFn(p);
      if (!peta.has(k)) peta.set(k, { nama: k, pcs: 0, nominal: 0, pesanan: new Set() });
      const a = peta.get(k);
      a.pcs += (p.beli || 0) + (p.kembali || 0); a.nominal += p.sub || 0; a.pesanan.add(p.no);
    }
    return [...peta.values()].map((a) => ({ nama: a.nama, pcs: a.pcs, nominal: a.nominal, pesanan: a.pesanan.size }))
      .sort((a, b) => b[pilihan.ukuran] - a[pilihan.ukuran] || a.nama.localeCompare(b.nama));
  }

  function daftarBatang(el, items, tombol, aktif) {
    const maks = Math.max(1, ...items.map((x) => Math.max(0, x[pilihan.ukuran])));
    el.innerHTML = "";
    for (const it of items) {
      const b = document.createElement(tombol ? "button" : "div");
      b.className = "baris-batang"; b.setAttribute("role", "listitem");
      if (tombol) { b.type = "button"; b.setAttribute("aria-pressed", String(it.nama === aktif)); }
      const w = Math.max(0, it[pilihan.ukuran]) / maks * 100;
      b.innerHTML = `<span class="nama" title="${esc(it.nama)}">${esc(singkatSKU(it.nama) || "(tanpa varian)")}</span><span class="nilai">${nilaiUkuran(it[pilihan.ukuran])}</span>
        <span class="jalur"><span class="isi" style="width:${w}%;display:block"></span></span>`;
      if (tombol) b.addEventListener("click", () => { pilihan.sku = it.nama; simpanPilihan(); gambarProduk(tersaring()); });
      el.appendChild(b);
    }
  }

  function gambarProduk(baris) {
    const nos = new Set(baris.map((x) => x.no));
    const rows = PRODUK.filter((p) => nos.has(p.no));
    document.querySelectorAll("#ukuran-produk button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.u === pilihan.ukuran)));
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
    $("sorot-produk").innerHTML = kotak("Paling populer", atas) + (sku.length > 1 ? kotak("Paling tidak populer", bawah) : "");
    const aktif = sku.some((s) => s.nama === pilihan.sku) ? pilihan.sku : atas.nama;
    daftarBatang($("daftar-sku"), sku, true, aktif);
    const varian = agregat(rows.filter((p) => p.sku === aktif), (p) => p.varian);
    const vA = varian[0], vB = varian[varian.length - 1];
    const namaV = (n) => varian.filter((x) => x[pilihan.ukuran] === n).map((x) => x.nama || "(tanpa varian)").join(", ");
    $("judul-varian").textContent = `Varian ${singkatSKU(aktif)}` + (varian.length > 1 && vA[pilihan.ukuran] !== vB[pilihan.ukuran]
      ? ` · terpopuler ${namaV(vA[pilihan.ukuran])}; paling tidak populer ${namaV(vB[pilihan.ukuran])}` : "");
    daftarBatang($("daftar-varian"), varian, false, null);
  }

  // ------------------------------------------------------------------ saringan
  const PERIODE = [["semua", "Semua"], ["30h", "30 hari"], ["bulan_ini", "Bulan ini"], ["bulan_lalu", "Bulan lalu"],
    ["3bln", "3 bulan"], ["tahun_ini", "Tahun ini"], ["rentang", "Rentang…"]];

  function buatSaringan() {
    for (const [k, nama] of PERIODE) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = nama; b.dataset.p = k; b.setAttribute("role", "radio");
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
    const ps = PESANAN.map((x) => x.p).filter((x) => typeof x === "number");
    if (ps.length) {
      $("dari").min = $("sampai").min = isoTgl(Math.min(...ps));
      $("dari").value = isoTgl(Math.min(...ps)); $("sampai").value = isoTgl(Math.max(...ps));
    }
    const nRetur = PESANAN.filter((x) => x.retur).length;
    $("label-retur").textContent = `Kecualikan retur (${nRetur} pesanan)`;
  }

  function gambarSemua() {
    document.querySelectorAll("#periode .chip").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.p === pilihan.periode)));
    $("rentang").hidden = pilihan.periode !== "rentang";
    const baris = tersaring();
    const [, , teks] = rentangPeriode();
    $("ringkas-periode").textContent = `${teks} · ${baris.length} pesanan menurut Waktu Selesai (Dana Lepas)`;
    gambarKPI(baris);
    gambarTren(baris);
    gambarLokasi(baris);
    for (const m of METRIK) gambarKartu(m, baris);
    gambarProduk(baris);
  }

  // ------------------------------------------------------------------ masuk
  function tampil(id) {
    $("memuat").hidden = id !== "memuat"; $("masuk").hidden = id !== "masuk"; $("aplikasi").hidden = id !== "aplikasi";
  }

  function mulai(data) {
    DATA = data;
    siapkan(data);
    const ps = PESANAN.map((x) => x.p).filter((x) => typeof x === "number");
    $("info-data").textContent = `${PESANAN.length} pesanan · dana lepas terakhir ${ps.length ? tglTeks(Math.max(...ps)) : "-"}` +
      (data.dibuat ? ` · diperbarui ${dibuatTeks(data.dibuat)}` : "");
    if (!$("periode").children.length) { buatSaringan(); buatKartu(); }
    tampil("aplikasi");
    gambarSemua();
  }

  async function ambilAmplop() {
    const r = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (r.status === 404) throw new Error("BELUM_ADA");
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
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
      const tombol = $("tombol-masuk");
      tombol.disabled = true; $("pesan-masuk").textContent = ""; tombol.textContent = "Membuka…";
      try {
        const kunci = await GanecaKripto.turunkan($("sandi").value, amplop);
        const data = await GanecaKripto.buka(amplop, kunci);
        if ($("ingat").checked) {
          try { localStorage.setItem(KUNCI_SIMPAN, JSON.stringify({ salt: amplop.salt, kunci: GanecaKripto.keB64(kunci) })); }
          catch (e) { /* abaikan */ }
        }
        $("sandi").value = "";
        mulai(data);
      } catch (e) {
        $("pesan-masuk").textContent = e.message === "SANDI" ? "Kata sandi salah." : "Data tidak bisa dibuka (" + e.message + ").";
      } finally { tombol.disabled = false; tombol.textContent = "Buka dashboard"; }
    });
  }

  $("keluar").addEventListener("click", () => {
    try { localStorage.removeItem(KUNCI_SIMPAN); } catch (e) { /* abaikan */ }
    location.reload();
  });

  // gambar ulang saat tema perangkat berubah (warna grafik ikut)
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (DATA) gambarSemua(); });
  }
  init();
})();
