/**
 * Order lifecycle state machine. Order status changes ONLY through this module and the
 * database function `public.apply_order_transition()`.
 *
 * The transition table is mirrored in the database (`public.allowed_order_transitions`,
 * migration *_order_state_machine.sql). A test parses that migration and asserts the rows
 * match `ORDER_TRANSITIONS` exactly, so the two cannot drift.
 *
 * Every applied transition writes one `order_events` row and one `audit_log` row; the
 * database function does this atomically.
 */

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'in_production',
  'ready_to_ship',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
  'partially_refunded',
  'exchange_requested',
  'exchange_in_progress',
  'exchange_completed',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['cancelled', 'refunded'];

/**
 * Allowed transitions. Notes:
 * - `cancelled` = cancelled before payment. A paid order that is cancelled goes to
 *   `refunded` (the refund is the cancellation).
 * - `in_production` is only for orders containing preorder/mto lines (guarded below).
 * - `partially_refunded -> partially_refunded` records an additional partial refund.
 * - `exchange_requested -> delivered` = exchange declined or withdrawn.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['in_production', 'ready_to_ship', 'refunded', 'partially_refunded'],
  in_production: ['ready_to_ship', 'refunded', 'partially_refunded'],
  ready_to_ship: ['shipped', 'refunded', 'partially_refunded'],
  shipped: ['delivered'],
  delivered: ['exchange_requested', 'partially_refunded', 'refunded'],
  partially_refunded: ['partially_refunded', 'refunded', 'exchange_requested'],
  exchange_requested: ['exchange_in_progress', 'delivered', 'partially_refunded', 'refunded'],
  exchange_in_progress: ['exchange_completed'],
  exchange_completed: ['exchange_requested', 'partially_refunded', 'refunded'],
  cancelled: [],
  refunded: [],
};

export interface TransitionContext {
  /** True if any order line is stock_mode preorder or mto. */
  hasMadeToOrderLines: boolean;
}

export type TransitionResult =
  | { ok: true; from: OrderStatus; to: OrderStatus }
  | { ok: false; from: OrderStatus; to: OrderStatus; reason: string };

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** Pure table lookup (no guards). Mirrors the DB table. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Table lookup plus business guards. */
export function checkTransition(
  from: OrderStatus,
  to: OrderStatus,
  ctx: TransitionContext,
): TransitionResult {
  if (!canTransition(from, to)) {
    return { ok: false, from, to, reason: `transition ${from} -> ${to} is not allowed` };
  }
  if (from === 'paid' && to === 'in_production' && !ctx.hasMadeToOrderLines) {
    return { ok: false, from, to, reason: 'only preorder/mto orders go into production' };
  }
  if (from === 'paid' && to === 'ready_to_ship' && ctx.hasMadeToOrderLines) {
    return { ok: false, from, to, reason: 'preorder/mto orders must go through in_production' };
  }
  return { ok: true, from, to };
}

export class OrderTransitionError extends Error {
  readonly from: OrderStatus;
  readonly to: OrderStatus;

  constructor(from: OrderStatus, to: OrderStatus, reason: string) {
    super(reason);
    this.name = 'OrderTransitionError';
    this.from = from;
    this.to = to;
  }
}

/** Throws OrderTransitionError if the transition is not permitted. Returns the new status. */
export function transitionOrder(
  from: OrderStatus,
  to: OrderStatus,
  ctx: TransitionContext,
): OrderStatus {
  const r = checkTransition(from, to, ctx);
  if (!r.ok) throw new OrderTransitionError(from, to, r.reason);
  return r.to;
}

/** Flattened (from, to) pairs — the exact rows of `public.allowed_order_transitions`. */
export function transitionPairs(): Array<[OrderStatus, OrderStatus]> {
  return ORDER_STATUSES.flatMap((from) =>
    ORDER_TRANSITIONS[from].map((to): [OrderStatus, OrderStatus] => [from, to]),
  );
}
