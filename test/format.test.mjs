import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatARS, buildProduct } from '../format.mjs';

test('formatARS formats whole number', () => {
  assert.equal(formatARS(99990), '$ 99.990,00');
});

test('formatARS formats with decimals', () => {
  assert.equal(formatARS(143790), '$ 143.790,00');
});

test('formatARS formats small number', () => {
  assert.equal(formatARS(8990), '$ 8.990,00');
});

test('buildProduct sin promo', () => {
  const p = buildProduct('ALF001BN', 'ALFOMBRA GRANDE', 38349, 99990, null);
  assert.equal(p.Name, 'ALF001BN');
  assert.equal(p.Precio, '$ 99.990,00');
  assert.equal(p.Descuento, 'NO');
  assert.equal(p.Efecivo, '$ 79.992,00');
  assert.ok(!p.Pdesceunto);
  assert.ok(!p.Porcentaje);
  assert.equal(p.img, 'https://lett.exemax.ar/web/image/product.template/38349/image_512');
});

test('buildProduct con promo', () => {
  const p = buildProduct('ALF001BN', 'ALFOMBRA GRANDE', 38349, 99990, 65994);
  assert.equal(p.Descuento, 'SI');
  assert.equal(p.Pdesceunto, '$ 65.994,00');
  assert.equal(p.Porcentaje, '34%');
});

test('buildProduct sin imagen', () => {
  const p = buildProduct('ALF001BN', 'ALFOMBRA', null, 99990, null);
  assert.ok(!p.img);
});
