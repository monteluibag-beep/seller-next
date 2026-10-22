'use client';
import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Product } from '@/types';
import { IconBook2, IconDownload, IconCheck, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
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

  const PRODUCTS_PER_PAGE = 9; // 3 sütun × 3 satır

  // Her kategori için sayfa(lar) üret — 9'dan fazla ürün varsa birden fazla sayfa
  let globalPageNum = 0;
  const categoryPages = selectedCats.flatMap((cat) => {
    const prods = productsByCat[cat] || [];
    const chunks: Product[][] = [];
    for (let i = 0; i < Math.max(prods.length, 1); i += PRODUCTS_PER_PAGE) {
      chunks.push(prods.slice(i, i + PRODUCTS_PER_PAGE));
    }

    return chunks.map((chunk, chunkIdx) => {
      globalPageNum++;
      const pageNum = globalPageNum;
      const isFirstChunk = chunkIdx === 0;
      const catLabel = chunks.length > 1 ? `${esc(cat)} (${chunkIdx + 1}/${chunks.length})` : esc(cat);

      const productCards = chunk.map(p => `
        <div style="background:#fff;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden;display:flex;flex-direction:column;">
          <div style="background:#fff;height:160px;display:flex;align-items:center;justify-content:center;padding:10px;">
            ${p.photo
              ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" style="max-height:140px;max-width:100%;object-fit:contain;">`
              : `<div style="width:64px;height:64px;background:#e5e7eb;border-radius:50%;display:flex;align-items:center;justify-content:center;">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                 </div>`
            }
          </div>
          <div style="padding:10px 12px;flex:1;display:flex;flex-direction:column;gap:5px;">
            <div style="font-size:12px;font-weight:700;color:#111;line-height:1.3;">${esc(p.name)}</div>
            ${showCode && p.code ? `<div style="font-size:10px;color:#6b7280;font-family:monospace;background:#f3f4f6;padding:2px 6px;border-radius:4px;display:inline-block;width:fit-content;">${esc(p.code)}</div>` : ''}
            ${showPrice && p.list ? `<div style="font-size:12px;font-weight:800;color:#E85D04;margin-top:auto;">${fmtPrice(p.list)}</div>` : ''}
          </div>
        </div>
      `).join('');

      return `
        <!-- KATEGORİ SAYFASI: ${esc(cat)} sayfa ${chunkIdx + 1} -->
        <div class="page">

          <!-- Sayfa başlığı -->
          <div style="padding:20px 36px 12px;border-bottom:3px solid #E85D04;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <div style="font-size:10px;font-weight:700;color:#E85D04;text-transform:uppercase;letter-spacing:2px;">Ürün Kataloğu</div>
              ${isFirstChunk ? logoHtml : `<div style="font-size:11px;color:#9ca3af;">${catLabel}</div>`}
            </div>
            ${isFirstChunk ? `<div style="font-size:20px;font-weight:900;color:#111;letter-spacing:-0.5px;line-height:1.1;">${esc(cat)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">${prods.length} ürün</div>` : ''}
          </div>

          <!-- Ürün grid -->
          <div style="padding:14px 36px 14px;">
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
              ${productCards}
            </div>
          </div>

          <!-- Alt bilgi -->
          <div style="padding:8px 36px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:10px;color:#c0bdb8;letter-spacing:.3px;">${esc(firm.name)}${firm.phone ? ' · ' + esc(firm.phone) : ''}</div>
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="font-size:10px;color:#c0bdb8;letter-spacing:.3px;">${esc(cat)}</div>
              <div style="width:1px;height:12px;background:#e5e7eb;"></div>
              <div style="font-size:11px;font-weight:700;color:#E85D04;">${pageNum}</div>
            </div>
          </div>
        </div>
      `;
    });
  }).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=794, initial-scale=1.0">
<title>Katalog — ${esc(firm.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; color: #111; width: 794px; }
  @page { size: A4 portrait; margin: 10mm 12mm; }
  .page {
    width: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    page-break-after: always;
    break-after: page;
    page-break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page-inner {
    display: flex;
    flex-direction: column;
  }
  @media print {
    html, body { width: 794px; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<!-- KAPAK SAYFASI -->
<div class="page">
  <div style="padding:80px 60px 40px;display:flex;flex-direction:column;align-items:center;text-align:center;">

    ${firm.logoDataUrl
      ? `<div style="margin-bottom:32px;"><img src="${firm.logoDataUrl}" alt="${esc(firm.name)}" style="height:56px;object-fit:contain;"></div>`
      : ''
    }

    <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:14px;">
      <div style="width:24px;height:2px;background:#E85D04;border-radius:1px;"></div>
      <span style="font-size:10px;font-weight:800;color:#E85D04;text-transform:uppercase;letter-spacing:4px;">Ürün Kataloğu</span>
      <div style="width:24px;height:2px;background:#E85D04;border-radius:1px;"></div>
    </div>

    <div style="font-size:36px;font-weight:900;color:#1a1a1a;letter-spacing:-1px;line-height:1.15;max-width:560px;margin-bottom:32px;">
      ${esc(firm.name)}
    </div>

    <div style="display:flex;gap:12px;justify-content:center;margin-bottom:28px;">
      <div style="background:#E85D04;border-radius:12px;padding:12px 24px;min-width:80px;">
        <div style="font-size:24px;font-weight:900;color:#fff;line-height:1;">${selectedCats.length}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.75);margin-top:3px;text-transform:uppercase;letter-spacing:1px;">Kategori</div>
      </div>
      <div style="background:#f5f5f5;border:1.5px solid #e5e5e5;border-radius:12px;padding:12px 24px;min-width:80px;">
        <div style="font-size:24px;font-weight:900;color:#1a1a1a;line-height:1;">${selectedCats.reduce((s, c) => s + (productsByCat[c]?.length || 0), 0)}</div>
        <div style="font-size:10px;color:#999;margin-top:3px;text-transform:uppercase;letter-spacing:1px;">Ürün</div>
      </div>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;max-width:480px;margin-bottom:48px;">
      ${selectedCats.map(c => `
        <div style="display:flex;align-items:center;gap:6px;padding:5px 14px;border-radius:8px;background:#f5f5f5;border:1px solid #e5e5e5;font-size:11px;font-weight:600;color:#444;">
          <span style="width:5px;height:5px;border-radius:50%;background:#E85D04;flex-shrink:0;display:inline-block;"></span>
          ${esc(c)}
        </div>
      `).join('')}
    </div>

    <div style="border-top:1px solid #eee;padding-top:20px;width:100%;">
      <span style="font-size:11px;color:#aaa;font-weight:500;">${new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' })}</span>
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
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
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
    const catProds = productsByCat[cat] || [];
    const allSelected = catProds.every(p => selectedProducts.has(p.id!));
    setSelectedProducts(prev => {
      const next = new Set(prev);
      if (allSelected) {
        catProds.forEach(p => next.delete(p.id!));
      } else {
        catProds.forEach(p => next.add(p.id!));
      }
      return next;
    });
    setSelectedCats(prev => {
      const next = new Set(prev);
      allSelected ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  function toggleProduct(cat: string, productId: string) {
    const catProds = productsByCat[cat] || [];
    setSelectedProducts(prev => {
      const next = new Set(prev);
      next.has(productId) ? next.delete(productId) : next.add(productId);
      const anySelected = catProds.some(p => next.has(p.id!));
      setSelectedCats(cats2 => {
        const nextCats = new Set(cats2);
        anySelected ? nextCats.add(cat) : nextCats.delete(cat);
        return nextCats;
      });
      return next;
    });
  }

  function toggleExpand(cat: string) {
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  function selectAll() {
    setSelectedCats(new Set(cats));
    setSelectedProducts(new Set(products.map(p => p.id!)));
  }

  function clearAll() {
    setSelectedCats(new Set());
    setSelectedProducts(new Set());
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
      // Seçili ürünleri filtrele — kategori tamamsa tümü, kısmensa sadece seçililer
      const filteredByCat: Record<string, Product[]> = {};
      orderedCats.forEach(c => {
        const catProds = productsByCat[c] || [];
        const allSelected = catProds.every(p => selectedProducts.has(p.id!));
        filteredByCat[c] = allSelected ? catProds : catProds.filter(p => selectedProducts.has(p.id!));
      });
      const html = generateCatalogHtml(orderedCats, filteredByCat, firm, showPrice, showCode, currency, qty, rates);
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
  const totalProducts = orderedSelected.reduce((s, c) => {
    const catProds = productsByCat[c] || [];
    const selCount = catProds.filter(p => selectedProducts.has(p.id!)).length;
    return s + (selCount || catProds.length);
  }, 0);

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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'start' }}>

          {/* Kategori seçimi */}
          <div className="card" style={{ flex: '1 1 300px', minWidth: 0 }}>
            <div className="card-header">
              <div className="card-title">Kategoriler</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={selectAll}>Tümünü Seç</button>
                <button className="btn btn-secondary btn-sm" onClick={clearAll}>Temizle</button>
              </div>
            </div>
            <div style={{ padding: '8px 0' }}>
              {cats.map(cat => {
                const catProds = productsByCat[cat] || [];
                const selCount = catProds.filter(p => selectedProducts.has(p.id!)).length;
                const allSel = selCount === catProds.length && catProds.length > 0;
                const partSel = selCount > 0 && selCount < catProds.length;
                const expanded = expandedCats.has(cat);
                return (
                  <div key={cat}>
                    {/* Kategori satırı */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 16px', cursor: 'pointer',
                      background: allSel ? 'var(--or-tint)' : partSel ? 'var(--surface-2)' : 'transparent',
                      borderLeft: allSel ? '3px solid var(--or)' : partSel ? '3px solid var(--or)' : '3px solid transparent',
                    }}>
                      {/* Checkbox */}
                      <div
                        onClick={() => toggleCat(cat)}
                        style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                          border: allSel ? 'none' : partSel ? '2px solid var(--or)' : '1.5px solid var(--border-2)',
                          background: allSel ? 'var(--or)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {allSel && <IconCheck size={11} color="#fff" />}
                        {partSel && <div style={{ width: 8, height: 2, background: 'var(--or)', borderRadius: 1 }} />}
                      </div>
                      {/* İsim */}
                      <span
                        onClick={() => toggleCat(cat)}
                        style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-1)', cursor: 'pointer' }}
                      >{cat}</span>
                      {/* Sayaç */}
                      <span style={{ fontSize: 11, color: selCount > 0 ? 'var(--or)' : 'var(--text-3)', fontWeight: 600, minWidth: 28, textAlign: 'right' }}>
                        {selCount > 0 ? `${selCount}/${catProds.length}` : catProds.length}
                      </span>
                      {/* Expand */}
                      <div onClick={() => toggleExpand(cat)} style={{ color: 'var(--text-3)', cursor: 'pointer', padding: '0 2px' }}>
                        {expanded ? <IconChevronDown size={15} /> : <IconChevronRight size={15} />}
                      </div>
                    </div>

                    {/* Ürün listesi */}
                    {expanded && (
                      <div style={{ paddingBottom: 4 }}>
                        {catProds.map(p => {
                          const pSel = selectedProducts.has(p.id!);
                          return (
                            <div
                              key={p.id}
                              onClick={() => toggleProduct(cat, p.id!)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '7px 16px 7px 42px', cursor: 'pointer',
                                background: pSel ? 'var(--or-tint)' : 'transparent',
                              }}
                            >
                              <div style={{
                                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                                border: pSel ? 'none' : '1.5px solid var(--border-2)',
                                background: pSel ? 'var(--or)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {pSel && <IconCheck size={10} color="#fff" />}
                              </div>
                              <span style={{ fontSize: 12, color: 'var(--text-1)', flex: 1, lineHeight: 1.3 }}>{p.name}</span>
                              {p.code && <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace' }}>{p.code}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ayarlar & Özet */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: '1 1 280px', minWidth: 0 }}>
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
                  <span style={{ color: 'var(--text-3)' }}>Seçili ürün</span>
                  <span style={{ fontWeight: 700 }}>{totalProducts}</span>
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
