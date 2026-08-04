'use client';
import { useState, useEffect, useRef } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Product, Category, ProductVariant } from '@/types';
import {
  IconPlus, IconSearch, IconEdit, IconTrash, IconPhoto, IconCamera, IconX, IconRefresh,
  IconDownload, IconScan, IconCopy, IconUpload, IconTemplate,
} from '@tabler/icons-react';
import BarcodeScanner from '@/components/BarcodeScanner';
import { useRates } from '@/hooks/useRates';
import * as XLSX from 'xlsx';

const empty: Omit<Product, 'id'> = {
  name: '', code: '', barcode: '', cost: 0, costUsd: 0, list: 0, stock: 0, photo: '', catName: '',
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

function toAsciiPrefix(str: string): string {
  return str
    .toUpperCase()
    .replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/İ/g, 'I')
    .replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3);
}

function generateCode(prefix: string, products: Product[], catName: string): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const existing = products.filter(p =>
    p.catName === catName && p.code?.startsWith(`${prefix}-${year}-`)
  );
  const seq = (existing.length + 1).toString().padStart(3, '0');
  return `${prefix}-${year}-${seq}`;
}

function generateCodeFromName(name: string, products: Product[]): string {
  const prefix = toAsciiPrefix(name);
  if (!prefix) return '';
  const year = new Date().getFullYear().toString().slice(-2);
  const existing = products.filter(p => p.code?.startsWith(`${prefix}-${year}-`));
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
  const [catFilter, setCatFilter] = useState<string>(''); // '' = Tümü
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
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkType, setBulkType] = useState<'percent' | 'amount'>('percent');
  const [bulkField, setBulkField] = useState<'list' | 'cost'>('list');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  // Ürün detay kartı
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  // Varyantlar
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [varSize, setVarSize] = useState('');
  const [varColor, setVarColor] = useState('');
  const [varStock, setVarStock] = useState('');
  // --- Category mapping (import) ---
  type CatMapping = { importName: string; suggestion: string; selected: string };
  const [catMappingOpen, setCatMappingOpen] = useState(false);
  const [catMappings, setCatMappings] = useState<CatMapping[]>([]);
  const [pendingRows, setPendingRows] = useState<Record<string, unknown>[]>([]);
  const photoRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const { rates } = useRates();
  const usdRate = rates.USD || 1;

  // Ürünün TL maliyetini hesapla (costUsd varsa kur ile çevir)
  function effectiveCost(p: Product): number {
    if (p.cost && p.cost > 0) return p.cost;
    if (p.costUsd && p.costUsd > 0) return p.costUsd * usdRate;
    return 0;
  }

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

  const filtered = products.filter(p => {
    if (catFilter && p.catName !== catFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.name || '').toLowerCase().includes(q) ||
           (p.code || '').toLowerCase().includes(q) ||
           (p.barcode || '').includes(search);
  });

  // Kategorileri ürünlerde kullanılma sırasına göre listele
  const usedCatNames = [...new Set(products.map(p => p.catName).filter(Boolean))];

  function autoCode(catName: string, productName = '') {
    const cat = categories.find(c => c.name === catName);
    if (cat?.prefix) return generateCode(cat.prefix, products, catName);
    if (productName) return generateCodeFromName(productName, products);
    return '';
  }

  function resetVariantInputs() { setVarSize(''); setVarColor(''); setVarStock(''); }

  function openAdd(prefillBarcode?: string) {
    setEditing(null);
    setBarcodeError('');
    setForm({ ...empty, barcode: prefillBarcode ?? generateBarcode(products) });
    setVariants([]);
    resetVariantInputs();
    setCodeManual(false);
    setListManual(false);
    setOpen(true);
    setFabOpen(false);
  }

  function exportCSV() {
    const rows = filtered.map(p => ({
      'Ürün Adı': p.name || '',
      'Kod': p.code || '',
      'Barkod': p.barcode || '',
      'Kategori': p.catName || '',
      'Maliyet (₺)': p.cost ?? 0,
      'Maliyet ($)': p.costUsd ?? 0,
      'Liste Fiyatı (₺)': p.list ?? 0,
      'Stok': p.stock ?? 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ürünler');
    XLSX.writeFile(wb, `urunler_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function downloadTemplate() {
    const example = [{
      'Ürün Adı *': 'Sırt Çantası M',
      'Kategori': 'Çanta',
      'Açıklama': 'Orta boy fermuarlı sırt çantası',
      'Stok Kodu (opsiyonel)': '',
      'Barkod EAN-13 (opsiyonel)': '',
      'Maliyet ($)': 150,
      'Liste Fiyatı (₺)': 0,
      'Liste Fiyatı ($)': 0,
      'Stok Adedi (opsiyonel)': '',
    }];
    const ws = XLSX.utils.json_to_sheet(example);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ürünler');
    XLSX.writeFile(wb, 'urun_iceri_aktar_taslak.xlsx');
  }

  function getImportCol(row: Record<string, unknown>, keyword: string): string {
    const key = Object.keys(row).find(k => k.toLowerCase().includes(keyword.toLowerCase()));
    return key ? String(row[key] ?? '').trim() : '';
  }

  // Basit benzerlik skoru — ortak karakter sayısı / max uzunluk
  function similarityScore(a: string, b: string): number {
    const sa = a.toLowerCase(), sb = b.toLowerCase();
    if (sa === sb) return 1;
    let common = 0;
    for (const ch of sa) if (sb.includes(ch)) common++;
    return common / Math.max(sa.length, sb.length, 1);
  }

  function bestCatMatch(importName: string): string {
    if (!importName) return '';
    const exact = categories.find(c => c.name.toLowerCase() === importName.toLowerCase());
    if (exact) return exact.name;
    let best = '', bestScore = 0;
    for (const c of categories) {
      const score = similarityScore(importName, c.name);
      if (score > bestScore) { bestScore = score; best = c.name; }
    }
    return bestScore > 0.4 ? best : '';
  }

  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

      if (jsonRows.length === 0) { showToast('⚠️ Dosyada veri satırı bulunamadı'); return; }

      // Tanınmayan kategorileri tespit et
      const unknownCats = new Set<string>();
      for (const row of jsonRows) {
        const catName = getImportCol(row, 'kategori');
        if (!catName) continue;
        const exists = categories.some(c => c.name.toLowerCase() === catName.toLowerCase());
        if (!exists) unknownCats.add(catName);
      }

      if (unknownCats.size > 0) {
        // Öneri üret ve mapping modal'ı aç
        const mappings: CatMapping[] = Array.from(unknownCats).map(importName => ({
          importName,
          suggestion: bestCatMatch(importName),
          selected: bestCatMatch(importName) || '__new__',
        }));
        setPendingRows(jsonRows);
        setCatMappings(mappings);
        setCatMappingOpen(true);
        return; // doImport mapping onayı sonrası çağrılacak
      }

      await doImport(jsonRows, []);
    } catch {
      showToast('⚠️ Dosya okunamadı, lütfen taslak formatını kullanın');
    } finally {
      setImporting(false);
    }
  }

  async function doImport(jsonRows: Record<string, unknown>[], mappings: CatMapping[]) {
    let added = 0, skipped = 0;
    const currentProducts = [...products];

    for (const row of jsonRows) {
      const name = getImportCol(row, 'ürün adı') || getImportCol(row, 'ad');
      if (!name) { skipped++; continue; }

      let catName = getImportCol(row, 'kategori');
      // Eşleştirme uygula
      const mapping = mappings.find(m => m.importName.toLowerCase() === catName.toLowerCase());
      if (mapping) {
        catName = mapping.selected === '__new__' ? mapping.importName : mapping.selected;
      }

      const description = getImportCol(row, 'açıklama');
      let   code        = getImportCol(row, 'stok kodu') || getImportCol(row, 'kod');
      let   barcode     = getImportCol(row, 'barkod');
      const costUsd     = parseFloat(getImportCol(row, 'maliyet ($)') || getImportCol(row, 'maliyet') || '0') || 0;
      const listRaw     = parseFloat(getImportCol(row, 'liste fiyatı (₺)') || getImportCol(row, 'liste') || '0');
      const list        = listRaw > 0 ? listRaw : recommendedList(costUsd * usdRate);
      const listUsd     = parseFloat(getImportCol(row, 'liste fiyatı ($)') || '0') || 0;
      const stock       = parseInt(getImportCol(row, 'stok') || '0') || 0;

      if (!barcode || currentProducts.some(p => p.barcode === barcode)) {
        barcode = generateBarcode(currentProducts);
      }
      if (!code) {
        const cat = categories.find(c => c.name === catName);
        if (cat?.prefix) {
          code = generateCode(cat.prefix, currentProducts, catName);
        } else {
          code = generateCodeFromName(name, currentProducts);
        }
      }

      const payload: Record<string, unknown> = {
        name, catName, code, barcode, cost: 0, list, stock, photo: '', createdAt: serverTimestamp(),
      };
      if (description) payload.description = description;
      if (costUsd > 0) payload.costUsd = costUsd;
      if (listUsd > 0) payload.listUsd = listUsd;

      const newDoc = await addDoc(collection(db, 'products'), payload);
      currentProducts.push({ id: newDoc.id, name, catName, code, barcode, cost: 0, costUsd, list, listUsd, stock, photo: '', description });
      added++;
    }

    await load();
    showToast(`✅ ${added} ürün eklendi${skipped > 0 ? `, ${skipped} satır atlandı` : ''}`);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setBarcodeError('');
    setForm({
      name: p.name || '', code: p.code || '', barcode: p.barcode || '',
      cost: p.cost ?? 0, costUsd: p.costUsd ?? 0, list: p.list ?? 0, stock: p.stock ?? 0,
      photo: p.photo || '', catName: p.catName || '',
    });
    setVariants(p.variants ? [...p.variants] : []);
    resetVariantInputs();
    setCodeManual(true);
    setListManual(true);
    setOpen(true);
  }

  function openCopy(p: Product) {
    setEditing(null);
    setBarcodeError('');
    const newBarcode = generateBarcode(products);
    const newCode = p.catName ? autoCode(p.catName) : '';
    setForm({
      name: p.name || '', code: newCode, barcode: newBarcode,
      cost: p.cost ?? 0, costUsd: p.costUsd ?? 0, list: p.list ?? 0, stock: 0,
      photo: p.photo || '', catName: p.catName || '',
    });
    setVariants(p.variants ? p.variants.map(v => ({ ...v })) : []);
    resetVariantInputs();
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
      // Varyant varsa stok = varyant stoklarının toplamı
      const totalStock = variants.length > 0
        ? variants.reduce((s, v) => s + (v.stock || 0), 0)
        : form.stock;
      const payload = { ...form, stock: totalStock, variants: variants.length > 0 ? variants : [] };
      if (editing?.id) {
        await updateDoc(doc(db, 'products', editing.id), payload);
      } else {
        await addDoc(collection(db, 'products'), { ...payload, createdAt: serverTimestamp() });
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

  // Seçim fonksiyonları
  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(p => p.id!)));
    }
  }

  async function bulkDelete() {
    if (!confirm(`${selected.size} ürünü silmek istediğinize emin misiniz?`)) return;
    const batch = writeBatch(db);
    selected.forEach(id => batch.delete(doc(db, 'products', id)));
    await batch.commit();
    setSelected(new Set());
    load();
  }

  async function bulkPriceUpdate() {
    const val = parseFloat(bulkValue);
    if (!val || val === 0) return;
    setBulkSaving(true);
    try {
      const batch = writeBatch(db);
      selected.forEach(id => {
        const p = products.find(x => x.id === id);
        if (!p) return;
        if (bulkField === 'cost') {
          // Maliyet ($) güncelle — sadece tutar olarak
          const currentCostUsd = p.costUsd ?? 0;
          const newCostUsd = Math.max(0, currentCostUsd + val);
          const newList = recommendedList(newCostUsd * usdRate);
          batch.update(doc(db, 'products', id), { costUsd: newCostUsd, list: newList });
        } else {
          // Liste fiyatı güncelle
          let newList: number;
          if (bulkType === 'percent') {
            newList = Math.round(p.list * (1 + val / 100));
          } else {
            newList = Math.round(p.list + val);
          }
          if (newList < 0) newList = 0;
          batch.update(doc(db, 'products', id), { list: newList });
        }
      });
      await batch.commit();
      setBulkOpen(false);
      setBulkValue('');
      setSelected(new Set());
      load();
      showToast(`✅ ${selected.size} ürün güncellendi`);
    } finally {
      setBulkSaving(false);
    }
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

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Ürünler</div>
          <div className="page-sub">{products.length} ürün kayıtlı{someSelected && ` · ${selected.size} seçili`}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={exportCSV} title="Excel olarak dışa aktar">
            <IconDownload size={16} /> <span className="btn-label">Excel</span>
          </button>
          <button className="btn btn-secondary" onClick={downloadTemplate} title="İçeri aktarma taslağı indir">
            <IconTemplate size={16} /> <span className="btn-label">Taslak</span>
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => importRef.current?.click()}
            disabled={importing}
            title="Excel ile içeri aktar"
            style={{ color: 'var(--or)', borderColor: 'rgba(232,93,4,.3)' }}
          >
            <IconUpload size={16} /> <span className="btn-label">{importing ? 'Aktarılıyor...' : 'İçeri Aktar'}</span>
          </button>
          <input ref={importRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportCSV} />
          <button className="btn btn-primary" onClick={() => openAdd()}>
            <IconPlus size={16} /> <span className="btn-label">Yeni Ürün</span>
          </button>
        </div>
      </div>

      {/* Seçili ürün action bar */}
      {someSelected && (
        <div style={{
          background: 'var(--or-tint)', borderBottom: '1px solid rgba(232,93,4,.25)',
          padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--or)', flex: 1 }}>
            {selected.size} ürün seçildi
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => { setBulkOpen(true); setBulkValue(''); }}
            style={{ color: 'var(--or)', borderColor: 'rgba(232,93,4,.4)' }}>
            💰 Fiyat Güncelle
          </button>
          <button className="btn btn-sm" style={{ background: 'rgba(248,113,113,.12)', color: '#F87171' }}
            onClick={bulkDelete}>
            🗑 Sil ({selected.size})
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())}>
            İptal
          </button>
        </div>
      )}

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

          {/* Kategori filtre dropdown */}
          {usedCatNames.length > 0 && (
            <div style={{ padding: '0 16px 12px', borderBottom: '1px solid var(--border)' }}>
              <select
                className="form-input"
                value={catFilter}
                onChange={e => setCatFilter(e.target.value)}
                style={{ maxWidth: 260, height: 36, fontSize: 13 }}
              >
                <option value="">Tüm Kategoriler ({products.length})</option>
                {usedCatNames.map(cat => (
                  <option key={cat} value={cat!}>
                    {cat} ({products.filter(p => p.catName === cat).length})
                  </option>
                ))}
              </select>
            </div>
          )}

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
                    <th style={{ width: 36 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                        style={{ cursor: 'pointer', width: 15, height: 15, accentColor: 'var(--or)' }} />
                    </th>
                    <th>Foto</th><th>Ürün Adı</th><th>Kod</th><th>Barkod</th>
                    <th>Kategori</th><th>Maliyet</th><th>Liste</th><th>Stok</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} onClick={() => setDetailProduct(p)} style={{ background: selected.has(p.id!) ? 'rgba(232,93,4,.06)' : undefined, cursor: 'pointer' }}>
                      <td style={{ width: 36 }}>
                        <input type="checkbox" checked={selected.has(p.id!)}
                          onClick={e => e.stopPropagation()}
                          onChange={() => toggleSelect(p.id!)}
                          style={{ cursor: 'pointer', width: 15, height: 15, accentColor: 'var(--or)' }} />
                      </td>
                      <td>
                        {p.photo
                          ? <img src={p.photo} alt={p.name} style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 8, background: '#fff' }} />
                          : <div style={{ width: 56, height: 56, background: 'var(--surface-2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconPhoto size={22} color="var(--text-3)" /></div>
                        }
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {p.name}
                        {p.variants && p.variants.length > 0 && (
                          <span style={{ marginLeft: 6, fontSize: 10, background: 'rgba(139,92,246,.12)', color: '#8B5CF6', padding: '2px 7px', borderRadius: 5, fontWeight: 700, verticalAlign: 'middle' }}>
                            {p.variants.length} varyant
                          </span>
                        )}
                      </td>
                      <td>{p.code ? <code style={{ background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 4, fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{p.code}</code> : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                      <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{p.barcode || '—'}</td>
                      <td>{p.catName ? <span className="badge badge-blue">{p.catName}</span> : '—'}</td>
                      <td>
                        {p.costUsd && p.costUsd > 0 ? (
                          <span title={`$${p.costUsd} × ${usdRate.toFixed(2)} kur`}>
                            ₺{effectiveCost(p).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                            <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 4 }}>(${p.costUsd})</span>
                          </span>
                        ) : (
                          <span>₺{(p.cost ?? 0).toLocaleString('tr-TR')}</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 700 }}>₺{(p.list ?? 0).toLocaleString('tr-TR')}</td>
                      <td><span style={{ fontWeight: 700, color: p.stock <= 5 ? '#F87171' : p.stock <= 15 ? '#FCD34D' : '#4ADE80' }}>{p.stock}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
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
              <div key={p.id} onClick={() => setDetailProduct(p)} style={{ display: 'flex', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)', alignItems: 'center', background: selected.has(p.id!) ? 'rgba(232,93,4,.06)' : undefined, cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.has(p.id!)} onChange={() => toggleSelect(p.id!)}
                  style={{ cursor: 'pointer', width: 16, height: 16, flexShrink: 0, accentColor: 'var(--or)' }} />
                {p.photo
                  ? <img src={p.photo} alt={p.name} style={{ width: 68, height: 68, objectFit: 'contain', borderRadius: 10, flexShrink: 0, background: '#fff' }} />
                  : <div style={{ width: 68, height: 68, background: 'var(--surface-2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><IconPhoto size={24} color="var(--text-3)" /></div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', marginBottom: 3 }}>{p.name}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {p.code && <code style={{ background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4, fontSize: 10, color: 'var(--text-2)' }}>{p.code}</code>}
                    {p.catName && <span className="badge badge-blue" style={{ fontSize: 10 }}>{p.catName}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-3)' }}>
                      Maliyet: <strong style={{ color: 'var(--text-1)' }}>
                        ₺{effectiveCost(p).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                        {p.costUsd && p.costUsd > 0 && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> (${p.costUsd})</span>}
                      </strong>
                    </span>
                    <span style={{ color: 'var(--text-3)' }}>Liste: <strong style={{ color: 'var(--text-1)' }}>₺{(p.list ?? 0).toLocaleString('tr-TR')}</strong></span>
                    <span style={{ color: 'var(--text-3)' }}>Stok: <strong style={{ color: p.stock <= 5 ? '#F87171' : p.stock <= 15 ? '#FCD34D' : '#4ADE80' }}>{p.stock}</strong></span>
                  </div>
                  {p.variants && p.variants.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                      {p.variants.map((v, i) => (
                        <span key={i} style={{ fontSize: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 5, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                          {v.size} · {v.color} <span style={{ color: 'var(--text-3)' }}>({v.stock})</span>
                        </span>
                      ))}
                    </div>
                  )}
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
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: 'var(--or)', fontWeight: 700 }}>Maliyet ($)</span>
                    <span style={{ fontSize: 10, background: 'var(--or-tint)', color: 'var(--or)', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>Birincil</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="form-input" inputMode="decimal"
                      value={form.costUsd || ''} onFocus={selectAll}
                      placeholder="0"
                      style={{ paddingRight: 30, borderColor: form.costUsd ? 'rgba(232,93,4,.4)' : undefined }}
                      onChange={e => {
                        const costUsd = parseFloat(e.target.value.replace(',', '.')) || 0;
                        setForm(f => ({
                          ...f,
                          costUsd,
                          list: listManual ? f.list : recommendedList(costUsd * usdRate || f.cost),
                        }));
                      }}
                    />
                    <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-3)', fontWeight: 700 }}>$</span>
                  </div>
                  {(form.costUsd ?? 0) > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
                      ≈ ₺{(form.costUsd! * usdRate).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} · kur {usdRate.toFixed(2)}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Maliyet (₺)</label>
                  <input
                    className="form-input" inputMode="decimal"
                    value={form.cost || ''} onFocus={selectAll}
                    placeholder="0"
                    onChange={e => {
                      const cost = parseFloat(e.target.value.replace(',', '.')) || 0;
                      setForm(f => ({
                        ...f,
                        cost,
                        list: listManual ? f.list : recommendedList(cost || (f.costUsd ? f.costUsd * usdRate : 0)),
                      }));
                    }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Liste Fiyatı (₺)</span>
                    {((form.costUsd ?? 0) > 0 || form.cost > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          const base = (form.costUsd ?? 0) > 0 ? form.costUsd! * usdRate : form.cost;
                          setForm(f => ({ ...f, list: recommendedList(base) }));
                          setListManual(false);
                        }}
                        title="Tavsiye fiyatına sıfırla"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--or)', display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 600, padding: 0 }}
                      >
                        <IconRefresh size={11} /> Tavsiye
                      </button>
                    )}
                  </label>
                  <input
                    className="form-input" inputMode="decimal"
                    value={form.list || ''} onFocus={selectAll}
                    placeholder="0"
                    onChange={e => { setListManual(true); set('list', parseFloat(e.target.value.replace(',', '.')) || 0); }}
                    style={{
                      borderColor: !listManual && ((form.costUsd ?? 0) > 0 || form.cost > 0) ? 'rgba(232,93,4,.4)' : undefined,
                      background: !listManual && ((form.costUsd ?? 0) > 0 || form.cost > 0) ? 'rgba(232,93,4,.04)' : undefined,
                    }}
                  />
                  {(() => {
                    const base = (form.costUsd ?? 0) > 0 ? form.costUsd! * usdRate : form.cost;
                    return base > 0 ? (
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.4 }}>
                        {listManual
                          ? `Tavsiye: ₺${recommendedList(base).toLocaleString('tr-TR')} · %${MIN_MARGIN} kâr`
                          : `%${MIN_MARGIN} kâr · %${MAX_DISCOUNT} iskonto sonrası ₺${(form.list * (1 - MAX_DISCOUNT / 100)).toFixed(0)}`
                        }
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
              {variants.length === 0 && (
                <div className="form-row-3" style={{ marginTop: 0 }}>
                  <div className="form-group">
                    <label className="form-label">Stok Adedi</label>
                    <input className="form-input" type="number" min={0} value={form.stock} onFocus={selectAll} onChange={e => set('stock', parseInt(e.target.value) || 0)} />
                  </div>
                </div>
              )}
            </div>

            {/* Varyantlar */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <label className="form-label" style={{ margin: 0, fontWeight: 700 }}>
                  Beden / Renk Varyantları
                </label>
                {variants.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    Toplam stok: <strong style={{ color: 'var(--text-1)' }}>{variants.reduce((s, v) => s + (v.stock || 0), 0)}</strong>
                  </span>
                )}
              </div>

              {/* Varyant ekleme satırı */}
              <div style={{ display: 'flex', gap: 6, marginBottom: variants.length > 0 ? 10 : 0 }}>
                <input
                  className="form-input"
                  placeholder="Beden (S, M, L, 38…)"
                  value={varSize}
                  onChange={e => setVarSize(e.target.value)}
                  style={{ flex: 1, height: 36 }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && varSize && varColor) {
                      e.preventDefault();
                      const stock = parseInt(varStock) || 0;
                      setVariants(v => [...v, { size: varSize.trim(), color: varColor.trim(), stock }]);
                      resetVariantInputs();
                    }
                  }}
                />
                <input
                  className="form-input"
                  placeholder="Renk (Siyah, Kırmızı…)"
                  value={varColor}
                  onChange={e => setVarColor(e.target.value)}
                  style={{ flex: 1, height: 36 }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && varSize && varColor) {
                      e.preventDefault();
                      const stock = parseInt(varStock) || 0;
                      setVariants(v => [...v, { size: varSize.trim(), color: varColor.trim(), stock }]);
                      resetVariantInputs();
                    }
                  }}
                />
                <input
                  className="form-input"
                  type="number" min={0}
                  placeholder="Stok"
                  value={varStock}
                  onChange={e => setVarStock(e.target.value)}
                  onFocus={selectAll}
                  style={{ width: 72, height: 36 }}
                />
                <button
                  type="button"
                  disabled={!varSize.trim() || !varColor.trim()}
                  onClick={() => {
                    const stock = parseInt(varStock) || 0;
                    setVariants(v => [...v, { size: varSize.trim(), color: varColor.trim(), stock }]);
                    resetVariantInputs();
                  }}
                  style={{
                    height: 36, padding: '0 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: varSize.trim() && varColor.trim() ? 'var(--or)' : 'var(--surface-3)',
                    color: varSize.trim() && varColor.trim() ? '#fff' : 'var(--text-3)',
                    fontWeight: 700, fontSize: 18, flexShrink: 0, transition: 'all .15s',
                  }}
                >+</button>
              </div>

              {/* Varyant listesi */}
              {variants.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {variants.map((v, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'var(--surface-2)', borderRadius: 8, padding: '7px 10px',
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', minWidth: 60 }}>{v.size}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>{v.color}</span>
                      <input
                        type="number" min={0}
                        value={v.stock}
                        onChange={e => setVariants(prev => prev.map((x, j) => j === i ? { ...x, stock: parseInt(e.target.value) || 0 } : x))}
                        onFocus={selectAll}
                        style={{
                          width: 64, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-2)',
                          background: 'var(--surface-3)', color: 'var(--text-1)', fontSize: 13, textAlign: 'center',
                        }}
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>adet</span>
                      <button
                        type="button"
                        onClick={() => setVariants(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F87171', padding: 2 }}
                      >
                        <IconX size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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

      {/* Toplu Fiyat Güncelleme Modalı */}
      {bulkOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setBulkOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 18px 14px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Toplu Fiyat Güncelle</h3>
              <button onClick={() => setBulkOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><IconX size={20} /></button>
            </div>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>
                {selected.size} ürün güncellenecek
              </div>

              {/* Alan seçimi: Liste Fiyatı / Maliyet */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                {([['list', '₺ Liste Fiyatı'], ['cost', '$ Maliyet']] as const).map(([f, label]) => (
                  <button key={f} onClick={() => { setBulkField(f); setBulkValue(''); }} style={{
                    padding: '9px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                    border: `2px solid ${bulkField === f ? 'var(--or)' : 'var(--border-2)'}`,
                    background: bulkField === f ? 'var(--or-tint)' : 'transparent',
                    color: bulkField === f ? 'var(--or)' : 'var(--text-2)',
                  }}>{label}</button>
                ))}
              </div>

              {/* Yüzde / Tutar seçimi — sadece liste fiyatında */}
              {bulkField === 'list' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {(['percent', 'amount'] as const).map(t => (
                    <button key={t} onClick={() => setBulkType(t)} style={{
                      padding: '8px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12,
                      border: `1.5px solid ${bulkType === t ? 'var(--or)' : 'var(--border-2)'}`,
                      background: bulkType === t ? 'var(--or-tint)' : 'transparent',
                      color: bulkType === t ? 'var(--or)' : 'var(--text-2)',
                    }}>
                      {t === 'percent' ? '% Yüzde' : '₺ Tutar'}
                    </button>
                  ))}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">
                  {bulkField === 'cost'
                    ? 'Dolar Değişim (+ artış, - azalma)'
                    : bulkType === 'percent' ? 'Yüzde Değişim (+ artış, - indirim)' : 'Tutar Değişim (+ artış, - indirim)'}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    className="form-input"
                    inputMode="decimal"
                    value={bulkValue}
                    onChange={e => setBulkValue(e.target.value.replace(',', '.'))}
                    placeholder={bulkField === 'cost' ? 'örn: 2 veya -1.5' : bulkType === 'percent' ? 'örn: 10 veya -5' : 'örn: 50 veya -20'}
                    style={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }}
                    onFocus={e => e.target.select()}
                  />
                  <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-3)', flexShrink: 0 }}>
                    {bulkField === 'cost' ? '$' : bulkType === 'percent' ? '%' : '₺'}
                  </span>
                </div>
              </div>

              {/* Önizleme */}
              {bulkValue && !isNaN(parseFloat(bulkValue)) && (
                <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
                  {bulkField === 'cost' ? (
                    <>
                      <strong>Örnek:</strong> $10 maliyet → <strong style={{ color: 'var(--or)' }}>${Math.max(0, 10 + parseFloat(bulkValue)).toFixed(2)}</strong>
                      {' '}· Liste: <strong style={{ color: 'var(--or)' }}>₺{recommendedList(Math.max(0, 10 + parseFloat(bulkValue)) * usdRate).toLocaleString('tr-TR')}</strong>
                    </>
                  ) : (
                    <>
                      <strong>Örnek:</strong> ₺100 liste fiyatı →{' '}
                      <strong style={{ color: 'var(--or)' }}>
                        ₺{bulkType === 'percent'
                          ? Math.round(100 * (1 + parseFloat(bulkValue) / 100))
                          : Math.round(100 + parseFloat(bulkValue))}
                      </strong>
                    </>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, padding: '4px 18px 16px' }}>
              <button className="btn btn-secondary" onClick={() => setBulkOpen(false)}>İptal</button>
              <button className="btn btn-primary" onClick={bulkPriceUpdate}
                disabled={bulkSaving || !bulkValue || isNaN(parseFloat(bulkValue)) || parseFloat(bulkValue) === 0}>
                {bulkSaving ? 'Güncelleniyor...' : `${selected.size} Ürünü Güncelle`}
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

      {/* Ürün Detay Kartı */}
      {detailProduct && (() => {
        const p = detailProduct;
        const cost = effectiveCost(p);
        const margin = cost > 0 && p.list > 0 ? (((p.list * 0.45) - cost) / cost * 100) : null;
        return (
          <div className="modal-overlay" onClick={() => setDetailProduct(null)}>
            <div className="modal-box" style={{ maxWidth: 480, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

              {/* Üst bant — turuncu aksan */}
              <div style={{ background: 'linear-gradient(135deg, rgba(232,93,4,.12) 0%, rgba(232,93,4,.03) 100%)', borderBottom: '1px solid var(--border)', padding: '18px 20px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {/* Resim */}
                <div style={{ flexShrink: 0 }}>
                  {p.photo
                    ? <img src={p.photo} alt={p.name} style={{ width: 90, height: 90, objectFit: 'contain', borderRadius: 12, background: '#fff', border: '1px solid var(--border)' }} />
                    : <div style={{ width: 90, height: 90, background: 'var(--surface-2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}><IconPhoto size={32} color="var(--text-3)" /></div>
                  }
                </div>
                {/* İsim + meta */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-1)', lineHeight: 1.3, marginBottom: 6 }}>{p.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {p.catName && <span className="badge badge-blue">{p.catName}</span>}
                    {p.code && <code style={{ fontSize: 10, background: 'var(--surface-3)', padding: '2px 7px', borderRadius: 4, color: 'var(--text-2)' }}>{p.code}</code>}
                    {p.variants && p.variants.length > 0 && (
                      <span style={{ fontSize: 10, background: 'rgba(139,92,246,.12)', color: '#8B5CF6', padding: '2px 7px', borderRadius: 5, fontWeight: 700 }}>{p.variants.length} varyant</span>
                    )}
                  </div>
                  {p.description && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.4 }}>{p.description}</div>}
                </div>
                <button onClick={() => setDetailProduct(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0, padding: 2 }}><IconX size={18} /></button>
              </div>

              {/* Fiyat + Stok satırı */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
                {[
                  { label: 'Maliyet', value: cost > 0 ? `₺${cost.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}` : '—', sub: p.costUsd ? `$${p.costUsd}` : undefined, color: 'var(--text-1)' },
                  { label: 'Liste Fiyatı', value: `₺${(p.list ?? 0).toLocaleString('tr-TR')}`, sub: undefined, color: 'var(--or)' },
                  { label: 'Stok', value: String(p.stock), sub: p.stock <= 5 ? 'Kritik' : p.stock <= 15 ? 'Düşük' : 'Yeterli', color: p.stock <= 5 ? '#F87171' : p.stock <= 15 ? '#FCD34D' : '#4ADE80' },
                ].map(item => (
                  <div key={item.label} style={{ padding: '14px 16px', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: item.color }}>{item.value}</div>
                    {item.sub && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{item.sub}</div>}
                  </div>
                ))}
              </div>

              {/* Kâr marjı */}
              {margin !== null && (
                <div style={{ padding: '10px 20px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>%55 iskonto sonrası kâr marjı</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: margin >= 10 ? '#4ADE80' : '#F87171' }}>%{margin.toFixed(1)}</span>
                  {margin < 10 && <span style={{ fontSize: 10, color: '#F87171' }}>⚠ Minimum %10 altında</span>}
                </div>
              )}

              {/* Barkod */}
              {p.barcode && (
                <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Barkod</span>
                  <code style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: 1 }}>{p.barcode}</code>
                </div>
              )}

              {/* Varyantlar */}
              {p.variants && p.variants.length > 0 && (
                <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>Varyantlar</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
                    {p.variants.map((v, i) => (
                      <div key={i} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{v.size}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>{v.color}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: v.stock <= 0 ? '#F87171' : '#4ADE80', marginTop: 4 }}>{v.stock} adet</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Aksiyonlar */}
              <div style={{ display: 'flex', gap: 8, padding: '14px 20px' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setDetailProduct(null); openEdit(p); }}>
                  <IconEdit size={15} /> Düzenle
                </button>
                <button className="btn btn-secondary" style={{ flex: 1, color: 'var(--or)' }} onClick={() => { setDetailProduct(null); openCopy(p); }}>
                  <IconCopy size={15} /> Kopyala
                </button>
                <button className="btn btn-sm" style={{ background: 'rgba(248,113,113,.1)', color: '#F87171', padding: '0 16px' }}
                  onClick={() => { setDetailProduct(null); remove(p.id!); }}>
                  <IconTrash size={15} />
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Kategori Eşleştirme Modalı */}
      {catMappingOpen && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setCatMappingOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 18px 14px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Kategori Eşleştirme</h3>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  Dosyada tanımadığım kategoriler var. Her biri için eşleştirme seçin.
                </div>
              </div>
              <button onClick={() => setCatMappingOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><IconX size={20} /></button>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {catMappings.map((m, i) => (
                <div key={m.importName} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--or)', background: 'var(--or-tint)', padding: '2px 8px', borderRadius: 4 }}>
                      Dosyadan
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>{m.importName}</span>
                  </div>
                  <label style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, display: 'block' }}>Eşleştir →</label>
                  <select
                    className="form-input"
                    value={m.selected}
                    onChange={e => {
                      const updated = [...catMappings];
                      updated[i] = { ...updated[i], selected: e.target.value };
                      setCatMappings(updated);
                    }}
                    style={{ fontSize: 13 }}
                  >
                    <option value="__new__">➕ Yeni kategori olarak ekle ({m.importName})</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.name}>
                        {c.name}{m.suggestion === c.name ? ' ✓ (önerilen)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, padding: '4px 18px 16px' }}>
              <button className="btn btn-secondary" onClick={() => setCatMappingOpen(false)}>İptal</button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  setCatMappingOpen(false);
                  setImporting(true);
                  try {
                    await doImport(pendingRows, catMappings);
                  } catch {
                    showToast('⚠️ Aktarım sırasında hata oluştu');
                  } finally {
                    setImporting(false);
                  }
                }}
              >
                Onayla &amp; Aktar ({pendingRows.length} ürün)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
