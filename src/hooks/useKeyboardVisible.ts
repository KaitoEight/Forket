import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Bàn phím có đang mở không + thời điểm vừa đóng.
 * Dùng để ẩn nút Gửi khi đang gõ, và bỏ qua cú chạm "đóng bàn phím" lỡ rơi trúng nút.
 */
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  const hiddenAt = useRef(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => {
      hiddenAt.current = Date.now();
      setVisible(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  /** true nếu bàn phím mới đóng trong vòng `ms` mili giây */
  const justHidden = (ms = 450) => Date.now() - hiddenAt.current < ms;

  return { visible, justHidden };
}
