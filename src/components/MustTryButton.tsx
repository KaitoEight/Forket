import { PlaceListButton } from '@/components/PlaceListButton';
import { colors } from '@/constants/theme';
import { toggleMustTry, useMustTryIds } from '@/services/mustTryService';

const tone = { main: colors.danger, soft: colors.dangerSoft, onText: colors.onAccent, offText: colors.danger };

/** Nút thả tim "Must try" ❤️ (quán nhất định phải thử). `compact` = chỉ icon */
export function MustTryButton({ placeId, compact }: { placeId: string; compact?: boolean }) {
  const on = useMustTryIds().has(placeId);
  return (
    <PlaceListButton
      placeId={placeId}
      active={on}
      toggle={toggleMustTry}
      icon={{ on: 'heart', off: 'heart-outline' }}
      label={{ on: 'Must try', off: 'Must try' }}
      tone={tone}
      compact={compact}
    />
  );
}
