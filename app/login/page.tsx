'use client';
import { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { IconLogin2 } from '@tabler/icons-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Email ve şifre zorunludur'); return; }
    setLoading(true); setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
    } catch {
      setError('Email veya şifre hatalı');
    }
    setLoading(false);
  };

  const handleForgot = async () => {
    if (!email) { setError('Lütfen önce e-posta adresinizi girin'); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess('Şifre sıfırlama maili gönderildi!');
      setError('');
    } catch {
      setError('Mail gönderilemedi. E-posta adresinizi kontrol edin.');
    }
  };

  return (
    <>
      <style>{`
        @keyframes grain {
          0%,100% { transform: translate(0,0) }
          10%      { transform: translate(-2%,-3%) }
          30%      { transform: translate(3%,2%) }
          50%      { transform: translate(-1%,4%) }
          70%      { transform: translate(2%,-2%) }
          90%      { transform: translate(-3%,1%) }
        }
        @keyframes pulse-tr {
          0%,100% { opacity:.75; transform:scale(1) }
          50%     { opacity:1;   transform:scale(1.08) }
        }
        @keyframes pulse-bl {
          0%,100% { opacity:.6;  transform:scale(1) }
          50%     { opacity:.85; transform:scale(1.1) }
        }
        @keyframes float-card {
          0%,100% { transform:translateY(0px) }
          50%     { transform:translateY(-6px) }
        }
        .login-input {
          width:100%; padding:13px 16px;
          background:rgba(255,255,255,.04);
          border:1.5px solid rgba(255,255,255,.09);
          border-radius:12px; color:#fff; font-size:14px;
          outline:none; transition:border-color .2s, background .2s;
          font-family:inherit;
        }
        .login-input:focus {
          border-color:rgba(232,93,4,.65);
          background:rgba(232,93,4,.04);
        }
        .login-input::placeholder { color:rgba(255,255,255,.22); }
        .forgot-btn {
          background:none; border:none;
          color:rgba(255,255,255,.3); font-size:13px;
          cursor:pointer; transition:color .2s; font-family:inherit;
        }
        .forgot-btn:hover { color:rgba(255,255,255,.65); }
        .submit-btn {
          width:100%; padding:14px;
          background:linear-gradient(135deg,#E85D04 0%,#FB8500 100%);
          color:#fff; border:none; border-radius:12px;
          font-size:15px; font-weight:700; cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:8px;
          box-shadow:0 4px 28px rgba(232,93,4,.38), 0 1px 0 rgba(255,255,255,.12) inset;
          transition:opacity .15s, box-shadow .15s, transform .1s;
          font-family:inherit;
        }
        .submit-btn:hover:not(:disabled) {
          box-shadow:0 6px 36px rgba(232,93,4,.55), 0 1px 0 rgba(255,255,255,.12) inset;
          transform:translateY(-1px);
        }
        .submit-btn:active:not(:disabled) { transform:translateY(0); }
        .submit-btn:disabled { opacity:.45; cursor:not-allowed; }
      `}</style>

      <div style={{
        minHeight: '100vh',
        background: '#111111',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* ── Mesh gradient base ── */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `
            radial-gradient(ellipse 80% 70% at 105% -10%, rgba(232,93,4,.22) 0%, transparent 60%),
            radial-gradient(ellipse 70% 60% at -10% 108%,  rgba(251,133,0,.18) 0%, transparent 55%),
            radial-gradient(ellipse 50% 40% at 50% 50%,    rgba(20,10,5,.6)   0%, transparent 80%)
          `,
          pointerEvents: 'none',
        }} />

        {/* ── Top-right orb ── */}
        <div style={{
          position: 'absolute',
          width: 520, height: 520,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(232,93,4,.32) 0%, rgba(232,93,4,.1) 40%, transparent 68%)',
          top: -160, right: -140,
          filter: 'blur(40px)',
          animation: 'pulse-tr 7s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        {/* ── Bottom-left orb ── */}
        <div style={{
          position: 'absolute',
          width: 460, height: 460,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(251,133,0,.28) 0%, rgba(232,93,4,.08) 42%, transparent 68%)',
          bottom: -140, left: -120,
          filter: 'blur(48px)',
          animation: 'pulse-bl 9s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        {/* ── Subtle secondary accent ── */}
        <div style={{
          position: 'absolute',
          width: 300, height: 200,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(232,93,4,.09) 0%, transparent 70%)',
          top: '60%', right: '12%',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }} />

        {/* ── Film grain overlay ── */}
        <div style={{
          position: 'absolute', inset: '-50%',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          animation: 'grain 8s steps(10) infinite',
          opacity: .5,
          pointerEvents: 'none',
          mixBlendMode: 'overlay',
        }} />

        {/* ── Light leak top-right ── */}
        <div style={{
          position: 'absolute',
          top: 0, right: 0,
          width: 220, height: 3,
          background: 'linear-gradient(90deg, transparent, rgba(232,93,4,.45), transparent)',
          filter: 'blur(2px)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          top: 0, right: 0,
          width: 3, height: 200,
          background: 'linear-gradient(180deg, rgba(232,93,4,.45), transparent)',
          filter: 'blur(2px)',
          pointerEvents: 'none',
        }} />

        {/* ── Light leak bottom-left ── */}
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0,
          width: 180, height: 2,
          background: 'linear-gradient(90deg, rgba(251,133,0,.4), transparent)',
          filter: 'blur(2px)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0,
          width: 2, height: 160,
          background: 'linear-gradient(0deg, rgba(251,133,0,.4), transparent)',
          filter: 'blur(2px)',
          pointerEvents: 'none',
        }} />

        {/* ══════════════════════════════
            LOGIN CARD
        ══════════════════════════════ */}
        <div style={{
          position: 'relative',
          width: '100%', maxWidth: 400,
          zIndex: 1,
          animation: 'float-card 6s ease-in-out infinite',
        }}>
          {/* Glow halo behind card */}
          <div style={{
            position: 'absolute',
            inset: -24,
            borderRadius: 32,
            background: 'radial-gradient(ellipse at 50% 60%, rgba(232,93,4,.18) 0%, transparent 70%)',
            filter: 'blur(16px)',
            zIndex: 0,
            pointerEvents: 'none',
          }} />

          {/* Gradient border shell */}
          <div style={{
            position: 'absolute', inset: -1,
            borderRadius: 22,
            background: `linear-gradient(145deg,
              rgba(232,93,4,.55) 0%,
              rgba(255,255,255,.06) 35%,
              rgba(255,255,255,.03) 65%,
              rgba(251,133,0,.35) 100%)`,
            zIndex: 0,
            pointerEvents: 'none',
          }} />

          {/* Card body */}
          <div style={{
            position: 'relative',
            background: 'rgba(16,14,12,0.82)',
            backdropFilter: 'blur(32px) saturate(180%)',
            WebkitBackdropFilter: 'blur(32px) saturate(180%)',
            borderRadius: 22,
            padding: '44px 38px 38px',
            border: '1px solid rgba(255,255,255,.06)',
            zIndex: 1,
            boxShadow: `
              0 2px 0 rgba(255,255,255,.04) inset,
              0 -1px 0 rgba(0,0,0,.5) inset,
              0 32px 80px rgba(0,0,0,.7),
              0 8px 32px rgba(0,0,0,.4)
            `,
          }}>

            {/* Logo */}
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <div style={{
                width: 88, height: 88, borderRadius: 22,
                background: 'linear-gradient(135deg, #E85D04 0%, #FB8500 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px',
                boxShadow: `
                  0 12px 40px rgba(232,93,4,.55),
                  0 4px 12px rgba(0,0,0,.4),
                  0 1px 0 rgba(255,255,255,.2) inset
                `,
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-icon.png" alt="Çalışkan Çanta" style={{ width: 60, height: 60, objectFit: 'contain' }} />
              </div>
              <div style={{
                fontSize: 22, fontWeight: 800, color: '#fff',
                letterSpacing: -.4,
                textShadow: '0 2px 12px rgba(0,0,0,.4)',
              }}>Çalışkan Çanta</div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.3)', marginTop: 5, letterSpacing: .2 }}>
                Satış Yönetim Paneli
              </div>
            </div>

            {/* Alerts */}
            {error && (
              <div style={{
                background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
                color: '#F87171', padding: '10px 14px', borderRadius: 10,
                fontSize: 13, marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>⚠ {error}</div>
            )}
            {success && (
              <div style={{
                background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.2)',
                color: '#4ADE80', padding: '10px 14px', borderRadius: 10,
                fontSize: 13, marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>✓ {success}</div>
            )}

            <form onSubmit={handleLogin}>
              {/* Email */}
              <div style={{ marginBottom: 14 }}>
                <label style={{
                  display: 'block', fontSize: 10.5, fontWeight: 700,
                  color: 'rgba(255,255,255,.28)',
                  textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 7,
                }}>Email</label>
                <input
                  className="login-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@caliskancanta.com"
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 28 }}>
                <label style={{
                  display: 'block', fontSize: 10.5, fontWeight: 700,
                  color: 'rgba(255,255,255,.28)',
                  textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 7,
                }}>Şifre</label>
                <input
                  className="login-input"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  autoComplete="current-password"
                />
              </div>

              <button type="submit" className="submit-btn" disabled={loading}>
                <IconLogin2 size={17} />
                {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
              </button>
            </form>

            {/* Forgot */}
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <button className="forgot-btn" onClick={handleForgot}>Şifremi Unuttum</button>
            </div>

            {/* Divider */}
            <div style={{
              height: 1,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.07), transparent)',
              margin: '24px 0 20px',
            }} />

            {/* Footer */}
            <div style={{
              textAlign: 'center', fontSize: 11,
              color: 'rgba(255,255,255,.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Firebase Authentication ile korunmaktadır
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
