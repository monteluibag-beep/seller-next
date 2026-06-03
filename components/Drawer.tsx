'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  IconX, IconLayoutDashboard, IconPackage, IconStack2,
  IconReceipt, IconFileText, IconTag, IconUsers,
  IconSettings, IconLogout, IconClipboardList, IconBuildingFactory2, IconListCheck
} from '@tabler/icons-react';

const ALL_NAV = [
  { href: '/', label: 'Ana Ekran', icon: IconLayoutDashboard, roles: ['admin', 'sales'] },
  { href: '/products', label: 'Ürünler', icon: IconPackage, roles: ['admin', 'sales'] },
  { href: '/stock', label: 'Stoklar', icon: IconStack2, roles: ['admin', 'sales'] },
  { href: '/sales', label: 'Satışlar', icon: IconReceipt, roles: ['admin', 'sales'] },
  { href: '/offers', label: 'Teklifler', icon: IconFileText, roles: ['admin', 'sales'] },
  { href: '/fason', label: 'Fason Takip', icon: IconClipboardList, roles: ['admin'] },
  { href: '/atolye', label: 'Atölyeler', icon: IconBuildingFactory2, roles: ['admin'] },
  { href: '/my-tasks', label: 'İş Takip', icon: IconListCheck, roles: ['atolye'] },
  { href: '/categories', label: 'Kategoriler', icon: IconTag, roles: ['admin'] },
  { href: '/users', label: 'Kullanıcılar', icon: IconUsers, roles: ['admin'] },
  { href: '/settings', label: 'Ayarlar', icon: IconSettings, roles: ['admin'] },
];

export default function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, role } = useAuth();
  const navItems = ALL_NAV.filter(i => !role || i.roles.includes(role));
  const router = useRouter();

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const initials = user?.email?.substring(0, 2).toUpperCase() || 'AD';
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Admin';

  return (
    <>
      {open && <div className="drawer-overlay open" onClick={onClose} />}
      <div className={`drawer ${open ? 'open' : ''}`}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 14, right: 14,
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(255,255,255,.08)', border: 'none',
          color: 'rgba(255,255,255,.5)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <IconX size={16} />
        </button>

        {/* Logo */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', marginTop: 8 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '6px 12px', display: 'inline-flex', alignItems: 'center' }}>
            <img src="/logo.png" alt="Çalışkan Çanta" style={{ height: 32, objectFit: 'contain' }} />
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {navItems.map(item => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={`nav-item ${active ? 'active' : ''}`} onClick={onClose}>
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div className="user-av">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
            </div>
          </div>
          <button className="sidebar-logout-btn" onClick={handleLogout}>
            <IconLogout size={16} />
            <span>Çıkış Yap</span>
          </button>
        </div>
      </div>
    </>
  );
}
