'use client';
import { useEffect } from 'react';

export default function DecimalFixer() {
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key !== '.') return;
      const el = e.target as HTMLInputElement;
      if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
      if (el.inputMode !== 'decimal') return;
      e.preventDefault();
      const s = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? s;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(el, el.value.slice(0, s) + ',' + el.value.slice(end));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      requestAnimationFrame(() => el.setSelectionRange(s + 1, s + 1));
    };
    document.addEventListener('keydown', handle, true);
    return () => document.removeEventListener('keydown', handle, true);
  }, []);
  return null;
}
