import { openDB, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION } from './constants';
import type { ColorSummary, ComponentData, DismissedPattern, StoredComponent, StoredPage, StoredPattern } from './types';
import type { ScanSnapshot } from './scan-history';

interface ReactXrayDB {
  components: {
    key: number;
    value: StoredComponent;
    indexes: {
      'by-name': string;
      'by-page': string;
      'by-style': string;
      'by-structure': string;
      'by-session': string;
      'by-source': string;
    };
  };
  pages: {
    key: string;
    value: StoredPage;
  };
  patterns: {
    key: string;
    value: StoredPattern;
  };
  dismissed: {
    key: string;
    value: DismissedPattern;
  };
  snapshots: {
    key: number;
    value: ScanSnapshot;
    indexes: {
      'by-timestamp': number;
    };
  };
}

let dbInstance: IDBPDatabase<ReactXrayDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<ReactXrayDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ReactXrayDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        // v1: Initial schema
        const componentStore = db.createObjectStore('components', {
          keyPath: 'id',
          autoIncrement: true,
        });
        componentStore.createIndex('by-name', 'componentName');
        componentStore.createIndex('by-page', 'pagePath');
        componentStore.createIndex('by-style', 'styleFingerprint');
        componentStore.createIndex('by-structure', 'structureHash');
        componentStore.createIndex('by-session', 'scanSessionId');
        componentStore.createIndex('by-source', 'sourceFile');

        db.createObjectStore('pages', { keyPath: 'pagePath' });
        db.createObjectStore('patterns', { keyPath: 'patternId' });
      }
      if (oldVersion < 2) {
        // v2: Dismissed patterns store
        db.createObjectStore('dismissed', { keyPath: 'patternId' });
      }
      if (oldVersion < 3) {
        // v3: Scan snapshots for history tracking
        const snapshotStore = db.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true });
        snapshotStore.createIndex('by-timestamp', 'timestamp');
      }
    },
  });

  return dbInstance;
}

/**
 * Store scan results: replace all components for this page, then insert new ones.
 * Uses getAllKeys + delete to avoid async gaps within the transaction.
 */
export async function storeScanResults(
  pagePath: string,
  pageTitle: string,
  pageUrl: string,
  components: ComponentData[],
  links: string[],
  colorSummary: ColorSummary | null = null,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['components', 'pages'], 'readwrite');
  const store = tx.objectStore('components');
  const index = store.index('by-page');

  // Delete existing components for this page
  const existingKeys = await index.getAllKeys(pagePath);
  for (const key of existingKeys) {
    store.delete(key);
  }

  // Insert new components (strip any stale id to let autoIncrement assign fresh keys)
  for (const comp of components) {
    const { id: _staleId, ...data } = comp as StoredComponent;
    store.add(data as StoredComponent);
  }

  // Update page record
  tx.objectStore('pages').put({
    pagePath,
    pageTitle,
    pageUrl,
    componentCount: components.length,
    scanTimestamp: Date.now(),
    links,
    colorSummary,
  });

  await tx.done;
}

export async function getAllComponents(): Promise<StoredComponent[]> {
  const db = await getDB();
  return db.getAll('components');
}

export async function getAllPages(): Promise<StoredPage[]> {
  const db = await getDB();
  return db.getAll('pages');
}

export async function getAllPatterns(): Promise<StoredPattern[]> {
  const db = await getDB();
  return db.getAll('patterns');
}

export async function storePatterns(patterns: StoredPattern[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('patterns', 'readwrite');
  // Clear existing patterns before inserting new ones
  await tx.objectStore('patterns').clear();
  for (const pattern of patterns) {
    tx.objectStore('patterns').add(pattern);
  }
  await tx.done;
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['components', 'pages', 'patterns', 'dismissed', 'snapshots'], 'readwrite');
  tx.objectStore('components').clear();
  tx.objectStore('pages').clear();
  tx.objectStore('patterns').clear();
  tx.objectStore('dismissed').clear();
  tx.objectStore('snapshots').clear();
  await tx.done;
}


// ─── Scan Snapshots ───

export async function saveSnapshot(snapshot: Omit<ScanSnapshot, 'id'>): Promise<number> {
  const db = await getDB();
  return db.add('snapshots', snapshot as ScanSnapshot);
}

export async function getAllSnapshots(): Promise<ScanSnapshot[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('snapshots', 'by-timestamp');
  return all.reverse(); // newest first
}

export async function deleteSnapshot(id: number): Promise<void> {
  const db = await getDB();
  await db.delete('snapshots', id);
}

export async function getLatestSnapshot(): Promise<ScanSnapshot | undefined> {
  const db = await getDB();
  const all = await db.getAllFromIndex('snapshots', 'by-timestamp');
  return all[all.length - 1];
}

// ─── Dismissed patterns ───

export async function getDismissedPatterns(): Promise<DismissedPattern[]> {
  const db = await getDB();
  return db.getAll('dismissed');
}

export async function dismissPattern(patternId: string, reason: string): Promise<void> {
  const db = await getDB();
  await db.put('dismissed', { patternId, reason, dismissedAt: Date.now() });
}

export async function restorePattern(patternId: string): Promise<void> {
  const db = await getDB();
  await db.delete('dismissed', patternId);
}

export async function clearDismissed(): Promise<void> {
  const db = await getDB();
  await db.clear('dismissed');
}
