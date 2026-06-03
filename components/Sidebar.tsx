'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useRates } from '@/hooks/useRates';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  IconLayoutDashboard, IconPackage, IconStack2,
  IconReceipt, IconFileText, IconTag, IconUsers,
  IconSettings, IconLogout, IconMenu2,
  IconChevronLeft, IconClipboardList, IconBuildingFactory2, IconListCheck
} from '@tabler/icons-react';

const ALL_NAV = [
  { href: '/', label: 'Ana Ekran', icon: IconLayoutDashboard, group: 'Genel', roles: ['admin', 'sales'] },
  { href: '/products', label: 'Ürünler', icon: IconPackage, group: 'Yönetim', roles: ['admin', 'sales'] },
  { href: '/stock', label: 'Stoklar', icon: IconStack2, group: 'Yönetim', roles: ['admin', 'sales'] },
  { href: '/sales', label: 'Satışlar', icon: IconReceipt, group: 'Yönetim', roles: ['admin', 'sales'] },
  { href: '/offers', label: 'Teklifler', icon: IconFileText, group: 'Yönetim', roles: ['admin', 'sales'] },
  { href: '/fason', label: 'Fason Takip', icon: IconClipboardList, group: 'Yönetim', roles: ['admin', 'mudur'] },
  { href: '/atolye', label: 'Atölyeler', icon: IconBuildingFactory2, group: 'Yönetim', roles: ['admin', 'mudur'] },
  { href: '/my-tasks', label: 'İş Takip', icon: IconListCheck, group: 'Genel', roles: ['atolye'] },
  { href: '/categories', label: 'Kategoriler', icon: IconTag, group: 'Sistem', roles: ['admin'] },
  { href: '/users', label: 'Kullanıcılar', icon: IconUsers, group: 'Sistem', roles: ['admin'] },
  { href: '/settings', label: 'Ayarlar', icon: IconSettings, group: 'Sistem', roles: ['admin'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, role } = useAuth();
  const { rates, updatedAt } = useRates();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sb-collapsed');
    const isCollapsed = saved === '1';
    if (isCollapsed) setCollapsed(true);
    document.documentElement.style.setProperty('--sidebar-current-w', isCollapsed ? '60px' : '240px');
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sb-collapsed', next ? '1' : '0');
    document.documentElement.style.setProperty('--sidebar-current-w', next ? '60px' : '240px');
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const navItems = ALL_NAV.filter(i => !role || i.roles.includes(role));
  const groups = ['Genel', 'Yönetim', 'Sistem'];
  const initials = user?.email?.substring(0, 2).toUpperCase() || 'AD';
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Admin';

  return (
    <aside className="sidebar" style={{ width: collapsed ? 60 : 240 }}>
      {/* Brand */}
      <div className="sidebar-brand" style={collapsed ? { justifyContent: 'center', padding: '12px 0' } : undefined}>
        {!collapsed && (
          <div style={{
            background: '#fff', borderRadius: 8, padding: '5px 10px',
            flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
          }}>
            <img
              src="/logo.png"
              alt="Çalışkan Çanta"
              style={{ height: 34, width: 'auto', objectFit: 'contain', maxWidth: 150 }}
            />
          </div>
        )}
        <button className="sidebar-toggle" onClick={toggle} style={{ flexShrink: 0 }}>
          {collapsed ? <IconMenu2 size={18} /> : <IconChevronLeft size={18} />}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, paddingTop: 8 }}>
        {groups.map(group => (
          <div key={group}>
            {!collapsed && <div className="nav-label">{group}</div>}
            {navItems.filter(i => i.group === group).map(item => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} className={`nav-item ${active ? 'active' : ''}`}>
                  <Icon size={18} style={{ flexShrink: 0 }} />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Rates + User */}
      <div className="rates-bar">
        {!collapsed && (
          <>
            {[['🇺🇸 USD/TRY', rates.USD], ['🇪🇺 EUR/TRY', rates.EUR], ['🇬🇧 GBP/TRY', rates.GBP]].map(([label, val]) => (
              <div key={label as string} className="rate-row">
                <span className="rate-label">{label}</span>
                <span className="rate-val">₺{(val as number).toFixed(2)}</span>
              </div>
            ))}
            {updatedAt && <div className="rate-time">{updatedAt} güncellendi</div>}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10 }}>
              <div className="sidebar-user-row">
                <div className="user-av">{initials}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
                </div>
              </div>
            </div>
          </>
        )}
        <button className="sidebar-logout-btn" onClick={handleLogout}>
          <IconLogout size={16} />
          {!collapsed && <span>Çıkış Yap</span>}
        </button>
      </div>
    </aside>
  );
}
