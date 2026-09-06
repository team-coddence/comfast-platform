// Normalisation for the mobile money MSISDN.
//
// Customers type their number every way a number can be typed: "+228 90 12 34
// 56", "0022890123456", "90-12-34-56". Processors accept exactly one of those,
// and reject the rest with an unhelpful generic error — so normalise here,
// once, before the number reaches any adapter.

const TOGO_COUNTRY_CODE = "228";

export interface NormalizedPhone {
    /** 8-digit national number, e.g. "90123456". */
    national: string;
    /** Full international form without "+", e.g. "22890123456". */
    international: string;
}

/**
 * Returns null when the input cannot be a Togolese mobile number.
 *
 * Only the shape is checked — length and leading digit. Operator prefixes are
 * deliberately not policed: they are reassigned between networks more often
 * than a hard-coded list gets updated, and a stale list here would reject
 * paying customers with a message they cannot act on. The processor is the
 * authority on whether a number belongs to Mixx or to Flooz.
 */
export const normalizeTogoPhone = (input: string | undefined | null): NormalizedPhone | null => {
    if (!input) return null;

    let digits = input.replace(/\D/g, "");

    // 00228… and 228… both mean the same thing.
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith(TOGO_COUNTRY_CODE)) digits = digits.slice(TOGO_COUNTRY_CODE.length);
    // Some customers add a leading 0 by habit, copying French formatting.
    if (digits.length === 9 && digits.startsWith("0")) digits = digits.slice(1);

    if (digits.length !== 8) return null;
    if (!/^[79]/.test(digits)) return null;

    return { national: digits, international: `${TOGO_COUNTRY_CODE}${digits}` };
}

/** "90 12 34 56" — for confirmation screens and receipts. */
export const formatTogoPhone = (national: string): string =>
    national.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
