const { query, withTransaction } = require('../../config/database');
const config = require('../../config');
const ApiError = require('../../utils/ApiError');
const { parsePagination, paginatedResponse } = require('../../utils/pagination');
const { generateOrderNumber } = require('../../utils/generateOrderNumber');
const { effectivePriceSql, compareAtPriceSql, round2 } = require('../../utils/pricing');
const { escapeLike } = require('../../utils/validators');
const { audit } = require('../../utils/audit');
const { afterStockChange } = require('../../lib/stockRevalidation');
const { applyCoupon, recordRedemption, releaseCouponForOrder } = require('../coupons/coupon.apply');
const { recordHistory } = require('../orders/order.lifecycle');
const {
  isSuperAdmin, listBranchScope, writeBranchScope, assertBranchAccess, addDateRange,
} = require('../branches/ops.shared');
const {
  recordLineMovements, addStock, takeAvailable, availableAt, assertActiveBranch,
} = require('../inventory/inventory.stock');

/**
 * POS — walk-in sales at a branch counter.
 *
 * A sale is an order with channel 'pos', status 'delivered' (goods handed
 * over) and a completed transaction. The server prices every line from the
 * catalog (effectivePriceSql); a different price is an audited override,
 * capped for branch_admin by POS_MAX_STAFF_DISCOUNT_PCT. Stock is taken only
 * from the unreserved part of the branch's inventory row.
 */

const SALE_NOT_FOUND = 'Sale not found';

/** Max % a branch_admin may knock off the catalog price (config, default 10). */
const maxStaffDiscountPct = () => config.pos.maxStaffDiscountPct;

