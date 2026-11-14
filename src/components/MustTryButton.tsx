import { PlaceListButton } from '@/components/PlaceListButton';
import { colors } from '@/constants/theme';
import { toggleMustTry, useMustTryIds } from '@/services/mustTryService';

const tone = { main: colors.danger, soft: colors.dangerSoft, onText: colors.onAccent, offText: colors.danger };

/** Nút thả tim "Yêu thích" ❤️ (quán nhất định phải thử). `compact` = chỉ icon */
export function MustTryButton({ placeId, compact }: { placeId: string; compact?: boolean }) {
  const on = useMustTryIds().has(placeId);
  return (
    <PlaceListButton
      placeId={placeId}
      active={on}
      toggle={toggleMustTry}
      icon={{ on: 'heart', off: 'heart-outline' }}
      label={{ on: 'Yêu thích', off: 'Yêu thích' }}
      tone={tone}
      compact={compact}
    />
  );
}
