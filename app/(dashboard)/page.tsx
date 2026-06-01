'use client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import { IconStack2, IconReceipt, IconFileText, IconAlertTriangle } from '@tabler/icons-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { user } = useAuth();
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    const d = new Date();
    const days = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
    const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
    setDateStr(`${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${days[d.getDay()]}`);
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
            <div className="stat-value">1.240</div>
            <div className="stat-sub">38 farklı ürün</div>
          </div>
          <div className="stat-card accent-green">
            <div className="stat-icon green"><IconReceipt size={20} /></div>
            <div className="stat-label">Bu Ay Satış</div>
            <div className="stat-value">₺48.350</div>
            <div className="stat-sub">124 işlem</div>
          </div>
          <div className="stat-card accent-blue">
            <div className="stat-icon blue"><IconFileText size={20} /></div>
            <div className="stat-label">Açık Teklifler</div>
            <div className="stat-value">7</div>
            <div className="stat-sub">2 yanıt bekliyor</div>
          </div>
          <div className="stat-card accent-red">
            <div className="stat-icon red"><IconAlertTriangle size={20} /></div>
            <div className="stat-label">Düşük Stok</div>
            <div className="stat-value">5</div>
            <div className="stat-sub">yenileme gerekli</div>
          </div>
        </div>

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
