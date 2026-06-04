'use client';
import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { Task, AppUser, Payment } from '@/types';
import {
  IconPlus, IconX, IconTrash, IconEdit, IconCheck,
  IconClock, IconPlayerPlay, IconCoin,
} from '@tabler/icons-react';

type TabKey = 'all' | 'todo' | 'in_progress' | 'done';

const STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'Yapılacak',
  in_progress: 'Devam Ediyor',
  done: 'Tamamlandı',
};
const STATUS_BADGE: Record<Task['status'], string> = {
  todo: 'badge-amber',
  in_progress: 'badge-blue',
  done: 'badge-green',
};

const emptyForm = {
  title: '', description: '', assignedTo: '', assignedToName: '',
  price: 0, showPriceToWorkshop: false, category: '', note: '', dueDate: '',
};

function fmtDate(ts: unknown): string {
  if (!ts) return '—';
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return d.toLocaleDateString('tr-TR');
}

export default function FasonPage() {
  const { user, role } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workers, setWorkers] = useState<AppUser[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payWorker, setPayWorker] = useState<AppUser | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [paySaving, setPaySaving] = useState(false);
  const canPay = role === 'admin' || role === 'mudur';

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [tasksSnap, usersSnap, paymentsSnap] = await Promise.all([
      getDocs(query(collection(db, 'tasks'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'users'), where('role', '==', 'atolye'))),
      getDocs(query(collection(db, 'payments'), orderBy('date', 'desc'))),
    ]);
    setTasks(tasksSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
    setWorkers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser)));
    setPayments(paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Payment)));
    setLoading(false);
  }

  async function savePayment() {
    if (!payWorker || !payAmount || parseFloat(payAmount) <= 0) return;
    setPaySaving(true);
    await addDoc(collection(db, 'payments'), {
      workerId: payWorker.uid,
      workerName: payWorker.name || payWorker.email,
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

  const filtered = tasks.filter(t => tab === 'all' || t.status === tab);

  const stats = {
    total: tasks.length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    hakEdis: tasks.filter(t => t.status === 'done').reduce((s, t) => s + (t.price ?? 0), 0),
  };

  // Atölye bazlı istatistik
  const workerStats = workers.map(w => {
    const hakedis = tasks.filter(t => t.assignedTo === w.uid && t.status === 'done').reduce((s, t) => s + (t.price ?? 0), 0);
    const odenen = payments.filter(p => p.workerId === w.uid).reduce((s, p) => s + p.amount, 0);
    return {
      ...w,
      done: tasks.filter(t => t.assignedTo === w.uid && t.status === 'done').length,
      inProg: tasks.filter(t => t.assignedTo === w.uid && t.status === 'in_progress').length,
      hakedis,
      odenen,
      kalan: hakedis - odenen,
    };
  });

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(t: Task) {
    setEditing(t);
    setForm({
      title: t.title, description: t.description,
      assignedTo: t.assignedTo, assignedToName: t.assignedToName,
      price: t.price, showPriceToWorkshop: t.showPriceToWorkshop,
      category: t.category, note: t.note, dueDate: t.dueDate || '',
    });
    setOpen(true);
  }

  async function save() {
    if (!form.title.trim() || !form.assignedTo) return;
    setSaving(true);
    const worker = workers.find(w => w.uid === form.assignedTo);
    const payload = {
      ...form,
      assignedToName: worker?.name || worker?.email || form.assignedToName,
    };
    try {
      if (editing?.id) {
        await updateDoc(doc(db, 'tasks', editing.id), payload);
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...payload,
          status: 'todo',
          createdBy: user?.uid || '',
          createdByName: user?.displayName || user?.email || '',
          createdAt: serverTimestamp(),
          startedAt: null,
          completedAt: null,
        });
      }
      setOpen(false);
      loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Bu görevi silmek istediğinize emin misiniz?')) return;
    await deleteDoc(doc(db, 'tasks', id));
    loadAll();
  }

  async function changeStatus(t: Task, status: Task['status']) {
    const update: Record<string, unknown> = { status };
    if (status === 'in_progress') update.startedAt = serverTimestamp();
    if (status === 'done') update.completedAt = serverTimestamp();
    await updateDoc(doc(db, 'tasks', t.id!), update);
    loadAll();
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'Tümü' },
    { key: 'todo', label: 'Yapılacak' },
    { key: 'in_progress', label: 'Devam Ediyor' },
    { key: 'done', label: 'Tamamlandı' },
  ];

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Fason Takip</div>
          <div className="page-sub">{tasks.length} görev</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <IconPlus size={16} /> Yeni Görev
        </button>
      </div>

      <div className="page-content">

        {/* Stat kartları */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <div className="stat-card accent-orange">
            <div className="stat-label">Toplam Görev</div>
            <div className="stat-value">{loading ? '—' : stats.total}</div>
          </div>
          <div className="stat-card accent-blue">
            <div className="stat-label">Devam Eden</div>
            <div className="stat-value">{loading ? '—' : stats.inProgress}</div>
          </div>
          <div className="stat-card accent-green">
            <div className="stat-label">Tamamlanan</div>
            <div className="stat-value">{loading ? '—' : stats.done}</div>
          </div>
          <div className="stat-card accent-red">
            <div className="stat-label">Toplam Hakediş</div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {loading ? '—' : `₺${stats.hakEdis.toLocaleString('tr-TR')}`}
            </div>
          </div>
        </div>

        {/* Atölye bazlı özet */}
        {workerStats.length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <div className="card-title">Atölye Bazlı Özet</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 12, padding: 16 }}>
              {workerStats.map(w => (
                <div key={w.uid} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '14px 16px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: 'var(--text-1)' }}>{w.name || w.email}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 2 }}>
                    <span style={{ color: '#4ADE80' }}>✓ {w.done} tamamlandı</span><br />
                    <span style={{ color: '#60A5FA' }}>▶ {w.inProg} devam ediyor</span><br />
                    <span style={{ color: '#E85D04', fontWeight: 700 }}>₺{w.hakedis.toLocaleString('tr-TR')} hakediş</span><br />
                    <span style={{ color: '#10b981' }}>₺{w.odenen.toLocaleString('tr-TR')} ödendi</span><br />
                    <span style={{ color: w.kalan > 0 ? '#f59e0b' : '#6b7280', fontWeight: 700 }}>₺{w.kalan.toLocaleString('tr-TR')} kalan</span>
                  </div>
                  {canPay && (
                    <button
                      onClick={() => { setPayWorker(w as AppUser); setPayOpen(true); }}
                      style={{
                        marginTop: 10, width: '100%', padding: '6px 0',
                        background: '#10b981', color: '#fff', border: 'none',
                        borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      }}
                    >
                      <IconCoin size={13} /> Ödeme Yap
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab + Görev Listesi */}
        <div className="card">
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, padding: '12px 16px 0', borderBottom: '1px solid var(--border)' }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '7px 16px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: tab === t.key ? 700 : 500,
                  background: tab === t.key ? 'var(--or-tint)' : 'transparent',
                  color: tab === t.key ? 'var(--or)' : 'var(--text-3)',
                  borderBottom: tab === t.key ? '2px solid var(--or)' : '2px solid transparent',
                }}
              >
                {t.label}
                <span style={{ marginLeft: 6, fontSize: 11, background: 'var(--surface-2)', borderRadius: 10, padding: '1px 7px' }}>
                  {t.key === 'all' ? tasks.length : tasks.filter(x => x.status === t.key).length}
                </span>
              </button>
            ))}
          </div>

          <div className="table-wrap">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Yükleniyor...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Görev yok</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Başlık</th>
                    <th>Atanan</th>
                    <th>Kategori</th>
                    <th>Durum</th>
                    <th>Hakediş</th>
                    <th>Ödeme</th>
                    <th>Tarih</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>
                        {t.title}
                        {t.description && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t.description}</div>}
                      </td>
                      <td>{t.assignedToName}</td>
                      <td>{t.category ? <span className="badge badge-blue">{t.category}</span> : '—'}</td>
                      <td>
                        <select
                          value={t.status}
                          onChange={e => changeStatus(t, e.target.value as Task['status'])}
                          style={{ background: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}
                        >
                          <option value="todo">Yapılacak</option>
                          <option value="in_progress">Devam Ediyor</option>
                          <option value="done">Tamamlandı</option>
                        </select>
                      </td>
                      <td style={{ fontWeight: 700, color: '#E85D04' }}>₺{(t.price ?? 0).toLocaleString('tr-TR')}</td>
                      <td>
                        {t.status === 'done' && (role === 'admin' || role === 'mudur') && (
                          <button
                            onClick={async () => {
                              await import('firebase/firestore').then(async ({ updateDoc, doc: fDoc, serverTimestamp }) => {
                                await updateDoc(fDoc(db, 'tasks', t.id!), {
                                  paid: !t.paid,
                                  paidAt: !t.paid ? serverTimestamp() : null,
                                });
                              });
                              loadAll();
                            }}
                            style={{
                              fontSize: 11, padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600,
                              background: t.paid ? '#d1fae5' : '#fee2e2',
                              color: t.paid ? '#065f46' : '#991b1b',
                            }}
                          >
                            {t.paid ? '✓ Ödendi' : 'Bekliyor'}
                          </button>
                        )}
                        {t.status === 'done' && role !== 'admin' && role !== 'mudur' && (
                          <span style={{ fontSize: 11, color: t.paid ? '#065f46' : '#991b1b', fontWeight: 600 }}>
                            {t.paid ? '✓ Ödendi' : 'Bekliyor'}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{fmtDate(t.createdAt)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(t)}><IconEdit size={13} /></button>
                          <button className="btn btn-sm" style={{ background: 'rgba(248,113,113,.1)', color: '#F87171' }} onClick={() => remove(t.id!)}><IconTrash size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Ödeme Yap Modal */}
      {payOpen && payWorker && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setPayOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Ödeme Yap — {payWorker.name || payWorker.email}</h3>
              <button onClick={() => setPayOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><IconX size={20} /></button>
            </div>
            {(() => {
              const workerStat = workerStats.find(w => w.uid === payWorker.uid);
              return workerStat && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                  {[
                    { label: 'Toplam Hakediş', value: `₺${workerStat.hakedis.toLocaleString('tr-TR')}`, color: 'var(--primary)' },
                    { label: 'Ödenen', value: `₺${workerStat.odenen.toLocaleString('tr-TR')}`, color: '#10b981' },
                    { label: 'Kalan', value: `₺${workerStat.kalan.toLocaleString('tr-TR')}`, color: workerStat.kalan > 0 ? '#f59e0b' : '#6b7280' },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="form-group">
              <label className="form-label">Ödeme Tutarı (₺) *</label>
              <input className="form-input" type="number" min={0} value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Not</label>
              <input className="form-input" value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="Opsiyonel not..." />
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

      {/* Görev Modal */}
      {open && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>{editing ? 'Görevi Düzenle' : 'Yeni Görev'}</h3>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><IconX size={20} /></button>
            </div>

            <div className="form-group">
              <label className="form-label">Başlık *</label>
              <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Görev başlığı" />
            </div>

            <div className="form-group">
              <label className="form-label">Açıklama</label>
              <textarea className="form-input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detaylar..." style={{ resize: 'vertical' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Atanan Kişi *</label>
                <select className="form-input" value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}>
                  <option value="">Kişi Seç</option>
                  {workers.map(w => (
                    <option key={w.uid} value={w.uid}>{w.name || w.email}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Kategori</label>
                <input className="form-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Dikiş, Baskı..." />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Bitiş Tarihi</label>
                <input className="form-input" type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Hakediş (₺)</label>
                <input className="form-input" type="number" min={0} value={form.price} onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ display: 'none' }}></div>
              <div className="form-group">
                <label className="form-label">Atölyeye Fiyat Göster</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, showPriceToWorkshop: !f.showPriceToWorkshop }))}
                    style={{
                      width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                      background: form.showPriceToWorkshop ? '#E85D04' : 'var(--surface-3)',
                      position: 'relative', transition: 'background .2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%',
                      background: '#fff', transition: 'left .2s',
                      left: form.showPriceToWorkshop ? 22 : 2,
                    }} />
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{form.showPriceToWorkshop ? 'Görünür' : 'Gizli'}</span>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Not</label>
              <textarea className="form-input" rows={2} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Ek notlar..." style={{ resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>İptal</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !form.title.trim() || !form.assignedTo}>
                {saving ? 'Kaydediliyor...' : editing ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
