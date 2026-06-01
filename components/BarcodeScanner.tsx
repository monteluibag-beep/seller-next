'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { IconX, IconAlertTriangle, IconScan } from '@tabler/icons-react';

interface Props {
  onDetect: (value: string) => void;
  onClose: () => void;
}

// BarcodeDetector type declarations
interface BarcodeResult { rawValue: string; format: string; }
interface BarcodeDetectorI {
  detect(src: HTMLVideoElement): Promise<BarcodeResult[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => BarcodeDetectorI;
  }
}

// iOS Safari ve diğer tarayıcılar için polyfill yükle
async function ensureBarcodeDetector() {
  if (!('BarcodeDetector' in window)) {
    const { BarcodeDetector } = await import('barcode-detector');
    (window as unknown as Record<string, unknown>).BarcodeDetector = BarcodeDetector;
  }
}

export default function BarcodeScanner({ onDetect, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const detectorRef = useRef<BarcodeDetectorI | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>('starting');
  const [error, setError] = useState('');
  const [detected, setDetected] = useState('');

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startScan = useCallback(() => {
    if (!videoRef.current || !detectorRef.current) return;
    const video = videoRef.current;
    const detector = detectorRef.current;

    const loop = async () => {
      if (!video || video.readyState < 2) { rafRef.current = requestAnimationFrame(loop); return; }
      try {
        const results = await detector.detect(video);
        if (results.length > 0) {
          const val = results[0].rawValue;
          setDetected(val);
          stopCamera();
          // kısa gecikme ile kullanıcı görsün
          setTimeout(() => onDetect(val), 600);
          return;
        }
      } catch { /* frame henüz hazır değil */ }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [onDetect, stopCamera]);

  useEffect(() => {
    async function init() {
      try {
        // Polyfill yükle (iOS Safari dahil tüm tarayıcılarda çalışır)
        await ensureBarcodeDetector();
      } catch {
        setError('Barkod okuyucu yüklenemedi.\nLütfen internet bağlantınızı kontrol edin.');
        setStatus('error');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        detectorRef.current = new window.BarcodeDetector!({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'itf'],
        });

        setStatus('scanning');
        startScan();
      } catch (e: unknown) {
        const err = e as { name?: string; message?: string };
        if (err.name === 'NotAllowedError') {
          setError('Kamera erişimi reddedildi.\nTarayıcı adres çubuğundaki kilit simgesine tıklayarak kamera iznini etkinleştirin.');
        } else if (err.name === 'NotFoundError') {
          setError('Arka kamera bulunamadı.\nCihazınızda kamera mevcut değil veya başka bir uygulama kullanıyor olabilir.');
        } else if (err.name === 'NotReadableError') {
          setError('Kamera başka bir uygulama tarafından kullanılıyor.\nDiğer uygulamaları kapatıp tekrar deneyin.');
        } else {
          setError(`Kamera açılamadı: ${err.message || 'Bilinmeyen hata'}`);
        }
        setStatus('error');
      }
    }

    init();
    return () => stopCamera();
  }, [startScan, stopCamera]);

  return (
    <>
      <style>{`
        @keyframes scan-sweep {
          0%   { top: 8%; opacity: 1; }
          48%  { opacity: 1; }
          50%  { top: 88%; opacity: 0.6; }
          52%  { opacity: 1; }
          100% { top: 8%; opacity: 1; }
        }
        @keyframes corner-pulse {
          0%, 100% { opacity: .7; }
          50% { opacity: 1; }
        }
      `}</style>

      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)',
        backdropFilter: 'blur(6px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}>
        <div style={{
          background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 400,
          border: '1px solid var(--border-2)',
          boxShadow: '0 24px 64px rgba(0,0,0,.7)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconScan size={18} color="var(--or)" />
              <span style={{ fontWeight: 700, fontSize: 15 }}>Barkod Tara</span>
            </div>
            <button onClick={() => { stopCamera(); onClose(); }} style={{ background: 'rgba(255,255,255,.06)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconX size={16} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: 18 }}>
            {status === 'error' ? (
              <div style={{ background: 'rgba(248,113,113,.08)', border: '1px solid rgba(248,113,113,.2)', borderRadius: 12, padding: 16, display: 'flex', gap: 12 }}>
                <IconAlertTriangle size={20} color="#F87171" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: '#F87171', whiteSpace: 'pre-line', lineHeight: 1.6 }}>{error}</div>
              </div>
            ) : detected ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
                <div style={{ fontWeight: 700, color: '#4ADE80', marginBottom: 4 }}>Barkod Okundu!</div>
                <code style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', letterSpacing: 2 }}>{detected}</code>
              </div>
            ) : (
              <>
                {/* Video + overlay */}
                <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000', aspectRatio: '4/3' }}>
                  <video
                    ref={videoRef}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    playsInline muted autoPlay
                  />

                  {/* Dim overlay */}
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)' }} />

                  {/* Scan frame */}
                  <div style={{
                    position: 'absolute',
                    top: '50%', left: '50%',
                    transform: 'translate(-50%,-50%)',
                    width: '70%', height: '38%',
                    animation: 'corner-pulse 2s ease-in-out infinite',
                  }}>
                    {/* Köşeler */}
                    {[
                      { top: 0, left: 0, borderTop: '3px solid var(--or)', borderLeft: '3px solid var(--or)', borderRadius: '6px 0 0 0' },
                      { top: 0, right: 0, borderTop: '3px solid var(--or)', borderRight: '3px solid var(--or)', borderRadius: '0 6px 0 0' },
                      { bottom: 0, left: 0, borderBottom: '3px solid var(--or)', borderLeft: '3px solid var(--or)', borderRadius: '0 0 0 6px' },
                      { bottom: 0, right: 0, borderBottom: '3px solid var(--or)', borderRight: '3px solid var(--or)', borderRadius: '0 0 6px 0' },
                    ].map((s, i) => (
                      <div key={i} style={{ position: 'absolute', width: 20, height: 20, ...s }} />
                    ))}

                    {/* Tarama çizgisi */}
                    {status === 'scanning' && (
                      <div style={{
                        position: 'absolute', left: 4, right: 4, height: 2,
                        background: 'linear-gradient(90deg, transparent, var(--or), transparent)',
                        animation: 'scan-sweep 1.8s ease-in-out infinite',
                        boxShadow: '0 0 8px var(--or)',
                      }} />
                    )}
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: 'var(--text-3)' }}>
                  {status === 'starting' ? '📷 Kamera başlatılıyor...' : '🔍 Barkodu çerçeve içine hizalayın'}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
