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

  const categoryPages = selectedCats.map(cat => {
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
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #E85D04;">
          <div>
            <div style="font-size:11px;font-weight:700;color:#E85D04;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;">Ürün Kataloğu</div>
            <div style="font-size:28px;font-weight:900;color:#111;letter-spacing:-0.5px;">${esc(cat)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">${prods.length} ürün</div>
          </div>
          <div style="text-align:right;">
            ${logoHtml}
          </div>
        </div>

        <!-- Ürün grid -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;">
          ${productCards}
        </div>

        <!-- Alt bilgi -->
        <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:11px;color:#9ca3af;">${esc(firm.name)} · ${esc(firm.phone)} · ${esc(firm.email)}</div>
          <div style="font-size:11px;color:#9ca3af;">${new Date().toLocaleDateString('tr-TR')}</div>
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
<div style="height:100vh;background:#f8f7f4;position:relative;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column;">

  <!-- Üst turuncu bar -->
  <div style="height:6px;background:linear-gradient(90deg,#E85D04 0%,#FF8C38 60%,#FFB347 100%);"></div>

  <!-- Sağ üst büyük dekor daire -->
  <div style="position:absolute;top:-120px;right:-120px;width:520px;height:520px;border-radius:50%;background:linear-gradient(135deg,rgba(232,93,4,.10) 0%,rgba(255,140,56,.04) 100%);"></div>
  <!-- Sol alt küçük dekor daire -->
  <div style="position:absolute;bottom:-80px;left:-80px;width:340px;height:340px;border-radius:50%;background:rgba(232,93,4,.06);"></div>
  <!-- Orta dekor çizgi grubu -->
  <div style="position:absolute;right:0;top:0;width:380px;height:100vh;overflow:hidden;pointer-events:none;">
    <div style="position:absolute;top:0;right:60px;width:1px;height:100%;background:linear-gradient(180deg,transparent,rgba(232,93,4,.12) 30%,rgba(232,93,4,.12) 70%,transparent);"></div>
    <div style="position:absolute;top:0;right:120px;width:1px;height:100%;background:linear-gradient(180deg,transparent,rgba(232,93,4,.06) 20%,rgba(232,93,4,.06) 80%,transparent);"></div>
  </div>

  <!-- İçerik -->
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 72px;position:relative;z-index:1;">

    <!-- Logo -->
    <div style="margin-bottom:56px;">
      ${firm.logoDataUrl
        ? `<img src="${firm.logoDataUrl}" alt="${esc(firm.name)}" style="height:64px;object-fit:contain;">`
        : `<div style="font-size:32px;font-weight:900;color:#1a1a1a;letter-spacing:-1.5px;">${esc(firm.name)}</div>`
      }
    </div>

    <!-- Etiket -->
    <div style="display:inline-flex;align-items:center;gap:8px;margin-bottom:20px;">
      <div style="width:28px;height:2px;background:#E85D04;border-radius:1px;"></div>
      <span style="font-size:11px;font-weight:800;color:#E85D04;text-transform:uppercase;letter-spacing:3px;">Ürün Kataloğu</span>
    </div>

    <!-- Ana başlık -->
    <div style="font-size:58px;font-weight:900;color:#1a1a1a;letter-spacing:-2.5px;line-height:.95;margin-bottom:10px;">
      ${esc(firm.name).split(' ').join('<br>')}
    </div>

    <!-- Tarih + ayırıcı -->
    <div style="display:flex;align-items:center;gap:16px;margin-top:32px;margin-bottom:48px;">
      <div style="font-size:13px;color:#888;font-weight:500;">${new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' })}</div>
      <div style="width:4px;height:4px;background:#E85D04;border-radius:50%;"></div>
      <div style="font-size:13px;color:#888;font-weight:500;">${selectedCats.length} Kategori · ${Object.values(productsByCat).reduce((s, ps) => s + ps.length, 0)} Ürün</div>
    </div>

    <!-- Kategoriler -->
    <div style="display:flex;flex-wrap:wrap;gap:8px;max-width:520px;">
      ${selectedCats.map((c, i) => `
        <div style="display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;border:1px solid ${i === 0 ? '#E85D04' : '#e0ddd8'};background:${i === 0 ? 'rgba(232,93,4,.06)' : '#fff'};font-size:12px;font-weight:600;color:${i === 0 ? '#E85D04' : '#555'};">
          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${i === 0 ? '#E85D04' : '#ccc'};flex-shrink:0;"></span>
          ${esc(c)}
        </div>
      `).join('')}
    </div>
  </div>

  <!-- Alt bilgi şeridi -->
  <div style="padding:20px 72px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #e8e5e0;position:relative;z-index:1;">
    <div style="font-size:11px;color:#aaa;">${esc(firm.phone)} · ${esc(firm.email)}</div>
    <div style="display:flex;align-items:center;gap:6px;">
      <div style="width:8px;height:8px;background:#E85D04;border-radius:2px;"></div>
      <div style="font-size:11px;font-weight:700;color:#1a1a1a;letter-spacing:.5px;">${esc(firm.name).toUpperCase()}</div>
    </div>
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
