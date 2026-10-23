# ERP permissions matrix — current and target

| Operation | Current enforcement | Target status |
|---|---|---|
| POS order / checkout | Cashier+ role and open shift in server writers | Existing; manager restriction needs an explicit permission split. |
| Waiter edit/dispatch | Waiter+ / branch and shift checks | Existing; item-level service pending. |
| Kitchen preparation | Kitchen+ lifecycle transition | Existing; item-level actor controls pending. |
| Inventory movement | Manager+ only in `staff-inventory-write.ts` | Replace with explicit `inventory.*` permissions before introducing inventory officer. |
| Fixed float | Server role/session and branch checks | Existing; live DB verification pending. |
| Accountability waiver | Not exposed yet | Manager+ only, mandatory reason, pending. |
| Payroll deduction | Not exposed yet | HR/accounting approval plus legal review, pending. |
| ERP accounting | Not implemented | Accountant/owner only, pending. |
| Supplier purchasing | Not implemented | Procurement/accountant role design pending. |

Role labels alone are insufficient for new domains. New ERP permissions must be
seeded and enforced in page guards, API handlers, and server services together.
