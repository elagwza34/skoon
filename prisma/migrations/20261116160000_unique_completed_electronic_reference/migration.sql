-- Do not rewrite financial history. If this fails, reconcile existing duplicate
-- completed references explicitly before retrying deployment.
CREATE UNIQUE INDEX payments_completed_external_reference_key
ON payments (branch_id, method, transaction_ref)
WHERE status = 'completed'
  AND method IN ('mobile_wallet', 'instapay')
  AND transaction_ref IS NOT NULL
  AND transaction_ref <> '';
