import { LayoutEngine, SugiyamaLayout } from './index';
import { SymmetricLayout } from './symmetric';

export type LayoutEngineId = 'classic' | 'symmetric';

/** Selectable layout engines. Adding one = a LayoutEngine class + an entry here. */
export const layoutEngines: Record<LayoutEngineId, { label: string; create(): LayoutEngine }> = {
  classic: { label: 'Classic', create: () => new SugiyamaLayout() },
  symmetric: { label: 'Symmetric', create: () => new SymmetricLayout() },
};

export function isLayoutEngineId(v: unknown): v is LayoutEngineId {
  return typeof v === 'string' && v in layoutEngines;
}
