import { router } from 'expo-router';

/**
 * Quay lại màn trước. Nếu không có màn nào để quay về (tải lại trang web, mở từ link,
 * sau router.replace…) thì về trang chính thay vì báo lỗi "GO_BACK was not handled".
 */
export function goBack(fallback: '/' | '/messages' | '/profile' = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
