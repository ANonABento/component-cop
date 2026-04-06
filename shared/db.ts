import { openDB, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION } from './constants';
import type { ColorSummary, ComponentData, StoredComponent, StoredPage, StoredPattern } from './types';

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
      // Future migrations: if (oldVersion < 2) { ... }
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

  // Insert new components
  for (const comp of components) {
    store.add(comp as StoredComponent);
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
  const tx = db.transaction(['components', 'pages', 'patterns'], 'readwrite');
  tx.objectStore('components').clear();
  tx.objectStore('pages').clear();
  tx.objectStore('patterns').clear();
  await tx.done;
}
