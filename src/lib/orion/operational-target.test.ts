import assert from "node:assert/strict"
import { resolveOperationalTarget } from "./operational-target"

{
  const result = resolveOperationalTarget({
    availableCash: 5869,
    realAvailableProfit: 2946,
  })
  assert.equal(result.target.source, "no_active_target")
  assert.equal(result.target.targetAmount, null)
  assert.equal(result.gap.amount, null)
  assert.equal(result.gap.tone, "neutral")
}

{
  const result = resolveOperationalTarget({
    upcomingBills30d: 350,
    minimumBuffer: 300,
    availableCash: 5869,
  })
  assert.equal(result.target.source, "no_active_target")
  assert.equal(result.target.targetAmount, null)
  assert.equal(result.gap.amount, null)
  assert.equal(result.gap.tone, "neutral")
}

{
  const result = resolveOperationalTarget({
    explicitUserGoal: 2500,
    upcomingBills30d: 350,
    minimumBuffer: 300,
    availableCash: 5869,
    realAvailableProfit: 1200,
  })
  assert.equal(result.target.source, "explicit_user_goal")
  assert.equal(result.target.targetAmount, 2500)
  assert.equal(result.gap.amount, 1300)
  assert.equal(result.gap.tone, "red")
}

{
  const result = resolveOperationalTarget({
    availableCash: 5000,
    configuredTarget: 4200,
  })
  assert.equal(result.target.source, "configured_target")
  assert.equal(result.gap.amount, 0)
}

console.log("operational-target tests passed")
