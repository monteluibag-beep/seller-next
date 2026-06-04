'use client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import { collection, getDocs, updateDoc, doc, serverTimestamp, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Task, Payment } from '@/types';
import {
  IconClipboardList, IconPlayerPlay, IconCheck,
  IconClock, IconCircleCheck, IconCoin, IconAlertCircle,
} from '@tabler/icons-react';

function formatTRY(n: number) {
  return `₺${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(ts: unknown): string {
  if (!ts) return '—';
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type Tab = 'active' | 'done' | 'payment';

export default function MyTasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('active');
  const [updating, setUpdating] = useState<string | null>(null);

  const load = async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const [taskSnap, paySnap] = await Promise.all([
        getDocs(query(collection(db, 'tasks'), where('assignedTo', '==', user.uid))),
        getDocs(query(collection(db, 'payments'), where('workerId', '==', user.uid), orderBy('date', 'desc'))),
      ]);
      const all = taskSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
      all.sort((a, b) => {
        const ta = (a.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() ?? 0;
        const tb = (b.createdAt as { toDate?: () => Date })?.toDate?.()?.getTime() ?? 0;
        return tb - ta;
      });
      setTasks(all);
      setPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() } as Payment)));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (user?.uid) load(); }, [user?.uid]);

  const handleStart = async (t: Task) => {
    if (!t.id) return;
    setUpdating(t.id);
    await updateDoc(doc(db, 'tasks', t.id), { status: 'in_progress', startedAt: serverTimestamp() });
    await load();
    setUpdating(null);
  };

  const handleDone = async (t: Task) => {
    if (!t.id) return;
    setUpdating(t.id);
    await updateDoc(doc(db, 'tasks', t.id), { status: 'done', completedAt: serverTimestamp() });
    await load();
    setUpdating(null);
  };

  const active = tasks.filter(t => t.status !== 'done');
  const done   = tasks.filter(t => t.status === 'done');
  const paid   = done.filter(t => t.paid);
  const unpaid = done.filter(t => !t.paid);

  const totalHakedis  = done.filter(t => t.showPriceToWorkshop).reduce((s, t) => s + (t.price || 0), 0);
  const totalOdenen   = payments.reduce((s, p) => s + p.amount, 0);
  const kalanBakiye   = totalHakedis - totalOdenen;
  const paidAmount    = totalOdenen;
  const unpaidAmount  = kalanBakiye;

  const stats = [
    { label: 'Aktif İş', value: active.length, color: '#f59e0b', icon: IconClock },
    { label: 'Tamamlanan', value: done.length, color: '#10b981', icon: IconCircleCheck },
    { label: 'Toplam Hakediş', value: formatTRY(totalHakedis), color: 'var(--primary)', icon: IconCoin, big: true },
    { label: 'Kalan Bakiye', value: formatTRY(kalanBakiye < 0 ? 0 : kalanBakiye), color: kalanBakiye > 0 ? '#f59e0b' : '#6b7280', icon: IconAlertCircle, big: true },
  ];

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'active',   label: 'Aktif İşler',      count: active.length },
    { key: 'done',     label: 'Tamamlanan İşler',  count: done.length },
    { key: 'payment',  label: 'Ödemeler',          count: payments.length },
  ];

  return (
    <>
      <div className="topbar">
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconClipboardList size={22} style={{ color: 'var(--primary)' }} />
            İş Takip
          </div>
          <div className="page-sub">{user?.displayName || user?.email?.split('@')[0]}</div>
        </div>
      </div>

      <div className="page-content">
        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
          {stats.map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 12, padding: '16px 18px',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: s.color + '20',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={22} style={{ color: s.color }} />
                </div>
                <div>
                  <div style={{ fontSize: s.big ? 16 : 22, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{s.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? 'var(--primary)' : 'var(--text-3)',
              borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {t.label}
              {t.count > 0 && (
                <span style={{
                  fontSize: 11, background: tab === t.key ? 'var(--primary)' : 'var(--border)',
                  color: tab === t.key ? '#fff' : 'var(--text-3)',
                  borderRadius: 10, padding: '1px 7px',
                }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Yükleniyor…</div>
        ) : (
          <>
            {/* AKTİF İŞLER */}
            {tab === 'active' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {active.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>
                    Aktif iş bulunmuyor 🎉
                  </div>
                ) : active.map(t => (
                  <div key={t.id} style={{
                    background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: '16px 18px',
                    borderLeft: `4px solid ${t.status === 'in_progress' ? '#3b82f6' : '#f59e0b'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>{t.title}</div>
                      <span className={`badge ${t.status === 'in_progress' ? 'badge-blue' : 'badge-amber'}`}>
                        {t.status === 'in_progress' ? 'Devam Ediyor' : 'Yapılacak'}
                      </span>
                    </div>
                    {t.description && (
                      <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 10 }}>{t.description}</div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {t.category && (
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 5,
                            background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-3)',
                          }}>{t.category}</span>
                        )}
                        {t.showPriceToWorkshop && t.price > 0 && (
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
                            {formatTRY(t.price)}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                          {fmtDate(t.createdAt)}
                        </span>
                        {t.dueDate && (
                          <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                            ⏰ Son: {new Date(t.dueDate).toLocaleDateString('tr-TR')}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {t.status === 'todo' && (
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 5 }}
                            disabled={updating === t.id}
                            onClick={() => handleStart(t)}
                          >
                            <IconPlayerPlay size={13} />
                            {updating === t.id ? '…' : 'Başla'}
                          </button>
                        )}
                        {t.status === 'in_progress' && (
                          <button
                            style={{
                              fontSize: 12, padding: '6px 14px', border: 'none', borderRadius: 7,
                              background: '#10b981', color: '#fff', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600,
                            }}
                            disabled={updating === t.id}
                            onClick={() => handleDone(t)}
                          >
                            <IconCheck size={13} />
                            {updating === t.id ? '…' : 'Tamamla'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAMAMLANAN İŞLER */}
            {tab === 'done' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {done.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Henüz tamamlanan iş yok</div>
                ) : done.map(t => (
                  <div key={t.id} style={{
                    background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: '16px 18px',
                    borderLeft: '4px solid #10b981',
                    opacity: 0.9,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>{t.title}</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        {t.showPriceToWorkshop && t.price > 0 && (
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{formatTRY(t.price)}</span>
                        )}
                        <span className={`badge ${t.paid ? 'badge-green' : 'badge-red'}`}>
                          {t.paid ? 'Ödendi' : 'Ödeme Bekliyor'}
                        </span>
                      </div>
                    </div>
                    {t.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>{t.description}</div>
                    )}
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-3)', flexWrap: 'wrap' }}>
                      {t.category && <span>📁 {t.category}</span>}
                      {!!t.completedAt && <span>✅ Tamamlandı: {fmtDate(t.completedAt)}</span>}
                      {t.paid && !!t.paidAt && <span>💰 Ödendi: {fmtDate(t.paidAt)}</span>}
                    </div>
                  </div>
                ))}

                {/* Hakediş özet */}
                {done.some(t => t.showPriceToWorkshop) && (
                  <div style={{
                    marginTop: 8, background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: '14px 18px',
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12,
                  }}>
                    {[
                      { label: 'Toplam Hakediş', value: formatTRY(totalHakedis), color: 'var(--primary)' },
                      { label: 'Ödenen', value: formatTRY(paidAmount), color: '#10b981' },
                      { label: 'Bekleyen', value: formatTRY(unpaidAmount), color: '#ef4444' },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ÖDEMELER */}
            {tab === 'payment' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Bakiye özet */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 8 }}>
                  {[
                    { label: 'Toplam Hakediş', value: formatTRY(totalHakedis), color: 'var(--primary)', bg: 'var(--primary)' },
                    { label: 'Tahsil Edilen', value: formatTRY(totalOdenen), color: '#10b981', bg: '#10b981' },
                    { label: 'Kalan Bakiye', value: formatTRY(kalanBakiye < 0 ? 0 : kalanBakiye), color: kalanBakiye > 0 ? '#f59e0b' : '#6b7280', bg: kalanBakiye > 0 ? '#f59e0b' : '#6b7280' },
                  ].map(s => (
                    <div key={s.label} style={{
                      background: s.bg + '15', border: `1px solid ${s.bg}40`,
                      borderRadius: 12, padding: '14px 10px', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Ödeme geçmişi */}
                {payments.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>
                    Henüz ödeme kaydı bulunmuyor
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4 }}>ÖDEME GEÇMİŞİ</div>
                    {payments.map(p => (
                      <div key={p.id} style={{
                        background: 'var(--card)', border: '1px solid #10b98140',
                        borderRadius: 12, padding: '14px 18px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span style={{ fontSize: 20 }}>💰</span>
                            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)' }}>Ödeme Alındı</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            {fmtDate(p.date)}{p.note ? ` · ${p.note}` : ''}
                          </div>
                        </div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: '#10b981', flexShrink: 0 }}>
                          +{formatTRY(p.amount)}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
