"use strict";
// Verification decks only. Never modifies the fixed 120-card source file.
module.exports = function (manifest, records, protectedName) {
  const copy = JSON.parse(JSON.stringify(manifest));
  const byType = new Map(
    records
      .filter(
        (r) =>
          r.mainPlan?.mechanic === "BASIC_ENERGY" && r.facts.basicEnergyType,
      )
      .map((r) => [r.facts.basicEnergyType, r]),
  );
  for (const deck of copy.decks) {
    const present = new Set(
      deck.cards
        .filter((c) => c.category === "energy")
        .map((c) => c.name.match(/^基本(.)エネルギー$/)?.[1])
        .filter(Boolean),
    );
    for (const [type, r] of byType) {
      if (present.has(type)) continue;
      let remaining = 3;
      for (const c of deck.cards) {
        if (
          !["item", "supporter", "support", "goods"].includes(c.category) ||
          c.referenceOfficialCardId ||
          c.name === protectedName
        )
          continue;
        const count = Math.min(c.count, remaining);
        c.count -= count;
        remaining -= count;
        if (!remaining) break;
      }
      if (remaining) throw Error("VERIFICATION_ENERGY_CAPACITY");
      deck.cards.push({
        name: r.name,
        category: "energy",
        count: 3,
        referenceOfficialCardId: r.officialCardId,
      });
    }
    deck.cards = deck.cards.filter((c) => c.count > 0);
  }
  return copy;
};