const EPS = 1e-9;
const taka = (n) => `৳${round2(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** Branch the sale is rung up at: the operator's, or (super_admin) the one given. */
const saleBranch = (operator, requested) => {
  const branchId = writeBranchScope(operator, requested);
  if (!branchId) throw ApiError.badRequest('branch_id is required (your account has no branch)');
  return branchId;
};

/**
 * Ring up a walk-in sale.
 *
 * @param {object} data     - validated createSaleSchema body
 * @param {object} operator - req.user (staff)
 * @returns {Promise<object>} the sale (order + items + transaction)
 */
const createSale = async (data, operator) => {
  const branchId = saleBranch(operator, data.branch_id);
  const capped = !isSuperAdmin(operator);
  const pct = maxStaffDiscountPct();

  const orderId = await withTransaction(async (client) => {
    await assertActiveBranch(client, branchId);

    // Lock inventory rows in variant order so two multi-line sales can't deadlock.
    const items = [...data.items].sort((a, b) => a.variant_id.toLowerCase().localeCompare(b.variant_id.toLowerCase()));
    const lines = [];
    const overrides = [];

    for (const item of items) {
      const { rows } = await client.query(
        `SELECT pv.id, pv.sku, pv.variant_name, p.name AS product_name,
                ${effectivePriceSql('pv')} AS list_price
           FROM product_variants pv
           JOIN products p ON p.id = pv.product_id
          WHERE pv.id = $1 AND pv.is_active AND p.deleted_at IS NULL`,
        [item.variant_id]
      );
      const variant = rows[0];
      if (!variant) throw ApiError.badRequest(`Product variant ${item.variant_id} is not available`);
      const label = `${variant.product_name} — ${variant.variant_name}`;

      const listPrice = round2(variant.list_price);
      let unitPrice = listPrice;
      if (item.unit_price !== undefined && round2(item.unit_price) !== listPrice) {
        unitPrice = round2(item.unit_price);
        if (capped) {
          const floor = round2(listPrice * (1 - pct / 100));
          if (unitPrice + EPS < floor) {
            throw ApiError.forbidden(`${label}: price can't go below ${taka(floor)} (max ${pct}% staff discount)`);
          }
        }
        overrides.push({
          variant_id: variant.id, sku: variant.sku, list_price: listPrice, unit_price: unitPrice,
          reason: item.price_override_reason,
        });
      }

      // BE-01: only unreserved stock can be sold over the counter.
      const stock = await takeAvailable(client, { variantId: variant.id, branchId, qty: item.quantity });
      if (!stock) {
        const n = await availableAt(client, { variantId: variant.id, branchId });
        throw ApiError.conflict(`${label}: only ${n} available at this branch`);
      }

      const unitIds = item.unit_ids || [];
      if (unitIds.length) {
        const units = await client.query(
          `SELECT id FROM inventory_units
            WHERE id = ANY($1::uuid[]) AND variant_id = $2 AND branch_id = $3 AND status = 'in_stock'
            FOR UPDATE`,
          [unitIds, variant.id, branchId]
        );
        if (units.rows.length !== unitIds.length) {
          throw ApiError.conflict(`${label}: a selected serial unit is not in stock at this branch`);
        }
      }

      lines.push({
        variant, quantity: item.quantity, listPrice, unitPrice, unitIds,
        total: round2(unitPrice * item.quantity),
      });
    }

    const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
    const listSubtotal = round2(lines.reduce((s, l) => s + l.listPrice * l.quantity, 0));

    // Manual discount: bounded by the subtotal, and for branch_admin by the
    // staff cap — on its own and together with any price overrides.
    const manual = round2(data.discount || 0);
    if (manual > subtotal + EPS) throw ApiError.badRequest('Discount exceeds the subtotal');
    if (capped && manual > 0) {
      const maxManual = round2(subtotal * pct / 100);
      if (manual > maxManual + EPS) {
        throw ApiError.forbidden(`Discount can't exceed ${taka(maxManual)} (max ${pct}% staff discount)`);
      }
      const maxCombined = round2(listSubtotal * pct / 100);
      if (round2(listSubtotal - subtotal + manual) > maxCombined + EPS) {
        throw ApiError.forbidden(`Price overrides plus discount can't exceed ${pct}% of the list total (${taka(maxCombined)})`);
      }
    }

    // A registered customer with this phone gets the sale on their account
    // (and coupon per-user limits apply to them) — but only if they proved
    // they own the number. Registration doesn't require OTP, so otherwise
    // anyone could register a victim's phone and see their in-store purchases.
    let customerId = null;
    if (data.customer_phone) {
      const u = await client.query(
        `SELECT id FROM users
          WHERE phone = $1 AND role = 'customer' AND phone_verified AND deleted_at IS NULL`,
        [data.customer_phone]
      );
      customerId = u.rows[0]?.id || null;
    }

    let coupon = null;
    let couponDiscount = 0;
    if (data.coupon_code) {
      const applied = await applyCoupon(client, { code: data.coupon_code, subtotal, userId: customerId, channel: 'pos' });
      coupon = applied.coupon;
      couponDiscount = round2(Math.min(applied.discount, subtotal - manual));
    }

    const discount = round2(manual + couponDiscount);
    const total = round2(subtotal - discount);

    const orderNumber = await generateOrderNumber(client);
    const { rows: [order] } = await client.query(
      `INSERT INTO orders
         (order_number, user_id, branch_id, channel, status, subtotal, discount, shipping_fee,
          total_amount, admin_note, pos_operator_id, coupon_id, payment_method, payment_status,
          customer_name, customer_phone, delivered_at)
       VALUES ($1, $2, $3, 'pos', 'delivered', $4, $5, 0, $6, $7, $8, $9, $10, 'completed', $11, $12, NOW())
       RETURNING id, order_number`,
      [orderNumber, customerId, branchId, subtotal, discount, total, data.note ?? null, operator.id,
       coupon?.id ?? null, data.payment_method, data.customer_name ?? null, data.customer_phone ?? null]
    );
    await recordHistory(client, { orderId: order.id, from: null, to: 'delivered', note: 'POS sale', actor: operator });

    for (const line of lines) {
      const { rows: [oi] } = await client.query(
        `INSERT INTO order_items
           (order_id, variant_id, quantity, unit_price, total_price, list_price, branch_id,
            product_name, variant_name, sku)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [order.id, line.variant.id, line.quantity, line.unitPrice, line.total, line.listPrice, branchId,
         line.variant.product_name, line.variant.variant_name, line.variant.sku]
      );
      if (line.unitIds.length) {
        await client.query(
          `UPDATE inventory_units SET status = 'sold', sold_at = NOW(), order_item_id = $1
            WHERE id = ANY($2::uuid[])`,
          [oi.id, line.unitIds]
        );
      }
      await recordLineMovements(client, {
        variantId: line.variant.id, branchId, qty: line.quantity, unitIds: line.unitIds, sign: -1,
        type: 'sale', refType: 'order', refId: order.id, userId: operator.id,
        note: `POS sale ${order.order_number}`,
      });
    }

    await client.query(
      `INSERT INTO transactions (order_id, payment_method, payment_status, amount)
       VALUES ($1, $2, 'completed', $3)`,
      [order.id, data.payment_method, total]
    );

    if (coupon) {
      await recordRedemption(client, { couponId: coupon.id, userId: customerId, orderId: order.id, discount: couponDiscount });
    }

    await audit({
      actor: operator, action: 'pos.sale', entity: 'order', entityId: order.id, db: client,
      data: { order_number: order.order_number, branch_id: branchId, subtotal, discount, total },
    });
    if (overrides.length || manual > 0) {
      await audit({
        actor: operator, action: 'pos.price_override', entity: 'order', entityId: order.id, db: client,
        data: {
          order_number: order.order_number, overrides, manual_discount: manual,
          discount_reason: data.discount_reason ?? null, cap_pct: capped ? pct : null,
        },
      });
    }
    return order.id;
  });

  return getSaleById(orderId, operator);
};

// ─── Listing / detail ────────────────────────────────────────

const buildSalesFilter = (q, user) => {
  const where = [`o.channel = 'pos'`];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  const branchId = listBranchScope(user, q.branch_id);
  if (branchId) add('o.branch_id = ?', branchId);
  if (q.operator_id) add('o.pos_operator_id = ?', q.operator_id);
  if (q.payment_method) add('o.payment_method = ?', q.payment_method);
  if (q.q) add('(o.order_number ILIKE ? OR o.customer_phone ILIKE ? OR o.customer_name ILIKE ?)', `%${escapeLike(q.q)}%`);
  if (q.voided === true) where.push('o.voided_at IS NOT NULL');
  if (q.voided === false) where.push('o.voided_at IS NULL');
  addDateRange(where, params, 'o.created_at', q);
  return { whereSql: where.join(' AND '), params };
};

/**
 * Paginated POS sales (branch scoped) with a summary of the whole filtered
 * range for day-close. Voided sales are listed but excluded from the totals.
 */
const getSales = async (q, user) => {
  const { page, limit, offset } = parsePagination(q);
  const { whereSql, params } = buildSalesFilter(q, user);

  const [rows, summary, byMethod] = await Promise.all([
    query(
      `SELECT o.id, o.order_number, o.created_at, o.status, o.subtotal, o.discount, o.total_amount,
              o.payment_method, o.payment_status, o.customer_name, o.customer_phone,
              o.user_id AS customer_id, o.pos_operator_id AS operator_id, op.full_name AS operator_name,
              o.branch_id, b.name AS branch_name, c.code AS coupon_code, o.voided_at, o.void_reason,
              (SELECT COALESCE(SUM(oi.quantity), 0)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count
         FROM orders o
         LEFT JOIN users op ON op.id = o.pos_operator_id
         LEFT JOIN branches b ON b.id = o.branch_id
         LEFT JOIN coupons c ON c.id = o.coupon_id
        WHERE ${whereSql}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(
      `SELECT COUNT(*)::int AS total_rows,
              COUNT(*) FILTER (WHERE o.voided_at IS NULL)::int AS count,
              COALESCE(SUM(o.subtotal)     FILTER (WHERE o.voided_at IS NULL), 0) AS gross,
              COALESCE(SUM(o.discount)     FILTER (WHERE o.voided_at IS NULL), 0) AS discount,
              COALESCE(SUM(o.total_amount) FILTER (WHERE o.voided_at IS NULL), 0) AS net,
              COUNT(*) FILTER (WHERE o.voided_at IS NOT NULL)::int AS voided_count,
              COALESCE(SUM(o.total_amount) FILTER (WHERE o.voided_at IS NOT NULL), 0) AS voided_net
         FROM orders o WHERE ${whereSql}`,
      params
    ),
    query(
      `SELECT o.payment_method, COUNT(*)::int AS count, COALESCE(SUM(o.total_amount), 0) AS net
         FROM orders o WHERE ${whereSql} AND o.voided_at IS NULL
        GROUP BY o.payment_method ORDER BY o.payment_method`,
      params
    ),
  ]);

  const s = summary.rows[0];
  return {
    ...paginatedResponse(rows.rows, s.total_rows, { page, limit }),
    summary: {
      count: s.count,
      gross: round2(s.gross),
      discount: round2(s.discount),
      net: round2(s.net),
      voided_count: s.voided_count,
      voided_net: round2(s.voided_net),
      by_payment_method: Object.fromEntries(
        byMethod.rows.map((r) => [r.payment_method, { count: r.count, net: round2(r.net) }])
      ),
    },
  };
};

