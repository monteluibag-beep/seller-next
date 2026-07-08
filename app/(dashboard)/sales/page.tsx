'use client';
import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, serverTimestamp, query, orderBy,
  doc, updateDoc, increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Sale, SaleItem, Product } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { IconPlus, IconX, IconTrash, IconSearch, IconChevronDown } from '@tabler/icons-react';
import { useRates } from '@/hooks/useRates';

type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP';
const CUR_SYMBOLS: Record<Currency, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };
const CUR_FLAGS:   Record<Currency, string> = { TRY: '🇹🇷', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧' };

const DISCOUNTS = [
  { qty: 1000, rate: 55 }, { qty: 500, rate: 50 }, { qty: 200, rate: 40 },
  { qty: 100, rate: 35 }, { qty: 50, rate: 30 }, { qty: 40, rate: 25 },
  { qty: 30, rate: 22 }, { qty: 20, rate: 18 }, { qty: 10, rate: 15 },
];

function getDiscount(qty: number): number {
  return DISCOUNTS.find(d => qty >= d.qty)?.rate ?? 0;
}

interface CartItem extends SaleItem { cost: number; listPrice: number; }

export default function SalesPage() {
  const { user } = useAuth();
  const { rates } = useRates();
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState('');
  const [note, setNote] = useState('');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Kur: TRY → seçilen döviz
  const rate = currency === 'TRY' ? 1 : rates[currency as 'USD'|'EUR'|'GBP'];
  const toForeign = (tryAmt: number) => tryAmt / rate;
  const sym = CUR_SYMBOLS[currency];

  useEffect(() => { load(); loadProducts(); }, []);

  async function load() {
    setLoading(true);
    const snap = await getDocs(query(collection(db, 'sales'), orderBy('date', 'desc')));
    setSales(snap.docs.map(d => ({ id: d.id, ...d.data() } as Sale)));
    setLoading(false);
  }

  async function loadProducts() {
    const snap = await getDocs(collection(db, 'products'));
    setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
  }

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  const discountRate = discountEnabled ? getDiscount(totalQty) : 0;
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmt = subtotal * discountRate / 100;
  const total = subtotal - discountAmt;
  const profit = cart.reduce((s, i) => s + (i.price * (1 - discountRate / 100) - i.cost) * i.qty, 0);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.code.toLowerCase().includes(productSearch.toLowerCase())
  );

  function addToCart(p: Product) {
    setCart(c => {
      const existing = c.find(i => i.productId === p.id);
      if (existing) return c.map(i => i.productId === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...c, { productId: p.id!, name: p.name, qty: 1, price: p.list, cost: p.cost, listPrice: p.list }];
    });
    setProductSearch('');
  }

  function removeFromCart(pid: string) {
    setCart(c => c.filter(i => i.productId !== pid));
  }

  function updateQty(pid: string, qty: number) {
    if (qty < 1) return;
    setCart(c => c.map(i => i.productId === pid ? { ...i, qty } : i));
  }

  function updatePrice(pid: string, price: number) {
    setCart(c => c.map(i => i.productId === pid ? { ...i, price } : i));
  }

  async function save() {
    if (!customer.trim() || cart.length === 0) return;
    setSaving(true);
    try {
      const items: SaleItem[] = cart.map(i => ({
        productId: i.productId, name: i.name, qty: i.qty,
        price: parseFloat((i.price * (1 - discountRate / 100)).toFixed(2)),
      }));
      await addDoc(collection(db, 'sales'), {
        customer, items, total, note,
        discountRate, currency, exchangeRate: rate,
        by: user?.email?.split('@')[0] || 'admin',
        status: 'completed', date: serverTimestamp(),
      });
      for (const item of cart) {
        const pid = item.productId;
        await updateDoc(doc(db, 'products', pid), { stock: increment(-item.qty) });
        await addDoc(collection(db, 'stock_moves'), {
          productId: pid, productName: item.name,
          type: 'out', qty: item.qty,
          note: `Satış: ${customer}`, date: serverTimestamp(),
        });
      }
      setOpen(false);
      resetForm();
      load();
      loadProducts();
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setCustomer(''); setNote(''); setCart([]); setDiscountEnabled(false); setProductSearch(''); setCurrency('TRY');
  }

  function formatDate(ts: unknown) {
    if (!ts) return '—';
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  const detailSale = sales.find(s => s.id === detailId);

  async function openSalePDF(sale: Sale) {
    let firmName = '', firmAddress = '', firmPhone = '', firmEmail = '', bankInfo = '';
    try {
      const { getDoc, doc: fDoc } = await import('firebase/firestore');
      const snap = await getDoc(fDoc(db, 'settings', 'main'));
      if (snap.exists()) {
        const d = snap.data();
        firmName = d.firmName || '';
        firmAddress = d.firmAddress || '';
        firmPhone = d.firmPhone || '';
        firmEmail = d.firmEmail || '';
        bankInfo = d.bankInfo || '';
      }
    } catch {}

    const saleNo = (sale.id || '').slice(-6).toUpperCase();
    const saleDate = formatDate(sale.date);
    const discRate = sale.discountRate ?? 0;
    const subtotalAmt = sale.items.reduce((s, i) => s + i.price * i.qty, 0);
    const discountAmt = discRate > 0 ? subtotalAmt * discRate / 100 : 0;

    const itemRows = sale.items.map(item => `
      <tr>
        <td>${item.name}</td>
        <td style="text-align:center">${item.qty}</td>
        <td style="text-align:right">₺${item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
        <td style="text-align:right">₺${(item.price * item.qty).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
      </tr>`).join('');

    const discountRows = discRate > 0 ? `
      <tr style="color:#555">
        <td colspan="3" style="text-align:right;padding-top:6px">Ara Toplam:</td>
        <td style="text-align:right;padding-top:6px">₺${subtotalAmt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr style="color:#16A34A">
        <td colspan="3" style="text-align:right">İskonto (%${discRate}):</td>
        <td style="text-align:right">-₺${discountAmt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
      </tr>` : '';

    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8"/>
<title>Satış Özeti - ${saleNo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #222; background: #fff; }
  .page { width: 210mm; min-height: 297mm; padding: 16mm 18mm; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; border-bottom: 3px solid #E85D04; padding-bottom: 16px; }
  .logo img { height: 60px; object-fit: contain; }
  .firm-info { text-align: right; font-size: 12px; color: #444; line-height: 1.6; }
  .firm-name { font-size: 17px; font-weight: 700; color: #E85D04; }
  .sale-title { font-size: 22px; font-weight: 800; color: #E85D04; margin-bottom: 16px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 24px; font-size: 13px; }
  .meta-item { display: flex; gap: 8px; }
  .meta-label { font-weight: 600; color: #555; min-width: 90px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #E85D04; color: #fff; padding: 9px 12px; text-align: left; font-size: 12px; }
  td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
  tr:nth-child(even) td { background: #fafafa; }
  .total-row td { font-weight: 800; font-size: 16px; color: #E85D04; border-top: 2px solid #E85D04; border-bottom: none; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
  .bank-info { background: #fff8f0; border: 1px solid #fcd9b0; border-radius: 6px; padding: 10px 14px; margin-top: 12px; font-size: 12px; white-space: pre-line; }
  @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo"><img src="/logo.png" alt="Logo" onerror="this.style.display='none'" /></div>
    <div class="firm-info">
      <div class="firm-name">${firmName}</div>
      ${firmAddress ? `<div>${firmAddress}</div>` : ''}
      ${firmPhone ? `<div>${firmPhone}</div>` : ''}
      ${firmEmail ? `<div>${firmEmail}</div>` : ''}
    </div>
  </div>

  <div class="sale-title">SATIŞ FİŞİ</div>

  <div class="meta">
    <div class="meta-item"><span class="meta-label">Müşteri:</span><span>${sale.customer}</span></div>
    <div class="meta-item"><span class="meta-label">Fiş No:</span><span>#${saleNo}</span></div>
    <div class="meta-item"><span class="meta-label">Tarih:</span><span>${saleDate}</span></div>
    ${sale.by ? `<div class="meta-item"><span class="meta-label">Hazırlayan:</span><span>${sale.by}</span></div>` : ''}
    ${sale.note ? `<div class="meta-item"><span class="meta-label">Not:</span><span>${sale.note}</span></div>` : ''}
  </div>

  <table>
    <thead>
      <tr><th>Ürün Adı</th><th style="text-align:center">Adet</th><th style="text-align:right">Birim Fiyat</th><th style="text-align:right">Toplam</th></tr>
    </thead>
    <tbody>
      ${itemRows}
      ${discountRows}
      <tr class="total-row">
        <td colspan="3" style="text-align:right">GENEL TOPLAM</td>
        <td style="text-align:right">₺${sale.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    ${bankInfo ? `<div><strong>Banka / Ödeme Bilgileri:</strong></div><div class="bank-info">${bankInfo}</div>` : ''}
    <div style="margin-top:16px;text-align:center;font-size:13px;color:#E85D04;font-weight:600">Teşekkür ederiz!</div>
  </div>
</div>
<script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Satışlar</div>
          <div className="page-sub">{sales.length} satış kaydı</div>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          <IconPlus size={16} /> Yeni Satış
        </button>
      </div>
      <button className="mob-fab" onClick={() => setOpen(true)} aria-label="Yeni Satış">
        <IconPlus size={22} />
      </button>

      <div className="page-content">
        <div className="card">
          {/* Desktop table */}
          <div className="table-wrap mob-hide-table">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>Yükleniyor...</div>
            ) : sales.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>Satış kaydı bulunamadı</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Müşteri</th>
                    <th>Ürünler</th>
                    <th>Toplam</th>
                    <th>Durum</th>
                    <th>Tarih</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.customer}</td>
                      <td style={{ color: '#888' }}>{s.items.length} kalem, {s.items.reduce((a, i) => a + i.qty, 0)} adet</td>
                      <td style={{ fontWeight: 700 }}>₺{s.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td>
                        {s.status === 'completed'
                          ? <span className="badge badge-green">Tamamlandı</span>
                          : s.status === 'pending'
                          ? <span className="badge badge-amber">Bekliyor</span>
                          : <span className="badge badge-red">İptal</span>
                        }
                      </td>
                      <td style={{ color: '#888', fontSize: 12 }}>{formatDate(s.date)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setDetailId(s.id!)}>Detay</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => openSalePDF(s)} title="PDF İndir / Yazdır" style={{ color: '#E85D04' }}>PDF</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Mobile card list */}
          <div className="mob-card-list" style={{ padding: '4px 0' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>Yükleniyor...</div>
            ) : sales.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>Satış kaydı bulunamadı</div>
            ) : sales.map(s => (
              <div key={s.id} style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', marginBottom: 4 }}>{s.customer}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{formatDate(s.date)}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--or)' }}>₺{s.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                    {s.status === 'completed'
                      ? <span className="badge badge-green">Tamamlandı</span>
                      : s.status === 'pending'
                      ? <span className="badge badge-amber">Bekliyor</span>
                      : <span className="badge badge-red">İptal</span>
                    }
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setDetailId(s.id!)}>Detay</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New Sale Modal */}
      {open && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 680 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Yeni Satış</h3>
              <button onClick={() => { setOpen(false); resetForm(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa' }}><IconX size={20} /></button>
            </div>

            <div className="form-row-2" style={{ marginBottom: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Müşteri Adı *</label>
                <input className="form-input" value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Müşteri adı" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Not</label>
                <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Opsiyonel not" />
              </div>
            </div>

            {/* Para Birimi */}
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Para Birimi</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['TRY','USD','EUR','GBP'] as Currency[]).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    style={{
                      padding: '7px 16px', borderRadius: 8, border: '1px solid',
                      cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      borderColor: currency === c ? 'var(--or)' : 'var(--border)',
                      background: currency === c ? 'rgba(232,93,4,.1)' : 'var(--bg)',
                      color: currency === c ? 'var(--or)' : 'var(--text-2)',
                    }}
                  >
                    {CUR_FLAGS[c]} {c}
                  </button>
                ))}
                {currency !== 'TRY' && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center', marginLeft: 4 }}>
                    1 {currency} = ₺{rate.toFixed(2)}
                  </span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Ürün Ara</label>
              <div style={{ position: 'relative' }}>
                <IconSearch size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} />
                <input
                  className="form-input"
                  style={{ paddingLeft: 32 }}
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="Ürün adı veya kod..."
                />
              </div>
              {productSearch && filteredProducts.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: 'auto', background: 'var(--card)' }}>
                  {filteredProducts.map(p => (
                    <div
                      key={p.id}
                      onClick={() => addToCart(p)}
                      style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text-1)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span>{p.name} <code style={{ fontSize: 11, background: 'var(--bg)', padding: '1px 5px', borderRadius: 3, color: 'var(--text-3)' }}>{p.code}</code></span>
                      <span style={{ color: 'var(--text-3)', flexShrink: 0, marginLeft: 8 }}>₺{p.list.toLocaleString('tr-TR')} | Stok: {p.stock}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                {/* Desktop tablo */}
                <div className="mob-hide-table" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>Ürün</th>
                        <th style={{ width: 75, textAlign: 'center' }}>Adet</th>
                        <th style={{ width: 120, textAlign: 'right' }}>Birim ({sym})</th>
                        <th style={{ width: 110, textAlign: 'right' }}>Hakediş ({sym})</th>
                        <th style={{ width: 36 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map(item => {
                        const unitForeign  = toForeign(item.price);
                        const totalForeign = toForeign(item.price * item.qty);
                        return (
                          <tr key={item.productId}>
                            <td style={{ fontWeight: 500 }}>{item.name}</td>
                            <td style={{ textAlign: 'center' }}>
                              <input type="number" min={1} value={item.qty}
                                onChange={e => updateQty(item.productId, parseInt(e.target.value) || 1)}
                                style={{ width: 65, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', color: 'var(--text-1)', textAlign: 'center' }} />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <input type="number" min={0}
                                value={currency === 'TRY' ? item.price : parseFloat(unitForeign.toFixed(4))}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  updatePrice(item.productId, currency === 'TRY' ? val : val * rate);
                                }}
                                style={{ width: 100, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--bg)', color: 'var(--text-1)', textAlign: 'right' }} />
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#E85D04' }}>
                              {sym}{totalForeign.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                              <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 400 }}>
                                {item.qty} × {sym}{unitForeign.toFixed(2)}
                              </div>
                            </td>
                            <td>
                              <button onClick={() => removeFromCart(item.productId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626' }}>
                                <IconTrash size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Mobil kart listesi */}
                <div className="mob-card-list" style={{ padding: 10 }}>
                  {cart.map(item => {
                    const unitForeign  = toForeign(item.price);
                    const totalForeign = toForeign(item.price * item.qty);
                    return (
                      <div key={item.productId} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)', flex: 1, paddingRight: 8 }}>{item.name}</span>
                          <button onClick={() => removeFromCart(item.productId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', flexShrink: 0 }}>
                            <IconTrash size={15} />
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>ADET</div>
                            <input type="number" min={1} value={item.qty} onChange={e => updateQty(item.productId, parseInt(e.target.value) || 1)}
                              className="form-input" style={{ padding: '6px 10px', fontSize: 14, textAlign: 'center' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>BİRİM ({sym})</div>
                            <input type="number" min={0}
                              value={currency === 'TRY' ? item.price : parseFloat(unitForeign.toFixed(4))}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                updatePrice(item.productId, currency === 'TRY' ? val : val * rate);
                              }}
                              className="form-input" style={{ padding: '6px 10px', fontSize: 14, textAlign: 'right' }} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            {item.qty} × {sym}{unitForeign.toFixed(2)}
                          </span>
                          <span style={{ fontWeight: 700, color: '#E85D04', fontSize: 14 }}>
                            = {sym}{totalForeign.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={discountEnabled} onChange={e => setDiscountEnabled(e.target.checked)} />
                İskonto Uygula
                {discountEnabled && discountRate > 0 && (
                  <span className="badge badge-green">%{discountRate} ({totalQty} adet)</span>
                )}
              </label>
              <div style={{ textAlign: 'right', fontSize: 13 }}>
                {discountRate > 0 && (
                  <div style={{ color: '#888' }}>
                    Ara toplam: {sym}{toForeign(subtotal).toFixed(2)}
                    {currency !== 'TRY' && <span style={{ fontSize: 11, color: 'var(--text-3)' }}> (₺{subtotal.toFixed(2)})</span>}
                  </div>
                )}
                {discountRate > 0 && (
                  <div style={{ color: '#16A34A' }}>İskonto (%{discountRate}): -{sym}{toForeign(discountAmt).toFixed(2)}</div>
                )}
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {sym}{toForeign(total).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  {currency !== 'TRY' && <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>≈ ₺{total.toFixed(2)}</span>}
                </div>
                <div style={{ fontSize: 11, color: profit >= 0 ? '#16A34A' : '#DC2626' }}>Kâr: ₺{profit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setOpen(false); resetForm(); }}>İptal</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !customer.trim() || cart.length === 0}>
                {saving ? 'Kaydediliyor...' : 'Satışı Tamamla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailSale && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetailId(null)}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Satış Detayı</h3>
              <button onClick={() => setDetailId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa' }}><IconX size={20} /></button>
            </div>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#555' }}>
              <strong>Müşteri:</strong> {detailSale.customer}<br />
              <strong>Tarih:</strong> {formatDate(detailSale.date)}<br />
              {detailSale.note && <><strong>Not:</strong> {detailSale.note}<br /></>}
            </div>
            <table style={{ width: '100%', marginBottom: 12 }}>
              <thead><tr><th>Ürün</th><th>Adet</th><th>Birim</th><th>Toplam</th></tr></thead>
              <tbody>
                {detailSale.items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.name}</td>
                    <td>{item.qty}</td>
                    <td>₺{item.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                    <td style={{ fontWeight: 600 }}>₺{(item.price * item.qty).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 18 }}>
              Toplam: ₺{detailSale.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setDetailId(null)}>Kapat</button>
              <button className="btn btn-primary" onClick={() => openSalePDF(detailSale)} style={{ background: '#E85D04' }}>
                İndir / Yazdır
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
