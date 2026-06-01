'use client';
import { useEffect, useState } from 'react';

interface Rates { USD: number; EUR: number; GBP: number; }

export function useRates() {
  const [rates, setRates] = useState<Rates>({ USD: 38.45, EUR: 41.82, GBP: 48.90 });
  const [updatedAt, setUpdatedAt] = useState('');

  async function fetchRates() {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/TRY');
      const data = await res.json();
      if (data.result === 'success') {
        setRates({
          USD: parseFloat((1 / data.rates.USD).toFixed(4)),
          EUR: parseFloat((1 / data.rates.EUR).toFixed(4)),
          GBP: parseFloat((1 / data.rates.GBP).toFixed(4)),
        });
        setUpdatedAt(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
      }
    } catch {}
  }

  useEffect(() => {
    fetchRates();
    const t = setInterval(fetchRates, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  return { rates, updatedAt };
}
