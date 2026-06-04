'use client';
import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { Task, AppUser, Payment } from '@/types';
import { IconPlus, IconX, IconTrash, IconEdit, IconHistory, IconCheck } from '@tabler/icons-react';

type TabKey = 'all' | 'todo' | 'in_progress' | 'done';

const STATUS_CONFIG = {
  todo:        { label: 'Yapılacak',    color: '#f59e0b', bg: 'rgba(245,158,11,.15)',  dot: '#f59e0b' },
  in_progress: { label: 'Devam Ediyor', color: '#3b82f6', bg: 'rgba(59,130,246,.15)',  dot: '#3b82f6' },
  done:        { label: 'Tamamlandı',   color: '#10b981', bg: 'rgba(16,185,129,.15)',  dot: '#10b981' },
};

const emptyForm = {
  title: '', description: '', assignedTo: '', assignedToName: '',
  price: 0, showPriceToWorkshop: false, category: '', note: '', dueDate: '',
};

function fmtDate(ts: unknown): string {
  if (!ts) return '';
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
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
  const [changingStatus, setChangingStatus] = useState<string | null>(null);

  // Ödeme Geçmişi modal
  const [histOpen, setHistOpen] = useState(false);
  const [histWorkerUid, setHistWorkerUid] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const isAdmin = role === 'admin' || role === 'mudur';

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

  const visibleTasks = role === 'atolye' ? tasks.filter(t => t.assignedTo === user?.uid) : tasks;
  const filtered = visibleTasks.filter(t => tab === 'all' || t.status === tab);

  const stats = {
    total: visibleTasks.length,
    inProgress: visibleTasks.filter(t => t.status === 'in_progress').length,
    done: visibleTasks.filter(t => t.status === 'done').length,
    hakEdis: visibleTasks.filter(t => t.status === 'done').reduce((s, t) => s + (t.price ?? 0), 0),
  };

  // Her çalışan için bakiye: sadece received===true ödemeler düşer
  function getWorkerBalance(workerUid: string) {
    const hakedis = tasks.filter(t => t.assignedTo === workerUid && t.status === 'done').reduce((s, t) => s + (t.price ?? 0), 0);
    const workerPayments = payments.filter(p => p.workerId === workerUid);
    const odenen = workerPayments.filter(p => p.received).reduce((s, p) => s + p.amount, 0);
    const bekleyen = workerPayments.filter(p => !p.received).reduce((s, p) => s + p.amount, 0);
    return { hakedis, odenen, bekleyen, kalan: hakedis - odenen, workerPayments };
  }

  // Ödemeyi "Alındı" olarak işaretle
  async function confirmReceived(paymentId: string) {
    setConfirmingId(paymentId);
    await updateDoc(doc(db, 'payments', paymentId), {
      received: true,
      receivedAt: serverTimestamp(),
    });
    await loadAll();
    setConfirmingId(null);
  }

  function openAdd() { setEditing(null); setForm(emptyForm); setOpen(true); }
  function openEdit(t: Task) {
    setEditing(t);
    setForm({ title: t.title, description: t.description, assignedTo: t.assignedTo, assignedToName: t.assignedToName, price: t.price, showPriceToWorkshop: t.showPriceToWorkshop, category: t.category, note: t.note, dueDate: t.dueDate || '' });
    setOpen(true);
  }

  async function save() {
    if (!form.title.trim() || !form.assignedTo) return;
    setSaving(true);
    const worker = workers.find(w => w.uid === form.assignedTo);
    const payload = { ...form, assignedToName: worker?.name || worker?.email || form.assignedToName };
    try {
      if (editing?.id) {
        await updateDoc(doc(db, 'tasks', editing.id), payload);
      } else {
        await addDoc(collection(db, 'tasks'), { ...payload, status: 'todo', createdBy: user?.uid || '', createdByName: user?.displayName || user?.email || '', createdAt: serverTimestamp(), startedAt: null, completedAt: null });
      }
      setOpen(false);
      loadAll();
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!confirm('Bu görevi silmek istediğinize emin misiniz?')) return;
    await deleteDoc(doc(db, 'tasks', id));
    loadAll();
  }

  async function changeStatus(t: Task, status: Task['status']) {
    setChangingStatus(t.id!);
    const update: Record<string, unknown> = { status };
    if (status === 'in_progress') update.startedAt = serverTimestamp();
    if (status === 'done') update.completedAt = serverTimestamp();
    await updateDoc(doc(db, 'tasks', t.id!), update);
    await loadAll();
    setChangingStatus(null);
  }

  async function togglePaid(t: Task) {
    const { updateDoc: upd, doc: fDoc, serverTimestamp: sts } = await import('firebase/firestore');
    await upd(fDoc(db, 'tasks', t.id!), { paid: !t.paid, paidAt: !t.paid ? sts() : null });
    loadAll();
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'Tümü' },
    { key: 'todo', label: 'Yapılacak' },
    { key: 'in_progress', label: 'Devam' },
    { key: 'done', label: 'Tamam' },
  ];

  // Ödeme geçmişi modal için aktif çalışan
  const histWorker = histWorkerUid ? workers.find(w => w.uid === histWorkerUid) : null;
  const histBalance = histWorkerUid ? getWorkerBalance(histWorkerUid) : null;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title">Fason Takip</div>
          <div className="page-sub">{visibleTasks.length} görev</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openAdd}>
            <IconPlus size={16} /> Yeni Görev
          </button>
        )}
      </div>

      <div className="page-content">

        {/* Stat kartları */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Toplam', value: stats.total, color: '#E85D04' },
            { label: 'Devam Eden', value: stats.inProgress, color: '#3b82f6' },
            { label: 'Tamamlanan', value: stats.done, color: '#10b981' },
            { label: 'Toplam Hakediş', value: `₺${stats.hakEdis.toLocaleString('tr-TR')}`, color: '#f59e0b', small: true },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: s.small ? 18 : 24, fontWeight: 800, color: s.color }}>{loading ? '—' : s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
          {tabs.map(t => {
            const count = t.key === 'all' ? visibleTasks.length : visibleTasks.filter(x => x.status === t.key).length;
            const active = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flexShrink: 0, padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                background: active ? 'var(--or)' : 'var(--card)',
                color: active ? '#fff' : 'var(--text-3)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {t.label}
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  background: active ? 'rgba(255,255,255,.25)' : 'var(--bg)',
                  color: active ? '#fff' : 'var(--text-3)',
                  borderRadius: 10, padding: '1px 7px',
                }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Görev Kartları */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Yükleniyor…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Bu kategoride görev yok</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(t => {
              const cfg = STATUS_CONFIG[t.status];
              const isChanging = changingStatus === t.id;
              const showPrice = role !== 'atolye' || t.showPriceToWorkshop;
              const workerBalance = getWorkerBalance(t.assignedTo);
              const pendingCount = workerBalance.workerPayments.filter(p => !p.received).length;

              return (
                <div key={t.id} style={{
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 14, overflow: 'hidden',
                  borderLeft: `4px solid ${cfg.dot}`,
                }}>
                  {/* Card Header */}
                  <div style={{ padding: '14px 14px 0 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)', marginBottom: 4, lineHeight: 1.3 }}>
                        {t.title}
                      </div>
                      {t.description && (
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6, lineHeight: 1.4 }}>{t.description}</div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>👤 {t.assignedToName || '—'}</span>
                        {t.category && (
                          <span style={{ fontSize: 11, background: 'rgba(59,130,246,.15)', color: '#60a5fa', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
                            {t.category}
                          </span>
                        )}
                      </div>
                    </div>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => openEdit(t)} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <IconEdit size={14} />
                        </button>
                        <button onClick={() => remove(t.id!)} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.2)', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <IconTrash size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Tarih + Hakediş */}
                  <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: '6px 16px', borderBottom: '1px solid var(--border)' }}>
                    {!!t.createdAt && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Başlangıç</span>
                        <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>{fmtDate(t.createdAt)}</span>
                      </div>
                    )}
                    {t.dueDate && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bitiş</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: t.status !== 'done' && new Date(t.dueDate) < new Date() ? '#f87171' : 'var(--text-2)' }}>
                          {new Date(t.dueDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    )}
                    {showPrice && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
                        <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Hakediş</span>
                        <span style={{ fontSize: 14, color: '#E85D04', fontWeight: 800 }}>₺{(t.price ?? 0).toLocaleString('tr-TR')}</span>
                      </div>
                    )}
                    {t.status === 'done' && (
                      isAdmin ? (
                        <button onClick={() => togglePaid(t)} style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700,
                          background: t.paid ? 'rgba(16,185,129,.15)' : 'rgba(248,113,113,.15)',
                          color: t.paid ? '#10b981' : '#f87171',
                        }}>
                          {t.paid ? '✓ Ödendi' : '⏳ Ödeme Bekliyor'}
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, color: t.paid ? '#10b981' : '#f87171' }}>
                          {t.paid ? '✓ Ödendi' : '⏳ Ödeme Bekliyor'}
                        </span>
                      )
                    )}
                  </div>

                  {/* Durum Butonları */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
                    {(['todo', 'in_progress', 'done'] as Task['status'][]).map((s, i) => {
                      const c = STATUS_CONFIG[s];
                      const active = t.status === s;
                      return (
                        <button
                          key={s}
                          disabled={isChanging || (!isAdmin && role === 'atolye' && s === 'todo')}
                          onClick={() => !active && changeStatus(t, s)}
                          style={{
                            padding: '10px 4px', border: 'none', cursor: active ? 'default' : 'pointer',
                            borderRight: i < 2 ? '1px solid var(--border)' : 'none',
                            background: active ? c.bg : 'transparent',
                            color: active ? c.color : 'var(--text-3)',
                            fontSize: 12, fontWeight: active ? 700 : 500,
                            transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                            opacity: isChanging ? 0.5 : 1,
                          }}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? c.dot : 'var(--border)', flexShrink: 0 }} />
                          {c.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Ödeme Geçmişi Butonu */}
                  <button
                    onClick={() => { setHistWorkerUid(t.assignedTo); setHistOpen(true); }}
                    style={{
                      width: '100%', padding: '11px 14px', border: 'none', cursor: 'pointer',
                      background: 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      color: 'var(--text-3)', fontSize: 13, fontWeight: 600,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <IconHistory size={15} />
                      Ödeme Geçmişi
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {pendingCount > 0 && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, background: 'rgba(245,158,11,.2)',
                          color: '#f59e0b', borderRadius: 10, padding: '2px 8px',
                        }}>
                          {pendingCount} onay bekliyor
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>›</span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ödeme Geçmişi Modal */}
      {histOpen && histWorker && histBalance && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setHistOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>
                📋 Ödeme Geçmişi — {histWorker.name || histWorker.email}
              </h3>
              <button onClick={() => setHistOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                <IconX size={20} />
              </button>
            </div>

            {/* Özet */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Toplam Hakediş', value: `₺${histBalance.hakedis.toLocaleString('tr-TR')}`, color: '#E85D04' },
                { label: 'Alınan', value: `₺${histBalance.odenen.toLocaleString('tr-TR')}`, color: '#10b981' },
                { label: 'Kalan Bakiye', value: `₺${histBalance.kalan.toLocaleString('tr-TR')}`, color: histBalance.kalan > 0 ? '#f59e0b' : '#6b7280' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px', textAlign: 'center', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Bekleyen ödeme varsa uyarı */}
            {histBalance.bekleyen > 0 && (
              <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#f59e0b', fontWeight: 600 }}>
                ⚠️ ₺{histBalance.bekleyen.toLocaleString('tr-TR')} tutarında onay bekleyen ödeme var. Alındı onayı verildiğinde bakiyeden düşer.
              </div>
            )}

            {/* Ödeme Listesi */}
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {histBalance.workerPayments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
                  Henüz ödeme kaydı yok
                </div>
              ) : (
                histBalance.workerPayments.map(p => (
                  <div key={p.id} style={{
                    background: 'var(--bg)', borderRadius: 10, padding: '12px 14px',
                    border: `1px solid ${p.received ? 'rgba(16,185,129,.2)' : 'rgba(245,158,11,.25)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: p.received ? '#10b981' : '#f59e0b' }}>
                          ₺{p.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '2px 7px',
                          background: p.received ? 'rgba(16,185,129,.15)' : 'rgba(245,158,11,.15)',
                          color: p.received ? '#10b981' : '#f59e0b',
                        }}>
                          {p.received ? '✓ Alındı' : 'Onay Bekliyor'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {fmtDate(p.date)} · Kaydeden: {p.createdBy}
                      </div>
                      {p.note && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{p.note}</div>}
                    </div>

                    {/* Alındı Butonu — sadece received=false ise göster */}
                    {!p.received && (
                      <button
                        disabled={confirmingId === p.id}
                        onClick={() => confirmReceived(p.id!)}
                        style={{
                          flexShrink: 0, padding: '8px 14px', borderRadius: 10, border: 'none',
                          background: '#10b981', color: '#fff', fontSize: 12, fontWeight: 700,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                          opacity: confirmingId === p.id ? 0.6 : 1,
                        }}
                      >
                        <IconCheck size={14} />
                        {confirmingId === p.id ? '…' : 'Alındı'}
                      </button>
                    )}
                  </div>
                ))
              )}
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
                  {workers.map(w => <option key={w.uid} value={w.uid}>{w.name || w.email}</option>)}
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
            <div className="form-group">
              <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>Atölyeye Fiyat Göster</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" onClick={() => setForm(f => ({ ...f, showPriceToWorkshop: !f.showPriceToWorkshop }))}
                  style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: form.showPriceToWorkshop ? '#E85D04' : 'var(--surface-3)', position: 'relative', transition: 'background .2s' }}>
                  <span style={{ position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .2s', left: form.showPriceToWorkshop ? 22 : 2 }} />
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{form.showPriceToWorkshop ? 'Görünür' : 'Gizli'}</span>
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
