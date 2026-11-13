import { requireUserId } from '../lib/auth';
import { supabase } from '../lib/supabase';

export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'other';

export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'spam', label: 'Spam, quảng cáo' },
  { key: 'harassment', label: 'Quấy rối, xúc phạm' },
  { key: 'inappropriate', label: 'Nội dung không phù hợp' },
  { key: 'other', label: 'Lý do khác' },
];

export type ReportTarget = { userId?: string | null; postId?: string | null; commentId?: string | null };

export async function submitReport(target: ReportTarget, reason: ReportReason) {
  const me = await requireUserId();
  const { error } = await supabase.from('reports').insert({
    reporter_id: me,
    target_user: target.userId ?? null,
    post_id: target.postId ?? null,
    comment_id: target.commentId ?? null,
    reason,
  });
  if (error) {
    if (error.code === 'PGRST205' || error.code === '42P01') {
      throw new Error('Server chưa bật báo cáo: hãy chạy file SQL 20261114030000_reports_limits.sql trong Supabase.');
    }
    throw new Error(error.message);
  }
}
