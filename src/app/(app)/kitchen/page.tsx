import { redirect } from "next/navigation";
import { getStaffSession } from "@/lib/session";
import { listStaffOrders } from "@/lib/staff-orders";
import { KitchenBoard } from "@/components/kitchen/kitchen-board";

/**
 * Kitchen board — server component. Resolves the branch-scoped live orders for
 * the signed-in staff member and hands them to the interactive board. Kitchen
 * sees active work (new/preparing/ready); the board advances status via the API.
 */
export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  const orders = await listStaffOrders(session, { limit: 100 });
  return <KitchenBoard orders={orders} />;
}
