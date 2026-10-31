# Employee login test matrix

Date: 2026-10-28

| Area | Status | Evidence / blocker |
| --- | --- | --- |
| Owner | BLOCKED | No isolated staging Auth/DB project is configured. |
| Manager | BLOCKED | Owner-created Manager E2E cannot run until the staging guard passes. |
| Cashier | BLOCKED | Owner-created Cashier login and `/cashier` refresh require isolated browser E2E. |
| Waiter | BLOCKED | Owner-created Waiter login requires isolated Auth integration. |
| Kitchen | BLOCKED | Owner-created Kitchen login requires isolated Auth integration. |
| Role home routing | Passed (unit) | 173-test suite verifies all five canonical homes. |
| Unauthorized role routes | Passed (unit) | Route-access tests cover role and permission denials. |
| Incorrect password / expiry / logout | Blocked | Requires isolated live Auth project. |
| Duplicate creation / partial failure | Code-inspected; integration blocked | Provisioning detects existing profile and adopts unlinked Auth identity safely. |
| Server authorization bypass | Passed (code/unit) | Trusted database role/permissions are used; client role claims are not trusted. |
| Password recovery | Not implemented/testable in current UI | No user-facing recovery flow was found in the inspected login surface. |

No Playwright, Cypress, or other browser-E2E configuration was found in the repository.
