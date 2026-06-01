'use client';
import { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, serverTimestamp, query, orderBy,
  doc, updateDoc, increment, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { StockMove, Product } from '@/types';
import {
  IconPlus, IconArrowUp, IconArrowDown, IconAlertTriangle, IconX,
  IconDownload, IconUpload, IconCheck, IconScan, IconEdit, IconDeviceFloppy,
} from '@tabler/icons-react';
import BarcodeScanner from '@/components/BarcodeScanner';
import * as XLSX from 'xlsx';

type Filter = 'all' | 'in' | 'out';

interface ImportRow {
  line: number;
  raw: string;
  status: 'ok' | 'error';
  message: string;
  productId?: string;
  productName?: string;
  newStock?: number;
  delta?: number;
}

export default function StockPage() {
  const [moves, setMoves] = useState<StockMove[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  // Add move modal
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ productId: '', type: 'in' as 'in' | 'out', qty: 1, note: '' });
  const [saving, setSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  // CSV/Excel import
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Inline stock edit
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [editingStockVal, setEditingStockVal] = useState(0);
  const [savingStock, setSavingStock] = useState(false);

  // Product search for add-move modal
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => { load(); loadProducts(); }, []);

  async function load() {
    setLoading(true);
    const snap = await getDocs(query(collection(db, 'stock_moves'), orderBy('date', 'desc')));
    setMoves(snap.docs.map(d => ({ id: d.id, ...d.data() } as StockMove)));
    setLoading(false);
  }

  async function loadProducts() {
    const snap = await getDocs(collection(db, 'products'));
    setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
  }

  const filtered = moves.filter(m => filter === 'all' || m.type === filter);
  const lowStock = products.filter(p => p.stock <= 10).sort((a, b) => a.stock - b.stock);
  const selectedProduct = products.find(p => p.id === form.productId);

  const productSearchFiltered = products.filter(p =>
    productSearch.length > 0 && (
      (p.name || '').toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.code || '').toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.barcode || '').includes(productSearch)
    )
  );

  async function save() {
    if (!form.productId || form.qty < 1) return;
    setSaving(true);
    try {
      const product = products.find(p => p.id === form.productId)!;
      await addDoc(collection(db, 'stock_moves'), {
        productId: form.productId,
        productName: product.name,
        type: form.type,
        qty: form.qty,
        note: form.note,
        date: serverTimestamp(),
      });
      const delta = form.type === 'in' ? form.qty : -form.qty;
      await updateDoc(doc(db, 'products', form.productId), { stock: increment(delta) });
      setOpen(false);
      setForm({ productId: '', type: 'in', qty: 1, note: '' });
      setProductSearch('');
      load();
      loadProducts();
    } finally {
      setSaving(false);
    }
  }

  function formatDate(ts: unknown) {
    if (!ts) return '—';
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // ── Inline Stock Edit ───────────────────────────────────────────────────────
  function startEditStock(p: Product) {
    setEditingStockId(p.id!);
    setEditingStockVal(p.stock);
  }

  async function saveInlineStock(p: Product) {
    if (editingStockVal === p.stock) { setEditingStockId(null); return; }
    setSavingStock(true);
    try {
      const delta = editingStockVal - p.stock;
      const type = delta >= 0 ? 'in' : 'out';
      await addDoc(collection(db, 'stock_moves'), {
        productId: p.id,
        productName: p.name,
        type,
        qty: Math.abs(delta),
        note: 'Manuel stok düzeltme',
        date: serverTimestamp(),
      });
      await updateDoc(doc(db, 'products', p.id!), { stock: editingStockVal });
      setEditingStockId(null);
      load();
      loadProducts();
    } finally {
      setSavingStock(false);
    }
  }

  // ── Excel Export (template for bulk import) ─────────────────────────────────
  function exportStockExcel() {
    const data = products.map(p => ({
      'Ürün Adı': p.name || '',
      'Kod': p.code || '',
      'Barkod': p.barcode || '',
      'Kategori': p.catName || '',
      'Mevcut Stok': p.stock ?? 0,
      'Yeni Stok': p.stock ?? 0,
    }));

    const ws = XLSX.utils.json_to_sheet(data);

    // Column widths
    ws['!cols'] = [
      { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
    ];

    // Header style (bold, orange fill) — note: XLSX CE doesn't support full styles, but we mark for reference
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellAddr = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[cellAddr]) continue;
      ws[cellAddr].s = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: 'E85D04' } },
        alignment: { horizontal: 'center' },
      };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stok Güncelleme');

    // Add instructions sheet
    const infoData = [
      ['KULLANIM TALİMATLARI'],
      [''],
      ['1. "Stok Güncelleme" sekmesindeki "Yeni Stok" sütununa istediğiniz stok adedini girin.'],
      ['2. Kod ve Barkod sütunlarını DEĞİŞTİRMEYİN — bunlar ürün eşleştirmede kullanılır.'],
      ['3. Dosyayı kaydedin ve sisteme yükleyin.'],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
    wsInfo['!cols'] = [{ wch: 70 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Talimatlar');

    XLSX.writeFile(wb, `stok_guncelleme_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  // ── CSV Export (movements) ──────────────────────────────────────────────────
  function exportCSV() {
    const headers = ['Ürün Kodu', 'Barkod', 'Ürün Adı', 'Tip (giris/cikis)', 'Adet', 'Not', 'Tarih'];
    const rows = filtered.map(m => {
      const prod = products.find(p => p.id === m.productId);
      const dateVal = (m.date as { toDate?: () => Date })?.toDate?.() ?? new Date(m.date as string);
      return [
        `"${(prod?.code || '').replace(/"/g, '""')}"`,
        `"${(prod?.barcode || '').replace(/"/g, '""')}"`,
        `"${(m.productName || '').replace(/"/g, '""')}"`,
        m.type === 'in' ? 'giris' : 'cikis',
        m.qty,
        `"${(m.note || '').replace(/"/g, '""')}"`,
        dateVal ? dateVal.toLocaleDateString('tr-TR') : '',
      ];
    });
    const csv = '﻿' + [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stok_hareketleri_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Excel/CSV Import ────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    const reader = new FileReader();
    reader.onload = ev => {
      const data = ev.target?.result;
      if (isExcel) {
        parseExcel(data as ArrayBuffer);
      } else {
        const text = new TextDecoder('utf-8').decode(data as ArrayBuffer).replace(/^﻿/, '');
        parseCSV(text);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function parseExcel(buf: ArrayBuffer) {
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

    const parsed: ImportRow[] = rows.map((row, idx) => {
      const line = idx + 2;
      const identifier = String(row['Kod'] || row['Barkod'] || '').trim();
      const newStockRaw = row['Yeni Stok'];
      const rawStr = Object.values(row).join(', ');

      if (!identifier) {
        return { line, raw: rawStr, status: 'error' as const, message: 'Kod ve Barkod boş — satır atlandı.' };
      }

      const newStock = Number(newStockRaw);
      if (isNaN(newStock) || newStock < 0 || !Number.isInteger(newStock)) {
        return { line, raw: rawStr, status: 'error' as const, message: `Geçersiz "Yeni Stok" değeri: "${newStockRaw}". Negatif olmayan tam sayı olmalı.` };
      }

      const product = products.find(p =>
        (p.code || '').toLowerCase() === identifier.toLowerCase() ||
        (p.barcode || '') === identifier
      );

      if (!product) {
        return { line, raw: rawStr, status: 'error' as const, message: `Ürün bulunamadı: "${identifier}"` };
      }

      const delta = newStock - product.stock;
      const changeStr = delta === 0 ? 'değişim yok' : delta > 0 ? `+${delta}` : `${delta}`;

      return {
        line, raw: rawStr, status: 'ok' as const,
        message: `${product.name}: ${product.stock} → ${newStock} (${changeStr})`,
        productId: product.id,
        productName: product.name,
        newStock,
        delta,
      };
    });

    setImportRows(parsed);
    setImportOpen(true);
    setImportDone(false);
  }

  function parseCSV(text: string) {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      setImportRows([{ line: 0, raw: '', status: 'error', message: 'Dosya boş veya yalnızca başlık satırı içeriyor.' }]);
      setImportOpen(true);
      setImportDone(false);
      return;
    }

    const dataLines = lines.slice(1);
    const parsed: ImportRow[] = dataLines.map((rawLine, idx) => {
      const line = idx + 2;
      const cols = rawLine.match(/("(?:[^"]|"")*"|[^,]*)/g)?.map(c =>
        c.startsWith('"') ? c.slice(1, -1).replace(/""/g, '"') : c.trim()
      ) ?? [];

      if (cols.length < 3) {
        return { line, raw: rawLine, status: 'error' as const, message: 'Eksik sütun. En az 3 sütun gerekli: Ürün Adı, Kod, Barkod, ..., Mevcut Stok, Yeni Stok' };
      }

      // Expect same column order as Excel export: Ad, Kod, Barkod, Kategori, Mevcut Stok, Yeni Stok
      const identifier = (cols[1] || cols[2] || '').trim();
      const newStockRaw = cols[5]?.trim() ?? '';

      if (!identifier) {
        return { line, raw: rawLine, status: 'error' as const, message: 'Kod ve Barkod boş — satır atlandı.' };
      }

      const newStock = parseInt(newStockRaw);
      if (isNaN(newStock) || newStock < 0) {
        return { line, raw: rawLine, status: 'error' as const, message: `Geçersiz "Yeni Stok" değeri: "${newStockRaw}"` };
      }

      const product = products.find(p =>
        (p.code || '').toLowerCase() === identifier.toLowerCase() ||
        (p.barcode || '') === identifier
      );

      if (!product) {
        return { line, raw: rawLine, status: 'error' as const, message: `Ürün bulunamadı: "${identifier}"` };
      }

      const delta = newStock - product.stock;
      const changeStr = delta === 0 ? 'değişim yok' : delta > 0 ? `+${delta}` : `${delta}`;

      return {
        line, raw: rawLine, status: 'ok' as const,
        message: `${product.name}: ${product.stock} → ${newStock} (${changeStr})`,
        productId: product.id,
        productName: product.name,
        newStock,
        delta,
      };
    });

    setImportRows(parsed);
    setImportOpen(true);
    setImportDone(false);
  }

  async function applyImport() {
    const okRows = importRows.filter(r => r.status === 'ok' && r.delta !== 0);
    if (okRows.length === 0) return;
    setImporting(true);
    try {
      // Add stock_moves for changed rows
      for (const row of okRows) {
        const type = (row.delta! > 0) ? 'in' : 'out';
        await addDoc(collection(db, 'stock_moves'), {
          productId: row.productId,
          productName: row.productName,
          type,
          qty: Math.abs(row.delta!),
          note: 'Excel toplu güncelleme',
          date: serverTimestamp(),
        });
      }

      // Batch update product stocks
      const batch = writeBatch(db);
      for (const row of okRows) {
        batch.update(doc(db, 'products', row.productId!), { stock: row.newStock });
      }
      await batch.commit();

      setImportDone(true);
      load();
      loadProducts();
    } finally {
      setImporting(false);
    }
  }

  const importOkCount = importRows.filter(r => r.status === 'ok').length;
  const importChangedCount = importRows.filter(r => r.status === 'ok' && r.delta !== 0).length;
  const importErrCount = importRows.filter(r => r.status === 'error').length;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Stoklar</div>
          <div className="page-sub">{moves.length} hareket kaydı</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportCSV} title="Hareketleri CSV olarak dışa aktar">
            <IconDownload size={16} /> CSV
          </button>
          <button className="btn btn-secondary" onClick={() => { setImportRows([]); setImportOpen(true); setImportDone(false); }} title="Excel ile toplu stok güncelle">
            <IconUpload size={16} /> İçe Aktar
          </button>
          <button className="btn btn-primary" onClick={() => { setForm({ productId: '', type: 'in', qty: 1, note: '' }); setProductSearch(''); setOpen(true); }}>
            <IconPlus size={16} /> Stok Hareketi
          </button>
        </div>
      </div>

      <div className="page-content">
        {lowStock.length > 0 && (
          <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <IconAlertTriangle size={18} color="#DC2626" style={{ marginTop: 1, flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, color: '#DC2626', fontSize: 13, marginBottom: 4 }}>Düşük Stok Uyarısı ({lowStock.length} ürün)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {lowStock.map(p => (
                  <span key={p.id} style={{
                    background: p.stock <= 3 ? 'rgba(239,68,68,.15)' : 'rgba(217,119,6,.12)',
                    color: p.stock <= 3 ? '#DC2626' : '#D97706',
                    padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  }}>
                    {p.name}: {p.stock} adet
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Movements table */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', gap: 6 }}>
              {(['all', 'in', 'out'] as Filter[]).map(f => (
                <button
                  key={f}
                  className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'Tümü' : f === 'in' ? '↑ Giriş' : '↓ Çıkış'}
                </button>
              ))}
            </div>
          </div>
          <div className="table-wrap">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>Yükleniyor...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>Hareket kaydı bulunamadı</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Tip</th>
                    <th>Ürün</th>
                    <th>Adet</th>
                    <th>Not</th>
                    <th>Tarih</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(m => (
                    <tr key={m.id}>
                      <td>
                        {m.type === 'in'
                          ? <span className="badge badge-green" style={{ gap: 4 }}><IconArrowUp size={11} /> Giriş</span>
                          : <span className="badge badge-red" style={{ gap: 4 }}><IconArrowDown size={11} /> Çıkış</span>
                        }
                      </td>
                      <td style={{ fontWeight: 600 }}>{m.productName}</td>
                      <td style={{ fontWeight: 700, color: m.type === 'in' ? '#16A34A' : '#DC2626' }}>
                        {m.type === 'in' ? '+' : '-'}{m.qty}
                      </td>
                      <td style={{ color: '#888' }}>{m.note || '—'}</td>
                      <td style={{ color: '#888', fontSize: 12 }}>{formatDate(m.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Current stock table with inline edit */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Mevcut Stok Durumu</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Stok adedine tıklayarak düzeltebilirsiniz
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Kod</th>
                  <th>Kategori</th>
                  <th>Mevcut Stok</th>
                  <th>Durum</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {products.sort((a, b) => a.stock - b.stock).map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>
                      {p.code
                        ? <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{p.code}</code>
                        : <span style={{ color: 'var(--text-3)' }}>—</span>
                      }
                    </td>
                    <td>{p.catName ? <span className="badge badge-blue">{p.catName}</span> : '—'}</td>
                    <td>
                      {editingStockId === p.id ? (
                        <input
                          type="number"
                          min={0}
                          value={editingStockVal}
                          autoFocus
                          onFocus={e => e.target.select()}
                          onChange={e => setEditingStockVal(parseInt(e.target.value) || 0)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveInlineStock(p);
                            if (e.key === 'Escape') setEditingStockId(null);
                          }}
                          style={{ width: 80, padding: '4px 8px', background: 'var(--surface-2)', border: '1.5px solid var(--or)', borderRadius: 6, color: 'var(--text-1)', fontSize: 13, fontWeight: 700, outline: 'none' }}
                        />
                      ) : (
                        <span
                          style={{ fontWeight: 700, cursor: 'pointer', borderBottom: '1px dashed rgba(255,255,255,.2)', paddingBottom: 1 }}
                          title="Tıkla: stok düzelt"
                          onClick={() => startEditStock(p)}
                        >
                          {p.stock}
                        </span>
                      )}
                    </td>
                    <td>
                      {p.stock <= 3
                        ? <span className="badge badge-red">Kritik</span>
                        : p.stock <= 10
                        ? <span className="badge badge-amber">Düşük</span>
                        : <span className="badge badge-green">Normal</span>
                      }
                    </td>
                    <td>
                      {editingStockId === p.id ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => saveInlineStock(p)}
                            disabled={savingStock}
                            title="Kaydet"
                          >
                            <IconDeviceFloppy size={13} />
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => setEditingStockId(null)}
                            title="İptal"
                          >
                            <IconX size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => startEditStock(p)}
                          title="Stok Düzelt"
                        >
                          <IconEdit size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Add Move Modal ──────────────────────────────────────────────────── */}
      {open && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Stok Hareketi Ekle</h3>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa' }}><IconX size={20} /></button>
            </div>

            <div className="form-group">
              <label className="form-label">Hareket Tipi</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['in', 'out'] as const).map(t => (
                  <button
                    key={t}
                    className={`btn ${form.type === t ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1 }}
                    onClick={() => setForm(f => ({ ...f, type: t }))}
                  >
                    {t === 'in' ? '↑ Stok Girişi' : '↓ Stok Çıkışı'}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Ürün Ara (Ad, Kod veya Barkod) *</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="form-input"
                  placeholder="Ürün ara..."
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setForm(f => ({ ...f, productId: '' })); }}
                  style={{ flex: 1 }}
                />
                <button
                  title="Kamera ile barkod tara"
                  onClick={() => setScanOpen(true)}
                  style={{ background: 'var(--or-tint)', border: '1px solid rgba(232,93,4,.3)', borderRadius: 8, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: 'var(--or)' }}
                >
                  <IconScan size={17} />
                </button>
              </div>

              {productSearchFiltered.length > 0 && !form.productId && (
                <div style={{ marginTop: 4, background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 8, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                  {productSearchFiltered.map(p => (
                    <div
                      key={p.id}
                      onMouseDown={() => { setForm(f => ({ ...f, productId: p.id! })); setProductSearch(p.name); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.05)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {p.photo
                        ? <img src={p.photo} alt={p.name} style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                        : <div style={{ width: 34, height: 34, background: 'var(--surface-3)', borderRadius: 6, flexShrink: 0 }} />
                      }
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.code || p.barcode || ''} · Stok: {p.stock}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedProduct && (
                <div style={{ marginTop: 8, background: 'rgba(232,93,4,.08)', border: '1px solid rgba(232,93,4,.2)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
                  <span style={{ color: 'var(--or)', fontWeight: 600 }}>{selectedProduct.name}</span>
                  <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>Mevcut stok: <strong style={{ color: 'var(--text-1)' }}>{selectedProduct.stock} adet</strong></span>
                  {form.type === 'out' && form.qty > selectedProduct.stock && (
                    <span style={{ color: '#DC2626', marginLeft: 8 }}>⚠ Stok yetersiz!</span>
                  )}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Adet *</label>
              <input
                className="form-input"
                type="number"
                min={1}
                value={form.qty}
                onFocus={e => e.target.select()}
                onChange={e => setForm(f => ({ ...f, qty: parseInt(e.target.value) || 1 }))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Not</label>
              <input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="İrsaliye no, açıklama..." />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>İptal</button>
              <button
                className="btn btn-primary"
                onClick={save}
                disabled={saving || !form.productId || (form.type === 'out' && form.qty > (selectedProduct?.stock ?? 0))}
              >
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import Modal ────────────────────────────────────────────────────── */}
      {importOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setImportOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Toplu Stok Güncelleme</h3>
              <button onClick={() => setImportOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa' }}><IconX size={20} /></button>
            </div>

            {importRows.length === 0 && (
              <>
                <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 16, marginBottom: 16, fontSize: 13, lineHeight: 1.8 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--text-1)' }}>Nasıl Çalışır?</div>
                  <div style={{ color: 'var(--text-2)' }}>
                    1. Aşağıdaki <strong>"Excel İndir"</strong> butonuyla tüm ürün listesini indirin.<br />
                    2. Excel&apos;de yalnızca <strong style={{ color: 'var(--or)' }}>"Yeni Stok"</strong> sütununu düzenleyin.<br />
                    3. Kod / Barkod sütunlarını değiştirmeyin — eşleştirme için kullanılır.<br />
                    4. Dosyayı kaydedin ve <strong>"Dosya Seç"</strong> ile yükleyin.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={exportStockExcel}>
                    <IconDownload size={15} /> Excel İndir ({products.length} ürün)
                  </button>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10 }}>Excel (.xlsx) veya CSV dosyası yükleyin:</div>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,text/csv" style={{ display: 'none' }} onChange={handleFileChange} />
                  <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => fileRef.current?.click()}>
                    <IconUpload size={16} /> Dosya Seç &amp; Önizle
                  </button>
                </div>
              </>
            )}

            {importRows.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1, background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.2)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#4ADE80' }}>{importChangedCount}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Değişecek ürün</div>
                  </div>
                  <div style={{ flex: 1, background: 'rgba(96,165,250,.08)', border: '1px solid rgba(96,165,250,.2)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#60A5FA' }}>{importOkCount - importChangedCount}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Değişmeyecek</div>
                  </div>
                  <div style={{ flex: 1, background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.2)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#F87171' }}>{importErrCount}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Hata</div>
                  </div>
                </div>

                <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14 }}>
                  {importRows.map((row, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px',
                      borderBottom: '1px solid var(--border)',
                      background: row.status === 'error' ? 'rgba(248,113,113,.04)' : row.delta !== 0 ? 'rgba(74,222,128,.03)' : 'transparent',
                    }}>
                      <div style={{ marginTop: 1, flexShrink: 0 }}>
                        {row.status === 'ok'
                          ? <IconCheck size={14} color={row.delta !== 0 ? '#4ADE80' : '#555'} />
                          : <IconAlertTriangle size={14} color="#F87171" />
                        }
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, color: row.status === 'ok' ? 'var(--text-1)' : '#F87171', fontWeight: 500 }}>{row.message}</div>
                        {row.status === 'error' && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Satır {row.line}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {importDone ? (
                  <div style={{ background: 'rgba(74,222,128,.1)', border: '1px solid rgba(74,222,128,.25)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <IconCheck size={18} color="#4ADE80" />
                    <span style={{ color: '#4ADE80', fontWeight: 600 }}>{importChangedCount} ürünün stoğu başarıyla güncellendi!</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary" onClick={() => { setImportRows([]); setImportDone(false); }}>
                      ← Geri
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={applyImport}
                      disabled={importing || importChangedCount === 0}
                    >
                      {importing ? 'Uygulanıyor...' : `${importChangedCount} Ürünü Güncelle`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Barcode Scanner ──────────────────────────────────────────────────── */}
      {scanOpen && (
        <BarcodeScanner
          onDetect={val => {
            setProductSearch(val);
            setForm(f => ({ ...f, productId: '' }));
            setScanOpen(false);
          }}
          onClose={() => setScanOpen(false)}
        />
      )}
    </>
  );
}
