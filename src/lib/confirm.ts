import { appAlert } from './appAlert';

/** Hỏi xác nhận trước khi làm việc khó hoàn tác (chạy được cả web lẫn điện thoại) */
export function confirmAction(title: string, message: string, confirmText: string): Promise<boolean> {
  return new Promise((resolve) =>
    appAlert(title, message, [
      { text: 'Thôi', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
    ])
  );
}

export function showError(title: string, message: string) {
  appAlert(title, message);
}
