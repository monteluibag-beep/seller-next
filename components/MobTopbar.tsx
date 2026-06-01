'use client';
import { usePathname } from 'next/navigation';
import { IconMenu2 } from '@tabler/icons-react';
import { useRates } from '@/hooks/useRates';
import { useState } from 'react';
import Drawer from './Drawer';

const pageTitles: Record<string, string> = {
  '/': 'Ana Ekran',
  '/products': 'Ürünler',
  '/stock': 'Stoklar',
  '/sales': 'Satışlar',
  '/offers': 'Teklifler',
  '/categories': 'Kategoriler',
  '/users': 'Kullanıcılar',
  '/settings': 'Ayarlar',
};

export default function MobTopbar() {
  const pathname = usePathname();
  const { rates } = useRates();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const title = pageTitles[pathname] || 'Çalışkan Çanta';

  return (
    <>
      <div className="mob-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onClick={() => setDrawerOpen(true)}
          >
            <IconMenu2 size={20} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{title}</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)' }}>USD</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>₺{rates.USD.toFixed(2)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)' }}>EUR</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>₺{rates.EUR.toFixed(2)}</div>
          </div>
        </div>
      </div>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
