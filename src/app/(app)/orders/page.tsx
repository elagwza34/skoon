import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/session";
import { listStaffOrders } from "@/lib/staff-orders";
import { OrdersBoard } from "@/components/orders/orders-board";

/**
 * Orders — server component. Fetches the signed-in staff member's branch-scoped
 * orders (real DB) and hands them to the interactive board for search/filter.
 */
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const orders = await listStaffOrders(session, { limit: 100 });
  return <OrdersBoard orders={orders} />;
}