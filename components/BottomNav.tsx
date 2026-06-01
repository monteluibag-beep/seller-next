'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  IconLayoutDashboard, IconPackage,
  IconFileText, IconReceipt, IconDots
} from '@tabler/icons-react';
import Drawer from './Drawer';

const items = [
  { href: '/', label: 'Ana', icon: IconLayoutDashboard },
  { href: '/products', label: 'Ürünler', icon: IconPackage },
  { href: '/offers', label: 'Teklifler', icon: IconFileText },
  { href: '/sales', label: 'Satışlar', icon: IconReceipt },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <nav className="bottom-nav" style={{ display: 'flex' }}>
        {items.map(item => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 3,
              color: active ? 'var(--or)' : 'rgba(255,255,255,.4)',
              textDecoration: 'none', fontSize: 9, fontWeight: 600,
            }}>
              <Icon size={22} />
              {item.label}
            </Link>
          );
        })}
        <button onClick={() => setDrawerOpen(true)} style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 3,
          color: 'rgba(255,255,255,.4)', background: 'none', border: 'none',
          cursor: 'pointer', fontSize: 9, fontWeight: 600,
        }}>
          <IconDots size={22} />
          Daha
        </button>
      </nav>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