/** One POS sale with items (and their serial units), transaction and operator. */
const getSaleById = async (id, user) => {
  const { rows } = await query(
    `SELECT o.id, o.order_number, o.channel, o.status, o.branch_id, b.name AS branch_name,
            o.subtotal, o.discount, o.shipping_fee, o.total_amount, o.payment_method, o.payment_status,
            o.customer_name, o.customer_phone, o.user_id AS customer_id, o.admin_note AS note,
            o.coupon_id, c.code AS coupon_code,
            o.pos_operator_id AS operator_id, op.full_name AS operator_name,
            o.voided_at, o.voided_by, vb.full_name AS voided_by_name, o.void_reason,
            o.created_at, o.updated_at
       FROM orders o
       LEFT JOIN branches b ON b.id = o.branch_id
       LEFT JOIN coupons c ON c.id = o.coupon_id
       LEFT JOIN users op ON op.id = o.pos_operator_id
       LEFT JOIN users vb ON vb.id = o.voided_by
      WHERE o.id = $1 AND o.channel = 'pos'`,
    [id]
  );
  const sale = rows[0];
  if (!sale) throw ApiError.notFound(SALE_NOT_FOUND);
  assertBranchAccess(user, sale.branch_id, SALE_NOT_FOUND);

  const [items, units, txns] = await Promise.all([
    query(
      `SELECT id, variant_id, product_name, variant_name, sku, quantity, list_price, unit_price, total_price, branch_id
         FROM order_items WHERE order_id = $1 ORDER BY created_at, id`,
      [id]
    ),
    // Serial units come from the ledger so they still show after a void.
    query(
      `SELECT sm.variant_id, iu.id, iu.serial_number, iu.condition_grade
         FROM stock_movements sm JOIN inventory_units iu ON iu.id = sm.unit_id
        WHERE sm.reference_id = $1 AND sm.movement_type = 'sale'
        ORDER BY iu.serial_number`,
      [id]
    ),
    query(
      `SELECT id, payment_method, payment_status, amount, currency, created_at, updated_at
         FROM transactions WHERE order_id = $1 ORDER BY created_at DESC`,
      [id]
    ),
  ]);

  return {
    ...sale,
    items: items.rows.map((it) => ({
      ...it,
      units: units.rows
        .filter((u) => u.variant_id === it.variant_id)
        .map(({ id: unitId, serial_number, condition_grade }) => ({ id: unitId, serial_number, condition_grade })),
    })),
    transaction: txns.rows[0] || null,
  };
};

