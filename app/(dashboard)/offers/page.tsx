'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Offer, OfferItem, Product, MainSettings } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { useRates } from '@/hooks/useRates';
import {
  IconPlus, IconX, IconTrash, IconSearch, IconCheck, IconFileText,
  IconBrandWhatsapp, IconMail, IconPrinter, IconChevronDown,
  IconTrendingUp, IconLoader2, IconUserCheck, IconEdit,
} from '@tabler/icons-react';
import { generateOfferHtml } from '@/lib/offerPdf';
import Pagination from '@/components/Pagination';

const DEFAULT_DISCOUNTS = [
  { qty: 1000, rate: 55 }, { qty: 500, rate: 50 }, { qty: 200, rate: 40 },
  { qty: 100, rate: 35 }, { qty: 50, rate: 30 }, { qty: 40, rate: 25 },
  { qty: 30, rate: 22 }, { qty: 20, rate: 18 }, { qty: 10, rate: 15 },
];

type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP';
const CURRENCY_SYMBOLS: Record<Currency, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };

function getDiscount(qty: number, discounts = DEFAULT_DISCOUNTS): number {
  return discounts.find(d => qty >= d.qty)?.rate ?? 0;
}

export default function OffersPage() {
  const { user } = useAuth();
  const { rates } = useRates();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<MainSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // form state
  const [customer, setCustomer] = useState('');
  const [note, setNote] = useState('');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const prevCurrencyRef = useRef<Currency>('TRY');
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [items, setItems] = useState<OfferItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [catAddMode, setCatAddMode] = useState(false); // kategori ile toplu ekleme modu
  const [selCat, setSelCat] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingOffer, setEditingOffer] = useState<Offer | null>(null);
  const [showSubtotal, setShowSubtotal] = useState(true);
  const [offerSearch, setOfferSearch] = useState('');
  const [offerPage, setOfferPage] = useState(1);
  const PAGE_SIZE = 20;
  const [pdfLoading, setPdfLoading] = useState<string | null>(null);
  // PDF preview modal
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string; offer: Offer } | null>(null);

  useEffect(() => { load(); loadProducts(); loadSettings(); }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  async function load() {
    setLoading(true);
    const snap = await getDocs(query(collection(db, 'offers'), orderBy('date', 'desc')));
    setOffers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Offer)));
    setLoading(false);
  }

  async function loadProducts() {
    const snap = await getDocs(collection(db, 'products'));
    setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
  }

  async function loadSettings() {
    try {
      const snap = await getDocs(collection(db, 'settings'));
      const main = snap.docs.find(d => d.id === 'main');
      if (main) setSettings(main.data() as MainSettings);
    } catch {}
  }

  // Exchange rate: TRY per 1 foreign unit
  function toTRY(amount: number): number {
    if (currency === 'TRY') return amount;
    return amount * rates[currency as keyof typeof rates];
  }

  function fromTRY(amount: number): number {
    if (currency === 'TRY') return amount;
    return amount / rates[currency as keyof typeof rates];
  }

  function changeCurrency(next: Currency) {
    const prev = prevCurrencyRef.current;
    prevCurrencyRef.current = next;
    setCurrency(next);
    if (items.length === 0) return;
    // Önce eski currency'den TRY'ye, sonra TRY'den yeni currency'ye çevir
    const prevRate = prev === 'TRY' ? 1 : rates[prev as keyof typeof rates];
    const nextRate = next === 'TRY' ? 1 : rates[next as keyof typeof rates];
    setItems(cur => cur.map(i => ({
      ...i,
      listPrice: parseFloat(((i.listPrice * prevRate) / nextRate).toFixed(2)),
      finalPrice: parseFloat(((i.finalPrice * prevRate) / nextRate).toFixed(2)),
    })));
  }

  const sym = CURRENCY_SYMBOLS[currency];
  const discountTiers = settings?.discounts ?? DEFAULT_DISCOUNTS;
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const discountRate = discountEnabled ? getDiscount(totalQty, discountTiers) : 0;

  // Computed items: finalPrice is either discount-computed or manually set
  const computedItems: OfferItem[] = items.map(i => ({
    ...i,
    discountRate,
    finalPrice: discountEnabled
      ? parseFloat((i.listPrice * (1 - discountRate / 100)).toFixed(2))
      : i.finalPrice, // manual when discount off
  }));

  const subtotal = computedItems.reduce((s, i) => s + i.listPrice * i.qty, 0);
  const total = computedItems.reduce((s, i) => s + i.finalPrice * i.qty, 0);
  // Cost in display currency
  const totalCostTRY = computedItems.reduce((s, i) => s + i.cost * i.qty, 0);
  const totalCost = fromTRY(totalCostTRY);
  const totalSaleTRY = toTRY(total);
  const profit = totalSaleTRY - totalCostTRY;
  const margin = totalSaleTRY > 0 ? (profit / totalSaleTRY) * 100 : 0;

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.code.toLowerCase().includes(productSearch.toLowerCase())
  );

  function addItem(p: Product) {
    const listInCurrency = parseFloat(fromTRY(p.list).toFixed(2));
    setItems(c => {
      const ex = c.find(i => i.productId === p.id);
      if (ex) return c.map(i => i.productId === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...c, {
        productId: p.id!, name: p.name, qty: 1,
        listPrice: listInCurrency,
        cost: p.cost, // always stored in TRY
        discountRate: 0,
        finalPrice: listInCurrency,
        photo: p.photo || '',
      }];
    });
    setProductSearch('');
    setSearchFocused(false);
  }

  function addByCategory(catName: string) {
    const catProducts = products.filter(p => p.catName === catName);
    for (const p of catProducts) addItem(p);
    setCatAddMode(false);
  }

  function removeItem(pid: string) { setItems(c => c.filter(i => i.productId !== pid)); }
  function setQty(pid: string, qty: number) { if (qty >= 1) setItems(c => c.map(i => i.productId === pid ? { ...i, qty } : i)); }
  function setListPrice(pid: string, price: number) {
    setItems(c => c.map(i => i.productId === pid ? { ...i, listPrice: price, finalPrice: discountEnabled ? price * (1 - discountRate / 100) : i.finalPrice } : i));
  }
  function setFinalPrice(pid: string, price: number) {
    setItems(c => c.map(i => i.productId === pid ? { ...i, finalPrice: price } : i));
  }

  function openEditModal(offer: Offer) {
    const offerCurrency = (offer as Offer & { currency?: Currency }).currency ?? 'TRY';
    const offerRate = offerCurrency !== 'TRY' ? rates[offerCurrency as keyof typeof rates] : 1;
    // Items are stored in TRY — convert to offer currency for display
    const loadedItems: OfferItem[] = offer.items.map(i => ({
      ...i,
      listPrice: parseFloat((i.listPrice / offerRate).toFixed(2)),
      finalPrice: parseFloat((i.finalPrice / offerRate).toFixed(2)),
    }));
    setEditingOffer(offer);
    setCustomer(offer.customer);
    setNote(offer.note || '');
    setCurrency(offerCurrency);
    prevCurrencyRef.current = offerCurrency;
    setDiscountEnabled(offer.discountEnabled ?? false);
    setShowSubtotal(offer.showSubtotal !== false);
    setItems(loadedItems);
    setOpen(true);
  }

  async function save() {
    if (!customer.trim() || items.length === 0) return;
    setSaving(true);
    try {
      const itemsToSave: OfferItem[] = computedItems.map(i => ({
        ...i,
        listPrice: parseFloat(toTRY(i.listPrice).toFixed(2)),
        finalPrice: parseFloat(toTRY(i.finalPrice).toFixed(2)),
      }));
      const totalTRY = parseFloat(toTRY(total).toFixed(2));

      if (editingOffer) {
        await updateDoc(doc(db, 'offers', editingOffer.id!), {
          customer, note,
          items: itemsToSave,
          total: totalTRY,
          currency, exchangeRate: currency !== 'TRY' ? rates[currency as keyof typeof rates] : 1,
          discountEnabled, discountRate,
          showSubtotal,
        });
      } else {
        const no = `TKL-${Date.now().toString().slice(-6)}`;
        await addDoc(collection(db, 'offers'), {
          no, customer, note,
          by: user?.displayName || user?.email?.split('@')[0] || 'admin',
          items: itemsToSave,
          total: totalTRY,
          currency, exchangeRate: currency !== 'TRY' ? rates[currency as keyof typeof rates] : 1,
          discountEnabled, discountRate,
          showSubtotal,
          status: 'pending',
          date: serverTimestamp(),
        });
      }
      await load();
      setOpen(false);
      resetForm();
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setCustomer(''); setNote(''); setItems([]);
    setDiscountEnabled(false); setProductSearch('');
    setCurrency('TRY');
    prevCurrencyRef.current = 'TRY';
    setShowSubtotal(true);
    setEditingOffer(null);
  }

  async function approve(id: string) {
    const approvedBy = user?.displayName || user?.email?.split('@')[0] || 'Bilinmiyor';
    await updateDoc(doc(db, 'offers', id), { status: 'approved', approvedBy });
    load();
  }
  async function reject(id: string) { await updateDoc(doc(db, 'offers', id), { status: 'rejected' }); load(); }
  async function removeOffer(id: string) {
    if (!confirm('Bu teklifi silmek istediğinize emin misiniz?')) return;
    await deleteDoc(doc(db, 'offers', id));
    load();
  }

  function formatDate(ts: unknown) {
    if (!ts) return '—';
    const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
    return d.toLocaleDateString('tr-TR');
  }

  function getFirmInfo(logoDataUrl?: string) {
    return {
      name: settings?.firmName || 'Çalışkan Çanta',
      address: settings?.firmAddress || '',
      phone: settings?.firmPhone || '',
      email: settings?.firmEmail || '',
      terms: settings?.offerTerms || '',
      bankInfo: settings?.bankInfo || '',
      invoiceInfo: settings?.invoiceInfo || '',
      logoDataUrl,
    };
  }

  async function getLogoDataUrl(): Promise<string | undefined> {
    try {
      const res = await fetch('/logo.png');
      const blob = await res.blob();
      return await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target?.result as string);
        reader.readAsDataURL(blob);
      });
    } catch { return undefined; }
  }

  function closePdfPreview() {
    if (pdfPreview) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview(null);
  }

  async function openPdfPreview(offer: Offer) {
    setPdfLoading(offer.id!);
    try {
      const logo = await getLogoDataUrl();
      const html = generateOfferHtml(offer, getFirmInfo(logo));
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      // iOS Safari blob URL'yi iframe'de gösteremiyor — yeni sekmede aç
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        const w = window.open(url, '_blank');
        if (!w) alert('Lütfen pop-up engelleyicisini kapatın.');
        setPdfLoading(null);
        return;
      }

      setPdfPreview({ url, filename: `Teklif-${offer.no}.pdf`, offer });
    } catch (err) {
      console.error('Önizleme hatası:', err);
      alert(`Önizleme açılamadı: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPdfLoading(null);
    }
  }

  // Called from inside the preview modal
  function downloadCurrentPdf() {
    if (!pdfPreview) return;
    // Open in new window → browser print dialog → "PDF olarak kaydet"
    const w = window.open(pdfPreview.url, '_blank', 'width=900,height=700');
    if (w) {
      w.addEventListener('load', () => {
        setTimeout(() => w.print(), 300);
      });
    }
  }

  const [shareLoading, setShareLoading] = useState(false);

  async function sharePdfWhatsapp() {
    if (!pdfPreview || shareLoading) return;
    const offer = pdfPreview.offer;
    const filename = `Teklif-${offer.no}.pdf`;
    setShareLoading(true);

    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: html2canvas } = await import('html2canvas');

      // Gizli container — ürün fotoğrafları CORS sorununu aşmak için crossOrigin ayarı
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;z-index:-1;';
      const logo = await getLogoDataUrl();
      container.innerHTML = generateOfferHtml(offer, getFirmInfo(logo));

      // Ürün img'lerini crossOrigin anonymous yap
      container.querySelectorAll('img').forEach(img => {
        img.crossOrigin = 'anonymous';
      });

      document.body.appendChild(container);
      await new Promise(r => setTimeout(r, 600));

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 5000,
        onclone: (doc) => {
          // clone'daki img'lerin yüklenmesini bekle
          doc.querySelectorAll('img').forEach((img: HTMLImageElement) => {
            img.crossOrigin = 'anonymous';
          });
        },
      });
      document.body.removeChild(container);

      const imgData = canvas.toDataURL('image/jpeg', 0.90);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pdfW) / canvas.width;

      if (imgH <= pageH) {
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, imgH);
      } else {
        let remainY = 0;
        while (remainY < imgH) {
          if (remainY > 0) pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, -remainY, pdfW, imgH);
          remainY += pageH;
        }
      }

      const pdfBlob = pdf.output('blob');
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        // Mobil: native paylaşım
        await navigator.share({ files: [file], title: filename });
      } else {
        // Masaüstü: PDF indir + WhatsApp Web'i aç
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        // Teklif özetini WhatsApp Web'e gönder
        const offerSym = CURRENCY_SYMBOLS[(offer as Offer & { currency?: Currency }).currency ?? 'TRY'] ?? '₺';
        const lines = offer.items.map(i =>
          `• ${i.name} x${i.qty} = ${offerSym}${((i.finalPrice ?? i.listPrice ?? 0) * i.qty).toFixed(2)}`
        ).join('\n');
        const msg = `*Teklif ${offer.no}*\nMüşteri: ${offer.customer}\n\n${lines}\n\n*TOPLAM: ${offerSym}${offer.total.toFixed(2)}*\n\n_(PDF ekte)_`;
        setTimeout(() => {
          window.open(`https://web.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
        }, 500);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return; // kullanıcı iptal etti
      console.error('PDF paylaşım hatası:', err);
      alert('PDF oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
      setShareLoading(false);
    }
  }

  function whatsappFromPreview() {
    if (!pdfPreview) return;
    const offer = pdfPreview.offer;
    const offerSym = CURRENCY_SYMBOLS[(offer as Offer & { currency?: Currency }).currency ?? 'TRY'] ?? '₺';
    const lines = offer.items.map(i =>
      `• ${i.name} x${i.qty} = ${offerSym}${((i.finalPrice ?? i.listPrice ?? 0) * i.qty).toFixed(2)}`
    ).join('\n');
    const msg = `*Teklif ${offer.no}*\nMüşteri: ${offer.customer}\n\n${lines}\n\n*TOPLAM: ${offerSym}${offer.total.toFixed(2)}*`;
    // Desktop: open wa.me with text (user forwards the downloaded PDF manually if needed)
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function emailFromPreview() {
    if (!pdfPreview) return;
    const offer = pdfPreview.offer;
    const offerSym = CURRENCY_SYMBOLS[(offer as Offer & { currency?: Currency }).currency ?? 'TRY'] ?? '₺';
    const lines = offer.items.map(i =>
      `${i.name} x${i.qty} = ${offerSym}${((i.finalPrice ?? i.listPrice ?? 0) * i.qty).toFixed(2)}`
    ).join('\n');
    const body = `Teklif No: ${offer.no}\nMüşteri: ${offer.customer}\n\n${lines}\n\nTOPLAM: ${offerSym}${offer.total.toFixed(2)}\n\nTeklif PDF ekte yer almaktadır.`;
    window.open(`mailto:?subject=${encodeURIComponent(`Teklif ${offer.no}`)}&body=${encodeURIComponent(body)}`, '_blank');
  }

  const filteredOffers = offerSearch.trim()
    ? offers.filter(o =>
        o.no.toLowerCase().includes(offerSearch.toLowerCase()) ||
        o.customer.toLowerCase().includes(offerSearch.toLowerCase())
      )
    : offers;
  const pagedOffers = filteredOffers.slice((offerPage - 1) * PAGE_SIZE, offerPage * PAGE_SIZE);

  const viewOffer = offers.find(o => o.id === viewId);
  const showDropdown = searchFocused && productSearch.length > 0 && filteredProducts.length > 0;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Teklifler</div>
          <div className="page-sub">{offers.filter(o => o.status === 'pending').length} açık teklif</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <IconSearch size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              className="form-input"
              placeholder="Teklif no veya müşteri ara..."
              value={offerSearch}
              onChange={e => { setOfferSearch(e.target.value); setOfferPage(1); }}
              style={{ paddingLeft: 32, height: 36, width: 220, fontSize: 13 }}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <IconPlus size={16} /> Yeni Teklif
          </button>
        </div>
      </div>
      <button className="mob-fab" onClick={() => setOpen(true)} aria-label="Yeni Teklif">
        <IconPlus size={22} />
      </button>

      <div className="page-content">
        <div className="card">
          {/* Desktop table */}
          <div className="table-wrap mob-hide-table">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Yükleniyor...</div>
            ) : filteredOffers.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>{offerSearch ? 'Arama sonucu bulunamadı' : 'Teklif bulunamadı'}</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Teklif No</th>
                    <th>Müşteri</th>
                    <th>Hazırlayan</th>
                    <th>Toplam</th>
                    <th>Durum</th>
                    <th>Tarih</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedOffers.map(o => (
                    <tr key={o.id}>
                      <td><code style={{ fontSize: 11, background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 4, color: 'var(--text-2)' }}>{o.no}</code></td>
                      <td style={{ fontWeight: 600 }}>{o.customer}</td>
                      <td style={{ color: 'var(--text-3)' }}>{o.by}</td>
                      <td style={{ fontWeight: 700 }}>
                        {CURRENCY_SYMBOLS[(o as Offer & {currency?: Currency}).currency ?? 'TRY']}{o.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        {o.status === 'pending'
                          ? <span className="badge badge-amber">Bekliyor</span>
                          : o.status === 'approved'
                            ? <div>
                                <span className="badge badge-green">Onaylandı</span>
                                {o.approvedBy && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 3, fontSize: 11, color: 'var(--text-3)' }}>
                                    <IconUserCheck size={11} />
                                    {o.approvedBy}
                                  </div>
                                )}
                              </div>
                            : <span className="badge badge-red">Reddedildi</span>}
                      </td>
                      <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{formatDate(o.date)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setViewId(o.id!)} title="Görüntüle"><IconFileText size={13} /></button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openPdfPreview(o)}
                            title="PDF Önizle &amp; Paylaş"
                            disabled={pdfLoading === o.id}
                            style={{ gap: 4 }}
                          >
                            {pdfLoading === o.id
                              ? <IconLoader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                              : <IconPrinter size={13} />
                            }
                          </button>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(o)} title="Düzenle"><IconEdit size={13} /></button>
                          {o.status === 'pending' && (
                            <>
                              <button className="btn btn-sm" style={{ background: 'rgba(34,197,94,.12)', color: '#4ADE80' }} onClick={() => approve(o.id!)} title="Onayla"><IconCheck size={13} /></button>
                              <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,.1)', color: '#F87171' }} onClick={() => reject(o.id!)} title="Reddet"><IconX size={13} /></button>
                            </>
                          )}
                          <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,.1)', color: '#F87171' }} onClick={() => removeOffer(o.id!)} title="Teklifi Sil"><IconTrash size={13} /></button>
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
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Yükleniyor...</div>
            ) : filteredOffers.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>{offerSearch ? 'Arama sonucu bulunamadı' : 'Teklif bulunamadı'}</div>
            ) : pagedOffers.map(o => {
              const offerSym = CURRENCY_SYMBOLS[(o as Offer & {currency?: Currency}).currency ?? 'TRY'] ?? '₺';
              return (
                <div key={o.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', marginBottom: 2 }}>{o.customer}</div>
                      <code style={{ fontSize: 10, background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4, color: 'var(--text-3)' }}>{o.no}</code>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--or)' }}>{offerSym}{o.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{formatDate(o.date)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      {o.status === 'pending'
                        ? <span className="badge badge-amber">Bekliyor</span>
                        : o.status === 'approved'
                        ? <span className="badge badge-green">Onaylandı</span>
                        : <span className="badge badge-red">Reddedildi</span>
                      }
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setViewId(o.id!)} title="Görüntüle"><IconFileText size={13} /></button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => openPdfPreview(o)}
                        disabled={pdfLoading === o.id}
                        title="PDF"
                      >
                        {pdfLoading === o.id ? <IconLoader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <IconPrinter size={13} />}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(o)} title="Düzenle"><IconEdit size={13} /></button>
                      {o.status === 'pending' && (
                        <>
                          <button className="btn btn-sm" style={{ background: 'rgba(34,197,94,.12)', color: '#4ADE80' }} onClick={() => approve(o.id!)} title="Onayla"><IconCheck size={13} /></button>
                          <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,.1)', color: '#F87171' }} onClick={() => reject(o.id!)} title="Reddet"><IconX size={13} /></button>
                        </>
                      )}
                      <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,.1)', color: '#F87171' }} onClick={() => removeOffer(o.id!)} title="Sil"><IconTrash size={13} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={offerPage} total={filteredOffers.length} pageSize={PAGE_SIZE} onChange={p => { setOfferPage(p); window.scrollTo(0,0); }} />
        </div>
      </div>

      {/* ══════════════ CREATE OFFER MODAL ══════════════ */}
      {open && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 760, width: '100%', maxHeight: '95dvh', overflowY: 'auto', overflowX: 'hidden' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 10, padding: '16px 0 12px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>{editingOffer ? `Teklif Düzenle — ${editingOffer.no}` : 'Yeni Teklif Oluştur'}</h3>
              <button onClick={() => { setOpen(false); resetForm(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><IconX size={20} /></button>
            </div>

            {/* Row 1: Customer + Note + Currency */}
            <div className="form-row-2-auto" style={{ marginBottom: 16 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Müşteri Adı *</label>
                <input className="form-input" value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Müşteri adı" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Not / Koşul</label>
                <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="Opsiyonel not" />
              </div>
              {/* Currency selector */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Döviz</label>
                <div style={{ position: 'relative' }}>
                  <select
                    className="form-input"
                    value={currency}
                    onChange={e => changeCurrency(e.target.value as Currency)}
                    style={{ paddingRight: 28, appearance: 'none', cursor: 'pointer', minWidth: 100 }}
                  >
                    <option value="TRY">₺ TRY</option>
                    <option value="USD">$ USD</option>
                    <option value="EUR">€ EUR</option>
                    <option value="GBP">£ GBP</option>
                  </select>
                  <IconChevronDown size={14} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                </div>
                {currency !== 'TRY' && (
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
                    1 {currency} = ₺{rates[currency as keyof typeof rates]?.toFixed(2)}
                  </div>
                )}
              </div>
            </div>

            {/* Product search */}
            <div className="form-group" ref={searchRef}>
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Ürün Ekle</span>
                <button
                  type="button"
                  onClick={() => { setCatAddMode(m => !m); setProductSearch(''); setSearchFocused(false); }}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: catAddMode ? 'var(--or)' : 'var(--surface-2)',
                    color: catAddMode ? '#fff' : 'var(--text-2)',
                  }}
                >
                  {catAddMode ? '✕ Kategoriden Ekle' : '+ Kategoriden Ekle'}
                </button>
              </label>

              {catAddMode ? (
                (() => {
                  const cats = [...new Set(products.map(p => p.catName).filter(Boolean))] as string[];
                  const activeCat = selCat || cats[0] || '';
                  const catProds = products.filter(p => p.catName === activeCat);
                  const alreadyIn = catProds.filter(p => items.some(i => i.productId === p.id)).length;
                  return (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select
                        className="form-input"
                        value={activeCat}
                        onChange={e => setSelCat(e.target.value)}
                        style={{ flex: 1, height: 40, fontSize: 13 }}
                      >
                        {cats.map(cat => {
                          const n = products.filter(p => p.catName === cat).length;
                          return <option key={cat} value={cat}>{cat} ({n} ürün)</option>;
                        })}
                      </select>
                      <button
                        className="btn btn-primary"
                        style={{ height: 40, whiteSpace: 'nowrap', flexShrink: 0 }}
                        onClick={() => addByCategory(activeCat)}
                        disabled={!activeCat}
                      >
                        + Tümünü Ekle {alreadyIn > 0 ? `(${alreadyIn} ekli)` : `(${catProds.length})`}
                      </button>
                    </div>
                  );
                })()
              ) : (
              <div style={{ position: 'relative' }}>
                <IconSearch size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', zIndex: 1 }} />
                <input
                  className="form-input"
                  style={{ paddingLeft: 32 }}
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  placeholder="Ürün adı veya kod yazın..."
                />
                {showDropdown && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-2)',
                    borderRadius: 10, marginTop: 4,
                    maxHeight: 220, overflowY: 'auto',
                    boxShadow: '0 8px 24px rgba(0,0,0,.4)',
                  }}>
                    {filteredProducts.map((p, idx) => (
                      <div
                        key={p.id}
                        onMouseDown={() => addItem(p)}
                        style={{
                          padding: '8px 12px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 10,
                          borderBottom: idx < filteredProducts.length - 1 ? '1px solid var(--border)' : 'none',
                          fontSize: 13, transition: 'background .1s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,93,4,.08)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        {/* Ürün resmi */}
                        {p.photo
                          ? <img src={p.photo} alt={p.name} style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 8, flexShrink: 0, background: '#fff' }} />
                          : <div style={{ width: 56, height: 56, background: 'var(--surface-3)', borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <IconSearch size={18} color="var(--text-3)" />
                            </div>
                        }
                        {/* Ürün bilgisi */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 2, alignItems: 'center' }}>
                            {p.code && <code style={{ fontSize: 10, background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 3, color: 'var(--text-3)' }}>{p.code}</code>}
                            {p.catName && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{p.catName}</span>}
                            <span style={{ fontSize: 10, color: p.stock <= 5 ? '#F87171' : 'var(--text-3)' }}>Stok: {p.stock}</span>
                          </div>
                        </div>
                        {/* Fiyat */}
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontWeight: 700, color: 'var(--or)' }}>{sym}{fromTRY(p.list).toFixed(2)}</div>
                          {currency !== 'TRY' && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>₺{p.list.toFixed(0)}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>

            {/* Items — desktop table / mobile cards */}
            {items.length > 0 && (
              <>
                {/* Desktop table */}
                <div className="mob-hide-table" style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                  <table style={{ minWidth: 480 }}>
                    <thead>
                      <tr>
                        <th>Ürün</th>
                        <th style={{ width: 64 }}>Adet</th>
                        <th style={{ width: 100 }}>Liste ({sym})</th>
                        <th style={{ width: 70 }}>İskonto</th>
                        <th style={{ width: 100 }}>{discountEnabled ? `Net (${sym})` : `Satış (${sym})`}</th>
                        <th style={{ width: 32 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {computedItems.map(item => {
                        const itemCostTRY = item.cost * item.qty;
                        const itemSaleTRY = toTRY(item.finalPrice * item.qty);
                        const itemProfit = itemSaleTRY - itemCostTRY;
                        const itemMargin = itemSaleTRY > 0 ? (itemProfit / itemSaleTRY) * 100 : 0;
                        return (
                          <tr key={item.productId}>
                            <td>
                              <div style={{ fontWeight: 500, color: 'var(--text-1)', fontSize: 13 }}>{item.name}</div>
                              <div style={{ fontSize: 10, color: itemMargin >= 0 ? '#4ADE80' : '#F87171', marginTop: 2 }}>
                                Kar: %{itemMargin.toFixed(1)} · ₺{itemProfit.toFixed(0)}
                              </div>
                            </td>
                            <td>
                              <input type="number" min={1} value={item.qty}
                                onChange={e => setQty(item.productId, parseInt(e.target.value) || 1)}
                                onFocus={e => e.target.select()}
                                style={{ width: 56, padding: '4px 6px', background: 'var(--surface-3)', border: '1px solid var(--border-2)', borderRadius: 6, fontSize: 13, color: 'var(--text-1)', textAlign: 'center' }} />
                            </td>
                            <td>
                              <input inputMode="decimal" min={0} value={item.listPrice}
                                onChange={e => setListPrice(item.productId, parseFloat(e.target.value.replace(',', '.')) || 0)}
                                style={{ width: 90, padding: '4px 8px', background: 'var(--surface-3)', border: '1px solid var(--border-2)', borderRadius: 6, fontSize: 13, color: 'var(--text-1)' }} />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {discountEnabled && discountRate > 0
                                ? <span className="badge badge-green">%{discountRate}</span>
                                : <span style={{ color: 'var(--text-3)' }}>—</span>}
                            </td>
                            <td>
                              {discountEnabled
                                ? <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{sym}{item.finalPrice.toFixed(2)}</span>
                                : <input inputMode="decimal" min={0} value={item.finalPrice}
                                    onChange={e => setFinalPrice(item.productId, parseFloat(e.target.value.replace(',', '.')) || 0)}
                                    style={{ width: 90, padding: '4px 8px', background: 'var(--surface-3)', border: '1px solid var(--or)', borderRadius: 6, fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }} />
                              }
                            </td>
                            <td>
                              <button onClick={() => removeItem(item.productId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F87171' }}>
                                <IconTrash size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="mob-card-list" style={{ marginBottom: 16, gap: 8 }}>
                  {computedItems.map(item => {
                    const itemCostTRY = item.cost * item.qty;
                    const itemSaleTRY = toTRY(item.finalPrice * item.qty);
                    const itemProfit = itemSaleTRY - itemCostTRY;
                    const itemMargin = itemSaleTRY > 0 ? (itemProfit / itemSaleTRY) * 100 : 0;
                    return (
                      <div key={item.productId} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)', flex: 1, paddingRight: 8 }}>{item.name}</div>
                          <button onClick={() => removeItem(item.productId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F87171', flexShrink: 0 }}>
                            <IconTrash size={16} />
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>Adet</div>
                            <input type="number" min={1} value={item.qty}
                              onChange={e => setQty(item.productId, parseInt(e.target.value) || 1)}
                              onFocus={e => e.target.select()}
                              style={{ width: '100%', padding: '6px 8px', background: 'var(--surface-3)', border: '1px solid var(--border-2)', borderRadius: 6, fontSize: 14, color: 'var(--text-1)', textAlign: 'center' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>Liste ({sym})</div>
                            <input inputMode="decimal" min={0} value={item.listPrice}
                              onChange={e => setListPrice(item.productId, parseFloat(e.target.value.replace(',', '.')) || 0)}
                              onFocus={e => e.target.select()}
                              style={{ width: '100%', padding: '6px 8px', background: 'var(--surface-3)', border: '1px solid var(--border-2)', borderRadius: 6, fontSize: 14, color: 'var(--text-1)' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>
                              {discountEnabled ? `Net (${sym})` : `Satış (${sym})`}
                              {discountEnabled && discountRate > 0 && <span className="badge badge-green" style={{ marginLeft: 4 }}>%{discountRate}</span>}
                            </div>
                            {discountEnabled
                              ? <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', padding: '6px 0' }}>{sym}{item.finalPrice.toFixed(2)}</div>
                              : <input inputMode="decimal" min={0} value={item.finalPrice}
                                  onChange={e => setFinalPrice(item.productId, parseFloat(e.target.value.replace(',', '.')) || 0)}
                                  onFocus={e => e.target.select()}
                                  style={{ width: '100%', padding: '6px 8px', background: 'var(--surface-3)', border: '1px solid var(--or)', borderRadius: 6, fontSize: 14, color: 'var(--text-1)', fontWeight: 600 }} />
                            }
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>Toplam</div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--or)', padding: '6px 0' }}>{sym}{(item.finalPrice * item.qty).toFixed(2)}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: itemMargin >= 0 ? '#4ADE80' : '#F87171', marginTop: 6 }}>
                          Kar: %{itemMargin.toFixed(1)} · ₺{itemProfit.toFixed(0)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Profit analysis panel — internal only */}
            {items.length > 0 && (
              <div className="profit-panel" style={{
                background: 'rgba(232,93,4,.06)',
                border: '1px solid rgba(232,93,4,.15)',
                borderRadius: 10, padding: '12px 16px',
                marginBottom: 16,
              }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 3 }}>
                    <IconTrendingUp size={10} style={{ marginRight: 4 }} />Toplam Maliyet
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--text-2)' }}>₺{totalCostTRY.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                  {currency !== 'TRY' && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{sym}{totalCost.toFixed(2)}</div>}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 3 }}>Toplam Satış</div>
                  <div style={{ fontWeight: 700, color: 'var(--text-1)' }}>₺{totalSaleTRY.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                  {currency !== 'TRY' && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{sym}{total.toFixed(2)}</div>}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 3 }}>Brüt Kâr</div>
                  <div style={{ fontWeight: 700, color: profit >= 0 ? '#4ADE80' : '#F87171' }}>₺{profit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 3 }}>Kâr Marjı</div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: margin >= 30 ? '#4ADE80' : margin >= 15 ? '#FCD34D' : '#F87171' }}>
                    %{margin.toFixed(1)}
                  </div>
                </div>
              </div>
            )}

            {/* Bottom row: discount + totals */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginBottom: 6 }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 4,
                    border: showSubtotal ? '2px solid #E85D04' : '2px solid #555',
                    background: showSubtotal ? '#E85D04' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s', cursor: 'pointer',
                  }} onClick={() => setShowSubtotal(v => !v)}>
                    {showSubtotal && <svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </span>
                  <span style={{ color: 'var(--text-2)', cursor: 'pointer' }} onClick={() => setShowSubtotal(v => !v)}>Ara toplam ve genel toplam göster</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, marginBottom: 8 }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 4,
                    border: discountEnabled ? '2px solid #E85D04' : '2px solid #555',
                    background: discountEnabled ? '#E85D04' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s', cursor: 'pointer',
                  }} onClick={() => setDiscountEnabled(v => !v)}>
                    {discountEnabled && <svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </span>
                  <span style={{ color: 'var(--text-2)', cursor: 'pointer' }} onClick={() => setDiscountEnabled(v => !v)}>İskonto Uygula</span>
                  {discountEnabled && discountRate > 0 && <span className="badge badge-green">%{discountRate} ({totalQty} adet)</span>}
                  {discountEnabled && discountRate === 0 && totalQty > 0 && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>(min. 10 adet)</span>}
                </label>
                {!discountEnabled && items.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>İskonto kapalı — satış fiyatlarını manuel düzenleyebilirsiniz</div>
                )}
                {discountEnabled && (
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                    {discountTiers.slice().reverse().map(t => `${t.qty}+: %${t.rate}`).join(' · ')}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', fontSize: 13 }}>
                {discountRate > 0 && (
                  <>
                    <div style={{ color: 'var(--text-3)' }}>Ara: {sym}{subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                    <div style={{ color: '#4ADE80' }}>İskonto: -{sym}{(subtotal - total).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                  </>
                )}
                <div style={{ fontWeight: 800, fontSize: 22, color: 'var(--text-1)' }}>{sym}{total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                {currency !== 'TRY' && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>≈ ₺{totalSaleTRY.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setOpen(false); resetForm(); }}>İptal</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !customer.trim() || items.length === 0}>
                {saving ? 'Kaydediliyor...' : 'Teklifi Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ VIEW OFFER MODAL ══════════════ */}
      {viewOffer && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setViewId(null)}>
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Teklif Detayı</h3>
                <code style={{ fontSize: 12, color: 'var(--text-3)' }}>{viewOffer.no}</code>
              </div>
              <button onClick={() => setViewId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><IconX size={20} /></button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
              <strong>Müşteri:</strong> {viewOffer.customer} &nbsp;|&nbsp;
              <strong>Tarih:</strong> {formatDate(viewOffer.date)} &nbsp;|&nbsp;
              <strong>Hazırlayan:</strong> {viewOffer.by}
            </div>
            <table style={{ width: '100%', marginBottom: 12 }}>
              <thead><tr><th>Ürün</th><th>Adet</th><th>İskonto</th><th>Birim</th><th>Toplam</th></tr></thead>
              <tbody>
                {viewOffer.items.map((item, i) => {
                  const unitPrice = item.finalPrice ?? item.listPrice ?? 0;
                  const discount = item.discountRate ?? 0;
                  const offerSym = CURRENCY_SYMBOLS[(viewOffer as Offer & {currency?: Currency}).currency ?? 'TRY'] ?? '₺';
                  return (
                    <tr key={i}>
                      <td>{item.name}</td>
                      <td>{item.qty}</td>
                      <td>{discount > 0 ? `%${discount}` : '—'}</td>
                      <td>{offerSym}{unitPrice.toFixed(2)}</td>
                      <td style={{ fontWeight: 600 }}>{offerSym}{(unitPrice * item.qty).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 18, marginBottom: 16 }}>
              {CURRENCY_SYMBOLS[(viewOffer as Offer & {currency?: Currency}).currency ?? 'TRY']}{viewOffer.total.toFixed(2)}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setViewId(null); openPdfPreview(viewOffer); }} disabled={pdfLoading === viewOffer.id}>
                {pdfLoading === viewOffer.id ? <IconLoader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <IconPrinter size={13} />} PDF Önizle &amp; Paylaş
              </button>
              {viewOffer.status === 'pending' && (
                <>
                  <button className="btn btn-sm" style={{ background: 'rgba(74,222,128,.12)', color: '#4ADE80' }} onClick={() => { approve(viewOffer.id!); setViewId(null); }}>
                    <IconCheck size={13} /> Onayla
                  </button>
                  <button className="btn btn-sm" style={{ background: 'rgba(248,113,113,.1)', color: '#F87171' }} onClick={() => { reject(viewOffer.id!); setViewId(null); }}>
                    <IconX size={13} /> Reddet
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ══════════════ PDF PREVIEW MODAL ══════════════ */}
      {pdfPreview && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)',
            backdropFilter: 'blur(6px)', zIndex: 600,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '0',
          }}
        >
          {/* Top bar */}
          <div className="pdf-modal-bar" style={{
            width: '100%', background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 20px', flexShrink: 0, gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              <IconFileText size={18} color="var(--or)" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfPreview.offer.no}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfPreview.offer.customer}</div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {/* Download */}
              <button
                className="btn btn-secondary btn-sm btn-icon-only"
                onClick={downloadCurrentPdf}
                title="PDF olarak kaydet"
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <IconPrinter size={14} /> <span className="btn-label">PDF Kaydet</span>
              </button>

              {/* WhatsApp PDF Paylaş */}
              <button
                onClick={sharePdfWhatsapp}
                disabled={shareLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: shareLoading ? '#128C4A' : '#25D366', color: '#fff',
                  border: 'none', borderRadius: 8, padding: '6px 12px',
                  cursor: shareLoading ? 'default' : 'pointer', fontWeight: 600, fontSize: 13,
                  opacity: shareLoading ? 0.8 : 1,
                }}
                title="PDF olarak WhatsApp'ta Paylaş"
              >
                {shareLoading
                  ? <><IconLoader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> <span className="btn-label">Hazırlanıyor...</span></>
                  : <><IconBrandWhatsapp size={15} /> <span className="btn-label">WhatsApp PDF</span></>
                }
              </button>

              {/* Email */}
              <button
                onClick={emailFromPreview}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: '#3B82F6', color: '#fff',
                  border: 'none', borderRadius: 8, padding: '6px 12px',
                  cursor: 'pointer', fontWeight: 600, fontSize: 13,
                }}
                title="E-posta Gönder"
              >
                <IconMail size={15} /> <span className="btn-label">E-posta</span>
              </button>

              {/* Close */}
              <button
                onClick={closePdfPreview}
                style={{
                  background: 'rgba(255,255,255,.08)', border: '1px solid var(--border-2)',
                  borderRadius: 8, width: 34, height: 34,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--text-3)',
                }}
              >
                <IconX size={16} />
              </button>
            </div>
          </div>

          {/* PDF iframe */}
          <div style={{ flex: 1, width: '100%', maxWidth: 900, padding: '12px 16px 16px', display: 'flex', flexDirection: 'column' }}>
            <iframe
              src={pdfPreview.url}
              style={{
                flex: 1, width: '100%', border: 'none',
                borderRadius: 10, background: '#fff',
                minHeight: 0,
                height: 'calc(100vh - 60px)',
              }}
              title={pdfPreview.filename}
            />
          </div>
        </div>
      )}
    </>
  );
}
