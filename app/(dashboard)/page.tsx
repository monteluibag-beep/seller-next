'use client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { IconStack2, IconReceipt, IconFileText, IconAlertTriangle } from '@tabler/icons-react';
import Link from 'next/link';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Product, Sale, Offer } from '@/types';

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

interface Stats {
  totalStock: number;
  productCount: number;
  thisMonthSales: number;
  thisMonthCount: number;
  openOffers: number;
  lowStock: number;
  monthlyData: MonthData[];
  thisYearTotal: number;
  lastYearTotal: number;
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
  const [dateStr, setDateStr] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

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
        const sales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Sale));
        const offers = offersSnap.docs.map(d => ({ id: d.id, ...d.data() } as Offer));

        const totalStock = products.reduce((s, p) => s + (p.stock ?? 0), 0);
        const productCount = products.length;
        const lowStock = products.filter(p => (p.stock ?? 0) <= 5).length;
        const openOffers = offers.filter(o => o.status === 'pending').length;

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
          openOffers, lowStock, monthlyData, thisYearTotal, lastYearTotal,
        });
      } catch (err) {
        console.error('Dashboard stats error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

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
          <div className="stat-card accent-orange">
            <div className="stat-icon orange"><IconStack2 size={20} /></div>
            <div className="stat-label">Toplam Stok</div>
            <div className="stat-value">{loading ? '—' : (stats?.totalStock ?? 0).toLocaleString('tr-TR')}</div>
            <div className="stat-sub">{loading ? '...' : `${stats?.productCount ?? 0} farklı ürün`}</div>
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
