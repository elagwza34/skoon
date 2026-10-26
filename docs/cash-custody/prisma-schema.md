# Cash Custody — Prisma Schema Draft

**Status:** Draft for review. No changes deployed.

## New Models

### CashDrawer

A physical cash container within a branch.

```prisma
model CashDrawer {
  id        BigInt   @id @default(autoincrement())
  branchId  BigInt   @map("branch_id")
  name      String   @db.VarChar(60)
  is_active Boolean  @default(true) @map("is_active")

  branch CafeBranch @relation(fields: [branchId], references: [id], onDelete: Restrict)
  activeCustody CashCustodyAssignment?
}
```

### CashCustodyAssignment

Links an employee, an operational shift (where required), and a cash drawer.

```prisma
model CashCustodyAssignment {
  id         BigInt   @id @default(autoincrement())
  branchId   BigInt   @map("branch_id")
  cashierId  String   @map("cashier_id") @db.Uuid
  shiftId    BigInt   @map("shift_id")
  drawerId   BigInt   @map("cash_drawer_id")

  status       String? @default("active") @map("status")
  assignedById String? @map("assigned_by_id")

  branch CafeBranch @relation(fields: [branchId], references: [id], onDelete: Restrict)
  cashier User     @relation(name: "cashCustodyCashier", fields: [cashierId], references: [id], onDelete: Restrict)
  shift  Shift     @relation(fields: [shiftId], references: [id], onDelete: Restrict)
  drawer CashDrawer @relation(fields: [drawerId], references: [id], onDelete: Restrict)

  events CashCustodyEvent[]
}
```

### CashCustodyEvent

Immutable audit trail for assignment, acceptance, release, reconciliation, and handover.

```prisma
model CashCustodyEvent {
  id         BigInt   @id @default(autoincrement())
  assignmentId BigInt  @map("assignment_id")
  type       String   @db.VarChar(40)
  detail     String?  @db.VarChar(255)
  actorId    String?  @map("actor_id") @db.Uuid
  created_at DateTime @default(now()) @map("created_at")

  assignment CashCustodyAssignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)

  @@index([assignmentId])
}
```

---

## Validation Rules

- `CashDrawer.branchId` matches an existing branch.
- `CashCustodyAssignment.cashierId` references an active `User` (non-deleted).
- `CashCustodyAssignment.shiftId` references an open shift (when required for the role).
- `CashCustodyEvent.assignmentId` references an existing `CashCustodyAssignment`.
- `CashCustodyEvent` is append-only: no updates or deletes.
