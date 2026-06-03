'use client';
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppUser, Task } from '@/types';

interface AtölyeStat {
  user: AppUser;
  todo: number;
  in_progress: number;
  done: number;
  total: number;
  totalPrice: number;
}

export default function AtölyelerPage() {
  const [stats, setStats] = useState<AtölyeStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AtölyeStat | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [usersSnap, tasksSnap] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('role', '==', 'atolye'))),
      getDocs(collection(db, 'tasks')),
    ]);

    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser));
    const allTasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() } as Task));

    const result: AtölyeStat[] = users.map(user => {
      const userTasks = allTasks.filter(t => t.assignedTo === user.id);
      return {
        user,
        todo: userTasks.filter(t => t.status === 'todo').length,
        in_progress: userTasks.filter(t => t.status === 'in_progress').length,
        done: userTasks.filter(t => t.status === 'done').length,
        total: userTasks.length,
        totalPrice: userTasks.reduce((s, t) => s + (t.price || 0), 0),
      };
    });

    setStats(result);
    setLoading(false);
  }

  async function openDetail(stat: AtölyeStat) {
    setSelected(stat);
    setTasksLoading(true);
    const snap = await getDocs(query(collection(db, 'tasks'), where('assignedTo', '==', stat.user.id)));
    setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
    setTasksLoading(false);
  }

  const statusLabel: Record<string, string> = {
    todo: 'Bekliyor',
    in_progress: 'Devam Ediyor',
    done: 'Tamamlandı',
  };
  const statusColor: Record<string, string> = {
    todo: '#f59e0b',
    in_progress: '#3b82f6',
    done: '#10b981',
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Atölyeler</h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '4px 0 0' }}>
          Atölye çalışanlarının iş yükü ve görev özeti
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>Yükleniyor…</div>
      ) : stats.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>
          Henüz atölye çalışanı bulunmuyor.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {stats.map(stat => (
            <div
              key={stat.user.id}
              onClick={() => openDetail(stat)}
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 20,
                cursor: 'pointer',
                transition: 'box-shadow 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'var(--primary)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 700, flexShrink: 0,
                }}>
                  {stat.user.name.substring(0, 2).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {stat.user.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {stat.user.email}
                  </div>
                </div>
                <span style={{
                  marginLeft: 'auto', padding: '2px 8px', borderRadius: 6,
                  fontSize: 11, fontWeight: 600,
                  background: stat.user.active ? '#d1fae5' : '#fee2e2',
                  color: stat.user.active ? '#065f46' : '#991b1b',
                  flexShrink: 0,
                }}>
                  {stat.user.active ? 'Aktif' : 'Pasif'}
                </span>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'Bekliyor', value: stat.todo, color: '#f59e0b' },
                  { label: 'Devam', value: stat.in_progress, color: '#3b82f6' },
                  { label: 'Tamam', value: stat.done, color: '#10b981' },
                ].map(s => (
                  <div key={s.label} style={{
                    background: 'var(--bg)', borderRadius: 8, padding: '8px 4px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Toplam Görev</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{stat.total}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Toplam Hakediş</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
                  ₺{stat.totalPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card)', borderRadius: 14, width: '100%', maxWidth: 640,
              maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
              border: '1px solid var(--border)',
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '18px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'var(--primary)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700,
              }}>
                {selected.user.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)' }}>{selected.user.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{selected.user.email}</div>
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none',
                  cursor: 'pointer', color: 'var(--text-3)', fontSize: 20, lineHeight: 1,
                }}
              >✕</button>
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
              {/* Summary row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
                {[
                  { label: 'Bekliyor', value: selected.todo, color: '#f59e0b' },
                  { label: 'Devam', value: selected.in_progress, color: '#3b82f6' },
                  { label: 'Tamam', value: selected.done, color: '#10b981' },
                  { label: 'Toplam', value: selected.total, color: 'var(--text-1)' },
                ].map(s => (
                  <div key={s.label} style={{
                    background: 'var(--bg)', borderRadius: 8, padding: 12, textAlign: 'center',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Task List */}
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }}>
                Görevler
              </div>
              {tasksLoading ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>Yükleniyor…</div>
              ) : tasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)' }}>Henüz görev yok</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tasks.map(task => (
                    <div key={task.id} style={{
                      background: 'var(--bg)', border: '1px solid var(--border)',
                      borderRadius: 10, padding: '12px 14px',
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)', marginBottom: 2 }}>
                          {task.title}
                        </div>
                        {task.description && (
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
                            {task.description}
                          </div>
                        )}
                        {task.category && (
                          <span style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4,
                            background: 'var(--card)', border: '1px solid var(--border)',
                            color: 'var(--text-3)',
                          }}>{task.category}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                        <span style={{
                          fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 600,
                          background: statusColor[task.status] + '20',
                          color: statusColor[task.status],
                        }}>
                          {statusLabel[task.status]}
                        </span>
                        {task.showPriceToWorkshop && task.price > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                            ₺{task.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
