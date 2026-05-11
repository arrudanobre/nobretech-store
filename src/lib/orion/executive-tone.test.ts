import assert from "node:assert/strict"
import { compressOperationalAnswer, normalizeExecutiveTone, removeCoachingLanguage } from "./executive-tone"

{
  const output = removeCoachingLanguage("Leitura: não deixe a ansiedade virar impulso. se quiser eu ajudo depois.")
  assert.equal(output.toLowerCase().indexOf("ansiedade"), -1)
  assert.equal(output.toLowerCase().indexOf("impulso"), -1)
  assert.equal(output.toLowerCase().indexOf("se quiser eu ajudo"), -1)
}

{
  const output = compressOperationalAnswer([
    "Leitura:",
    "Caixa coberto.",
    "Decisão:",
    "Segurar caixa.",
    "Motivo:",
    "Capital imobilizado em estoque ativo.",
    "Risco:",
    "Perder flexibilidade.",
    "Extra:",
    "Campanha comercial.",
  ].join("\n"))
  assert.equal(output.split("\n").filter((line) => line.endsWith(":")).length, 4)
  assert.equal(output.indexOf("Extra:"), -1)
  assert.ok(output.split("Capital imobilizado").length > 1)
}

{
  const output = normalizeExecutiveTone([
    "Leitura:",
    "Reinvestimento seguro auditado com caixa e lucro rastreado, sem risco alto automático.",
    "Decisão:",
    "Compra pequena, sem segurar caixa por alarme.",
    "Motivo:",
    "profitBasis veio de lucro real rastreado; capital preso foi contextualizado.",
    "Risco:",
    "Retirada e reinvestimento competem pelo mesmo capital.",
  ].join("\n"))
  assert.ok(output.split("profitBasis veio de lucro real").length > 1)
  assert.ok(output.split("Retirada e reinvestimento competem").length > 1)
  assert.equal(output.indexOf("risco alto"), -1)
  assert.equal(output.indexOf("segurar caixa"), -1)
  assert.equal(output.indexOf("capital preso"), -1)
  assert.ok(output.indexOf("pressão elevada") >= 0)
  assert.ok(output.indexOf("manter liquidez") >= 0)
  assert.ok(output.indexOf("capital operacional alocado em estoque") >= 0)
}

console.log("executive-tone tests passed")
