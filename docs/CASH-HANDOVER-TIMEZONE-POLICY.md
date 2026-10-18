# Cash handover timezone policy

The server obtains the branch IANA timezone from `branches.timezone`; the browser clock is never used. A handover goes to the Main Safe when the local calendar date of the persisted server-side close timestamp differs from the local date on which the shift opened. Otherwise it goes to the selected active user whose role slug is exactly `cashier` in that branch. The close and ledger movement are written in one database transaction.
