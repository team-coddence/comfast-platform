// Week-grid maths for the scheduler calendar.
//
// Everything here works in the browser's local timezone: the grid shows the
// user the slots they think in, and only the ISO strings crossing the wire are
// absolute.

/** First visible row. Earlier posts are clamped into it rather than hidden. */
export const START_HOUR = 6;
/** Last visible row, inclusive. */
export const END_HOUR = 22;

export const HOURS: number[] = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Midnight local time on the same day. */
export const startOfDay = (date: Date): Date => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

/** The Sunday at or before `date`, matching the Sun→Sat columns in the design. */
export const startOfWeek = (date: Date): Date => {
    const d = startOfDay(date);
    d.setDate(d.getDate() - d.getDay());
    return d;
}

export const addDays = (date: Date, days: number): Date => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

/** The seven day-start dates of the week containing `date`. */
export const weekDays = (weekStart: Date): Date[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

export const isSameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const isToday = (date: Date): boolean => isSameDay(date, new Date());

/** "Aug – Sep 2026", collapsing to one month or one year where they match. */
export const formatWeekRange = (weekStart: Date): string => {
    const end = addDays(weekStart, 6);
    const month = (d: Date) => d.toLocaleDateString(undefined, { month: "short" });
    if (weekStart.getFullYear() !== end.getFullYear()) {
        return `${month(weekStart)} ${weekStart.getFullYear()} – ${month(end)} ${end.getFullYear()}`;
    }
    if (weekStart.getMonth() !== end.getMonth()) {
        return `${month(weekStart)} – ${month(end)} ${end.getFullYear()}`;
    }
    return `${month(weekStart)} ${end.getFullYear()}`;
}

export const formatTime = (date: Date): string =>
    date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/**
 * Vertical position of `date` within the grid, as a 0–1 fraction of the visible
 * span. Posts outside [START_HOUR, END_HOUR] clamp to the edges so an 03:00
 * post is still reachable instead of rendering off-canvas.
 */
export const offsetInDay = (date: Date): number => {
    const minutes = date.getHours() * 60 + date.getMinutes();
    const from = START_HOUR * 60;
    const span = (END_HOUR + 1) * 60 - from;
    return Math.min(1, Math.max(0, (minutes - from) / span));
}

/** `YYYY-MM-DD` in local time — what an `<input type="date">` expects. */
export const toDateInput = (date: Date): string => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `HH:mm` in local time — what an `<input type="time">` expects. */
export const toTimeInput = (date: Date): string => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Combines the two input values back into an absolute instant. */
export const fromDateTimeInputs = (date: string, time: string): Date => new Date(`${date}T${time}`);
