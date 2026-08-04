'use client';
import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

interface MonthData { ay: string; ciro: number; }
interface YearData  { yil: string; toplam: number; }

interface Props {
  monthlyData: MonthData[];
  yearData: YearData[];
}

function useIsDark() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const update = () => setDark(document.documentElement.getAttribute('data-theme') !== 'light');
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export default function SalesCharts({ monthlyData, yearData }: Props) {
  const dark = useIsDark();

  const gridColor  = dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)';
  const tickColor  = dark ? 'rgba(255,255,255,.4)'  : 'rgba(0,0,0,.45)';
  const tipBg      = dark ? '#1e1e1e'               : '#fff';
  const tipBorder  = dark ? 'rgba(255,255,255,.1)'  : 'rgba(0,0,0,.1)';
  const tipLabel   = dark ? '#fff'                  : '#111';
  const cardSecBg  = dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)';
  const cardSecBorder = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.09)';
  const subText    = dark ? 'rgba(255,255,255,.4)'  : 'rgba(0,0,0,.4)';
  const prevYearColor = dark ? 'rgba(255,255,255,.65)' : 'rgba(0,0,0,.6)';

  return (
    <div className="grid-2" style={{ marginBottom: 16 }}>
      {/* Aylık Ciro */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Aylık Ciro (Son 12 Ay)</div>
        </div>
        <div style={{ height: 220, padding: '8px 4px 4px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="ay" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}B` : String(v)} />
              <Tooltip
                contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: tipLabel, fontWeight: 700 }}
                formatter={(value: unknown) => [`₺${Number(value ?? 0).toLocaleString('tr-TR')}`, 'Ciro']}
              />
              <Bar dataKey="ciro" fill="#E85D04" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Yıllık Karşılaştırma */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Yıllık Karşılaştırma</div>
        </div>
        <div style={{ padding: '12px 16px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ background: 'rgba(232,93,4,.08)', border: '1px solid rgba(232,93,4,.2)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: subText, marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>Bu Yıl</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: '#E85D04' }}>
                ₺{yearData[1]?.toplam.toLocaleString('tr-TR') ?? '0'}
              </div>
              <div style={{ fontSize: 11, color: subText, marginTop: 4 }}>{yearData[1]?.yil}</div>
            </div>
            <div style={{ background: cardSecBg, border: `1px solid ${cardSecBorder}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: subText, marginBottom: 6, textTransform: 'uppercase', letterSpacing: .5 }}>Geçen Yıl</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: prevYearColor }}>
                ₺{yearData[0]?.toplam.toLocaleString('tr-TR') ?? '0'}
              </div>
              <div style={{ fontSize: 11, color: subText, marginTop: 4 }}>{yearData[0]?.yil}</div>
            </div>
          </div>
          <div style={{ height: 90 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="yil" tick={{ fill: tickColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: tipBg, border: `1px solid ${tipBorder}`, borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: tipLabel, fontWeight: 700 }}
                  formatter={(value: unknown) => [`₺${Number(value ?? 0).toLocaleString('tr-TR')}`, 'Toplam Ciro']}
                />
                <Bar dataKey="toplam" fill="#E85D04" radius={[4, 4, 0, 0]} maxBarSize={60} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
