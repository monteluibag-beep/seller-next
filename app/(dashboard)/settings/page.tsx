'use client';
import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MainSettings, DiscountTier } from '@/types';
import { IconPlus, IconTrash, IconDeviceFloppy, IconCheck } from '@tabler/icons-react';

const DEFAULT_SETTINGS: MainSettings = {
  firmName: 'Çalışkan Çanta',
  firmAddress: '',
  firmPhone: '',
  firmEmail: '',
  offerTerms: '',
  bankInfo: '',
  invoiceInfo: '',
  discounts: [
    { qty: 10, rate: 15 }, { qty: 20, rate: 18 }, { qty: 30, rate: 22 },
    { qty: 40, rate: 25 }, { qty: 50, rate: 30 }, { qty: 100, rate: 35 },
    { qty: 200, rate: 40 }, { qty: 500, rate: 50 }, { qty: 1000, rate: 55 },
  ],
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<MainSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const d = await getDoc(doc(db, 'settings', 'main'));
      if (d.exists()) setSettings({ ...DEFAULT_SETTINGS, ...(d.data() as MainSettings) });
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'main'), settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  function setField<K extends keyof MainSettings>(key: K, val: MainSettings[K]) {
    setSettings(s => ({ ...s, [key]: val }));
  }

  function updateDiscount(i: number, field: keyof DiscountTier, val: number) {
    setSettings(s => {
      const d = [...s.discounts];
      d[i] = { ...d[i], [field]: val };
      return { ...s, discounts: d.sort((a, b) => a.qty - b.qty) };
    });
  }

  function addDiscount() {
    setSettings(s => ({
      ...s,
      discounts: [...s.discounts, { qty: 0, rate: 0 }].sort((a, b) => a.qty - b.qty),
    }));
  }

  function removeDiscount(i: number) {
    setSettings(s => ({ ...s, discounts: s.discounts.filter((_, idx) => idx !== i) }));
  }

  if (loading) return (
    <>
      <div className="topbar"><div className="page-title">Ayarlar</div></div>
      <div className="page-content"><div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>Yükleniyor...</div></div>
    </>
  );

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Ayarlar</div>
          <div className="page-sub">Firma bilgileri ve iskonto oranları</div>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saved ? <><IconCheck size={16} /> Kaydedildi</> : <><IconDeviceFloppy size={16} /> {saving ? 'Kaydediliyor...' : 'Kaydet'}</>}
        </button>
      </div>

      <div className="page-content">
        <div className="grid-2" style={{ alignItems: 'start' }}>

          {/* Firm Info */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-header">
              <div className="card-title">Firma Bilgileri</div>
            </div>
            <div style={{ padding: '20px 18px' }}>
              <div className="form-group">
                <label className="form-label">Firma Adı</label>
                <input className="form-input" value={settings.firmName} onChange={e => setField('firmName', e.target.value)} placeholder="Çalışkan Çanta" />
              </div>
              <div className="form-group">
                <label className="form-label">Adres</label>
                <textarea
                  className="form-input"
                  value={settings.firmAddress}
                  onChange={e => setField('firmAddress', e.target.value)}
                  placeholder="Adres satırı"
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Telefon</label>
                  <input className="form-input" value={settings.firmPhone} onChange={e => setField('firmPhone', e.target.value)} placeholder="+90 (212) 000 00 00" />
                </div>
                <div className="form-group">
                  <label className="form-label">E-posta</label>
                  <input className="form-input" type="email" value={settings.firmEmail} onChange={e => setField('firmEmail', e.target.value)} placeholder="info@firma.com" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Teklif Koşulları / Alt Notu</label>
                <textarea
                  className="form-input"
                  value={settings.offerTerms}
                  onChange={e => setField('offerTerms', e.target.value)}
                  placeholder="Fiyatlar KDV hariçtir. Teklif geçerlilik süresi 30 gündür..."
                  rows={4}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* Bank + Invoice Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-header">
                <div className="card-title">Hesap Bilgilerimiz</div>
              </div>
              <div style={{ padding: '16px 18px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">TL / Döviz Hesap Bilgileri</label>
                  <textarea
                    className="form-input"
                    value={settings.bankInfo}
                    onChange={e => setField('bankInfo', e.target.value)}
                    placeholder={`Banka Adı: Ziraat Bankası\nHesap Adı: Çalışkan Çanta Ltd.\nIBAN (TL): TR00 0000 0000 0000 0000 0000 00\n\nBanka Adı: Garanti BBVA\nHesap Adı: Çalışkan Çanta Ltd.\nIBAN (USD): TR00 0000 0000 0000 0000 0000 00`}
                    rows={7}
                    style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
                  />
                </div>
              </div>
            </div>

            <div className="card" style={{ marginBottom: 0 }}>
              <div className="card-header">
                <div className="card-title">Fatura Bilgilerimiz</div>
              </div>
              <div style={{ padding: '16px 18px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Vergi No, Vergi Dairesi, Adres</label>
                  <textarea
                    className="form-input"
                    value={settings.invoiceInfo}
                    onChange={e => setField('invoiceInfo', e.target.value)}
                    placeholder={`Ünvan: Çalışkan Çanta Tekstil Ltd. Şti.\nVergi Dairesi: Bağcılar VD.\nVergi No: 1234567890\nAdres: Örnek Mah. Örnek Sk. No:1 Bağcılar / İstanbul`}
                    rows={5}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>

          {/* Discounts */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-header">
              <div className="card-title">İskonto Kademeleri</div>
              <button className="btn btn-secondary btn-sm" onClick={addDiscount}>
                <IconPlus size={13} /> Ekle
              </button>
            </div>
            <div style={{ padding: '8px 18px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 36px', gap: 8, padding: '8px 0', borderBottom: '1px solid #f0f0f0', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: .5 }}>Min. Adet</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: .5 }}>İskonto (%)</div>
                <div />
              </div>
              {settings.discounts.map((tier, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 36px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input
                    className="form-input"
                    type="number" min={1}
                    value={tier.qty}
                    onChange={e => updateDiscount(i, 'qty', parseInt(e.target.value) || 0)}
                    placeholder="Adet"
                  />
                  <div style={{ position: 'relative' }}>
                    <input
                      className="form-input"
                      type="number" min={0} max={100} step={0.5}
                      value={tier.rate}
                      onChange={e => updateDiscount(i, 'rate', parseFloat(e.target.value) || 0)}
                      placeholder="Oran"
                      style={{ paddingRight: 28 }}
                    />
                    <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#aaa', fontSize: 13 }}>%</span>
                  </div>
                  <button
                    onClick={() => removeDiscount(i)}
                    style={{ width: 32, height: 36, background: 'rgba(239,68,68,.1)', color: '#DC2626', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <IconTrash size={13} />
                  </button>
                </div>
              ))}
              {settings.discounts.length === 0 && (
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                  Henüz iskonto kademesi eklenmedi
                </div>
              )}
              <div style={{ marginTop: 16, padding: '12px 14px', background: '#f8f8f8', borderRadius: 8, fontSize: 12, color: '#666' }}>
                <strong>Mevcut kademeler:</strong>{' '}
                {settings.discounts.length > 0
                  ? settings.discounts.map(t => `${t.qty}+ adet → %${t.rate}`).join(', ')
                  : '—'}
              </div>
            </div>
          </div>
          </div>{/* end flex column */}

        </div>{/* end grid-2 */}

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ minWidth: 140 }}>
            {saved
              ? <><IconCheck size={16} /> Kaydedildi!</>
              : <><IconDeviceFloppy size={16} /> {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}</>
            }
          </button>
        </div>
      </div>
    </>
  );
}
