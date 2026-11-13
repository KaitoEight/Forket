import { appAlert } from './appAlert';
import { REPORT_REASONS, submitReport, type ReportTarget } from '../services/reportService';

/** Hỏi lý do rồi gửi báo cáo. `what` = "ảnh này", "bình luận này", "người này"… */
export function askReport(target: ReportTarget, what: string) {
  appAlert(
    `Báo cáo ${what}`,
    'Chọn lý do. Báo cáo được gửi riêng cho quản trị viên, người kia sẽ không biết.',
    [
      ...REPORT_REASONS.map((r) => ({
        text: r.label,
        icon: 'flag-outline' as const,
        onPress: async () => {
          try {
            await submitReport(target, r.key);
            appAlert('Đã gửi báo cáo', 'Cảm ơn bạn, mình sẽ xem xét sớm.');
          } catch (e: any) {
            appAlert('Không gửi được báo cáo', e?.message ?? String(e));
          }
        },
      })),
      { text: 'Thôi', style: 'cancel' as const },
    ]
  );
}
