'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Sidebar from '@/components/Sidebar';
import MobTopbar from '@/components/MobTopbar';
import BottomNav from '@/components/BottomNav';
import DecimalFixer from '@/components/DecimalFixer';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.push('/login'); return; }
    // Atolye kullanıcısı sadece /fason ve /atolye* görebilir
    if (role === 'atolye' && pathname === '/') {
      router.replace('/fason');
    }
  }, [user, role, loading, router, pathname]);

  if (loading) return (
    <div className="loading-screen">
      <div style={{
        width: 80, height: 80, borderRadius: 20,
        background: 'linear-gradient(145deg, #1a1a1a 0%, #111 100%)',
        border: '1px solid rgba(232,93,4,.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 32px rgba(232,93,4,.25)',
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-icon.png" alt="Çalışkan Çanta" style={{ width: 52, height: 52, objectFit: 'contain' }} />
      </div>
      <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Yükleniyor...</div>
    </div>
  );

  if (!user) return null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>
      <DecimalFixer />
      <Sidebar />
      <div className="main" style={{ flex: 1 }}>
        <MobTopbar />
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
