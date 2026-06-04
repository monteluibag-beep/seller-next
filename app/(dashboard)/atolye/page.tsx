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

function exportExcel(payments: Payment[], workerName?: string) {
  const rows = [
    ['Çalışan', 'Tutar (₺)', 'Not', 'Tarih', 'Kaydeden'],
    ...payments.map(p => [
      p.workerName,
      p.amount,
      p.note || '',
      fmtDate(p.date),
      p.createdBy,
    ]),
  ];
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `odeme-gecmisi${workerName ? '-' + workerName : ''}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AtölyelerPage() {
  const { user, role, loading: authLoading } = useAuth();
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

  // Only show pay buttons after auth is resolved
  const canPay = !authLoading && (role === 'admin' || role === 'mudur');

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
            onClick={() => exportExcel(allPayments)}
          >
            📥 Tümünü Excel İndir
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
                  <div style={{ display: 'grid', gridTemplateColumns: ws.workerPayments.length > 0 ? '1fr 1fr' : '1fr', gap: 8 }}>
                    {canPay && (
                      <button
                        onClick={() => { setPayWorker(ws); setPayAmount(''); setPayNote(''); setPayOpen(true); }}
                        style={{
                          padding: '8px 0', background: '#10b981', color: '#fff', border: 'none',
                          borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        }}
                      >
                        <IconCoin size={14} /> Ödeme Yap
                      </button>
                    )}
                    {ws.workerPayments.length > 0 && (
                      <button
                        onClick={() => { setHistWorker(ws); setHistOpen(true); }}
                        style={{
                          padding: '8px 0', background: 'var(--bg)', color: 'var(--text-2)',
                          border: '1px solid var(--border)', borderRadius: 8,
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        }}
                      >
                        <IconHistory size={14} /> Ödeme Geçmişi
                      </button>
                    )}
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
                  onClick={() => exportExcel(histWorker.workerPayments, histWorker.worker.name || histWorker.worker.email)}
                >
                  📥 Excel
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
