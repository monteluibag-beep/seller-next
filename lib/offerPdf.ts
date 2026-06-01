import type { Offer } from '@/types';

type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP';
const CURRENCY_SYMBOLS: Record<Currency, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };

export interface FirmInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  terms: string;
  bankInfo?: string;
  invoiceInfo?: string;
  logoDataUrl?: string;
}

function fmtDate(ts: unknown): string {
  if (!ts) return '—';
  const d = (ts as { toDate?: () => Date }).toDate?.() ?? new Date(ts as string);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtNum(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateOfferHtml(offer: Offer, firm: FirmInfo): string {
  const cur = ((offer as Offer & { currency?: Currency }).currency) ?? 'TRY';
  const sym = CURRENCY_SYMBOLS[cur] ?? '₺';
  const dr  = (offer as Offer & { discountRate?: number }).discountRate ?? 0;
  const sub = offer.items.reduce((s, i) => s + (i.listPrice ?? 0) * i.qty, 0);

  const logoHtml = firm.logoDataUrl
    ? `<img src="${firm.logoDataUrl}" alt="${esc(firm.name)}" style="height:44px;object-fit:contain;display:block;">`
    : `<div style="font-size:20px;font-weight:800;color:#E85D04;">${esc(firm.name)}</div>`;

  const contactParts = [
    firm.address ? esc(firm.address).replace(/\n/g, ' · ') : '',
    firm.phone   ? `Tel: ${esc(firm.phone)}`  : '',
    firm.email   ? esc(firm.email) : '',
  ].filter(Boolean);
  const contactHtml = contactParts.map(p => `<div>${p}</div>`).join('');

  /* ---- product rows ---- */
  const rows = offer.items.map(item => {
    const unit  = item.finalPrice ?? item.listPrice ?? 0;
    const total = unit * item.qty;
    const disc  = item.discountRate ?? 0;
    const imgHtml = item.photo
      ? `<img src="${item.photo}" alt="${esc(item.name)}" style="width:44px;height:44px;object-fit:cover;border-radius:5px;display:block;flex-shrink:0;">`
      : `<div style="width:44px;height:44px;border-radius:5px;background:#F0F0F0;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#CCC" stroke-width="1.5">
             <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
             <polyline points="21 15 16 10 5 21"/>
           </svg>
         </div>`;
    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            ${imgHtml}
            <span style="font-weight:600;font-size:12px;">${esc(item.name)}</span>
          </div>
        </td>
        <td class="c">${item.qty}</td>
        <td class="r">${sym}${fmtNum(item.listPrice ?? 0)}</td>
        <td class="c" style="color:${disc > 0 ? '#16A34A' : '#999'};">${disc > 0 ? `%${disc}` : '—'}</td>
        <td class="r fw">${sym}${fmtNum(unit)}</td>
        <td class="r fw">${sym}${fmtNum(total)}</td>
      </tr>`;
  }).join('');

  const discountRows = dr > 0 ? `
    <tr class="sub-row">
      <td colspan="5" class="r" style="color:#555;">Ara Toplam</td>
      <td class="r" style="color:#555;">${sym}${fmtNum(sub)}</td>
    </tr>
    <tr class="sub-row">
      <td colspan="5" class="r" style="color:#16A34A;">İskonto (%${dr})</td>
      <td class="r" style="color:#16A34A;">-${sym}${fmtNum(sub - offer.total)}</td>
    </tr>` : '';

  const termsHtml = firm.terms ? `
    <div class="info-section">
      <div class="info-section-title">Koşullar ve Notlar</div>
      <div style="font-size:11px;color:#555;line-height:1.7;">${esc(firm.terms).replace(/\n/g, '<br>')}</div>
    </div>` : '';

  const noteHtml = offer.note ? `
    <div class="note-box">
      <strong>Not:</strong> ${esc(offer.note)}
    </div>` : '';

  /* ---- bank + invoice info ---- */
  const hasBankOrInvoice = (firm.bankInfo && firm.bankInfo.trim()) || (firm.invoiceInfo && firm.invoiceInfo.trim());
  const bottomInfoHtml = hasBankOrInvoice ? `
    <div class="bottom-info-grid">
      ${firm.bankInfo?.trim() ? `
      <div class="info-section">
        <div class="info-section-title">Hesap Bilgilerimiz</div>
        <div style="font-family:monospace;font-size:11px;color:#444;line-height:1.8;white-space:pre-wrap;">${esc(firm.bankInfo.trim())}</div>
      </div>` : ''}
      ${firm.invoiceInfo?.trim() ? `
      <div class="info-section">
        <div class="info-section-title">Fatura Bilgilerimiz</div>
        <div style="font-size:11px;color:#444;line-height:1.8;white-space:pre-wrap;">${esc(firm.invoiceInfo.trim())}</div>
      </div>` : ''}
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Teklif ${esc(offer.no)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      font-size: 12.5px;
      color: #222;
      background: #fff;
    }

    /* ── A4 preview wrapper (screen only) ── */
    @media screen {
      body { background: #e0e0e0; padding: 24px 0; }
      .a4 {
        width: 210mm;
        min-height: 297mm;
        margin: 0 auto;
        background: #fff;
        box-shadow: 0 4px 24px rgba(0,0,0,.18);
        padding: 14mm 14mm 18mm;
        position: relative;
      }
    }

    /* ── Print: A4, repeating header ── */
    @media print {
      @page {
        size: A4;
        margin: 0;
      }
      body { background: #fff; }
      .a4 {
        width: 210mm;
        padding: 14mm 14mm 18mm;
      }
      /* Fixed header repeats on every print page */
      .print-header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        padding: 10mm 14mm 6mm;
        background: #fff;
        border-bottom: 2px solid #E85D04;
        z-index: 100;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      /* Push content below the fixed header */
      .content-wrap {
        margin-top: 38mm;
      }
      /* First page: content flows right after the info box, no extra margin */
      .first-page-content {
        margin-top: 0;
      }
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Orange top stripe ── */
    .stripe { height: 7px; background: #E85D04; margin-bottom: 0; }

    /* ── Header (non-print) ── */
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 14px 0 10px;
      border-bottom: 2px solid #E85D04;
      margin-bottom: 14px;
    }
    .firm-contact { font-size: 10.5px; color: #666; line-height: 1.65; margin-top: 5px; }
    .offer-badge { text-align: right; }
    .offer-badge .title { font-size: 24px; font-weight: 800; color: #E85D04; line-height: 1; }
    .offer-badge .no    { font-size: 12px; color: #444; margin-top: 3px; font-weight: 600; }
    .offer-badge .date  { font-size: 11px; color: #888; margin-top: 2px; }
    .offer-badge .cur   { font-size: 10px; color: #E85D04; margin-top: 3px; font-weight: 700; letter-spacing: .5px; }

    /* Print header (separate from doc-header) */
    .print-header { display: none; }
    @media print {
      .print-header { display: flex; }
      .doc-header { border-bottom: none; padding-bottom: 0; }
    }

    /* ── Info box ── */
    .info-box {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      background: #F5F5F5;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 16px;
      gap: 8px;
    }
    .info-label { font-size: 9.5px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 2px; }
    .info-value { font-size: 12px; font-weight: 700; color: #222; }

    /* ── Table ── */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 0;
    }
    thead tr { background: #EEEEEE; }
    th {
      padding: 8px 9px;
      font-size: 9.5px;
      font-weight: 700;
      color: #555;
      text-transform: uppercase;
      letter-spacing: .3px;
    }
    td {
      padding: 7px 9px;
      border-bottom: 1px solid #EEEEEE;
      font-size: 12px;
      vertical-align: middle;
    }
    tbody tr:nth-child(even) { background: #FAFAFA; }
    .c  { text-align: center; }
    .r  { text-align: right; }
    .fw { font-weight: 700; }
    .sub-row td { border: none; padding: 4px 9px; font-size: 11.5px; background: #fff !important; }

    /* ── Totals ── */
    .total-wrap { display: flex; justify-content: flex-end; margin: 10px 0 16px; }
    .total-box {
      background: #E85D04;
      color: #fff;
      border-radius: 6px;
      padding: 10px 18px;
      display: flex;
      align-items: center;
      gap: 20px;
    }
    .total-label  { font-size: 10px; font-weight: 700; letter-spacing: .6px; opacity: .85; }
    .total-amount { font-size: 17px; font-weight: 800; }

    /* ── Note / Terms ── */
    .note-box {
      background: #FAFAFA;
      border: 1px solid #DDD;
      border-radius: 5px;
      padding: 8px 12px;
      margin-bottom: 10px;
      font-size: 11.5px;
      color: #444;
      line-height: 1.6;
    }

    /* ── Bottom info grid (bank + invoice) ── */
    .bottom-info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 14px;
    }
    .info-section {
      border: 1px solid #E8E8E8;
      border-radius: 6px;
      padding: 10px 12px;
      background: #FAFAFA;
    }
    .info-section-title {
      font-size: 9.5px;
      font-weight: 700;
      color: #E85D04;
      text-transform: uppercase;
      letter-spacing: .5px;
      margin-bottom: 6px;
      padding-bottom: 5px;
      border-bottom: 1px solid #E8E8E8;
    }

    /* Terms section (full width) */
    .terms-section {
      margin-top: 12px;
      border: 1px solid #FCD34D;
      border-radius: 6px;
      padding: 10px 14px;
      background: #FFFBEB;
    }
    .terms-section .info-section-title { color: #92400E; border-bottom-color: #FCD34D; }

    /* ── Footer ── */
    .footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #DDD;
      display: flex;
      justify-content: space-between;
      font-size: 9.5px;
      color: #999;
    }

    @media print {
      .stripe { display: none; }
      table { page-break-inside: auto; }
      tr     { page-break-inside: avoid; }
      thead  { display: table-header-group; }
    }
  </style>
</head>
<body>
  <div class="a4">
    <!-- Orange stripe (screen only) -->
    <div class="stripe"></div>

    <!-- PRINT repeating header: shown only when printing, fixed top -->
    <div class="print-header">
      <div>
        ${logoHtml}
        <div class="firm-contact">${contactHtml}</div>
      </div>
      <div class="offer-badge">
        <div class="title">TEKLİF</div>
        <div class="no">${esc(offer.no)}</div>
        <div class="date">${fmtDate(offer.date)}</div>
        ${cur !== 'TRY' ? `<div class="cur">${cur} CİNSİNDEN</div>` : ''}
      </div>
    </div>

    <!-- Screen header (inside normal flow) -->
    <div class="doc-header">
      <div>
        ${logoHtml}
        <div class="firm-contact">${contactHtml}</div>
      </div>
      <div class="offer-badge">
        <div class="title">TEKLİF</div>
        <div class="no">${esc(offer.no)}</div>
        <div class="date">${fmtDate(offer.date)}</div>
        ${cur !== 'TRY' ? `<div class="cur">${cur} CİNSİNDEN</div>` : ''}
      </div>
    </div>

    <!-- Customer info box -->
    <div class="info-box">
      <div>
        <div class="info-label">Müşteri</div>
        <div class="info-value">${esc(offer.customer)}</div>
      </div>
      <div>
        <div class="info-label">Teklif No</div>
        <div class="info-value">${esc(offer.no)}</div>
      </div>
      <div>
        <div class="info-label">Hazırlayan</div>
        <div class="info-value">${esc(offer.by)}</div>
      </div>
      <div>
        <div class="info-label">Tarih</div>
        <div class="info-value">${fmtDate(offer.date)}</div>
      </div>
    </div>

    <!-- Products table -->
    <table>
      <thead>
        <tr>
          <th>Ürün</th>
          <th class="c">Adet</th>
          <th class="r">Liste (${sym})</th>
          <th class="c">İskonto</th>
          <th class="r">Birim (${sym})</th>
          <th class="r">Tutar (${sym})</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        ${discountRows}
      </tbody>
    </table>

    <!-- Grand total -->
    <div class="total-wrap">
      <div class="total-box">
        <div class="total-label">GENEL TOPLAM</div>
        <div class="total-amount">${sym}${fmtNum(offer.total)}</div>
      </div>
    </div>

    ${noteHtml}
    ${termsHtml}
    ${bottomInfoHtml}

    <!-- Footer -->
    <div class="footer">
      <span>${esc(firm.name)}</span>
      <span>${firm.email ? esc(firm.email) : ''}</span>
      <span>${firm.phone ? esc(firm.phone) : ''}</span>
    </div>
  </div>
</body>
</html>`;
}
