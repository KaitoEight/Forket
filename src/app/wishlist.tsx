import { PlaceListScreen } from '@/components/PlaceListScreen';
import { WishButton } from '@/components/WishButton';
import { useWishlistIds } from '@/services/wishlistService';

/** Danh sách quán "Muốn đi" của tôi */
export default function WishlistScreen() {
  return (
    <PlaceListScreen
      title="Muốn đi"
      ids={useWishlistIds()}
      emptyIcon="bookmark-outline"
      emptyText="Bấm “Muốn đi” trên thẻ quán, hoặc bấm “Đi” ở lời rủ trong chat — quán sẽ được lưu ở đây."
      renderAction={(id) => <WishButton placeId={id} compact />}
    />
  );
}
