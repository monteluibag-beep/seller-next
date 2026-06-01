'use client';
import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, serverTimestamp, query, orderBy,
  doc, updateDoc, increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Sale, SaleItem, Product } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { IconPlus, IconX, IconTrash, IconSearch } from '@tabler/icons-react';

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
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState('');
  const [note, setNote] = useState('');
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

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
        discountRate, by: user?.email?.split('@')[0] || 'admin',
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
    setCustomer(''); setNote(''); setCart([]); setDiscountEnabled(false); setProductSearch('');
  }

  function formatDate(ts: unknown) {
    if (!ts) return '—';
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  const detailSale = sales.find(s => s.id === detailId);

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

      <div className="page-content">
        <div className="card">
          <div className="table-wrap">
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
                        <button className="btn btn-secondary btn-sm" onClick={() => setDetailId(s.id!)}>Detay</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Müşteri Adı *</label>
                <input className="form-input" value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Müşteri adı" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Not</label>
                <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Opsiyonel not" />
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
                <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, marginTop: 4, maxHeight: 180, overflowY: 'auto' }}>
                  {filteredProducts.map(p => (
                    <div
                      key={p.id}
                      onClick={() => addToCart(p)}
                      style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8f8f8')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <span>{p.name} <code style={{ fontSize: 11, background: '#f0f0f0', padding: '1px 5px', borderRadius: 3 }}>{p.code}</code></span>
                      <span style={{ color: '#888' }}>₺{p.list.toLocaleString('tr-TR')} | Stok: {p.stock}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div style={{ border: '1px solid #e0e0e0', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Ürün</th>
                      <th style={{ width: 80 }}>Adet</th>
                      <th style={{ width: 110 }}>Birim Fiyat</th>
                      <th style={{ width: 100 }}>Toplam</th>
                      <th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map(item => (
                      <tr key={item.productId}>
                        <td style={{ fontWeight: 500 }}>{item.name}</td>
                        <td>
                          <input
                            type="number" min={1} value={item.qty}
                            onChange={e => updateQty(item.productId, parseInt(e.target.value) || 1)}
                            style={{ width: 70, padding: '4px 8px', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 13 }}
                          />
                        </td>
                        <td>
                          <input
                            type="number" min={0} value={item.price}
                            onChange={e => updatePrice(item.productId, parseFloat(e.target.value) || 0)}
                            style={{ width: 100, padding: '4px 8px', border: '1px solid #e0e0e0', borderRadius: 6, fontSize: 13 }}
                          />
                        </td>
                        <td style={{ fontWeight: 600 }}>₺{(item.price * item.qty).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                        <td>
                          <button onClick={() => removeFromCart(item.productId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626' }}>
                            <IconTrash size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                {discountRate > 0 && <div style={{ color: '#888' }}>Ara toplam: ₺{subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>}
                {discountRate > 0 && <div style={{ color: '#16A34A' }}>İskonto: -₺{discountAmt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>}
                <div style={{ fontWeight: 800, fontSize: 18 }}>Toplam: ₺{total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
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
          </div>
        </div>
      )}
    </>
  );
}
