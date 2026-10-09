/**
 * Dashboard demo metrics — LOCAL MOCK ONLY (no database, no real sales).
 *
 * Self-consistent fabricated numbers so the preview KPIs, chart and donut add
 * up. Kept separate from components so a real data layer can replace it later.
 * Nothing here represents real revenue, orders or staff.
 */

/** Hourly sales curve for a typical demo cafe day (EGP). */
export const hourlySales: { hour: string; value: number }[] = [
  { hour: "08:00", value: 420 },
  { hour: "09:00", value: 680 },
  { hour: "10:00", value: 950 },
  { hour: "11:00", value: 1240 },
  { hour: "12:00", value: 1580 },
  { hour: "13:00", value: 1820 },
  { hour: "14:00", value: 1650 },
  { hour: "15:00", value: 1380 },
  { hour: "16:00", value: 1520 },
  { hour: "17:00", value: 1740 },
  { hour: "18:00", value: 1610 },
  { hour: "19:00", value: 1280 },
  { hour: "20:00", value: 940 },
  { hour: "21:00", value: 610 },
];

/** Total demo sales today (derived from the hourly curve so it stays consistent). */
export const totalSalesToday = hourlySales.reduce((s, h) => s + h.value, 0);
export const totalSalesYesterday = 15890;

/** Pre-baked ranges for the dashboard chart's time filter (demo only). */
export const salesSeriesByRange: Record<"day" | "week" | "month", { label: string; value: number }[]> = {
  day: hourlySales.map((h) => ({ label: h.hour, value: h.value })),
  week: [
    { label: "السبت", value: 14200 },
    { label: "الأحد", value: 12800 },
    { label: "الإثنين", value: 11500 },
    { label: "الثلاثاء", value: 13900 },
    { label: "الأربعاء", value: 15100 },
    { label: "الخميس", value: 18600 },
    { label: "الجمعة", value: 19800 },
  ],
  month: [
    { label: "أ1", value: 62000 },
    { label: "أ2", value: 58000 },
    { label: "أ3", value: 71000 },
    { label: "أ4", value: 66000 },
    { label: "أ5", value: 74000 },
  ],
};

export const ordersToday = 148;
export const ordersYesterday = 133;

/** Average order value (derived). */
export const avgOrderValue = Math.round(totalSalesToday / ordersToday);

/** Status distribution for today's orders (sum === ordersToday). */
export const statusDistribution: { key: string; label: string; value: number; color: string }[] = [
  { key: "new", label: "جديد", value: 6, color: "hsl(var(--accent-foreground))" },
  { key: "preparing", label: "قيد التحضير", value: 5, color: "hsl(var(--warning))" },
  { key: "ready", label: "جاهز", value: 3, color: "hsl(var(--primary))" },
  { key: "served", label: "تم التقديم", value: 127, color: "hsl(var(--success))" },
  { key: "cancelled", label: "ملغي", value: 7, color: "hsl(var(--destructive))" },
];

/** Orders currently being prepared (matches the `preparing` slice). */
export const ordersInPreparation = statusDistribution.find((s) => s.key === "preparing")?.value ?? 0;

/** Top-selling products for the demo day. */
export const topProducts: { name: string; emoji: string; qty: number; revenue: number }[] = [
  { name: "لاتيه", emoji: "🥛", qty: 42, revenue: 2310 },
  { name: "إسبريسو", emoji: "☕", qty: 38, revenue: 1330 },
  { name: "كابتشينو", emoji: "☕", qty: 31, revenue: 1705 },
  { name: "ساندويتش دجاج", emoji: "🥪", qty: 24, revenue: 1680 },
  { name: "تشيز كيك", emoji: "🍰", qty: 19, revenue: 1235 },
];

export type TableStatus = "available" | "occupied" | "cleaning";

export const TABLE_STATUS_META: Record<TableStatus, { label: string; tone: "success" | "warning" | "muted" }> = {
  available: { label: "متاحة", tone: "success" },
  occupied: { label: "مشغولة", tone: "warning" },
  cleaning: { label: "تحتاج تنظيف", tone: "muted" },
};

/** Demo tables with live-ish status for the dashboard snapshot. */
export const tables: { number: string; status: TableStatus; capacity: number; guests?: number }[] = [
  { number: "1", status: "occupied", capacity: 4, guests: 3 },
  { number: "2", status: "available", capacity: 2 },
  { number: "3", status: "occupied", capacity: 4, guests: 4 },
  { number: "4", status: "cleaning", capacity: 4 },
  { number: "5", status: "occupied", capacity: 6, guests: 5 },
  { number: "6", status: "available", capacity: 2 },
  { number: "7", status: "available", capacity: 4 },
  { number: "8", status: "occupied", capacity: 4, guests: 2 },
  { number: "9", status: "cleaning", capacity: 4 },
  { number: "10", status: "available", capacity: 6 },
  { number: "11", status: "available", capacity: 2 },
  { number: "12", status: "occupied", capacity: 4, guests: 4 },
  { number: "13", status: "available", capacity: 4 },
  { number: "14", status: "available", capacity: 4 },
  { number: "15", status: "available", capacity: 6 },
];

export const tableCounts = {
  available: tables.filter((t) => t.status === "available").length,
  occupied: tables.filter((t) => t.status === "occupied").length,
  cleaning: tables.filter((t) => t.status === "cleaning").length,
};

/** Demo notifications for the topbar bell (preview only). */
export const demoNotifications: { title: string; time: string; tone: "info" | "warning" | "success" }[] = [
  { title: "طلب جديد على الطاولة 5", time: "قبل دقيقتين", tone: "info" },
  { title: "الطلب ORD-1041 جاهز للتقديم", time: "قبل 5 دقائق", tone: "success" },
  { title: "مخزون الحليب منخفض", time: "قبل 20 دقيقة", tone: "warning" },
];