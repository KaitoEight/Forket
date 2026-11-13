/** 1250000 → "1.250.000đ" (tự định dạng, không phụ thuộc Intl của máy) */
export function formatMoney(amount: number) {
  const digits = Math.round(amount).toString();
  return `${digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;
}

/**
 * Đọc số tiền người dùng gõ → số nguyên (đồng), hoặc null nếu không hợp lệ.
 *   "50000" "50.000" "50,000" → 50000
 *   "50k" → 50000     "1.5tr" "1,5tr" "2m" → 1500000 / 2000000
 */
export function parseAmount(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '').replace(/đ$|d$|vnd$/, '');
  if (!t) return null;

  const suffix = t.match(/^([\d.,]+)(k|tr|m)$/);
  if (suffix) {
    // Có đơn vị: dấu . hoặc , là dấu thập phân (1.5tr = 1 triệu rưỡi)
    const value = parseFloat(suffix[1].replace(',', '.'));
    if (!Number.isFinite(value)) return null;
    const unit = suffix[2] === 'k' ? 1_000 : 1_000_000;
    const result = Math.round(value * unit);
    return result > 0 ? result : null;
  }

  // Không có đơn vị: dấu . và , chỉ là dấu ngăn cách hàng nghìn
  if (!/^[\d.,]+$/.test(t)) return null;
  const result = parseInt(t.replace(/[.,]/g, ''), 10);
  return Number.isFinite(result) && result > 0 ? result : null;
}

export const MAX_AMOUNT = 1_000_000_000;
