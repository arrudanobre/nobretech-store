export type SyncTransactionMovementOptions = {
  createdBy?: string | null
  deletedOnly?: boolean
}

export async function requestSyncTransactionMovement(
  transactionId: string,
  options: SyncTransactionMovementOptions = {}
) {
  const response = await fetch("/api/finance/sync-transaction-movement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transactionId,
      deletedOnly: options.deletedOnly === true,
      createdBy: options.createdBy ?? undefined,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || "Falha ao sincronizar extrato")
  }
}
