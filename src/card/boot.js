// For scripts/card-check and scripts/costume-preview.
HatchPetCard.seasons = SEASONS;
HatchPetCard.hanukkah = hanukkah;
HatchPetCard.seasonLines = seasonLines;
HatchPetCard.findsShown = FINDS_SHOWN; // card-check and the bench can set it
HatchPetCard.findLines = FIND_LINES;
HatchPetCard.giftLines = GIFT_LINES;
HatchPetCard.giftMade = GIFT_MADE;
HatchPetCard.collectionTiles = collectionTiles;
HatchPetCard.houseCategories = Object.keys(HOUSE_CATEGORY); // card-check: == const HOUSE_CATEGORIES
HatchPetCard.houseMomentLines = HOUSE_MOMENT_LINES;
HatchPetCard.momentClasses = Object.fromEntries(Object.entries(MOMENT_CLASS)
  .map(([type, c]) => [type, { [KEPT]: "kept", [BEAT]: "beat", [FLAVOUR]: "flavour" }[c]]));
HatchPetCard.seasonNow = seasonNow;

// The integration loads this file on every dashboard. If an old manual
// resource also loads it, keep the first definition instead of erroring.
// Wait for <home-assistant> first: once the service worker caches this file
// it can run before the frontend swaps in its own custom element registry,
// and a card defined in the old one is never found ("Configuration error").
customElements.whenDefined("home-assistant").then(() => {
  if (!window.customElements.get("hatch-pet-card")) {
    window.customElements.define("hatch-pet-card", HatchPetCard);
  }
  if (!window.customElements.get("hatch-pet-card-editor")) {
    window.customElements.define("hatch-pet-card-editor", HatchPetCardEditor);
  }
});

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "hatch-pet-card")) window.customCards.push({
  type: "hatch-pet-card",
  name: "Hatch at Home pet shelf",
  description: "Your virtual pets, each in its world's handheld device.",
  preview: true,
});

console.info(`%c HATCH-PET-CARD %c ${VERSION} `,
  "background:#c8642a;color:#fff", "background:#333;color:#fff");
