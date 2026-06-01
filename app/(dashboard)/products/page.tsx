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

type ScanTarget = 'search' | 'barcode' | null;

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Omit<Product, 'id'>>(empty);
  const [codeManual, setCodeManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanTarget, setScanTarget] = useState<ScanTarget>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); loadCats(); }, []);

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

  function openAdd() {
    setEditing(null);
    setForm({ ...empty, barcode: generateBarcode(products) });
    setCodeManual(false);
    setOpen(true);
  }

  function exportCSV() {
    const headers = ['Ürün Adı', 'Kod', 'Barkod', 'Kategori', 'Maliyet (₺)', 'Liste Fiyatı (₺)', 'Stok'];
    const rows = filtered.map(p => [
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.code || '').replace(/"/g, '""')}"`,
      `"${(p.barcode || '').replace(/"/g, '""')}"`,
      `"${(p.catName || '').replace(/"/g, '""')}"`,
      p.cost ?? 0,
      p.list ?? 0,
      p.stock ?? 0,
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
    setForm({
      name: p.name || '',
      code: p.code || '',
      barcode: p.barcode || '',
      cost: p.cost ?? 0,
      list: p.list ?? 0,
      stock: p.stock ?? 0,
      photo: p.photo || '',
      catName: p.catName || '',
    });
    setCodeManual(true);
    setOpen(true);
  }

  function openCopy(p: Product) {
    setEditing(null); // yeni ürün olarak kaydedilecek
    const newBarcode = generateBarcode(products);
    const newCode = p.catName ? autoCode(p.catName) : '';
    setForm({
      name: p.name || '',
      code: newCode,
      barcode: newBarcode,
      cost: p.cost ?? 0,
      list: p.list ?? 0,
      stock: 0,
      photo: p.photo || '',
      catName: p.catName || '',
    });
    setCodeManual(!newCode); // kod otomatik üretilemediyse manuel moda geç
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

  async function save() {
    if (!form.name.trim()) return;
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
    } else if (scanTarget === 'barcode') {
      set('barcode', val);
    }
    setScanTarget(null);
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
          <button className="btn btn-primary" onClick={openAdd}>
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
          <div className="table-wrap">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Yükleniyor...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Ürün bulunamadı</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Foto</th>
                    <th>Ürün Adı</th>
                    <th>Kod</th>
                    <th>Barkod</th>
                    <th>Kategori</th>
                    <th>Maliyet</th>
                    <th>Liste</th>
                    <th>Stok</th>
                    <th></th>
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
                      <td>
                        {p.code
                          ? <code style={{ background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 4, fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{p.code}</code>
                          : <span style={{ color: 'var(--text-3)' }}>—</span>
                        }
                      </td>
                      <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{p.barcode || '—'}</td>
                      <td>{p.catName ? <span className="badge badge-blue">{p.catName}</span> : '—'}</td>
                      <td>₺{(p.cost ?? 0).toLocaleString('tr-TR')}</td>
                      <td style={{ fontWeight: 700 }}>₺{(p.list ?? 0).toLocaleString('tr-TR')}</td>
                      <td>
                        <span style={{ fontWeight: 700, color: p.stock <= 5 ? '#F87171' : p.stock <= 15 ? '#FCD34D' : '#4ADE80' }}>
                          {p.stock}
                        </span>
                      </td>
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
        </div>
      </div>

      {open && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>{editing ? 'Ürünü Düzenle' : 'Yeni Ürün'}</h3>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><IconX size={20} /></button>
            </div>

            {/* Photo */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              {form.photo
                ? <img src={form.photo} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 10, marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                : <div style={{ width: 96, height: 96, background: 'var(--surface-2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}><IconPhoto size={32} color="var(--text-3)" /></div>
              }
              <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
              <button className="btn btn-secondary btn-sm" onClick={() => photoRef.current?.click()}>
                <IconCamera size={13} /> Fotoğraf Seç
              </button>
            </div>

            {/* Kategori */}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Ürün Kodu */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Ürün Kodu</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {form.catName && (
                      <button
                        type="button"
                        onClick={regenerateCode}
                        title="Kodu yeniden üret"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--or)', display: 'flex', alignItems: 'center', padding: 0 }}
                      >
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
                  placeholder={form.catName ? autoCode(form.catName) || 'Otomatik' : 'Önce kategori seçin'}
                  style={{ fontFamily: 'monospace', background: codeManual ? undefined : 'rgba(232,93,4,.05)', borderColor: codeManual ? undefined : 'rgba(232,93,4,.3)' }}
                />
                {!codeManual && form.catName && (
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
                    {categories.find(c => c.name === form.catName)?.prefix}-{new Date().getFullYear().toString().slice(-2)}-XXX formatında otomatik
                  </div>
                )}
              </div>

              {/* Barkod */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Barkod (EAN-13)</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => setScanTarget('barcode')}
                      title="Kamera ile barkod tara"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--or)', display: 'flex', alignItems: 'center', padding: 0 }}
                    >
                      <IconScan size={13} />
                    </button>
                    {!editing && (
                      <button
                        type="button"
                        onClick={() => set('barcode', generateBarcode(products))}
                        title="Yeni barkod üret"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--or)', display: 'flex', alignItems: 'center', padding: 0 }}
                      >
                        <IconRefresh size={12} />
                      </button>
                    )}
                  </div>
                </label>
                <input
                  className="form-input"
                  value={form.barcode}
                  onChange={e => set('barcode', e.target.value)}
                  placeholder="8690000000000"
                  style={{ fontFamily: 'monospace', letterSpacing: 1 }}
                />
                {!editing && form.barcode && (
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
                    EAN-13 otomatik üretildi · elle düzenleyebilirsiniz
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Maliyet (₺)</label>
                <input
                  className="form-input" type="number" min={0}
                  value={form.cost}
                  onFocus={selectAll}
                  onChange={e => set('cost', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Liste Fiyatı (₺)</label>
                <input
                  className="form-input" type="number" min={0}
                  value={form.list}
                  onFocus={selectAll}
                  onChange={e => set('list', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Stok Adedi</label>
                <input
                  className="form-input" type="number" min={0}
                  value={form.stock}
                  onFocus={selectAll}
                  onChange={e => set('stock', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>İptal</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !form.name.trim()}>
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
