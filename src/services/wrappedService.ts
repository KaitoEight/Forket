import { requireUserId } from '../lib/auth';
import { supabase } from '../lib/supabase';

export type YearPost = {
  id: string;
  created_at: string;
  dish: string | null;
  price: number | null;
  place: { id: string; name: string; tags: string[] | null } | null;
};

export type Wrapped = {
  year: number;
  checkIns: number;
  places: number;
  topPlaces: { id: string; name: string; visits: number }[];
  /** Tháng (1–12) check-in nhiều nhất */
  busiestMonth: { month: number; count: number } | null;
  /** Số lần theo từng loại quán (tag) */
  tagCounts: { tag: string; count: number }[];
  topDish: { name: string; count: number } | null;
  totalSpent: number;
  spentCount: number;
};

/** Ảnh check-in của tôi trong 1 năm */
export async function fetchYearPosts(year: number): Promise<YearPost[]> {
  const me = await requireUserId();
  const from = new Date(year, 0, 1).toISOString();
  const to = new Date(year + 1, 0, 1).toISOString();
  const query = (fields: string) =>
    supabase
      .from('posts')
      .select(fields)
      .eq('created_by', me)
      .gte('created_at', from)
      .lt('created_at', to)
      .order('created_at', { ascending: true })
      .limit(1000);
  const fields = 'id, created_at, dish, price, place:places(id, name, tags)';
  let { data, error } = await query(fields);
  // Chưa chạy SQL món + giá → vẫn tổng kết được phần còn lại
  if (error?.code === '42703') ({ data, error } = await query('id, created_at, place:places(id, name, tags)'));
  if (error) throw error;
  return ((data ?? []) as unknown as YearPost[]).map((p) => ({ ...p, dish: p.dish ?? null, price: p.price ?? null }));
}

export function buildWrapped(year: number, posts: YearPost[]): Wrapped {
  const placeVisits = new Map<string, { id: string; name: string; visits: number }>();
  const months = new Array<number>(12).fill(0);
  const tags = new Map<string, number>();
  const dishes = new Map<string, { name: string; count: number }>();
  let totalSpent = 0;
  let spentCount = 0;

  for (const p of posts) {
    months[new Date(p.created_at).getMonth()]++;
    if (p.place) {
      const cur = placeVisits.get(p.place.id) ?? { id: p.place.id, name: p.place.name, visits: 0 };
      cur.visits++;
      placeVisits.set(p.place.id, cur);
      for (const t of p.place.tags ?? []) tags.set(t, (tags.get(t) ?? 0) + 1);
    }
    const dish = p.dish?.trim();
    if (dish) {
      const key = dish.toLowerCase();
      const cur = dishes.get(key) ?? { name: dish, count: 0 };
      cur.count++;
      dishes.set(key, cur);
    }
    if (p.price) {
      totalSpent += p.price;
      spentCount++;
    }
  }

  const busiestIndex = months.indexOf(Math.max(...months));
  return {
    year,
    checkIns: posts.length,
    places: placeVisits.size,
    topPlaces: [...placeVisits.values()].sort((a, b) => b.visits - a.visits).slice(0, 3),
    busiestMonth: posts.length > 0 ? { month: busiestIndex + 1, count: months[busiestIndex] } : null,
    tagCounts: [...tags.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
    topDish: [...dishes.values()].sort((a, b) => b.count - a.count)[0] ?? null,
    totalSpent,
    spentCount,
  };
}
