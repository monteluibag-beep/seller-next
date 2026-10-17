'use client';
import { useEffect, useRef, useState } from 'react';

const POLL_MS = 5 * 60 * 1000; // 5 dakika

export default function UpdateBanner() {
  const [show, setShow] = useState(false);
  const currentVersion = useRef<string | null>(
    typeof window !== 'undefined' ? (window as unknown as Record<string, string>).APP_VERSION ?? null : null
  );

  async function checkVersion() {
    try {
      const res = await fetch('/version.json', { cache: 'no-store' });
      if (!res.ok) return;
      const { version } = await res.json();
      if (currentVersion.current === null) {
        currentVersion.current = version;
        return;
      }
      if (version !== currentVersion.current) setShow(true);
    } catch {
      // ağ hatası — sessizce geç
    }
  }

  useEffect(() => {
    checkVersion();
    const interval = setInterval(checkVersion, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') checkVersion(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: '#1a1a1a', borderTop: '2px solid #E85D04',
      padding: '12px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      boxShadow: '0 -4px 20px rgba(0,0,0,.5)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>🔄</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Yeni bir güncelleme mevcut</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>En güncel sürümü görmek için sayfayı yenileyin.</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => setShow(false)}
          style={{ height: 34, padding: '0 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', background: 'none', border: '1px solid rgba(255,255,255,.2)', color: 'rgba(255,255,255,.6)' }}
        >
          Daha Sonra
        </button>
        <button
          onClick={() => location.reload()}
          style={{ height: 34, padding: '0 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: '#E85D04', border: 'none', color: '#fff' }}
        >
          Şimdi Yenile
        </button>
      </div>
    </div>
  );
}
