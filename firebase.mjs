import 'dotenv/config';
import admin from 'firebase-admin';

let db;

function getDb() {
  if (!db) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }
    db = admin.firestore();
  }
  return db;
}

const PRODUCTS_COL  = 'pickalto_products';
const METADATA_COL  = 'sync_metadata';
const METADATA_DOC  = 'latest';
const BATCH_SIZE    = 500;

export async function batchWrite(docs) {
  const firestore = getDb();
  let written = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = firestore.batch();
    for (const { id, data } of docs.slice(i, i + BATCH_SIZE)) {
      batch.set(firestore.collection(PRODUCTS_COL).doc(id), data);
    }
    await batch.commit();
    written += Math.min(BATCH_SIZE, docs.length - i);
    console.log(`[firebase] written ${written}/${docs.length}`);
  }
  return { written };
}

export async function deleteStale(activeSkus) {
  const firestore = getDb();
  const snap = await firestore.collection(PRODUCTS_COL).select().get();
  const toDelete = snap.docs.map(d => d.id).filter(id => !activeSkus.has(id));
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const batch = firestore.batch();
    for (const id of toDelete.slice(i, i + BATCH_SIZE)) {
      batch.delete(firestore.collection(PRODUCTS_COL).doc(id));
    }
    await batch.commit();
    deleted += Math.min(BATCH_SIZE, toDelete.length - i);
  }
  if (deleted > 0) console.log(`[firebase] deleted ${deleted} stale products`);
  return { deleted };
}

export async function setMetadata(data) {
  const firestore = getDb();
  await firestore.collection(METADATA_COL).doc(METADATA_DOC).set({
    ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function getMetadata() {
  const firestore = getDb();
  const snap = await firestore.collection(METADATA_COL).doc(METADATA_DOC).get();
  return snap.exists ? snap.data() : null;
}
