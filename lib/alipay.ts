import "server-only";
import QRCode from "qrcode";

/**
 * Top-up by scanning a personal Alipay receive code.
 *
 * There is no merchant account and no API behind this: `ALIPAY_QR_URL` is the plain
 * `https://qr.alipay.com/...` link behind a personal 收款码, and the money moves straight from
 * the learner's Alipay to the owner's. Nothing calls back to say it arrived, so the learner's
 * own "I've paid" is all the ledger has to go on.
 *
 * That makes this a demo path, not a billing one — see `docs/alipay-credit.md`. The Stripe
 * route stays the one that credits an account only once money is confirmed.
 */

/** Null rather than throwing, so a deployment without the link degrades to "no Alipay". */
export function getAlipayPayUrl(url = process.env.ALIPAY_QR_URL): string | null {
  return url || null;
}

/**
 * The receive code as a PNG data URL.
 *
 * Rendered on the server so the QR library stays out of the browser bundle, and so the panel
 * can show the code with one `<img src>` and no client-side work.
 */
export function renderPayQrCode(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 1, width: 240 });
}

/**
 * Stands in for the Stripe event id on a ledger row.
 *
 * The ledger's uniqueness — and so its protection against double-crediting — hangs on that
 * column, which is `not null unique`. A confirmation that arrives by button press has no
 * Stripe event to name, so it brings its own id, prefixed to stay obvious in the table.
 */
export function alipayEventId(reference = crypto.randomUUID()): string {
  return `alipay_manual_${reference}`;
}