/**
 * Void a POS sale (super_admin): restock every line, put serial units back in
 * stock, release the coupon use, refund the transaction and cancel the order.
 * Idempotent — a second void is a 409.
 */
const voidSale = async (id, { reason }, user) => {
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND channel = 'pos' FOR UPDATE`, [id]
    );
    const order = rows[0];
    if (!order) throw ApiError.notFound(SALE_NOT_FOUND);
    if (order.voided_at || order.status === 'cancelled') throw ApiError.conflict('This sale has already been voided');

    const items = (await client.query(
      'SELECT id, variant_id, quantity, branch_id FROM order_items WHERE order_id = $1 ORDER BY variant_id',
      [id]
    )).rows;
    const soldUnits = (await client.query(
      `SELECT unit_id, variant_id FROM stock_movements
        WHERE reference_id = $1 AND movement_type = 'sale' AND unit_id IS NOT NULL`,
      [id]
    )).rows;

    // Inventory rows first, then units (global lock order).
    for (const item of items) {
      await addStock(client, { variantId: item.variant_id, branchId: item.branch_id || order.branch_id, qty: item.quantity });
    }

    const unitIds = soldUnits.map((u) => u.unit_id);
    if (unitIds.length) {
      const locked = await client.query(
        'SELECT id, status, order_item_id FROM inventory_units WHERE id = ANY($1::uuid[]) FOR UPDATE',
        [unitIds]
      );
      const itemIds = new Set(items.map((i) => i.id));
      const moved = locked.rows.filter((u) => u.status !== 'sold' || !itemIds.has(u.order_item_id));
      if (moved.length || locked.rows.length !== unitIds.length) {
        throw ApiError.conflict('A serial unit from this sale has since been returned or changed — fix it in inventory first');
      }
      await client.query(
        `UPDATE inventory_units SET status = 'in_stock', sold_at = NULL, order_item_id = NULL
          WHERE id = ANY($1::uuid[])`,
        [unitIds]
      );
    }

    for (const item of items) {
      await recordLineMovements(client, {
        variantId: item.variant_id, branchId: item.branch_id || order.branch_id, qty: item.quantity,
        unitIds: soldUnits.filter((u) => u.variant_id === item.variant_id).map((u) => u.unit_id),
        sign: 1, type: 'return', refType: 'order', refId: id, userId: user.id,
        note: `Void ${order.order_number}: ${reason}`.slice(0, 500),
      });
    }

    await releaseCouponForOrder(client, id);
    await client.query(
      `UPDATE transactions SET payment_status = 'refunded'
        WHERE order_id = $1 AND payment_status = 'completed'`,
      [id]
    );
    await client.query(
      `UPDATE orders SET status = 'cancelled', payment_status = 'refunded', cancelled_at = NOW(),
              cancel_reason = 'staff', voided_at = NOW(), voided_by = $2, void_reason = $3
        WHERE id = $1`,
      [id, user.id, reason]
    );
    await recordHistory(client, { orderId: id, from: order.status, to: 'cancelled', note: `POS void: ${reason}`, actor: user });
    await audit({
      actor: user, action: 'pos.void', entity: 'order', entityId: id, db: client,
      data: { order_number: order.order_number, reason, total: Number(order.total_amount) },
    });
  });
  return getSaleById(id, user);
};

/**
 * Counter lookup. An exact SKU (what a barcode scanner types) or an exact
 * in-stock serial number comes first, then name/SKU matches. Availability is
 * for the operator's branch.
 */
const catalog = async (q, user) => {
  const branchId = saleBranch(user, q.branch_id);
  const term = q.q;
  // System SKUs are PG-<number>; typing just the number finds them too.
  const skuTerm = /^\d+$/.test(term) ? `PG-${term}` : term;
  const { rows } = await query(
    `SELECT pv.id AS variant_id, pv.sku, pv.variant_name, pv.product_id, p.name AS product_name,
            p.condition, p.is_active AS product_active,
            ${effectivePriceSql('pv')} AS effective_price,
            pv.price AS list_price,
            ${compareAtPriceSql('pv')} AS compare_at_price,
            COALESCE(i.quantity, 0)::int AS quantity,
            COALESCE(i.reserved, 0)::int AS reserved,
            GREATEST(COALESCE(i.quantity - i.reserved, 0), 0)::int AS available,
            (SELECT COUNT(*)::int FROM inventory_units iu
              WHERE iu.variant_id = pv.id AND iu.branch_id = $2 AND iu.status = 'in_stock') AS serial_units_in_stock,
            (SELECT iu.id FROM inventory_units iu
              WHERE iu.variant_id = pv.id AND iu.branch_id = $2 AND iu.status = 'in_stock'
                AND LOWER(iu.serial_number) = LOWER($1) LIMIT 1) AS matched_unit_id,
            LOWER(pv.sku) IN (LOWER($1), LOWER($6)) AS exact_sku
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       LEFT JOIN inventory i ON i.variant_id = pv.id AND i.branch_id = $2
      WHERE pv.is_active AND p.deleted_at IS NULL
        AND (
          LOWER(pv.sku) IN (LOWER($1), LOWER($6))
          OR pv.sku ILIKE $4
          OR p.name ILIKE $3
          OR pv.variant_name ILIKE $3
          OR EXISTS (SELECT 1 FROM inventory_units iu
                      WHERE iu.variant_id = pv.id AND iu.branch_id = $2 AND iu.status = 'in_stock'
                        AND LOWER(iu.serial_number) = LOWER($1))
        )
      ORDER BY (LOWER(pv.sku) IN (LOWER($1), LOWER($6))) DESC,
               (EXISTS (SELECT 1 FROM inventory_units iu
                         WHERE iu.variant_id = pv.id AND iu.branch_id = $2 AND iu.status = 'in_stock'
                           AND LOWER(iu.serial_number) = LOWER($1))) DESC,
               (COALESCE(i.quantity - i.reserved, 0) > 0) DESC,
               p.name ASC, pv.variant_name ASC
      LIMIT $5`,
    [term, branchId, `%${escapeLike(term)}%`, `${escapeLike(term)}%`, q.limit || 20, skuTerm]
  );

  const pct = maxStaffDiscountPct();
  const capped = !isSuperAdmin(user);
  return rows.map((r) => ({
    ...r,
    ...(capped && { min_staff_price: round2(Number(r.effective_price) * (1 - pct / 100)) }),
  }));
};

// Sales and voids change stock: refresh the storefront's stock-dependent pages.
module.exports = {
  createSale: afterStockChange(createSale), getSales, getSaleById, voidSale: afterStockChange(voidSale), catalog, maxStaffDiscountPct,
};
