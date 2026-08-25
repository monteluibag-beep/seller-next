'use client';
import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Product } from '@/types';
import { IconBook2, IconDownload, IconCheck } from '@tabler/icons-react';
import type { FirmInfo } from '@/lib/offerPdf';
import { useRates } from '@/hooks/useRates';

type Currency = 'TRY' | 'USD' | 'EUR';

interface Settings {
  firmName?: string; firmAddress?: string; firmPhone?: string;
  firmEmail?: string; firmTerms?: string; firmBank?: string;
  firmInvoice?: string; logoUrl?: string;
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateCatalogHtml(
  selectedCats: string[],
  productsByCat: Record<string, Product[]>,
  firm: FirmInfo,
  showPrice: boolean,
  showCode: boolean,
  currency: Currency,
  qty: number,
  rates: { USD: number; EUR: number },
): string {
  const currSymbol = currency === 'TRY' ? '₺' : currency === 'USD' ? '$' : '€';
  const rate = currency === 'TRY' ? 1 : rates[currency];

  function fmtPrice(tryPrice: number): string {
    const converted = tryPrice / rate;
    const total = converted * qty;
    if (qty > 1) {
      return `${currSymbol}${converted.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${qty} adet: ${currSymbol}${total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${currSymbol}${converted.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const logoHtml = firm.logoDataUrl
    ? `<img src="${firm.logoDataUrl}" alt="${esc(firm.name)}" style="height:48px;object-fit:contain;">`
    : `<div style="font-size:22px;font-weight:900;color:#E85D04;letter-spacing:-1px;">${esc(firm.name)}</div>`;

  const totalPages = 1 + selectedCats.length; // kapak + kategori sayfaları

  const categoryPages = selectedCats.map((cat, catIdx) => {
    const pageNum = catIdx + 2; // kapak = 1
    const prods = productsByCat[cat] || [];
    const productCards = prods.map(p => `
      <div style="break-inside:avoid;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;display:flex;flex-direction:column;">
        <div style="background:#fff;height:180px;display:flex;align-items:center;justify-content:center;padding:12px;">
          ${p.photo
            ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" style="max-height:156px;max-width:100%;object-fit:contain;">`
            : `<div style="width:80px;height:80px;background:#e5e7eb;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
               </div>`
          }
        </div>
        <div style="padding:12px 14px;flex:1;display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:13px;font-weight:700;color:#111;line-height:1.3;">${esc(p.name)}</div>
          ${showCode && p.code ? `<div style="font-size:11px;color:#6b7280;font-family:monospace;background:#f3f4f6;padding:2px 8px;border-radius:4px;display:inline-block;width:fit-content;">${esc(p.code)}</div>` : ''}
          ${showPrice && p.list ? `<div style="font-size:13px;font-weight:800;color:#E85D04;margin-top:auto;">${fmtPrice(p.list)}</div>` : ''}
        </div>
      </div>
    `).join('');

    return `
      <!-- KATEGORİ SAYFASI: ${esc(cat)} -->
      <div style="page-break-before:always;padding:40px 48px;min-height:100vh;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <!-- Sayfa başlığı -->
        <div style="margin-bottom:28px;padding-bottom:18px;border-bottom:3px solid #E85D04;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div style="font-size:11px;font-weight:700;color:#E85D04;text-transform:uppercase;letter-spacing:2px;">Ürün Kataloğu</div>
            ${logoHtml}
          </div>
          <div style="font-size:26px;font-weight:900;color:#111;letter-spacing:-0.5px;line-height:1.1;">${esc(cat)}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">${prods.length} ürün</div>
        </div>

        <!-- Ürün grid -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;">
          ${productCards}
        </div>

        <!-- Alt bilgi -->
        <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:11px;color:#9ca3af;">${esc(firm.name)} · ${esc(firm.phone)} · ${esc(firm.email)}</div>
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="font-size:11px;color:#9ca3af;">${new Date().toLocaleDateString('tr-TR')}</div>
            <div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#E85D04;color:#fff;font-size:11px;font-weight:800;">${catIdx + 2}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Katalog — ${esc(firm.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; color: #111; }
  @media print {
    @page { size: A4; margin: 0; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<!-- KAPAK SAYFASI -->
<div style="height:100vh;background:#FAFAF8;position:relative;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column;">

  <!-- === DEKORATIF ÇANTA İKONLARI (SVG) === -->

  <!-- Dekor: sağ yarım daire turuncu -->
  <div style="position:absolute;top:-80px;right:-180px;width:460px;height:460px;border-radius:50%;background:linear-gradient(135deg,#E85D04,#FF9A3C);opacity:.10;"></div>
  <div style="position:absolute;bottom:-100px;right:-120px;width:360px;height:360px;border-radius:50%;background:#E85D04;opacity:.06;"></div>

  <!-- Çanta ikonları — açık renk dekor -->
  <svg style="position:absolute;top:32px;right:56px;opacity:.10;" width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="#E85D04" stroke-width=".8">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
  </svg>
  <svg style="position:absolute;bottom:80px;right:32px;opacity:.09;" width="130" height="130" viewBox="0 0 24 24" fill="none" stroke="#E85D04" stroke-width=".9">
    <path d="M17 8H7L4.5 18a2 2 0 0 0 2 2.5h11a2 2 0 0 0 2-2.5L17 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>
  </svg>
  <svg style="position:absolute;top:200px;right:220px;opacity:.06;" width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="#E85D04" stroke-width="1">
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2V5a5 5 0 0 0-10 0v1H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z"/><path d="M12 2v4"/><path d="M8 14h8"/>
  </svg>
  <svg style="position:absolute;bottom:160px;left:36px;opacity:.06;" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#E85D04" stroke-width="1">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
  </svg>

  <!-- Sol turuncu dikey aksent çizgisi -->
  <div style="position:absolute;left:0;top:0;width:6px;height:100%;background:linear-gradient(180deg,#E85D04 0%,#FF9A3C 100%);"></div>

  <!-- İÇERİK: sol yanaşık layout -->
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 72px 0 88px;position:relative;z-index:2;">

    <!-- Logo -->
    <div style="margin-bottom:52px;">
      ${firm.logoDataUrl
        ? `<img src="${firm.logoDataUrl}" alt="${esc(firm.name)}" style="height:60px;object-fit:contain;">`
        : `<div style="display:inline-flex;align-items:center;gap:10px;">
             <div style="width:8px;height:36px;background:#E85D04;border-radius:2px;"></div>
             <span style="font-size:18px;font-weight:900;color:#1a1a1a;letter-spacing:-.5px;">${esc(firm.name)}</span>
           </div>`
      }
    </div>

    <!-- Etiket -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <div style="width:28px;height:2px;background:#E85D04;border-radius:1px;"></div>
      <span style="font-size:10px;font-weight:800;color:#E85D04;text-transform:uppercase;letter-spacing:4px;">Ürün Kataloğu</span>
    </div>

    <!-- Firma adı -->
    <div style="font-size:40px;font-weight:900;color:#1a1a1a;letter-spacing:-1.5px;line-height:1.1;max-width:560px;margin-bottom:36px;">
      ${esc(firm.name)}
    </div>

    <!-- Stats kartlar -->
    <div style="display:flex;gap:12px;margin-bottom:40px;">
      <div style="background:#E85D04;border-radius:12px;padding:14px 22px;min-width:90px;">
        <div style="font-size:26px;font-weight:900;color:#fff;line-height:1;">${selectedCats.length}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.75);margin-top:3px;text-transform:uppercase;letter-spacing:1px;">Kategori</div>
      </div>
      <div style="background:#fff;border:1.5px solid #ede9e3;border-radius:12px;padding:14px 22px;min-width:90px;box-shadow:0 2px 12px rgba(0,0,0,.05);">
        <div style="font-size:26px;font-weight:900;color:#1a1a1a;line-height:1;">${selectedCats.reduce((s, c) => s + (productsByCat[c]?.length || 0), 0)}</div>
        <div style="font-size:10px;color:#999;margin-top:3px;text-transform:uppercase;letter-spacing:1px;">Ürün</div>
      </div>
      <div style="background:#fff;border:1.5px solid #ede9e3;border-radius:12px;padding:14px 22px;box-shadow:0 2px 12px rgba(0,0,0,.05);">
        <div style="font-size:14px;font-weight:700;color:#1a1a1a;line-height:1.3;">${new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' })}</div>
        <div style="font-size:10px;color:#999;margin-top:3px;text-transform:uppercase;letter-spacing:1px;">Tarih</div>
      </div>
    </div>

    <!-- Kategori etiketleri -->
    <div style="display:flex;flex-wrap:wrap;gap:8px;max-width:520px;">
      ${selectedCats.map(c => `
        <div style="display:flex;align-items:center;gap:6px;padding:6px 16px;border-radius:8px;background:#fff;border:1.5px solid #e8e4de;font-size:12px;font-weight:600;color:#444;box-shadow:0 1px 4px rgba(0,0,0,.04);">
          <span style="width:5px;height:5px;border-radius:50%;background:#E85D04;flex-shrink:0;display:inline-block;"></span>
          ${esc(c)}
        </div>
      `).join('')}
    </div>
  </div>

  <!-- Alt bilgi -->
  <div style="padding:16px 88px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #ece8e2;position:relative;z-index:2;">
    <div style="font-size:10px;color:#bbb;">${[firm.phone, firm.email].filter(Boolean).join('  ·  ')}</div>
    <div style="font-size:10px;font-weight:700;color:#ccc;letter-spacing:1px;text-transform:uppercase;">${esc(firm.name)}</div>
  </div>
</div>

${categoryPages}

</body>
</html>`;
}

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>({});
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [showPrice, setShowPrice] = useState(true);
  const [showCode, setShowCode] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [qty, setQty] = useState<number>(1);
  const { rates } = useRates();

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'products')),
      getDoc(doc(db, 'settings', 'main')),
    ]).then(([prodSnap, settSnap]) => {
      setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      if (settSnap.exists()) setSettings(settSnap.data() as Settings);
    }).finally(() => setLoading(false));
  }, []);

  const cats = [...new Set(products.map(p => p.catName).filter(Boolean))].sort();
  const productsByCat: Record<string, Product[]> = {};
  cats.forEach(cat => {
    productsByCat[cat] = products.filter(p => p.catName === cat);
  });

  function toggleCat(cat: string) {
    setSelectedCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  function selectAll() {
    setSelectedCats(new Set(cats));
  }

  function clearAll() {
    setSelectedCats(new Set());
  }

  async function generateCatalog() {
    if (selectedCats.size === 0) return;
    setGenerating(true);
    try {
      // Logo yükle
      let logoDataUrl: string | undefined;
      if (settings.logoUrl) {
        try {
          const res = await fetch(settings.logoUrl);
          const blob = await res.blob();
          logoDataUrl = await new Promise<string>(resolve => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target?.result as string);
            reader.readAsDataURL(blob);
          });
        } catch {}
      }

      const firm: FirmInfo = {
        name: settings.firmName || 'Çalışkan Çanta',
        address: settings.firmAddress || '',
        phone: settings.firmPhone || '',
        email: settings.firmEmail || '',
        terms: settings.firmTerms || '',
        bankInfo: settings.firmBank,
        invoiceInfo: settings.firmInvoice,
        logoDataUrl,
      };

      const orderedCats = cats.filter(c => selectedCats.has(c));
      const html = generateCatalogHtml(orderedCats, productsByCat, firm, showPrice, showCode, currency, qty, rates);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank', 'width=1000,height=800');
      if (w) {
        w.addEventListener('load', () => setTimeout(() => w.print(), 500));
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Yükleniyor...</div>
  );

  const orderedSelected = cats.filter(c => selectedCats.has(c));
  const totalProducts = orderedSelected.reduce((s, c) => s + (productsByCat[c]?.length || 0), 0);

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Katalog</div>
          <div className="page-sub">Kategorilere göre PDF katalog oluştur</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={generateCatalog}
          disabled={selectedCats.size === 0 || generating}
        >
          <IconDownload size={16} />
          {generating ? 'Oluşturuluyor...' : `Katalog Oluştur (${selectedCats.size} kategori)`}
        </button>
      </div>

      <div className="page-content">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

          {/* Kategori seçimi */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">Kategoriler</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={selectAll}>Tümünü Seç</button>
                <button className="btn btn-secondary btn-sm" onClick={clearAll}>Temizle</button>
              </div>
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {cats.map(cat => {
                const count = productsByCat[cat]?.length || 0;
                const selected = selectedCats.has(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCat(cat)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      border: selected ? '2px solid var(--or)' : '1px solid var(--border)',
                      background: selected ? 'var(--or-tint)' : 'var(--surface-2)',
                      transition: 'all .15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                        border: selected ? 'none' : '1.5px solid var(--border-2)',
                        background: selected ? 'var(--or)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {selected && <IconCheck size={13} color="#fff" />}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{cat}</span>
                    </div>
                    <span style={{ fontSize: 11, color: selected ? 'var(--or)' : 'var(--text-3)', fontWeight: 600 }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ayarlar & Özet */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="card-header"><div className="card-title">Katalog Seçenekleri</div></div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={showPrice} onChange={e => setShowPrice(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--or)', cursor: 'pointer' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Fiyat göster</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Liste fiyatı ürün kartında görünür</div>
                  </div>
                </label>

                {showPrice && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Para Birimi</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(['TRY', 'USD', 'EUR'] as Currency[]).map(c => (
                          <button key={c} onClick={() => setCurrency(c)} style={{
                            flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                            border: currency === c ? '2px solid var(--or)' : '1px solid var(--border)',
                            background: currency === c ? 'var(--or-tint)' : 'var(--surface-2)',
                            color: currency === c ? 'var(--or)' : 'var(--text-2)',
                            cursor: 'pointer',
                          }}>
                            {c === 'TRY' ? '₺ TRY' : c === 'USD' ? '$ USD' : '€ EUR'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Adet Fiyatı</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[1, 100].map(n => (
                          <button key={n} onClick={() => setQty(n)} style={{
                            flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                            border: qty === n ? '2px solid var(--or)' : '1px solid var(--border)',
                            background: qty === n ? 'var(--or-tint)' : 'var(--surface-2)',
                            color: qty === n ? 'var(--or)' : 'var(--text-2)',
                            cursor: 'pointer',
                          }}>
                            {n === 1 ? 'Liste Fiyatı' : '100 Adet Fiyatı'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={showCode} onChange={e => setShowCode(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--or)', cursor: 'pointer' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Ürün kodu göster</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Stok kodu kartın altında görünür</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title">Özet</div></div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>Seçili kategori</span>
                  <span style={{ fontWeight: 700 }}>{selectedCats.size}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>Toplam ürün</span>
                  <span style={{ fontWeight: 700 }}>{totalProducts}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>Tahmini sayfa</span>
                  <span style={{ fontWeight: 700 }}>{1 + selectedCats.size} (kapak + {selectedCats.size})</span>
                </div>
                {selectedCats.size > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>Sıra:</div>
                    {orderedSelected.map((cat, i) => (
                      <div key={cat} style={{ fontSize: 12, color: 'var(--text-2)', padding: '3px 0', display: 'flex', gap: 8 }}>
                        <span style={{ color: 'var(--text-3)' }}>{i + 1}.</span> {cat}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={generateCatalog}
              disabled={selectedCats.size === 0 || generating}
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
            >
              <IconBook2 size={18} />
              {generating ? 'Oluşturuluyor...' : 'Katalog Oluştur'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
