import { PlaceListButton } from '@/components/PlaceListButton';
import { colors } from '@/constants/theme';
import { toggleWishlist, useWishlistIds } from '@/services/wishlistService';

const tone = { main: colors.caramel, soft: colors.caramelSoft, onText: colors.onAccent, offText: colors.brown };

/** Nút "Muốn đi" (lưu quán để đi sau). `compact` = chỉ icon */
export function WishButton({ placeId, compact }: { placeId: string; compact?: boolean }) {
  const wished = useWishlistIds().has(placeId);
  return (
    <PlaceListButton
      placeId={placeId}
      active={wished}
      toggle={toggleWishlist}
      icon={{ on: 'bookmark', off: 'bookmark-outline' }}
      label={{ on: 'Đã lưu', off: 'Muốn đi' }}
      tone={tone}
      compact={compact}
    />
  );
}
