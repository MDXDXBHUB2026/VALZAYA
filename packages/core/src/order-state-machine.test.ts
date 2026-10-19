import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  OrderTransitionError,
  TERMINAL_ORDER_STATUSES,
  canTransition,
  checkTransition,
  isOrderStatus,
  transitionOrder,
  transitionPairs,
  type OrderStatus,
} from './order-state-machine';

/** The spec, written out independently of ORDER_TRANSITIONS so the test catches edits. */
const EXPECTED_ALLOWED = new Set<string>([
  'pending_payment>paid',
  'pending_payment>cancelled',
  'paid>in_production',
  'paid>ready_to_ship',
  'paid>refunded',
  'paid>partially_refunded',
  'in_production>ready_to_ship',
  'in_production>refunded',
  'in_production>partially_refunded',
  'ready_to_ship>shipped',
  'ready_to_ship>refunded',
  'ready_to_ship>partially_refunded',
  'shipped>delivered',
  'delivered>exchange_requested',
  'delivered>partially_refunded',
  'delivered>refunded',
  'partially_refunded>partially_refunded',
  'partially_refunded>refunded',
  'partially_refunded>exchange_requested',
  'exchange_requested>exchange_in_progress',
  'exchange_requested>delivered',
  'exchange_requested>partially_refunded',
  'exchange_requested>refunded',
  'exchange_in_progress>exchange_completed',
  'exchange_completed>exchange_requested',
  'exchange_completed>partially_refunded',
  'exchange_completed>refunded',
]);

const ALL_PAIRS: Array<[OrderStatus, OrderStatus]> = ORDER_STATUSES.flatMap((from) =>
  ORDER_STATUSES.map((to): [OrderStatus, OrderStatus] => [from, to]),
);

/** A context under which the guards permit the transition (if the table does). */
function permissiveCtx(from: OrderStatus, to: OrderStatus) {
  return { hasMadeToOrderLines: !(from === 'paid' && to === 'ready_to_ship') };
}

describe('order state machine — table', () => {
  it('covers all 12 statuses', () => {
    expect(ORDER_STATUSES).toHaveLength(12);
    expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual([...ORDER_STATUSES].sort());
  });

  it('table matches the spec exactly', () => {
    const actual = new Set(transitionPairs().map(([f, t]) => `${f}>${t}`));
    expect(actual).toEqual(EXPECTED_ALLOWED);
  });

  it.each(ALL_PAIRS)('%s -> %s', (from, to) => {
    const allowed = EXPECTED_ALLOWED.has(`${from}>${to}`);
    expect(canTransition(from, to)).toBe(allowed);
    const r = checkTransition(from, to, permissiveCtx(from, to));
    expect(r.ok).toBe(allowed);
    if (allowed) {
      expect(transitionOrder(from, to, permissiveCtx(from, to))).toBe(to);
    } else {
      expect(() => transitionOrder(from, to, permissiveCtx(from, to))).toThrow(
        OrderTransitionError,
      );
    }
  });

  it('terminal statuses have no outgoing transitions', () => {
    for (const s of TERMINAL_ORDER_STATUSES) expect(ORDER_TRANSITIONS[s]).toEqual([]);
  });

  it('every status is reachable from pending_payment', () => {
    const seen = new Set<OrderStatus>(['pending_payment']);
    const queue: OrderStatus[] = ['pending_payment'];
    while (queue.length) {
      const s = queue.shift() as OrderStatus;
      for (const n of ORDER_TRANSITIONS[s]) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect([...seen].sort()).toEqual([...ORDER_STATUSES].sort());
  });
});

describe('order state machine — guards', () => {
  it('stock-only orders skip production', () => {
    expect(checkTransition('paid', 'ready_to_ship', { hasMadeToOrderLines: false }).ok).toBe(true);
    expect(checkTransition('paid', 'in_production', { hasMadeToOrderLines: false }).ok).toBe(false);
  });

  it('preorder/mto orders must go through production', () => {
    expect(checkTransition('paid', 'in_production', { hasMadeToOrderLines: true }).ok).toBe(true);
    expect(checkTransition('paid', 'ready_to_ship', { hasMadeToOrderLines: true }).ok).toBe(false);
  });

  it('guards never open a transition the table forbids', () => {
    for (const [from, to] of ALL_PAIRS) {
      if (canTransition(from, to)) continue;
      for (const hasMadeToOrderLines of [true, false]) {
        expect(checkTransition(from, to, { hasMadeToOrderLines }).ok).toBe(false);
      }
    }
  });

  it('error carries from/to', () => {
    try {
      transitionOrder('shipped', 'paid', { hasMadeToOrderLines: false });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(OrderTransitionError);
      expect((e as OrderTransitionError).from).toBe('shipped');
      expect((e as OrderTransitionError).to).toBe('paid');
    }
  });

  it('isOrderStatus', () => {
    expect(isOrderStatus('paid')).toBe(true);
    expect(isOrderStatus('PAID')).toBe(false);
    expect(isOrderStatus(1)).toBe(false);
  });
});

describe('order state machine — database mirror', () => {
  it('allowed_order_transitions seed rows in the migration equal ORDER_TRANSITIONS', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const migrationsDir = join(here, '..', '..', '..', 'supabase', 'migrations');
    const file = readdirSync(migrationsDir).find((f) => f.endsWith('_order_state_machine.sql'));
    expect(file, 'order_state_machine migration not found').toBeDefined();
    const sql = readFileSync(join(migrationsDir, file as string), 'utf8');
    const block = /-- BEGIN TRANSITIONS([\s\S]*?)-- END TRANSITIONS/.exec(sql)?.[1] ?? '';
    const rows = [...block.matchAll(/\('([a-z_]+)'\s*,\s*'([a-z_]+)'\)/g)].map(
      (m) => `${m[1]}>${m[2]}`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows)).toEqual(new Set(transitionPairs().map(([f, t]) => `${f}>${t}`)));
    expect(rows.length).toBe(transitionPairs().length);

    const enumBlock =
      /create type public\.order_status as enum \(([\s\S]*?)\);/.exec(sql)?.[1] ?? '';
    const enumValues = [...enumBlock.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(enumValues).toEqual([...ORDER_STATUSES]);
  });
});
