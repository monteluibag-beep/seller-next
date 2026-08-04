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
  const isDashboard = pathname === '/';

  function openPriceModal() {
    document.dispatchEvent(new CustomEvent('open-price-modal'));
  }

  return (
    <>
      <div className="mob-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            style={{ background: 'var(--alpha-7)', border: '1px solid var(--border)', color: 'var(--text-1)', width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onClick={() => setDrawerOpen(true)}
          >
            <IconMenu2 size={20} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>{title}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: 'var(--text-3)' }}>USD</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)' }}>₺{rates.USD.toFixed(2)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: 'var(--text-3)' }}>EUR</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)' }}>₺{rates.EUR.toFixed(2)}</div>
            </div>
          </div>

          {isDashboard && (
            <button
              onClick={openPriceModal}
              title="Fiyat Sor"
              style={{
                width: 34, height: 34, borderRadius: '50%',
                background: '#E85D04',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 17, fontWeight: 800,
                boxShadow: '0 2px 8px rgba(232,93,4,.5)',
                flexShrink: 0,
              }}
            >
              ?
            </button>
          )}
        </div>
      </div>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
