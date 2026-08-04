'use client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { IconStack2, IconReceipt, IconFileText, IconAlertTriangle, IconTool, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { collection, getDocs, query, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Product, Sale, Offer } from '@/types';
import { useRates } from '@/hooks/useRates';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const SalesCharts = dynamic(() => import('@/components/SalesCharts'), {
  ssr: false,
  loading: () => (
    <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.3)', fontSize: 13 }}>
      Grafik yükleniyor...
    </div>
  ),
});

const MONTHS_TR = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];

interface MonthData {
  ay: string;
  ciro: number;
  gecenYil: number;
}

interface NoCostProduct {
  id: string;
  name: string;
  catName: string;
  costUsd: number;
  list: number;
}

interface Stats {
  totalStock: number;
  productCount: number;
  thisMonthSales: number;
  thisMonthCount: number;
  openOffers: number;
  lowStock: number;
  noCostCount: number;
  noCostProducts: NoCostProduct[];
  monthlyData: MonthData[];
  thisYearTotal: number;
  lastYearTotal: number;
}

const CAT_COLORS = ['#E85D04','#3b82f6','#10b981','#8B5CF6','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316'];

function StockModal({ products, onClose }: { products: Product[]; onClose: () => void }) {
  const [catFilter, setCatFilter] = useState('');
  const [sortBy, setSortBy] = useState<'stock-desc' | 'stock-asc' | 'az' | 'za'>('stock-desc');
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const update = () => setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const cats = [...new Set(products.map(p => p.catName).filter(Boolean))] as string[];

  // Kategori bazlı stok özet verisi (grafik için)
  const catData = cats.map((cat, i) => ({
    cat,
    stok: products.filter(p => p.catName === cat).reduce((s, p) => s + (p.stock ?? 0), 0),
    urun: products.filter(p => p.catName === cat).length,
    color: CAT_COLORS[i % CAT_COLORS.length],
  })).sort((a, b) => b.stok - a.stok);

  // Filtreli + sıralı ürün listesi
  const filtered = products
    .filter(p => !catFilter || p.catName === catFilter)
    .sort((a, b) => {
      if (sortBy === 'stock-desc') return (b.stock ?? 0) - (a.stock ?? 0);
      if (sortBy === 'stock-asc')  return (a.stock ?? 0) - (b.stock ?? 0);
      if (sortBy === 'az')  return a.name.localeCompare(b.name, 'tr');
      return b.name.localeCompare(a.name, 'tr');
    });

  const gridColor = isDark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)';
  const tickColor = isDark ? 'rgba(255,255,255,.4)'  : 'rgba(0,0,0,.45)';
  const tipBg     = isDark ? '#1e1e1e' : '#fff';
  const tipBorder = isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)';
  const tipLabel  = isDark ? '#fff' : '#111';

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 760, width: '96vw' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>Stok Dağılımı</h3>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {products.length} ürün · {products.reduce((s, p) => s + (p.stock ?? 0), 0).toLocaleString('tr-TR')} toplam adet
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
            <IconX size={20} />
          </button>
        </div>

        {/* Kategori Özet Grafiği */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>Kategoriye Göre Stok</div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={catData} margin={{ top: 4, right: 8, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis
                  dataKey="cat"
                  tick={{ fill: tickColor, fontSize: 10 }}
                  axisLine={false} tickLine={false}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                />
                <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: tipLabel, fontWeight: 700 }}
                  formatter={(value: unknown) => [`${Number(value ?? 0).toLocaleString('tr-TR')} adet`, 'Stok']}
                />
                <Bar dataKey="stok" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {catData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Filtre & Sıralama */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <select
            className="form-input"
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            style={{ flex: 1, minWidth: 160, height: 36, fontSize: 12 }}
          >
            <option value="">Tüm Kategoriler</option>
            {cats.map(c => (
              <option key={c} value={c}>{c} ({products.filter(p => p.catName === c).reduce((s, p) => s + (p.stock ?? 0), 0)} adet)</option>
            ))}
          </select>
          <select
            className="form-input"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            style={{ width: 180, height: 36, fontSize: 12, flexShrink: 0 }}
          >
            <option value="stock-desc">Stok: Çoktan Aza</option>
            <option value="stock-asc">Stok: Azdan Çoğa</option>
            <option value="az">İsim: A → Z</option>
            <option value="za">İsim: Z → A</option>
          </select>
        </div>

        {/* Ürün Listesi */}
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>ÜRÜN</th>
                <th style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>KATEGORİ</th>
                <th style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>STOK</th>
                <th style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-3)', fontWeight: 600, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>LİSTE</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const catIdx = cats.indexOf(p.catName || '');
                const dotColor = CAT_COLORS[catIdx % CAT_COLORS.length] ?? '#aaa';
                const isLow = (p.stock ?? 0) <= 5;
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 8px', fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: dotColor, marginRight: 6, flexShrink: 0 }} />
                      {p.name}
                    </td>
                    <td style={{ padding: '7px 8px', fontSize: 11, color: 'var(--text-3)' }}>{p.catName || '—'}</td>
                    <td style={{ padding: '7px 8px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: isLow ? '#ef4444' : 'var(--text-1)' }}>
                      {(p.stock ?? 0).toLocaleString('tr-TR')}
                      {isLow && <span style={{ fontSize: 9, marginLeft: 4, color: '#ef4444' }}>●</span>}
                    </td>
                    <td style={{ padding: '7px 8px', fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>
                      {p.list > 0 ? `₺${p.list.toLocaleString('tr-TR')}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Kapat</button>
        </div>
      </div>
    </div>
  );
}

function formatTRY(n: number): string {
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₺${(n / 1_000).toFixed(0)}B`;
  return `₺${n.toLocaleString('tr-TR')}`;
}

function getTimestamp(ts: unknown): Date | null {
  if (!ts) return null;
  const t = ts as { toDate?: () => Date };
  if (t.toDate) return t.toDate();
  return new Date(ts as string);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { rates } = useRates();
  const usdRate = rates.USD || 1;
  const [dateStr, setDateStr] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [stockModal, setStockModal] = useState(false);
  // İmalat fiyatı girişi
  const [costInputs, setCostInputs] = useState<Record<string, string>>({});
  const [savingCost, setSavingCost] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date();
    const days = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
    const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    setDateStr(`${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${days[d.getDay()]}`);
  }, []);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        const [productsSnap, salesSnap, offersSnap] = await Promise.all([
          getDocs(collection(db, 'products')),
          getDocs(query(collection(db, 'sales'), orderBy('date', 'desc'))),
          getDocs(collection(db, 'offers')),
        ]);

        const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
        setAllProducts(products);
        const sales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Sale));
        const offers = offersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Offer));

        const totalStock = products.reduce((s, p) => s + (p.stock ?? 0), 0);
        const productCount = products.length;
        const lowStock = products.filter(p => (p.stock ?? 0) <= 5).length;
        const openOffers = offers.filter(o => o.status === 'pending').length;
        const noCostProducts: NoCostProduct[] = products
          .filter(p => !(p.cost && p.cost > 0) && !((p as Product & { costUsd?: number }).costUsd && (p as Product & { costUsd?: number }).costUsd! > 0))
          .map(p => ({
            id: p.id!, name: p.name, catName: p.catName || '',
            costUsd: (p as Product & { costUsd?: number }).costUsd ?? 0,
            list: p.list ?? 0,
          }));
        const noCostCount = noCostProducts.length;

        const now = new Date();
        const thisYear = now.getFullYear();
        const thisMonth = now.getMonth();

        // Monthly aggregation: last 12 months for this year, and same months last year
        const monthlyCiro: Record<string, number> = {};
        const monthlyLastYear: Record<string, number> = {};

        let thisMonthSales = 0;
        let thisMonthCount = 0;
        let thisYearTotal = 0;
        let lastYearTotal = 0;

        for (const sale of sales) {
          const d = getTimestamp(sale.date);
          if (!d) continue;
          const y = d.getFullYear();
          const m = d.getMonth();
          const key = `${y}-${m}`;

          if (y === thisYear) {
            monthlyCiro[key] = (monthlyCiro[key] ?? 0) + (sale.total ?? 0);
            thisYearTotal += sale.total ?? 0;
            if (m === thisMonth) {
              thisMonthSales += sale.total ?? 0;
              thisMonthCount += 1;
            }
          } else if (y === thisYear - 1) {
            monthlyLastYear[key] = (monthlyLastYear[key] ?? 0) + (sale.total ?? 0);
            lastYearTotal += sale.total ?? 0;
          }
        }

        // Build last 12 months chart data
        const monthlyData: MonthData[] = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date(thisYear, thisMonth - i, 1);
          const y = d.getFullYear();
          const m = d.getMonth();
          const key = `${y}-${m}`;
          const lastKey = `${y - 1}-${m}`;
          monthlyData.push({
            ay: MONTHS_TR[m],
            ciro: Math.round(monthlyCiro[key] ?? 0),
            gecenYil: Math.round(monthlyLastYear[lastKey] ?? 0),
          });
        }

        setStats({
          totalStock, productCount, thisMonthSales, thisMonthCount,
          openOffers, lowStock, noCostCount, noCostProducts,
          monthlyData, thisYearTotal, lastYearTotal,
        });
      } catch (err) {
        console.error('Dashboard stats error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  function recommendedList(cost: number): number {
    if (!cost || cost <= 0) return 0;
    const raw = cost * 1.10 / 0.45;
    return Math.ceil(raw / 5) * 5;
  }

  async function saveCost(productId: string) {
    const raw = (costInputs[productId] || '').replace(',', '.');
    const costUsd = parseFloat(raw);
    if (!costUsd || isNaN(costUsd) || costUsd <= 0) return;
    setSavingCost(productId);
    try {
      const newList = recommendedList(costUsd * usdRate);
      await updateDoc(doc(db, 'products', productId), { costUsd, list: newList });
      setStats(prev => {
        if (!prev) return prev;
        const updated = prev.noCostProducts.filter(p => p.id !== productId);
        return { ...prev, noCostProducts: updated, noCostCount: updated.length };
      });
      setCostInputs(prev => { const n = { ...prev }; delete n[productId]; return n; });
    } finally {
      setSavingCost(null);
    }
  }

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="page-title">Ana Ekran</div>
          <div className="page-sub">{dateStr}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/products" className="btn btn-primary btn-sm">+ Yeni Ürün</Link>
          <Link href="/offers" className="btn btn-secondary btn-sm">📄 Yeni Teklif</Link>
        </div>
      </div>

      {/* Content */}
      <div className="page-content">
        <div className="stats-grid">
          <div
            className="stat-card accent-orange"
            style={{ cursor: 'pointer' }}
            onClick={() => setStockModal(true)}
            title="Stok dağılımını görüntüle"
          >
            <div className="stat-icon orange"><IconStack2 size={20} /></div>
            <div className="stat-label">Toplam Stok</div>
            <div className="stat-value">{loading ? '—' : (stats?.totalStock ?? 0).toLocaleString('tr-TR')}</div>
            <div className="stat-sub">{loading ? '...' : `${stats?.productCount ?? 0} farklı ürün · grafik için tıkla`}</div>
          </div>
          <div className="stat-card accent-green">
            <div className="stat-icon green"><IconReceipt size={20} /></div>
            <div className="stat-label">Bu Ay Satış</div>
            <div className="stat-value">{loading ? '—' : formatTRY(stats?.thisMonthSales ?? 0)}</div>
            <div className="stat-sub">{loading ? '...' : `${stats?.thisMonthCount ?? 0} işlem`}</div>
          </div>
          <div className="stat-card accent-blue">
            <div className="stat-icon blue"><IconFileText size={20} /></div>
            <div className="stat-label">Açık Teklifler</div>
            <div className="stat-value">{loading ? '—' : stats?.openOffers ?? 0}</div>
            <div className="stat-sub">yanıt bekliyor</div>
          </div>
          <div className="stat-card accent-red">
            <div className="stat-icon red"><IconAlertTriangle size={20} /></div>
            <div className="stat-label">Düşük Stok</div>
            <div className="stat-value">{loading ? '—' : stats?.lowStock ?? 0}</div>
            <div className="stat-sub">yenileme gerekli</div>
          </div>
          <div className="stat-card" style={{ borderColor: 'rgba(139,92,246,.25)', background: 'rgba(139,92,246,.05)' }}>
            <div className="stat-icon" style={{ background: 'rgba(139,92,246,.15)', color: '#8B5CF6' }}><IconTool size={20} /></div>
            <div className="stat-label">İmalat Fiyatı Eksik</div>
            <div className="stat-value" style={{ color: '#8B5CF6' }}>{loading ? '—' : stats?.noCostCount ?? 0}</div>
            <div className="stat-sub">fiyat bekliyor</div>
          </div>
        </div>

        {/* Charts */}
        {!loading && stats && (
          <SalesCharts
            monthlyData={stats.monthlyData}
            yearData={[
              { yil: String(new Date().getFullYear() - 1), toplam: Math.round(stats.lastYearTotal) },
              { yil: String(new Date().getFullYear()), toplam: Math.round(stats.thisYearTotal) },
            ]}
          />
        )}

        {!loading && stats && stats.noCostProducts.length > 0 && (
          <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(139,92,246,.2)' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconTool size={16} color="#8B5CF6" />
                <div className="card-title" style={{ color: '#8B5CF6' }}>İmalat Fiyatı Bekleyen Ürünler</div>
                <span style={{ fontSize: 11, fontWeight: 700, background: 'rgba(139,92,246,.12)', color: '#8B5CF6', padding: '2px 8px', borderRadius: 6 }}>
                  {stats.noCostProducts.length}
                </span>
              </div>
              <Link href="/products" className="btn btn-secondary btn-sm">→ Ürünler</Link>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ürün</th>
                    <th>Kategori</th>
                    <th>Liste Fiyatı</th>
                    <th style={{ minWidth: 200 }}>Maliyet ($) Gir</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.noCostProducts.slice(0, 10).map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{p.catName || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{p.list > 0 ? `₺${p.list.toLocaleString('tr-TR')}` : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            inputMode="decimal"
                            placeholder="örn: 150"
                            value={costInputs[p.id] ?? ''}
                            onChange={e => setCostInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && saveCost(p.id)}
                            style={{
                              flex: 1, padding: '5px 10px', borderRadius: 7, fontSize: 13,
                              border: '1.5px solid rgba(139,92,246,.35)', background: 'var(--surface-2)',
                              color: 'var(--text-1)', outline: 'none',
                            }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>$</span>
                          <button
                            onClick={() => saveCost(p.id)}
                            disabled={savingCost === p.id || !costInputs[p.id]}
                            style={{
                              padding: '5px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                              background: costInputs[p.id] ? '#8B5CF6' : 'var(--surface-3)',
                              color: costInputs[p.id] ? '#fff' : 'var(--text-3)',
                              fontSize: 12, fontWeight: 700, transition: 'all .15s',
                            }}
                          >
                            {savingCost === p.id ? '...' : 'Kaydet'}
                          </button>
                        </div>
                        {costInputs[p.id] && !isNaN(parseFloat(costInputs[p.id].replace(',','.'))) && (
                          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
                            Tavsiye liste: ₺{recommendedList(parseFloat(costInputs[p.id].replace(',','.')) * usdRate).toLocaleString('tr-TR')}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {stats.noCostProducts.length > 10 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, padding: '10px' }}>
                        +{stats.noCostProducts.length - 10} ürün daha · <Link href="/products" style={{ color: '#8B5CF6' }}>Ürünler sayfasında görüntüle</Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Stock Modal */}
        {stockModal && <StockModal products={allProducts} onClose={() => setStockModal(false)} />}

        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Son Satışlar</div>
              <Link href="/sales" className="btn btn-secondary btn-sm">→ Tümü</Link>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ürün</th><th>Adet</th><th>Tutar</th><th>Durum</th></tr></thead>
                <tbody>
                  <tr><td>Sırt Çantası M</td><td>50</td><td style={{fontWeight:700}}>₺6.250</td><td><span className="badge badge-green">Tamamlandı</span></td></tr>
                  <tr><td>Evrak Çantası</td><td>20</td><td style={{fontWeight:700}}>₺3.800</td><td><span className="badge badge-green">Tamamlandı</span></td></tr>
                  <tr><td>Laptop Çantası</td><td>10</td><td style={{fontWeight:700}}>₺2.100</td><td><span className="badge badge-amber">Bekliyor</span></td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Stok Uyarıları</div>
              <Link href="/stock" className="btn btn-secondary btn-sm">→ Tümü</Link>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ürün</th><th>Raf</th><th>Stok</th><th>Durum</th></tr></thead>
                <tbody>
                  <tr><td>Bel Çantası S</td><td><span className="shelf">B1</span></td><td style={{color:'#DC2626',fontWeight:700}}>3</td><td><span className="badge badge-red">Kritik</span></td></tr>
                  <tr><td>Okul Çantası</td><td><span className="shelf">C5</span></td><td style={{color:'#D97706',fontWeight:700}}>7</td><td><span className="badge badge-amber">Düşük</span></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
