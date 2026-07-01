import 'dotenv/config';
import { authenticate, fetchAll } from './odoo.mjs';
import { batchWrite, deleteStale, setMetadata } from './firebase.mjs';
import { buildProduct } from './format.mjs';

async function findPricelists() {
  const all = await fetchAll(
    'product.pricelist',
    [['active', '=', true]],
    ['id', 'name'],
    200
  );

  const tn = all
    .filter(p => p.name.includes('Tienda Nube') && !p.name.toLowerCase().includes('promo'))
    .sort((a, b) => b.id - a.id)[0];

  const promo = all
    .filter(p => p.name.includes('Tienda Nube') && p.name.toLowerCase().includes('promo'))
    .sort((a, b) => b.id - a.id)[0];

  if (!tn)    throw new Error('No active "Tienda Nube" pricelist found');
  if (!promo) throw new Error('No active "Tienda Nube Promo" pricelist found');

  console.log(`[sync] TN pricelist: [${tn.id}] ${tn.name}`);
  console.log(`[sync] Promo pricelist: [${promo.id}] ${promo.name}`);
  return { tnId: tn.id, promoId: promo.id };
}

async function fetchPriceMap(plId) {
  const items = await fetchAll(
    'product.pricelist.item',
    [['pricelist_id', '=', plId], ['compute_price', '=', 'fixed']],
    ['product_tmpl_id', 'fixed_price'],
    1000
  );
  const map = new Map();
  for (const item of items) {
    if (item.product_tmpl_id) {
      const tmplId = item.product_tmpl_id[0];
      map.set(tmplId, item.fixed_price);
    }
  }
  return map;
}

async function fetchProductMap() {
  // Fetch product data without image field to avoid large payloads / timeouts
  const [products, withImage] = await Promise.all([
    fetchAll(
      'product.template',
      [['active', '=', true], ['default_code', '!=', false]],
      ['id', 'name', 'default_code'],
      1000
    ),
    // Separate request: IDs of products that have an image (server-side filter, no data returned)
    fetchAll(
      'product.template',
      [['active', '=', true], ['default_code', '!=', false], ['image_1920', '!=', false]],
      ['id'],
      1000
    ),
  ]);

  const imageIds = new Set(withImage.map(p => p.id));
  const map = new Map();
  for (const p of products) {
    map.set(p.id, {
      sku:      p.default_code.trim(),
      name:     p.name.trim(),
      hasImage: imageIds.has(p.id),
    });
  }
  return map;
}

export async function runSync() {
  const start = Date.now();
  console.log('[sync] starting...');

  await authenticate();
  const { tnId, promoId } = await findPricelists();

  const [tnPrices, promoPrices, productMap] = await Promise.all([
    fetchPriceMap(tnId),
    fetchPriceMap(promoId),
    fetchProductMap(),
  ]);

  console.log(`[sync] TN items: ${tnPrices.size}, Promo items: ${promoPrices.size}, Products: ${productMap.size}`);

  const docs    = [];
  let   skipped = 0;

  for (const [tmplId, tnPrice] of tnPrices) {
    const product = productMap.get(tmplId);
    if (!product) { skipped++; continue; }

    const promoPrice = promoPrices.get(tmplId) ?? null;
    const data = buildProduct(
      product.sku,
      product.name,
      product.hasImage ? tmplId : null,
      tnPrice,
      promoPrice
    );
    docs.push({ id: product.sku, data });
  }

  console.log(`[sync] building ${docs.length} products (skipped ${skipped})`);

  const activeSkus   = new Set(docs.map(d => d.id));
  const { written } = await batchWrite(docs);
  const { deleted } = await deleteStale(activeSkus);

  const durationMs = Date.now() - start;
  const result = { synced: written, skipped, deleted, durationMs, pricelists: { tnId, promoId } };

  await setMetadata({
    ok:          true,
    synced:      written,
    skipped,
    deleted,
    durationMs,
    tnPricelist:  tnId,
    promoPricelist: promoId,
  });

  console.log(`[sync] done in ${durationMs}ms — synced: ${written}, deleted: ${deleted}, skipped: ${skipped}`);
  return result;
}

// Allow running standalone: node sync.mjs
if (process.argv[1].endsWith('sync.mjs')) {
  runSync().then(r => { console.log(r); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
}
