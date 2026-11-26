// Save slots. World snapshots live in IndexedDB (they can be large); a small index lives in localStorage.
const DB = 'dynasty', STORE = 'worlds', INDEX = 'dynasty.slots.v1', MOD = 'dynasty.mod.v1';
export const MAX_SLOTS = 3;

function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => { const t = d.transaction(STORE, mode); const st = t.objectStore(STORE); const out = fn(st); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); });
}
export function slots() { try { return JSON.parse(localStorage.getItem(INDEX)) || { current: null, list: [] }; } catch (e) { return { current: null, list: [] }; } }
function writeSlots(s) { try { localStorage.setItem(INDEX, JSON.stringify(s)); } catch (e) { /* ignore */ } }

export async function saveWorld(slotId, world, extra = {}) {
  if (!slotId || !world || world.pendingBattle) return;
  const json = JSON.stringify(world);
  await tx('readwrite', st => st.put(json, slotId));
  const s = slots(); const p = world.player;
  const meta = { id: slotId, seed: world.seed, size: world.size, year: world.year, month: world.month, savedAt: Date.now(),
    who: p ? `${p.name}${p.dynasty ? ' ' + p.dynasty : ''}` : 'No one yet', alive: !world.gameOver, ...extra };
  s.list = [meta, ...s.list.filter(x => x.id !== slotId)].slice(0, MAX_SLOTS); s.current = slotId; writeSlots(s);
}
export async function loadWorld(slotId) {
  const json = await tx('readonly', st => st.get(slotId));
  return json ? JSON.parse(json) : null;
}
export async function deleteWorld(slotId) {
  await tx('readwrite', st => st.delete(slotId));
  const s = slots(); s.list = s.list.filter(x => x.id !== slotId); if (s.current === slotId) s.current = null; writeSlots(s);
}
export function setCurrent(slotId) { const s = slots(); s.current = slotId; writeSlots(s); }
export function newSlotId() { return 'slot-' + Date.now().toString(36); }

export function getMod() { try { return JSON.parse(localStorage.getItem(MOD)); } catch (e) { return null; } }
export function setMod(mod) { try { if (mod) localStorage.setItem(MOD, JSON.stringify(mod)); else localStorage.removeItem(MOD); } catch (e) { /* ignore */ } }
