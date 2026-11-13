import { MustTryButton } from '@/components/MustTryButton';
import { PlaceListScreen } from '@/components/PlaceListScreen';
import { useMustTryIds } from '@/services/mustTryService';

/** Danh sách quán "Must try" ❤️ của tôi */
export default function MustTryScreen() {
  return (
    <PlaceListScreen
      title="Must try"
      ids={useMustTryIds()}
      emptyIcon="heart-outline"
      emptyText="Bấm trái tim “Must try” trên thẻ quán để lưu những quán nhất định phải thử. Lắc máy ở tab Bản đồ sẽ chọn giúp bạn hôm nay ăn gì!"
      renderAction={(id) => <MustTryButton placeId={id} compact />}
    />
  );
}
