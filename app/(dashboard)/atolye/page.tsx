'use client';
import { useEffect, useState } from 'react';
import {
  collection, getDocs, addDoc, query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { AppUser, Task, Payment } from '@/types';
import { IconX, IconCoin, IconHistory } from '@tabler/icons-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface WorkerStat {
  worker: AppUser;
  todo: number;
  in_progress: number;
  done: number;
  hakedis: number;
  odenen: number;
  kalan: number;
  workerPayments: Payment[];
}

function fmtDate(ts: unknown): string {
  if (!ts) return '—';
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return d.toLocaleDateString('tr-TR');
}

async function exportPaymentPDF(payments: Payment[], workerName?: string, workerStats?: WorkerStat[]) {
  // Firma bilgilerini Firestore'dan çek
  let firmName = '', firmAddress = '', firmPhone = '', firmEmail = '';
  try {
    const { getDoc, doc: fDoc } = await import('firebase/firestore');
    const snap = await getDoc(fDoc(db, 'settings', 'main'));
    if (snap.exists()) {
      const d = snap.data();
      firmName = d.firmName || '';
      firmAddress = d.firmAddress || '';
      firmPhone = d.firmPhone || '';
      firmEmail = d.firmEmail || '';
    }
  } catch {}

  const now = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  const isAll = !workerName;

  // Tüm ödemeler için çalışan bazlı grupla
  type Group = { name: string; payments: Payment[]; hakedis: number; odenen: number; kalan: number };
  let groups: Group[] = [];

  if (isAll && workerStats) {
    groups = workerStats.map(ws => ({
      name: ws.worker.name || ws.worker.email || '',
      payments: ws.workerPayments,
      hakedis: ws.hakedis,
      odenen: ws.odenen,
      kalan: ws.kalan,
    }));
  } else {
    const odenen = payments.reduce((s, p) => s + p.amount, 0);
    groups = [{ name: workerName || '', payments, hakedis: 0, odenen, kalan: 0 }];
  }

  const totalOdenen = groups.reduce((s, g) => s + g.odenen, 0);

  const groupRows = groups.map(g => {
    if (g.payments.length === 0) return '';
    const rows = g.payments.map((p, i) => `
      <tr>
        <td style="text-align:center;color:#888">${i + 1}</td>
        <td>${fmtDate(p.date)}</td>
        <td style="text-align:right;font-weight:700;color:#E85D04">₺${p.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
        <td>${p.note || '—'}</td>
        <td style="text-align:center">
          <span style="font-size:11px;padding:3px 9px;border-radius:12px;font-weight:700;
            background:${p.received ? '#d1fae5' : '#fef3c7'};
            color:${p.received ? '#065f46' : '#92400e'}">
            ${p.received ? '✓ Teslim Alındı' : 'Onay Bekliyor'}
          </span>
        </td>
        <td style="color:#666;font-size:11px">${p.createdBy}</td>
      </tr>`).join('');

    const workerTotal = g.payments.reduce((s, p) => s + p.amount, 0);

    return `
      <div class="worker-section">
        <div class="worker-header">
          <div class="worker-name">👤 ${g.name}</div>
          ${isAll ? `
          <div class="worker-summary">
            <span>Hakediş: <strong style="color:#E85D04">₺${g.hakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong></span>
            <span>Ödenen: <strong style="color:#10b981">₺${g.odenen.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong></span>
            <span>Kalan: <strong style="color:${g.kalan > 0 ? '#d97706' : '#6b7280'}">₺${g.kalan.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong></span>
          </div>` : ''}
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:36px">#</th>
              <th>Tarih</th>
              <th style="text-align:right">Tutar</th>
              <th>Not</th>
              <th style="text-align:center">Durum</th>
              <th>Kaydeden</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="text-align:right;font-weight:700;padding-top:8px">Toplam Ödeme:</td>
              <td style="text-align:right;font-weight:800;font-size:14px;color:#E85D04;padding-top:8px">
                ₺${workerTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </td>
              <td colspan="3"></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8"/>
<title>Ödeme Raporu${workerName ? ' — ' + workerName : ''}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; }
  .page { width: 210mm; min-height: 297mm; padding: 14mm 16mm; margin: 0 auto; }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; margin-bottom: 20px; border-bottom: 3px solid #E85D04; }
  .logo img { height: 56px; object-fit: contain; }
  .firm-info { text-align: right; font-size: 12px; color: #555; line-height: 1.7; }
  .firm-name { font-size: 16px; font-weight: 800; color: #E85D04; }

  /* Belge Başlığı */
  .doc-title { font-size: 22px; font-weight: 900; color: #1a1a1a; letter-spacing: -0.5px; margin-bottom: 4px; }
  .doc-sub { font-size: 13px; color: #666; margin-bottom: 20px; }

  /* Özet Banner */
  .summary-banner { background: linear-gradient(135deg, #fff8f0 0%, #fff3e6 100%); border: 1px solid #fcd9b0; border-radius: 10px; padding: 14px 18px; margin-bottom: 24px; display: flex; gap: 32px; flex-wrap: wrap; }
  .summary-item { display: flex; flex-direction: column; gap: 2px; }
  .summary-label { font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  .summary-value { font-size: 18px; font-weight: 800; color: #E85D04; }
  .summary-value.green { color: #10b981; }
  .summary-value.gray { color: #6b7280; }

  /* Açıklama Yazısı */
  .statement { background: #f9fafb; border-left: 4px solid #E85D04; border-radius: 0 8px 8px 0; padding: 12px 16px; margin-bottom: 24px; font-size: 13px; color: #374151; line-height: 1.7; }
  .statement strong { color: #1a1a1a; }

  /* Çalışan Bölümü */
  .worker-section { margin-bottom: 28px; page-break-inside: avoid; }
  .worker-header { display: flex; justify-content: space-between; align-items: center; background: #1a1a1a; color: #fff; padding: 10px 14px; border-radius: 8px 8px 0 0; margin-bottom: 0; }
  .worker-name { font-size: 14px; font-weight: 700; }
  .worker-summary { display: flex; gap: 20px; font-size: 12px; color: #ccc; }
  .worker-summary strong { font-size: 13px; }

  /* Tablo */
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #f3f4f6; }
  th { padding: 9px 12px; text-align: left; font-size: 11px; color: #555; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 2px solid #e5e7eb; }
  td { padding: 9px 12px; border-bottom: 1px solid #f0f0f0; font-size: 12.5px; vertical-align: middle; }
  tbody tr:hover td { background: #fafafa; }
  tfoot tr td { background: #f9fafb; border-top: 2px solid #e5e7eb; }

  /* İmza Alanı */
  .signature-section { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; page-break-inside: avoid; }
  .signature-box { border-top: 1.5px solid #d1d5db; padding-top: 10px; }
  .signature-label { font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 4px; }
  .signature-sub { font-size: 11px; color: #9ca3af; }
  .signature-space { height: 52px; }

  /* Footer */
  .footer { margin-top: 32px; padding-top: 14px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; }

  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .page { padding: 10mm 14mm; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header / Antet -->
  <div class="header">
    <div class="logo">
      <img src="/logo.png" alt="${firmName || 'Logo'}" onerror="this.style.display='none'" />
    </div>
    <div class="firm-info">
      <div class="firm-name">${firmName}</div>
      ${firmAddress ? `<div>${firmAddress}</div>` : ''}
      ${firmPhone ? `<div>${firmPhone}</div>` : ''}
      ${firmEmail ? `<div>${firmEmail}</div>` : ''}
    </div>
  </div>

  <!-- Belge Başlığı -->
  <div class="doc-title">ÖDEME RAPORU</div>
  <div class="doc-sub">
    Düzenlenme Tarihi: <strong>${now}</strong>
    ${workerName ? ` &nbsp;·&nbsp; Çalışan: <strong>${workerName}</strong>` : ''}
  </div>

  <!-- Özet Banner -->
  <div class="summary-banner">
    <div class="summary-item">
      <span class="summary-label">Toplam Ödeme Adedi</span>
      <span class="summary-value">${payments.length}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Toplam Ödenen Tutar</span>
      <span class="summary-value">₺${totalOdenen.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Mutabakat Durumu</span>
      <span class="summary-value ${payments.every(p => p.received) ? 'green' : 'gray'}">
        ${payments.filter(p => p.received).length} / ${payments.length} Onaylı
      </span>
    </div>
  </div>

  <!-- Açıklama Yazısı -->
  <div class="statement">
    İşbu belge, <strong>${firmName || 'firmamız'}</strong> tarafından aşağıda adları ve tutarları belirtilen
    atölye çalışanlarına gerçekleştirilen ödemeleri kapsamaktadır.
    Belge içeriğindeki tüm ödemeler kayıt altına alınmış olup taraflarca mutabık kalınmıştır.
    Ödeme tutarlarının eksiksiz teslim edildiğini teyit ederiz.
  </div>

  <!-- Ödeme Tabloları -->
  ${groupRows}

  <!-- İmza Alanları -->
  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-label">Ödeyen / Yetkili İmza</div>
      <div class="signature-sub">${firmName}</div>
      <div class="signature-space"></div>
      <div style="font-size:12px;color:#6b7280">Ad Soyad: ___________________</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">Tarih: ${now}</div>
    </div>
    <div class="signature-box">
      <div class="signature-label">Teslim Alan / Atölye Onayı</div>
      <div class="signature-sub">Yukarıda belirtilen tutarları eksiksiz teslim aldığımı beyan ederim.</div>
      <div class="signature-space"></div>
      <div style="font-size:12px;color:#6b7280">Ad Soyad: ___________________</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">Tarih: _____________________</div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>${firmName}${firmAddress ? ' · ' + firmAddress : ''}</span>
    <span>Belge No: OD-${Date.now().toString().slice(-8)}</span>
  </div>

</div>
<script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (w) { w.document.write(html); w.document.close(); }
}

export default function AtölyelerPage() {
  const { user, role, loading: authLoading } = useAuth();
  // authLoading is from useAuth
  const [workerStats, setWorkerStats] = useState<WorkerStat[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  // Ödeme Yap modal
  const [payOpen, setPayOpen] = useState(false);
  const [payWorker, setPayWorker] = useState<WorkerStat | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [paySaving, setPaySaving] = useState(false);

  // Ödeme Geçmişi modal
  const [histOpen, setHistOpen] = useState(false);
  const [histWorker, setHistWorker] = useState<WorkerStat | null>(null);

  // Show pay buttons for admin/mudur (null means still loading — show after resolve)
  const canPay = role === 'admin' || role === 'mudur';

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [usersSnap, tasksSnap, paymentsSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('role', '==', 'atolye'))),
      getDocs(collection(db, 'tasks')),
      getDocs(query(collection(db, 'payments'), orderBy('date', 'desc'))),
    ]);

    const workers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser));
    const allTasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
    const payments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Payment));

    const stats: WorkerStat[] = workers.map(w => {
      const hakedis = allTasks
        .filter(t => t.assignedTo === w.uid && t.status === 'done')
        .reduce((s, t) => s + (t.price ?? 0), 0);
      const workerPayments = payments.filter(p => p.workerId === w.uid);
      const odenen = workerPayments.reduce((s, p) => s + p.amount, 0);
      return {
        worker: w,
        todo: allTasks.filter(t => t.assignedTo === w.uid && t.status === 'todo').length,
        in_progress: allTasks.filter(t => t.assignedTo === w.uid && t.status === 'in_progress').length,
        done: allTasks.filter(t => t.assignedTo === w.uid && t.status === 'done').length,
        hakedis,
        odened: odenen,
        odenen,
        kalan: hakedis - odenen,
        workerPayments,
      };
    });

    setWorkerStats(stats);
    setAllPayments(payments);
    setLoading(false);
  }

  async function savePayment() {
    if (!payWorker || !payAmount || parseFloat(payAmount) <= 0) return;
    setPaySaving(true);
    await addDoc(collection(db, 'payments'), {
      workerId: payWorker.worker.uid,
      workerName: payWorker.worker.name || payWorker.worker.email,
      amount: parseFloat(payAmount),
      note: payNote,
      date: serverTimestamp(),
      createdBy: user?.email || '',
    });
    setPayOpen(false);
    setPayAmount('');
    setPayNote('');
    setPayWorker(null);
    setPaySaving(false);
    loadAll();
  }

  const chartData = workerStats.map(ws => ({
    name: (ws.worker.name || ws.worker.email || '').split(' ')[0],
    'Yapılacak': ws.todo,
    'Devam': ws.in_progress,
    'Tamamlanan': ws.done,
  }));

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Atölyeler</div>
          <div className="page-sub">{workerStats.length} atölye çalışanı</div>
        </div>
        {canPay && allPayments.length > 0 && (
          <button
            className="btn btn-secondary"
            onClick={() => exportPaymentPDF(allPayments, undefined, workerStats)}
          >
            🖨️ Tümünü PDF İndir
          </button>
        )}
      </div>

      <div className="page-content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Yükleniyor…</div>
        ) : workerStats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Henüz atölye çalışanı bulunmuyor.</div>
        ) : (
          <>
            {/* Performans Grafiği */}
            <div className="card" style={{ marginBottom: 20, padding: '20px 16px' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', marginBottom: 16 }}>
                Atölye Performans Karşılaştırması
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-3)', fontSize: 12 }} />
                  <YAxis tick={{ fill: 'var(--text-3)', fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-1)' }}
                    labelStyle={{ fontWeight: 700 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Yapılacak" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Devam" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Tamamlanan" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Worker Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
              {workerStats.map(ws => (
                <div key={ws.worker.uid} style={{
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 20,
                }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: '#E85D04', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 700, flexShrink: 0,
                    }}>
                      {(ws.worker.name || ws.worker.email || 'AT').substring(0, 2).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ws.worker.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ws.worker.email}
                      </div>
                    </div>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, flexShrink: 0,
                      background: ws.worker.active ? '#d1fae5' : '#fee2e2',
                      color: ws.worker.active ? '#065f46' : '#991b1b',
                    }}>
                      {ws.worker.active ? 'Aktif' : 'Pasif'}
                    </span>
                  </div>

                  {/* Task Counts */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                    {[
                      { label: 'Bekliyor', value: ws.todo, color: '#f59e0b' },
                      { label: 'Devam', value: ws.in_progress, color: '#3b82f6' },
                      { label: 'Tamam', value: ws.done, color: '#10b981' },
                    ].map(s => (
                      <div key={s.label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Financial */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 14 }}>
                    {[
                      { label: 'Toplam Hakediş', value: ws.hakedis, color: '#E85D04' },
                      { label: 'Ödenen', value: ws.odenen, color: '#10b981' },
                      { label: 'Kalan Bakiye', value: ws.kalan, color: ws.kalan > 0 ? '#f59e0b' : '#6b7280' },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{row.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: row.color }}>
                          ₺{row.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Buttons */}
                  <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                    <button
                      onClick={() => { setPayWorker(ws); setPayAmount(''); setPayNote(''); setPayOpen(true); }}
                      style={{
                        width: '100%', padding: '9px 0', background: '#10b981', color: '#fff', border: 'none',
                        borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      <IconCoin size={15} /> Ödeme Yap
                    </button>
                    <button
                      onClick={() => { setHistWorker(ws); setHistOpen(true); }}
                      style={{
                        width: '100%', padding: '9px 0', background: 'var(--bg)', color: 'var(--text-2)',
                        border: '1px solid var(--border)', borderRadius: 8,
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      <IconHistory size={15} /> Ödeme Geçmişi ({ws.workerPayments.length})
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Ödeme Yap Modal */}
      {payOpen && payWorker && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setPayOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>
                💰 Ödeme Yap — {payWorker.worker.name || payWorker.worker.email}
              </h3>
              <button onClick={() => setPayOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                <IconX size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
              {[
                { label: 'Hakediş', value: `₺${payWorker.hakedis.toLocaleString('tr-TR')}`, color: '#E85D04' },
                { label: 'Ödenen', value: `₺${payWorker.odenen.toLocaleString('tr-TR')}`, color: '#10b981' },
                { label: 'Kalan', value: `₺${payWorker.kalan.toLocaleString('tr-TR')}`, color: payWorker.kalan > 0 ? '#f59e0b' : '#6b7280' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px', textAlign: 'center', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div className="form-group">
              <label className="form-label">Ödeme Tutarı (₺) *</label>
              <input
                className="form-input"
                type="number"
                min={0}
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Not</label>
              <input
                className="form-input"
                value={payNote}
                onChange={e => setPayNote(e.target.value)}
                placeholder="Opsiyonel not..."
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setPayOpen(false)}>İptal</button>
              <button
                className="btn btn-primary"
                onClick={savePayment}
                disabled={paySaving || !payAmount || parseFloat(payAmount) <= 0}
                style={{ background: '#10b981', borderColor: '#10b981' }}
              >
                {paySaving ? 'Kaydediliyor…' : '✓ Ödemeyi Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ödeme Geçmişi Modal */}
      {histOpen && histWorker && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setHistOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>
                📋 Ödeme Geçmişi — {histWorker.worker.name || histWorker.worker.email}
              </h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: '5px 12px' }}
                  onClick={() => exportPaymentPDF(histWorker.workerPayments, histWorker.worker.name || histWorker.worker.email)}
                >
                  🖨️ PDF
                </button>
                <button onClick={() => setHistOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                  <IconX size={20} />
                </button>
              </div>
            </div>

            {/* Özet */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Toplam Hakediş', value: `₺${histWorker.hakedis.toLocaleString('tr-TR')}`, color: '#E85D04' },
                { label: 'Toplam Ödenen', value: `₺${histWorker.odenen.toLocaleString('tr-TR')}`, color: '#10b981' },
                { label: 'Kalan', value: `₺${histWorker.kalan.toLocaleString('tr-TR')}`, color: histWorker.kalan > 0 ? '#f59e0b' : '#6b7280' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px', textAlign: 'center', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Ödeme Listesi */}
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {histWorker.workerPayments.map(p => (
                <div key={p.id} style={{
                  background: 'var(--bg)', borderRadius: 10, padding: '12px 14px',
                  border: '1px solid #10b98130',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 16 }}>💰</span>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>
                        {fmtDate(p.date)}
                      </span>
                    </div>
                    {p.note && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.note}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Kaydeden: {p.createdBy}</div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#10b981', flexShrink: 0 }}>
                    +₺{p.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
