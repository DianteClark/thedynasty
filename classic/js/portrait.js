// Character portraits from the HAS hero icon sheets: one row per culture, ten men then ten women.
import { PORTRAIT_ROWS } from '../../assets/world/world.js';
export function portrait(c, px = 32, cls = '') {
  if (!c) return '';
  const row = Math.max(0, PORTRAIT_ROWS.indexOf(c.culture)); const col = (c.female ? 10 : 0) + (c.id % 10);
  return `<span class="portrait ${cls}" style="width:${px}px;height:${px}px;background:url(assets/world/portraits.png) -${col * px}px -${row * px}px / ${px * 20}px auto no-repeat"></span>`;
}
