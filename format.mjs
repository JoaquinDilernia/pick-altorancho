const ODOO_URL = process.env.ODOO_URL || 'https://lett.exemax.ar';

export function formatARS(amount) {
  return '$ ' + Number(amount).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function buildProduct(sku, name, templateId, tnPrice, promoPrice) {
  const hasPromo = promoPrice !== null && promoPrice < tnPrice;
  const discountPct = hasPromo
    ? Math.round((tnPrice - promoPrice) / tnPrice * 100)
    : null;
  const effectivePrice = hasPromo ? promoPrice : tnPrice;

  const doc = {
    Name:        sku,
    Description: name,
    MODELO:      name,
    Precio:      formatARS(tnPrice),
    Efecivo:     formatARS(effectivePrice * 0.75),
    Descuento:   hasPromo ? 'SI' : 'NO',
  };

  if (hasPromo) {
    doc.Pdesceunto = formatARS(promoPrice);
    doc.Porcentaje = `${discountPct}%`;
  }

  if (templateId) {
    doc.img = `${ODOO_URL}/web/image/product.template/${templateId}/image_512`;
  }

  return doc;
}
