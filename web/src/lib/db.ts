// IndexedDB storage (M3), through Dexie. IndexedDB is the browser's built-in database: unlike
// localStorage it has no 5 MB cap, survives offline use and lets the service worker keep the app alive
// without a network. Dexie is a thin wrapper that turns its awkward event API into Promises.
import Dexie, { type Table } from "dexie";
import type { Review } from "./srs";
import type { Synced } from "./syncMerge";
import type { Lesson, State } from "./types";

export const DB_NAME = "quaderno"; // technical name, kept from before the Quadernote rename
export const LEGACY_STATE_KEY = "quaderno.v1"; // localStorage keys of M1/M2, read once for the migration
export const LEGACY_SYNC_KEY = "quaderno.sync.v1";

interface Meta {
  key: string;
  value: unknown;
}

/** `Table<Row, Key>` = a typed object store: rows of that shape, looked up by that key. */
export class QuadernoDB extends Dexie {
  lessons!: Table<Lesson, string>;
  meta!: Table<Meta, string>;
  reviews!: Table<Review, string>;

  constructor(name = DB_NAME) {
    super(name);
    // Only indexed fields are listed; the rest of each lesson is stored as it is.
    this.version(1).stores({ lessons: "id, date", meta: "key" });
    // M5: the log of review answers (lib/reviews.ts). Adding a table is a new version; old data stays.
    this.version(2).stores({ lessons: "id, date", meta: "key", reviews: "id, card_id, reviewed_at" });
  }
}

export interface Loaded {
  state: State | null;
  synced: Synced;
  serverSeen: boolean; // this device has talked to a server before (so offline means "offline", not "no server")
  migrated: boolean; // true on the first start after M3, when localStorage data was copied in
}

const getMeta = async <T>(db: QuadernoDB, key: string): Promise<T | undefined> =>
  (await db.meta.get(key))?.value as T | undefined;

/** Read everything. On the first start after M3 copy the old localStorage data in (and leave it there as a backup). */
export async function loadAll(db: QuadernoDB, legacy: Pick<Storage, "getItem"> | null): Promise<Loaded> {
  const head = await getMeta<Omit<State, "lessons">>(db, "state");
  if (head) {
    const lessons = await db.lessons.toArray();
    const order = (await getMeta<string[]>(db, "order")) ?? [];
    const pos = new Map(order.map((id, i) => [id, i] as const));
    lessons.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
    return {
      state: { ...head, lessons },
      synced: (await getMeta<Synced>(db, "synced")) ?? {},
      serverSeen: (await getMeta<boolean>(db, "server_seen")) ?? false,
      migrated: false,
    };
  }
  const old = readLegacy(legacy);
  if (old.state) {
    await saveState(db, old.state);
    await saveSynced(db, old.synced);
    return { ...old, serverSeen: false, migrated: true };
  }
  return { state: null, synced: {}, serverSeen: false, migrated: false };
}

function readLegacy(ls: Pick<Storage, "getItem"> | null): Pick<Loaded, "state" | "synced"> {
  let state: State | null = null;
  let synced: Synced = {};
  try {
    const s = JSON.parse(ls?.getItem(LEGACY_STATE_KEY) || "null");
    if (s && Array.isArray(s.lessons)) state = s as State;
  } catch { /* broken JSON: nothing to migrate */ }
  try { synced = JSON.parse(ls?.getItem(LEGACY_SYNC_KEY) || "{}").synced || {}; } catch { /* ignore */ }
  return { state, synced };
}

/** Save the whole state in one transaction: either all of it lands or none of it. */
export async function saveState(db: QuadernoDB, state: State): Promise<void> {
  const { lessons, ...head } = state;
  // Dexie stores structured clones; JSON round-trip drops anything that is not plain data.
  const plain = JSON.parse(JSON.stringify(lessons)) as Lesson[];
  await db.transaction("rw", db.lessons, db.meta, async () => {
    const ids = new Set(plain.map((l) => l.id));
    const gone = (await db.lessons.toCollection().primaryKeys()).filter((id) => !ids.has(id));
    if (gone.length) await db.lessons.bulkDelete(gone);
    await db.lessons.bulkPut(plain);
    await db.meta.bulkPut([
      { key: "state", value: JSON.parse(JSON.stringify(head)) },
      { key: "order", value: plain.map((l) => l.id) },
    ]);
  });
}

export async function saveSynced(db: QuadernoDB, synced: Synced): Promise<void> {
  await db.meta.put({ key: "synced", value: { ...synced } });
}

export async function saveServerSeen(db: QuadernoDB): Promise<void> {
  await db.meta.put({ key: "server_seen", value: true });
}

/** Open the database, or return null where IndexedDB is missing or blocked (some private modes). */
export async function openDb(name = DB_NAME): Promise<QuadernoDB | null> {
  try {
    const db = new QuadernoDB(name);
    await db.open();
    return db;
  } catch {
    return null;
  }
}
