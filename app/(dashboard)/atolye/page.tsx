'use client';
import { useEffect, useState } from 'react';
import {
  collection, getDocs, addDoc, query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { AppUser, Task, Payment } from '@/types';
import { IconX, IconCoin } from '@tabler/icons-react';
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
}

function fmtDate(ts: unknown): string {
  if (!ts) return '—';
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return d.toLocaleDateString('tr-TR');
}

export default function AtölyelerPage() {
  const { user, role } = useAuth();
  const [workerStats, setWorkerStats] = useState<WorkerStat[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [payWorker, setPayWorker] = useState<WorkerStat | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [paySaving, setPaySaving] = useState(false);

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
    const allPayments = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Payment));

    const stats: WorkerStat[] = workers.map(w => {
      const hakedis = allTasks
        .filter(t => t.assignedTo === w.uid && t.status === 'done')
        .reduce((s, t) => s + (t.price ?? 0), 0);
      const odenen = allPayments
        .filter(p => p.workerId === w.uid)
        .reduce((s, p) => s + p.amount, 0);
      return {
        worker: w,
        todo: allTasks.filter(t => t.assignedTo === w.uid && t.status === 'todo').length,
        in_progress: allTasks.filter(t => t.assignedTo === w.uid && t.status === 'in_progress').length,
        done: allTasks.filter(t => t.assignedTo === w.uid && t.status === 'done').length,
        hakedis,
        odenen,
        kalan: hakedis - odenen,
      };
    });

    setWorkerStats(stats);
    setPayments(allPayments);
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
    name: ws.worker.name || ws.worker.email,
    'Yapılacak': ws.todo,
    'Devam': ws.in_progress,
    'Tamamlanan': ws.done,
  }));

  // Resolve worker name from payments list for display
  const allWorkerNames: Record<string, string> = {};
  workerStats.forEach(ws => {
    allWorkerNames[ws.worker.uid] = ws.worker.name || ws.worker.email;
  });

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Atölyeler</div>
          <div className="page-sub">{workerStats.length} atölye çalışanı</div>
        </div>
      </div>

      <div className="page-content">

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Yükleniyor…</div>
        ) : (
          <>
            {/* Performance Chart */}
            {workerStats.length > 0 && (
              <div className="card" style={{ marginBottom: 20, padding: '20px 16px' }}>
                <div className="card-header" style={{ paddingBottom: 12 }}>
                  <div className="card-title">Atölye Performans Karşılaştırması</div>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-3)', fontSize: 12 }} />
                    <YAxis tick={{ fill: 'var(--text-3)', fontSize: 12 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8 }}
                      labelStyle={{ color: 'var(--text-1)', fontWeight: 700 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-3)' }} />
                    <Bar dataKey="Yapılacak" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Devam" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Tamamlanan" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Worker Cards */}
            {workerStats.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>
                Henüz atölye çalışanı bulunmuyor.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
                {workerStats.map(ws => (
                  <div
                    key={ws.worker.uid}
                    style={{
                      background: 'var(--card)', border: '1px solid var(--border)',
                      borderRadius: 12, padding: 20,
                    }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: '50%',
                        background: 'var(--primary)', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 700, flexShrink: 0,
                      }}>
                        {(ws.worker.name || ws.worker.email).substring(0, 2).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ws.worker.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ws.worker.email}
                        </div>
                      </div>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6,
                        fontSize: 11, fontWeight: 600, flexShrink: 0,
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
                        { label: 'Hakediş', value: ws.hakedis, color: 'var(--primary)' },
                        { label: 'Ödenen', value: ws.odenen, color: '#10b981' },
                        { label: 'Kalan', value: ws.kalan, color: ws.kalan > 0 ? '#f59e0b' : '#6b7280' },
                      ].map(row => (
                        <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{row.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: row.color }}>
                            ₺{row.value.toLocaleString('tr-TR')}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Pay Button */}
                    {canPay && (
                      <button
                        onClick={() => { setPayWorker(ws); setPayOpen(true); }}
                        style={{
                          width: '100%', padding: '8px 0',
                          background: '#10b981', color: '#fff', border: 'none',
                          borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      >
                        <IconCoin size={14} /> Ödeme Yap
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Payment History */}
            {payments.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Ödeme Geçmişi</div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Çalışan</th>
                        <th>Tutar</th>
                        <th>Not</th>
                        <th>Tarih</th>
                        <th>Kaydeden</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.workerName}</td>
                          <td style={{ fontWeight: 700, color: '#10b981' }}>₺{p.amount.toLocaleString('tr-TR')}</td>
                          <td style={{ color: 'var(--text-3)', fontSize: 12 }}>{p.note || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{fmtDate(p.date)}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{p.createdBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Payment Modal */}
      {payOpen && payWorker && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setPayOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>
                Ödeme Yap — {payWorker.worker.name || payWorker.worker.email}
              </h3>
              <button onClick={() => setPayOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                <IconX size={20} />
              </button>
            </div>

            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Hakediş', value: `₺${payWorker.hakedis.toLocaleString('tr-TR')}`, color: 'var(--primary)' },
                { label: 'Ödenen', value: `₺${payWorker.odenen.toLocaleString('tr-TR')}`, color: '#10b981' },
                { label: 'Kalan', value: `₺${payWorker.kalan.toLocaleString('tr-TR')}`, color: payWorker.kalan > 0 ? '#f59e0b' : '#6b7280' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center', border: '1px solid var(--border)' }}>
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
                style={{ background: '#10b981' }}
              >
                {paySaving ? 'Kaydediliyor...' : '✓ Ödemeyi Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
