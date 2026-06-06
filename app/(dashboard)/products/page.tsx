'use client';
import { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Product, Category } from '@/types';
import {
  IconPlus, IconSearch, IconEdit, IconTrash, IconPhoto, IconCamera, IconX, IconRefresh,
  IconDownload, IconScan, IconCopy,
} from '@tabler/icons-react';
import BarcodeScanner from '@/components/BarcodeScanner';

const empty: Omit<Product, 'id'> = {
  name: '', code: '', barcode: '', cost: 0, list: 0, stock: 0, photo: '', catName: '',
};

function generateBarcode(products: Product[]): string {
  const prefix = '8690001';
  const existing = products
    .map(p => p.barcode || '')
    .filter(b => b.startsWith(prefix) && b.length === 13)
    .map(b => parseInt(b.slice(7, 12)))
    .filter(n => !isNaN(n));
  const seq = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  const body = prefix + seq.toString().padStart(5, '0');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(body[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return body + check;
}

function generateCode(prefix: string, products: Product[], catName: string): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const existing = products.filter(p =>
    p.catName === catName && p.code?.startsWith(`${prefix}-${year}-`)
  );
  const seq = (existing.length + 1).toString().padStart(3, '0');
  return `${prefix}-${year}-${seq}`;
}

const selectAll = (e: React.FocusEvent<HTMLInputElement>) => e.target.select();

// İskonto kademeleri (offers sayfasıyla aynı)
const DISCOUNT_TIERS = [
  { qty: 1000, rate: 55 }, { qty: 500, rate: 50 }, { qty: 200, rate: 40 },
  { qty: 100, rate: 35 }, { qty:  50, rate: 30 }, { qty:  40, rate: 25 },
  { qty:  30, rate: 22 }, { qty:  20, rate: 18 }, { qty:  10, rate: 15 },
];
const MAX_DISCOUNT = DISCOUNT_TIERS[0].rate; // 1000+ adette %55
const MIN_MARGIN   = 10; // %10 minimum kâr

/**
 * 1000+ adette %10 kâr korunacak şekilde liste fiyatı:
 *   liste × (1 − maxDiscount/100) ≥ maliyet × (1 + minMargin/100)
 *   liste ≥ maliyet × (1 + minMargin/100) / (1 − maxDiscount/100)
 * Sonuç 5'in katına yuvarlanır (görsel netlik).
 */
function recommendedList(cost: number): number {
  if (!cost || cost <= 0) return 0;
  const raw = cost * (1 + MIN_MARGIN / 100) / (1 - MAX_DISCOUNT / 100);
  return Math.ceil(raw / 5) * 5;
}

type ScanTarget = 'search' | 'barcode' | 'add' | null;

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Omit<Product, 'id'>>(empty);
  const [codeManual, setCodeManual] = useState(false);
  const [listManual, setListManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanTarget, setScanTarget] = useState<ScanTarget>(null);
  const [barcodeError, setBarcodeError] = useState('');
  const [fabOpen, setFabOpen] = useState(false);
  const [toast, setToast] = useState('');
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); loadCats(); }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function load() {
    setLoading(true);
    const snap = await getDocs(collection(db, 'products'));
    setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    setLoading(false);
  }

  async function loadCats() {
    const snap = await getDocs(collection(db, 'categories'));
    setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
  }

  const filtered = products.filter(p =>
    (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.code || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode || '').includes(search)
  );

  function autoCode(catName: string) {
    if (!catName) return '';
    const cat = categories.find(c => c.name === catName);
    if (!cat?.prefix) return '';
    return generateCode(cat.prefix, products, catName);
  }

  function openAdd(prefillBarcode?: string) {
    setEditing(null);
    setBarcodeError('');
    setForm({ ...empty, barcode: prefillBarcode ?? generateBarcode(products) });
    setCodeManual(false);
    setListManual(false);
    setOpen(true);
    setFabOpen(false);
  }

  function exportCSV() {
    const headers = ['Ürün Adı', 'Kod', 'Barkod', 'Kategori', 'Maliyet (₺)', 'Liste Fiyatı (₺)', 'Stok'];
    const rows = filtered.map(p => [
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.code || '').replace(/"/g, '""')}"`,
      `"${(p.barcode || '').replace(/"/g, '""')}"`,
      `"${(p.catName || '').replace(/"/g, '""')}"`,
      p.cost ?? 0, p.list ?? 0, p.stock ?? 0,
    ]);
    const csv = '﻿' + [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `urunler_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setBarcodeError('');
    setForm({
      name: p.name || '', code: p.code || '', barcode: p.barcode || '',
      cost: p.cost ?? 0, list: p.list ?? 0, stock: p.stock ?? 0,
      photo: p.photo || '', catName: p.catName || '',
    });
    setCodeManual(true);
    setListManual(true); // düzenleme modunda liste fiyatı mevcut değeri koru
    setOpen(true);
  }

  function openCopy(p: Product) {
    setEditing(null);
    setBarcodeError('');
    const newBarcode = generateBarcode(products);
    const newCode = p.catName ? autoCode(p.catName) : '';
    setForm({
      name: p.name || '', code: newCode, barcode: newBarcode,
      cost: p.cost ?? 0, list: p.list ?? 0, stock: 0,
      photo: p.photo || '', catName: p.catName || '',
    });
    setCodeManual(!newCode);
    setListManual(true);
    setOpen(true);
  }

  function handleCatChange(catName: string) {
    if (!codeManual) {
      setForm(f => ({ ...f, catName, code: autoCode(catName) }));
    } else {
      setForm(f => ({ ...f, catName }));
    }
  }

  function regenerateCode() {
    if (form.catName) {
      setForm(f => ({ ...f, code: autoCode(f.catName) }));
      setCodeManual(false);
    }
  }

  function checkBarcodeDuplicate(barcode: string): Product | undefined {
    if (!barcode.trim()) return undefined;
    return products.find(p => p.barcode === barcode && p.id !== editing?.id);
  }

  async function save() {
    if (!form.name.trim()) return;
    // Barkod duplicate kontrolü
    const dup = checkBarcodeDuplicate(form.barcode);
    if (dup) {
      setBarcodeError(`Bu barkod zaten "${dup.name}" ürününe ait!`);
      return;
    }
    setBarcodeError('');
    setSaving(true);
    try {
      if (editing?.id) {
        await updateDoc(doc(db, 'products', editing.id), { ...form });
      } else {
        await addDoc(collection(db, 'products'), { ...form, createdAt: serverTimestamp() });
      }
      setOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Bu ürünü silmek istediğinize emin misiniz?')) return;
    await deleteDoc(doc(db, 'products', id));
    load();
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        setForm(f => ({ ...f, photo: canvas.toDataURL('image/jpeg', 0.7) }));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  const set = (k: keyof Omit<Product, 'id'>, v: unknown) =>
    setForm(f => ({ ...f, [k]: v }));

  function handleScanDetect(val: string) {
    if (scanTarget === 'search') {
      setSearch(val);
      setScanTarget(null);
    } else if (scanTarget === 'barcode') {
      const dup = checkBarcodeDuplicate(val);
      if (dup) {
        setBarcodeError(`Bu barkod zaten "${dup.name}" ürününe ait!`);
      } else {
        setBarcodeError('');
        set('barcode', val);
      }
      setScanTarget(null);
    } else if (scanTarget === 'add') {
      setScanTarget(null);
      // Barkod sistemde var mı?
      const existing = products.find(p => p.barcode === val);
      if (existing) {
        showToast(`⚠️ Bu barkod zaten kayıtlı: "${existing.name}"`);
        return;
      }
      // Yok → yeni ürün formunu barkodla aç
      openAdd(val);
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Ürünler</div>
          <div className="page-sub">{products.length} ürün kayıtlı</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={exportCSV} title="CSV olarak dışa aktar">
            <IconDownload size={16} /> CSV
          </button>
          <button className="btn btn-primary" onClick={() => openAdd()}>
            <IconPlus size={16} /> Yeni Ürün
          </button>
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <div style={{ position: 'relative', flex: 1, maxWidth: 380, display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <IconSearch size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input
                  className="form-input"
                  style={{ paddingLeft: 32, paddingRight: 36, height: 36 }}
                  placeholder="İsim, kod veya barkod ara..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <button
                title="Kamera ile barkod tara"
                onClick={() => setScanTarget('search')}
                style={{ background: 'var(--or-tint)', border: '1px solid rgba(232,93,4,.3)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: 'var(--or)' }}
              >
                <IconScan size={16} />
              </button>
            </div>
          </div>

          {/* Desktop table */}
          <div className="table-wrap mob-hide-table">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Yükleniyor...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Ürün bulunamadı</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Foto</th><th>Ürün Adı</th><th>Kod</th><th>Barkod</th>
                    <th>Kategori</th><th>Maliyet</th><th>Liste</th><th>Stok</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id}>
                      <td>
                        {p.photo
                          ? <img src={p.photo} alt={p.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                          : <div style={{ width: 40, height: 40, background: 'var(--surface-2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconPhoto size={18} color="var(--text-3)" /></div>
                        }
                      </td>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>{p.code ? <code style={{ background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 4, fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{p.code}</code> : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                      <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{p.barcode || '—'}</td>
                      <td>{p.catName ? <span className="badge badge-blue">{p.catName}</span> : '—'}</td>
                      <td>₺{(p.cost ?? 0).toLocaleString('tr-TR')}</td>
                      <td style={{ fontWeight: 700 }}>₺{(p.list ?? 0).toLocaleString('tr-TR')}</td>
                      <td><span style={{ fontWeight: 700, color: p.stock <= 5 ? '#F87171' : p.stock <= 15 ? '#FCD34D' : '#4ADE80' }}>{p.stock}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)} title="Düzenle"><IconEdit size={13} /></button>
                          <button className="btn btn-secondary btn-sm" onClick={() => openCopy(p)} title="Kopyala" style={{ color: 'var(--or)' }}><IconCopy size={13} /></button>
                          <button className="btn btn-sm" style={{ background: 'rgba(248,113,113,.1)', color: '#F87171' }} onClick={() => remove(p.id!)} title="Sil"><IconTrash size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Mobile card list */}
          <div className="mob-card-list" style={{ padding: '8px 0' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Yükleniyor...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Ürün bulunamadı</div>
            ) : filtered.map(p => (
              <div key={p.id} style={{ display: 'flex', gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                {p.photo
                  ? <img src={p.photo} alt={p.name} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                  : <div style={{ width: 52, height: 52, background: 'var(--surface-2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><IconPhoto size={20} color="var(--text-3)" /></div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', marginBottom: 3 }}>{p.name}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {p.code && <code style={{ background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4, fontSize: 10, color: 'var(--text-2)' }}>{p.code}</code>}
                    {p.catName && <span className="badge badge-blue" style={{ fontSize: 10 }}>{p.catName}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-3)' }}>Liste: <strong style={{ color: 'var(--text-1)' }}>₺{(p.list ?? 0).toLocaleString('tr-TR')}</strong></span>
                    <span style={{ color: 'var(--text-3)' }}>Stok: <strong style={{ color: p.stock <= 5 ? '#F87171' : p.stock <= 15 ? '#FCD34D' : '#4ADE80' }}>{p.stock}</strong></span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}><IconEdit size={13} /></button>
                  <button className="btn btn-secondary btn-sm" onClick={() => openCopy(p)} style={{ color: 'var(--or)' }}><IconCopy size={13} /></button>
                  <button className="btn btn-sm" style={{ background: 'rgba(248,113,113,.1)', color: '#F87171' }} onClick={() => remove(p.id!)}><IconTrash size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Mobil FAB (speed dial) ── */}
      {fabOpen && (
        <div onClick={() => setFabOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
      )}
      <div style={{ position: 'fixed', bottom: 'calc(var(--bottom-nav-h) + 16px)', right: 18, zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}
        className="mob-fab-group">
        {/* Sub buttons */}
        {fabOpen && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ background: 'rgba(0,0,0,.75)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8, whiteSpace: 'nowrap' }}>Manuel Ekle</span>
              <button onClick={() => openAdd()} style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,.3)' }}>
                <IconPlus size={20} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ background: 'rgba(0,0,0,.75)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 8, whiteSpace: 'nowrap' }}>Barkod ile Ekle</span>
              <button onClick={() => { setFabOpen(false); setScanTarget('add'); }} style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--or)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,.3)' }}>
                <IconScan size={20} />
              </button>
            </div>
          </>
        )}
        {/* Ana FAB */}
        <button
          className="mob-fab"
          onClick={() => setFabOpen(v => !v)}
          style={{ transform: fabOpen ? 'rotate(45deg)' : 'none', transition: 'transform .2s' }}
        >
          <IconPlus size={22} />
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 'calc(var(--bottom-nav-h) + 80px)', left: '50%', transform: 'translateX(-50%)', background: '#1a1a1a', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 999, boxShadow: '0 4px 20px rgba(0,0,0,.4)', border: '1px solid rgba(255,255,255,.1)', whiteSpace: 'nowrap', maxWidth: '90vw', textAlign: 'center' }}>
          {toast}
        </div>
      )}

      {/* Ürün Formu Modal */}
      {open && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-box">

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 18px 12px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>{editing ? 'Ürünü Düzenle' : 'Yeni Ürün'}</h3>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}><IconX size={20} /></button>
            </div>

            <div style={{ padding: '14px 18px 0' }}>
              {/* Photo */}
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                {form.photo
                  ? <img src={form.photo} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                  : <div style={{ width: 80, height: 80, background: 'var(--surface-2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}><IconPhoto size={28} color="var(--text-3)" /></div>
                }
                <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
                <button className="btn btn-secondary btn-sm" onClick={() => photoRef.current?.click()}>
                  <IconCamera size={13} /> Fotoğraf Seç
                </button>
              </div>

              {/* Kategori + Ürün Adı */}
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Kategori</label>
                  <select className="form-input" value={form.catName} onChange={e => handleCatChange(e.target.value)}>
                    <option value="">Kategori Seç</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Ürün Adı *</label>
                  <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Sırt Çantası M" />
                </div>
              </div>

              {/* Ürün Kodu + Barkod */}
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Stok Kodu</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {form.catName && (
                        <button type="button" onClick={regenerateCode} title="Yeniden üret"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--or)', display: 'flex', alignItems: 'center', padding: 0 }}>
                          <IconRefresh size={12} />
                        </button>
                      )}
                      <label style={{ fontWeight: 400, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
                        <input type="checkbox" checked={codeManual} onChange={e => setCodeManual(e.target.checked)} />
                        Manuel
                      </label>
                    </div>
                  </label>
                  <input
                    className="form-input"
                    value={form.code}
                    onChange={e => { setCodeManual(true); set('code', e.target.value); }}
                    placeholder={form.catName ? autoCode(form.catName) || 'Otomatik' : 'Kategori seçin'}
                    style={{ fontFamily: 'monospace', background: codeManual ? undefined : 'rgba(232,93,4,.05)', borderColor: codeManual ? undefined : 'rgba(232,93,4,.3)' }}
                  />
                  {!codeManual && form.catName && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>Otomatik üretiliyor</div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Barkod (EAN-13)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button type="button" onClick={() => { setBarcodeError(''); setScanTarget('barcode'); }} title="Kamera ile tara"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--or)', display: 'flex', alignItems: 'center', padding: 0 }}>
                        <IconScan size={13} />
                      </button>
                      {!editing && (
                        <button type="button" onClick={() => { set('barcode', generateBarcode(products)); setBarcodeError(''); }} title="Yeni barkod üret"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--or)', display: 'flex', alignItems: 'center', padding: 0 }}>
                          <IconRefresh size={12} />
                        </button>
                      )}
                    </div>
                  </label>
                  <input
                    className="form-input"
                    value={form.barcode}
                    onChange={e => { set('barcode', e.target.value); if (barcodeError) setBarcodeError(''); }}
                    onBlur={e => {
                      const dup = checkBarcodeDuplicate(e.target.value);
                      setBarcodeError(dup ? `Bu barkod zaten "${dup.name}" ürününe ait!` : '');
                    }}
                    placeholder="8690000000000"
                    style={{ fontFamily: 'monospace', letterSpacing: 1, borderColor: barcodeError ? '#f87171' : undefined }}
                  />
                  {barcodeError
                    ? <div style={{ fontSize: 11, color: '#f87171', marginTop: 3, fontWeight: 600 }}>⚠️ {barcodeError}</div>
                    : !editing && form.barcode && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>EAN-13 otomatik üretildi</div>
                  }
                </div>
              </div>

              {/* Fiyat + Stok */}
              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">Maliyet (₺)</label>
                  <input
                    className="form-input" type="number" min={0}
                    value={form.cost} onFocus={selectAll}
                    onChange={e => {
                      const cost = parseFloat(e.target.value) || 0;
                      setForm(f => ({
                        ...f,
                        cost,
                        // Liste fiyatı manuel değilse otomatik güncelle
                        list: listManual ? f.list : recommendedList(cost),
                      }));
                    }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Liste Fiyatı (₺)</span>
                    {form.cost > 0 && (
                      <button
                        type="button"
                        onClick={() => { setForm(f => ({ ...f, list: recommendedList(f.cost) })); setListManual(false); }}
                        title="Tavsiye fiyatına sıfırla"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--or)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, padding: 0 }}
                      >
                        <IconRefresh size={11} /> Tavsiye
                      </button>
                    )}
                  </label>
                  <input
                    className="form-input" type="number" min={0}
                    value={form.list} onFocus={selectAll}
                    onChange={e => { setListManual(true); set('list', parseFloat(e.target.value) || 0); }}
                    style={{ borderColor: !listManual && form.cost > 0 ? 'rgba(232,93,4,.4)' : undefined, background: !listManual && form.cost > 0 ? 'rgba(232,93,4,.04)' : undefined }}
                  />
                  {form.cost > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.4 }}>
                      {listManual
                        ? `Tavsiye: ₺${recommendedList(form.cost).toLocaleString('tr-TR')} · 1000 adette %${MIN_MARGIN} kâr`
                        : `1000 adette %${MIN_MARGIN} kâr güvenceli (${MAX_DISCOUNT}% iskonto sonrası ₺${(form.list * (1 - MAX_DISCOUNT / 100)).toFixed(2)})`
                      }
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Stok Adedi</label>
                  <input className="form-input" type="number" min={0} value={form.stock} onFocus={selectAll} onChange={e => set('stock', parseInt(e.target.value) || 0)} />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, padding: '8px 18px 12px' }}>
              <button className="btn btn-secondary" onClick={() => setOpen(false)} style={{ width: '100%' }}>İptal</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !form.name.trim() || !!barcodeError} style={{ width: '100%' }}>
                {saving ? 'Kaydediliyor...' : editing ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {scanTarget && (
        <BarcodeScanner
          onDetect={handleScanDetect}
          onClose={() => setScanTarget(null)}
        />
      )}
    </>
  );
}
