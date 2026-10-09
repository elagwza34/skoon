"use client";

import { useMemo, useState } from "react";
import { products, productCategories, type Product } from "@/lib/demo";
import { tables } from "@/lib/demo/dashboard";

/** Demo-only rates — configurable later; never real/hardcoded policy. */
export const DEMO_TAX_RATE = 14; // %
export const DEMO_DISCOUNTS = [
  { value: 0, label: "بدون خصم" },
  { value: 10, label: "خصم 10%" },
  { value: 15, label: "خصم 15%" },
];

export type CartItem = { product: Product; qty: number };
export type OrderType = "dine_in" | "takeaway";

/**
 * usePosCart — all POS interaction logic (cart maths, filters, checkout flag)
 * kept out of the view so it is testable and reusable. Local state only; the
 * "checkout" is simulated and writes nothing.
 */
export function usePosCart() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("dine_in");
  const [tableNo, setTableNo] = useState<string>(tables.find((t) => t.status === "available")?.number ?? "1");
  const [discountPct, setDiscountPct] = useState(0);
  const [placed, setPlaced] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => (category === "all" || p.categoryId === category) && (!q || p.name.toLowerCase().includes(q)));
  }, [category, query]);

  const categoryOptions = [{ value: "all", label: "الكل" }, ...productCategories.map((c) => ({ value: c.id, label: c.name }))];
  const availableTables = tables.filter((t) => t.status === "available");

  function add(p: Product) {
    setPlaced(false);
    setCart((c) => {
      const found = c.find((i) => i.product.id === p.id);
      if (found) return c.map((i) => (i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...c, { product: p, qty: 1 }];
    });
  }
  const inc = (id: string) => setCart((c) => c.map((i) => (i.product.id === id ? { ...i, qty: i.qty + 1 } : i)));
  const dec = (id: string) => setCart((c) => c.flatMap((i) => (i.product.id === id ? (i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : []) : [i])));
  const removeItem = (id: string) => setCart((c) => c.filter((i) => i.product.id !== id));
  function clear() {
    setCart([]);
    setDiscountPct(0);
    setPlaced(false);
  }
  function checkout() {
    if (!cart.length) return;
    setPlaced(true);
    setCart([]);
    setDiscountPct(0);
  }

  const subtotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  const discountAmount = Math.round((subtotal * discountPct) / 100);
  const taxable = subtotal - discountAmount;
  const taxAmount = Math.round((taxable * DEMO_TAX_RATE) / 100);
  const total = taxable + taxAmount;
  const itemCount = cart.reduce((s, i) => s + i.qty, 0);

  return {
    cart, category, setCategory, query, setQuery, orderType, setOrderType, tableNo, setTableNo,
    discountPct, setDiscountPct, placed, visible, categoryOptions, availableTables,
    add, inc, dec, removeItem, clear, checkout,
    subtotal, discountAmount, taxAmount, total, itemCount,
  };
}