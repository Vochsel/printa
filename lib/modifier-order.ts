export type ModifierDropSide = "before" | "after";

export function modifierDropIndex(length: number, source: number, target: number, side: ModifierDropSide) {
  if (length <= 0 || source < 0 || source >= length || target < 0 || target >= length) return source;
  let destination = target + (side === "after" ? 1 : 0);
  if (source < destination) destination -= 1;
  return Math.max(0, Math.min(length - 1, destination));
}

export function reorderModifierStack<T>(items: T[], source: number, target: number, side: ModifierDropSide) {
  const destination = modifierDropIndex(items.length, source, target, side);
  if (destination === source) return destination;
  const [item] = items.splice(source, 1);
  if (item !== undefined) items.splice(destination, 0, item);
  return destination;
}
