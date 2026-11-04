const STYLE = `
  :host { display: block; --hp-backdrop: var(--card-background-color, #2f4a3a);
    --hp-ground: transparent; --hp-ink: var(--primary-text-color, #222);
    --hp-subink: var(--secondary-text-color, #555); }
  button:focus-visible { outline: 3px solid #fff;
    outline-offset: 2px; box-shadow: 0 0 0 6px #1d2a22; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
    .pet.droop, .drape.droop { transform: translateY(4px) rotate(-4deg) scaleY(.94); transform-origin: 50% 100%; }
  }
  ha-card { overflow: hidden; border-radius: var(--ha-card-border-radius, 24px);
    background: var(--hp-backdrop, #2f4a3a); transition: background .5s; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 14px 18px 4px; }
  .head > div:first-child { min-width: 0; } /* the name column shrinks, so the Status chip stays on the card */
  .head .chips { flex-shrink: 0; }
  .title { font: 400 24px 'Tiny5', monospace; color: var(--hp-ink); min-width: 0; overflow-wrap: anywhere; }
  .title.long { font-size: 16px; } /* a long name keeps to two lines */
  .sub { font-size: 13px; color: var(--hp-subink); margin-top: 2px; }
  /* S4: the empty card's "add a pet ›", an admin's way to HA's add dialog. */
  .head .addpet { display: block; margin: 0; padding: 0; border: none; background: none; text-align: left;
    min-height: 44px; font: inherit; font-size: 13px; color: var(--hp-subink); text-decoration: underline; cursor: pointer; }
  .head .addpet[hidden] { display: none; }
  .chips { display: flex; gap: 6px; align-items: center; }
  .statusbtn { display: flex; align-items: center; gap: 6px; height: 44px; padding: 0 12px;
    border: none; border-radius: 22px; cursor: pointer; font: 400 14px 'Tiny5', monospace;
    color: var(--hp-ink); background: color-mix(in srgb, var(--hp-ink) 14%, transparent); }
  .statusbtn[aria-pressed="true"] { background: var(--hp-ink); color: var(--hp-backdrop); }
  .tap-feedback { position: relative; overflow: visible; }
  .tap-feedback.pressed { transform: scale(.94); filter: brightness(.9); }
  .toy.tap-feedback.pressed { transform: none; filter: none; }
  .tap-feedback::after { content: ""; position: absolute; inset: 0; border: 2px solid currentColor;
    border-radius: inherit; pointer-events: none; opacity: 0; }
  .tap-feedback.tapped::after { animation: tap-ring .38s ease-out; }
  .toy.tap-feedback::after { display: none; }
  @keyframes tap-ring { 0% { opacity: .65; transform: scale(.82); } 100% { opacity: 0; transform: scale(1.28); } }
  .viewport { position: relative; overflow: hidden; padding: 14px 0 22px; touch-action: pan-y; }
  .ground { position: absolute; left: 0; right: 0; bottom: 0; height: 26%;
    background: var(--hp-ground); transition: background .5s; }
  /* No text selection from a mouse swipe (UX fix 2, F6); the typed-text box still takes typing. */
  .track { user-select: none; -webkit-user-select: none; position: relative; display: flex; gap: 16px; align-items: flex-end;
    transition: transform .5s cubic-bezier(.2,.8,.2,1); }
  .track input { user-select: text; -webkit-user-select: text; }
  .slide { flex-shrink: 0; transition: opacity .5s, transform .5s; transform-origin: 50% 100%; }
  .slide.away-slide { opacity: .5; transform: scale(.94); }
  /* Loops pause where nobody watches: the neighbours, or the card scrolled away. */
  .slide.away-slide .screen *, ha-card.offscreen .screen * { animation-play-state: paused !important; }
  .foot { display: flex; align-items: center; justify-content: space-between; padding: 0 14px 14px; }
  .nav { width: 44px; height: 44px; border: none; border-radius: 22px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; color: var(--hp-ink);
    background: color-mix(in srgb, var(--hp-ink) 14%, transparent); }
  /* Dots share what room the arrows leave; many pets wrap onto a second row. */
  .foot { gap: 8px; }
  .nav { flex-shrink: 0; }
  .dots { display: flex; flex-wrap: wrap; justify-content: center; gap: 0; min-width: 0; }
  /* 44 x 44 hit area (4c's size); the drawn dot is a 16 px head, and the boxes sit edge to edge. */
  .dot { width: 44px; height: 44px; border: none; padding: 0; cursor: pointer;
    background: none; display: flex; align-items: center; justify-content: center; }
  /* The dot is the pet's head (UX7 F8): 16 px, a 2 px ring, the sprite cropped as the status band's head is
     (_headCrop). The one on show is full colour; the others sit back at 55%. Before the sprite is drawn the
     ring alone shows. */
  .dot::before { content: ""; width: 16px; height: 16px; border-radius: 8px; box-sizing: border-box;
    border: 2px solid var(--hp-ink); opacity: .55; image-rendering: pixelated;
    background: var(--say-img, none) var(--say-at, 0 0) / var(--say-size, 43px) var(--say-size, 43px) no-repeat border-box,
      color-mix(in srgb, var(--hp-ink) 25%, transparent); }
  .dot[aria-current="true"]::before { opacity: 1; }
  /* A pet this browser hasn't shown yet (UX fix 4, F4): a small pulse till its slide is first shown
     (reduced motion: no pulse, but full colour like the one on show). */
  .dot.fresh::before { opacity: 1; animation: dotpulse 1.6s ease-in-out infinite; }
  /* The pet this person's card opens on (favourite §5.3): a small heart on its head dot. */
  .dot { position: relative; }
  .dot.open-on::after { content: "♥"; position: absolute; top: 6px; right: 6px; font-size: 10px; line-height: 1;
    color: var(--hp-ink); pointer-events: none; }
  @keyframes dotpulse { 50% { transform: scale(1.5); } }
  .slide.away-slide { cursor: pointer; }
  /* The empty card's toy (UX fix 4, F5): an egg's silhouette (the journal's "???" look), no buttons. */
  .slide.empty .pet { filter: brightness(0); opacity: .25; }
  .slide.empty .buttons, .slide.empty .backlight, .slide.empty .lcd, .slide.empty .glow { display: none; }
  .single .foot { display: none; }

  /* One device */
  .device { display: flex; flex-direction: column; align-items: center; font-family: 'Tiny5', monospace; }
  /* The moulded shell (_mould): each part's plastic is a .mould cut on the grid
     (--px a cell), its own colour in CSS with the cut light and shade (--tones) over
     it. The parts themselves only give the size and shape. */
  .mould { position: absolute; left: 0; top: 0; z-index: -1; pointer-events: none;
    background: var(--d-dark); }
  .mould::after { content: ""; position: absolute; inset: 0; background: var(--tones) 0 0 / 100% 100%; }
  .loop, .roof, .feet span, .bezel { isolation: isolate; }
  .loop { position: relative; width: 46px; height: 28px; margin-bottom: -12px; }
  .lid { width: 92%; height: 20px; border-radius: 10px 10px 4px 4px; display: flex; justify-content: center;
    align-items: center; gap: 6px; }
  .lid span { width: 12%; height: calc(var(--px, 2px) * 2); background: rgba(24,12,4,.34);
    box-shadow: 0 var(--px, 2px) 0 rgba(255,255,255,.22); }
  /* The lid sits over the body's top edge. */
  .lid { position: relative; z-index: 1; margin-bottom: -5px; }
  .feet { width: 82%; display: flex; justify-content: space-between; }
  .feet span { position: relative; width: 34px; height: 10px; border-radius: 0 0 6px 6px; }
  /* House: a pitched roof with a chimney, sitting on the body like a cottage. */
  .roof { position: relative; width: 108%; height: 64px; margin-bottom: -2px; }
  .compact .roof { height: 46px; }
  /* Porthole: a riveted ring (the rivets are cut with the bezel) around a rounded window. */
  .porthole .body { border-radius: 40px; padding: 22px 18px 26px; }
  .porthole .bezel { padding: 14px; border-radius: 30% / 38%; }
  /* --edge: how far the porthole's round corners eat into the screen (a share of its width;
     heights take ~.75 of it); what stands in a corner or on the ground keeps that far in.
     --go: how far go-left / go-right carry the pet (of its own width); less in the round window. */
  .porthole .screen { border-radius: 28% / 36%; --edge: 12%; --go: 45%; }
  /* Clear of the round corners, as wide as on the other shapes (the window is a little narrower). */
  .porthole .bubble { left: 11%; top: 11%; max-width: 66%; }
  .porthole .screen { container-type: inline-size; }
  .porthole .status { --sy: 6cqw; --sx: 11cqw; } /* the sheet's padding, its bands kept flush */
  /* Text fades at the lens's rim rather than being sliced mid-letter by the round corners (UX fix 2, F9). */
  .porthole .status { -webkit-mask-image: linear-gradient(transparent, #000 10px, #000 calc(100% - 10px), transparent);
    mask-image: linear-gradient(transparent, #000 10px, #000 calc(100% - 10px), transparent); }
  .porthole .attention { right: 13%; top: 9%; }
  /* Pad: a lily pad, its notch and veins cut with the body. */
  .pad .body { border-radius: 50% / 30%; padding: 40px 22px 40px; }
  .pad .buttons { width: 86%; }
  /* Moon: a crescent riding on top of a rounded body sprinkled with stars. */
  .crescent { width: 64px; height: 64px; border-radius: 50%; margin: 0 0 -26px 26px;
    position: relative; z-index: 1; }
  .crescent > .mould { background: var(--d-bezel); }
  .moon .body { border-radius: 34px; padding: 30px 18px 24px; }
  @supports (width: round(1px, 1px)) {
  .moon .body > .mould {
    --star: linear-gradient(rgba(255,255,255,.6), rgba(255,255,255,.6));
    background: var(--star) round(12%, var(--px)) round(20%, var(--px)) / var(--px) var(--px) no-repeat,
      var(--star) round(88%, var(--px)) round(14%, var(--px)) / var(--px) var(--px) no-repeat,
      var(--star) round(6%, var(--px)) round(62%, var(--px)) / var(--px) var(--px) no-repeat,
      var(--star) round(94%, var(--px)) round(56%, var(--px)) / var(--px) var(--px) no-repeat,
      var(--star) round(5%, var(--px)) round(86%, var(--px)) / var(--px) var(--px) no-repeat,
      var(--star) round(95%, var(--px)) round(90%, var(--px)) / var(--px) var(--px) no-repeat, var(--d-shell); }
  }
  .murk { inset: 0; width: 100%; height: 100%; opacity: 0; transition: opacity .8s; }
  .body { width: 100%; box-sizing: border-box; box-shadow: 0 16px 34px rgba(20,15,5,.32);
    display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .body { position: relative; isolation: isolate; }
  .body > .mould { background: var(--d-shell); }
  /* Shell finishes recolour the moulded plastic, in hard bands on the grid; the cut
     light and shade stay over them. They leave .bezel and .screen geometry alone:
     the screen is a fixed opening. A speck is a square of whole cells. */
  .device { --sq: calc(var(--px) * 2); }
  @supports (width: round(1px, 1px)) {
  .finish-woodland .body > .mould {
    background: linear-gradient(180deg, #f49a55 0 round(down, 20%, var(--px)), var(--d-shell) 0 round(down, 72%, var(--px)),
      #e07a40 0 round(down, 86%, var(--px)), #d76a35 0); }
  }
  @supports (width: round(1px, 1px)) {
  .finish-aqua .body > .mould {
    background: linear-gradient(180deg, #80e3df 0 round(down, 16%, var(--px)), #52cbcf 0 round(down, 32%, var(--px)),
      #36b9c2 0 round(down, 68%, var(--px)), #1fa0ae 0 round(down, 84%, var(--px)), #168d9c 0); }
  }
  .finish-aqua .toy:nth-child(4n + 1) .cap { background: #ffd9dc; }
  .finish-aqua .toy:nth-child(4n + 2) .cap { background: #fff0b7; }
  .finish-aqua .toy:nth-child(4n + 3) .cap { background: #dcd4ff; }
  .finish-aqua .toy:nth-child(4n) .cap { background: #c8f1d8; }
  @supports (width: round(1px, 1px)) {
  .finish-grove .body > .mould { --sun: linear-gradient(#ffec8f, #ffec8f);
    background: var(--sun) round(12%, var(--px)) round(23%, var(--px)) / var(--sq) var(--sq) no-repeat,
      var(--sun) round(88%, var(--px)) round(37%, var(--px)) / var(--sq) var(--sq) no-repeat,
      var(--sun) round(16%, var(--px)) round(73%, var(--px)) / var(--px) var(--px) no-repeat,
      var(--sun) round(84%, var(--px)) round(81%, var(--px)) / var(--px) var(--px) no-repeat,
      linear-gradient(180deg, #a9df68 0 round(down, 22%, var(--px)), #8dcd64 0 round(down, 46%, var(--px)),
        #74bd62 0 round(down, 78%, var(--px)), #4e965c 0); }
  }
  .finish-grove .toy .cap { background: #fff0a8; }
  .finish-grove .toy:nth-child(3n + 2) .cap { background: #ffd1b5; }
  @supports (width: round(1px, 1px)) {
  .finish-celestial .body > .mould { --star: linear-gradient(#fff4bb, #fff4bb); --dot: linear-gradient(#fff, #fff);
    background: var(--star) round(13%, var(--px)) round(16%, var(--px)) / var(--sq) var(--sq) no-repeat,
      var(--star) round(87%, var(--px)) round(24%, var(--px)) / var(--sq) var(--sq) no-repeat,
      var(--dot) round(9%, var(--px)) round(66%, var(--px)) / var(--px) var(--px) no-repeat,
      var(--dot) round(91%, var(--px)) round(75%, var(--px)) / var(--px) var(--px) no-repeat,
      linear-gradient(180deg, #777be0 0 round(down, 24%, var(--px)), #6255bb 0 round(down, 74%, var(--px)), #413c91 0); }
  }
  .finish-celestial .toy .cap { background: #f4d7fa; }
  .finish-celestial .toy:nth-child(3n + 2) .cap { background: #d4e7ff; }
  @supports (width: round(1px, 1px)) {
  .finish-dune .body > .mould { --grain: linear-gradient(rgba(150,104,52,.32), rgba(150,104,52,.32));
    background: var(--grain) round(10%, var(--px)) round(82%, var(--px)) / var(--sq) var(--sq) no-repeat,
      var(--grain) round(90%, var(--px)) round(70%, var(--px)) / var(--sq) var(--sq) no-repeat,
      linear-gradient(180deg, #ecc88f 0 round(down, 20%, var(--px)), var(--d-shell) 0 round(down, 74%, var(--px)),
        #cc9d62 0 round(down, 88%, var(--px)), #c39257 0); }
  }
  .finish-dune .toy .cap { background: #fbefd0; }
  .finish-dune .toy:nth-child(3n + 2) .cap { background: #f3d6a6; }
  /* 1990s special editions (any world, any shape). Clear: see-through plastic, the
     board and its glare showing; the outlines and the cut shade keep it solid. */
  .finish-clear .body > .mould { --gold: rgba(236,200,104,.6); --bp: calc(var(--bz-x) - var(--px) * 5) calc(var(--bz-y) - var(--px) * 5);
    --bs: calc(var(--bz-w) + var(--px) * 10) calc(var(--bz-h) + var(--px) * 10);
    background:
      repeating-linear-gradient(180deg, transparent 0 calc(var(--px) * 5), var(--gold) 0 calc(var(--px) * 6)) var(--bp) / var(--bs) no-repeat,
      repeating-linear-gradient(90deg, transparent 0 calc(var(--px) * 13), var(--gold) 0 calc(var(--px) * 14)) var(--bp) / var(--bs) no-repeat,
      linear-gradient(rgba(40,128,84,.55), rgba(40,128,84,.55)) var(--bp) / var(--bs) no-repeat,
      color-mix(in srgb, var(--d-shell) 34%, transparent); }
  .finish-clear .body > .mould::before { content: ""; position: absolute; width: calc(var(--px) * 8); height: calc(var(--px) * 8);
    top: round(7%, var(--px)); left: round(down, 84% - var(--px) * 8, var(--px)); opacity: .6; image-rendering: pixelated;
    background: #fff; -webkit-mask: var(--hw-glare) 0 0 / 100% 100%; mask: var(--hw-glare) 0 0 / 100% 100%; }
  .finish-clear .bezel > .mould::before { background: color-mix(in srgb, var(--d-bezel) 78%, transparent); }
  .finish-clear .crescent > .mould { background: color-mix(in srgb, var(--d-bezel) 50%, transparent); }
  .finish-clear .loop > .mould, .finish-clear .lid > .mould, .finish-clear .feet .mould,
  .finish-clear .roof > .mould { background: color-mix(in srgb, var(--d-dark) 48%, transparent); }
  .finish-clear .body { box-shadow: none; }
  .finish-clear .toy .cap { background: color-mix(in srgb, #e6f8ec 72%, transparent); }
  /* Glitter: sparkle in the plastic, a few flecks twinkling slowly. */
  .finish-glitter .body > .mould { background: var(--glitter) 0 0 / calc(var(--px) * 29) calc(var(--px) * 23),
    color-mix(in srgb, var(--d-shell) 80%, #fff2c9); }
  .finish-glitter .loop > .mould, .finish-glitter .lid > .mould, .finish-glitter .feet .mould,
  .finish-glitter .roof > .mould { background: color-mix(in srgb, var(--d-dark) 76%, #ffe9ad); }
  .finish-glitter .hw.flecks { display: block; }
  .finish-glitter .toy .cap { background: #fff0ce; }
  /* Glow: pale green by day; at night (or in a dark theme) the plastic itself lights up. */
  .finish-glow .body > .mould { background: color-mix(in srgb, var(--d-shell) 52%, #d4f0b4); }
  .finish-glow .loop > .mould, .finish-glow .lid > .mould, .finish-glow .feet .mould,
  .finish-glow .roof > .mould { background: color-mix(in srgb, var(--d-dark) 55%, #bfe4a0); }
  .finish-glow .toy .cap { background: #e7f3c8; }
  .finish-glow .toy:nth-child(3n + 2) .cap { background: #d5e8ae; }
  .finish-glow:has(.screen.night) .body > .mould, .finish-glow:has(.screen.dim) .body > .mould {
    background: color-mix(in srgb, var(--d-shell) 18%, #c6f79c); }
  .finish-glow:has(.screen.night) .body, .finish-glow:has(.screen.dim) .body {
    box-shadow: 0 0 18px 4px rgba(173,238,126,.5), 0 16px 34px rgba(20,15,5,.32); }
  .finish-glow:has(.screen.night) :is(.loop, .lid, .roof) > .mould, .finish-glow:has(.screen.night) .feet .mould,
  .finish-glow:has(.screen.dim) :is(.loop, .lid, .roof) > .mould, .finish-glow:has(.screen.dim) .feet .mould {
    background: #9fdc7c; }
  .finish-glow:has(.screen.night) .crescent > .mould, .finish-glow:has(.screen.dim) .crescent > .mould { background: #d3f7ad; }
  /* The plastic lights up in a dark HA theme (ha-card.ha-dark, from hass.themes.darkMode: UX7 F6), not
     in the OS's dark mode; where HA doesn't say, the OS's is the fallback. */
  ha-card.ha-dark .finish-glow .body > .mould { background: color-mix(in srgb, var(--d-shell) 18%, #c6f79c); }
  ha-card.ha-dark .finish-glow .body { box-shadow: 0 0 18px 4px rgba(173,238,126,.5), 0 16px 34px rgba(20,15,5,.32); }
  ha-card.ha-dark .finish-glow :is(.loop, .lid, .roof) > .mould,
  ha-card.ha-dark .finish-glow .feet .mould { background: #9fdc7c; }
  ha-card.ha-dark .finish-glow .crescent > .mould { background: #d3f7ad; }
  @media (prefers-color-scheme: dark) {
    ha-card:not(.ha-light, .ha-dark) .finish-glow .body > .mould { background: color-mix(in srgb, var(--d-shell) 18%, #c6f79c); }
    ha-card:not(.ha-light, .ha-dark) .finish-glow .body { box-shadow: 0 0 18px 4px rgba(173,238,126,.5), 0 16px 34px rgba(20,15,5,.32); }
    ha-card:not(.ha-light, .ha-dark) .finish-glow :is(.loop, .lid, .roof) > .mould,
    ha-card:not(.ha-light, .ha-dark) .finish-glow .feet .mould { background: #9fdc7c; }
    ha-card:not(.ha-light, .ha-dark) .finish-glow .crescent > .mould { background: #d3f7ad; }
  }
  /* Prints any world can wear (FINISHES): a tile of whole cells (--print-<key>) over the
     plastic's face (--d-face), tiled at the grid's size. */
  .finish-speckle .body > .mould { background: var(--print-speckle) 0 0 / calc(var(--px) * 14) calc(var(--px) * 10), var(--d-face); }
  .finish-stripes .body > .mould { background: var(--print-stripes) 0 0 / calc(var(--px) * 8) calc(var(--px) * 8), var(--d-face); }
  .finish-hearts .body > .mould { background: var(--print-hearts) 0 0 / calc(var(--px) * 12) calc(var(--px) * 12), var(--d-face); }
  .finish-stars .body > .mould { background: var(--print-stars) 0 0 / calc(var(--px) * 16) calc(var(--px) * 12), var(--d-face); }
  .finish-gingham .body > .mould { background: var(--print-gingham) 0 0 / calc(var(--px) * 8) calc(var(--px) * 8), var(--d-face); }
  .finish-dots .body > .mould { background: var(--print-dots) 0 0 / calc(var(--px) * 10) calc(var(--px) * 10), var(--d-face); }
  .finish-camo .body > .mould { background: var(--print-camo) 0 0 / calc(var(--px) * 22) calc(var(--px) * 12), var(--d-face); }
  .finish-waves .body > .mould { background: var(--print-waves) 0 0 / calc(var(--px) * 8) calc(var(--px) * 8), var(--d-face); }
  .finish-scales .body > .mould { background: radial-gradient(circle at 50% 100%, transparent 0 calc(var(--px) * 3),
    rgba(255,255,255,.38) 0 calc(var(--px) * 4), transparent 0) 0 0 / calc(var(--px) * 8) calc(var(--px) * 5), var(--d-face); }
  .finish-leaves .body > .mould { background: var(--print-leaves) 0 0 / calc(var(--px) * 12) calc(var(--px) * 12), var(--d-face); }
  .finish-paws .body > .mould { background: var(--print-paws) 0 0 / calc(var(--px) * 10) calc(var(--px) * 10), var(--d-face); }
  .finish-constellation .body > .mould { background: var(--print-constellation) 0 0 / calc(var(--px) * 30) calc(var(--px) * 16),
    linear-gradient(180deg, #45449f 0 var(--cut2, 40%), var(--d-face) 0); }
  /* A print stops a cell short of a caption's letters, so no mark runs into them. */
  :is(.finish-speckle, .finish-stripes, .finish-hearts, .finish-stars, .finish-gingham, .finish-dots, .finish-camo,
    .finish-waves, .finish-scales, .finish-leaves, .finish-paws, .finish-constellation) .toy {
    text-shadow: var(--px) 0 var(--d-face), calc(var(--px) * -1) 0 var(--d-face), 0 var(--px) var(--d-face),
      0 calc(var(--px) * -1) var(--d-face); }
  /* Bands change colour only in the gaps between the label, the bezel and the button
     rows (_bands), so none cuts a row of buttons or its captions. */
  .finish-rainbow .body > .mould { background: linear-gradient(180deg, #ffa3b1 0 var(--cut1), #ffd08f 0 var(--cut2),
    #fff08f 0 var(--cut3), #a8e6a6 0 var(--cut4), #9ed4f2 0 var(--cut5), #c9aef0 0); }
  .finish-sunset .body > .mould { background: linear-gradient(180deg, #ffd66e 0 var(--cut1), #ffbb63 0 var(--cut2),
    #ff9f62 0 var(--cut3), #ff8a78 0 var(--cut4), #f37e98 0 var(--cut5), #c96fa8 0); }
  /* Two-tone: the world's colour over cream, split behind the bezel. */
  .finish-twotone .body > .mould { background: linear-gradient(180deg, var(--d-shell) 0 var(--cut2), var(--d-face) 0); }
  .finish-twotone .label { color: var(--d-ink-top); }
  /* Smoke: dark see-through plastic, the board behind the bezel showing through it.
     The board is drawn in the body's own plastic, so the body's outline clips it. */
  .finish-smoke .body > .mould { --gold: rgba(236,200,104,.6); --bp: calc(var(--bz-x) - var(--px) * 5) calc(var(--bz-y) - var(--px) * 5);
    --bs: calc(var(--bz-w) + var(--px) * 10) calc(var(--bz-h) + var(--px) * 10);
    background: linear-gradient(rgba(40,34,48,.62), rgba(40,34,48,.62)),
      repeating-linear-gradient(180deg, transparent 0 calc(var(--px) * 5), var(--gold) 0 calc(var(--px) * 6)) var(--bp) / var(--bs) no-repeat,
      repeating-linear-gradient(90deg, transparent 0 calc(var(--px) * 13), var(--gold) 0 calc(var(--px) * 14)) var(--bp) / var(--bs) no-repeat,
      linear-gradient(rgba(40,128,84,.55), rgba(40,128,84,.55)) var(--bp) / var(--bs) no-repeat; }
  .finish-smoke .bezel > .mould::before { background: rgba(60,56,66,.78); }
  .finish-smoke .loop > .mould, .finish-smoke .lid > .mould, .finish-smoke .feet .mould,
  .finish-smoke .roof > .mould, .finish-smoke .crescent > .mould { background: rgba(30,26,38,.7); }
  .finish-smoke .body { box-shadow: none; }
  .finish-smoke .toy .cap { background: #d9d6e2; }
  /* A finish only tints idle buttons: the lit/asleep (.on) and wanted states keep their own look. */
  .device[class*="finish-"] .toy.wanted .cap { background: #ffe9a8; }
  .device[class*="finish-"] .toy.on .cap { background: #3a2a1a; color: #ffe9a8; }
  /* Sol's trim (worlds.json "trim"), drawn at each piece's own size (see _trim) and
     placed to suit each shell: over the top edge, on the plate, at the bottom corners. */
  .trim-top, .trim-top2, .trim-corner { position: absolute; pointer-events: none;
    image-rendering: pixelated; z-index: 1; }
  .trim-top { top: -12px; left: 50%; transform: translateX(-50%); }
  .trim-top2 { display: none; }
  /* Egg (woodland): the garland flipped so it arches with the dome, not against it (owner, 2026-10-30). */
  .egg .trim-top { transform: translateX(-50%) scaleY(-1); }
  .trim-corner { bottom: -18px; }
  .trim-corner.left { left: 14%; } .trim-corner.right { right: 14%; transform: scaleX(-1); }
  /* Tank: a pair standing on the lid's two ends, clear of its grips. */
  .tank .trim-top, .tank .trim-top2 { top: auto; bottom: calc(100% + 15px); transform: none; }
  .tank .trim-top { left: 20px; }
  .tank .trim-top2 { display: block; right: 20px; transform: scaleX(-1); }
  /* House: the wreath hangs in the middle of the roof's gable. */
  .house .trim-top { top: -50px; }
  .house .trim-corner { bottom: -12px; }
  .house .trim-corner.left { left: 4%; } .house .trim-corner.right { right: 4%; }
  /* Lily pad: the garland parts at the notch; the corners sit in on the bottom curve. */
  .pad .trim-top { top: -18px; }
  .pad .trim-corner { bottom: 2px; }
  .pad .trim-corner.left { left: 20%; } .pad .trim-corner.right { right: 20%; }
  /* Moon: the garland's gap sits under the crescent, which rides right of centre. */
  .moon .trim-top { top: -10px; transform: translateX(calc(-50% + 13px)); }
  /* Room under the full-width garlands for the plate, and above the bottom edge for the
     corners, so neither covers the label or the button captions. */
  .porthole .label.plate { margin-top: 44px; }
  .pad .label.plate { margin-top: 30px; }
  .moon .label.plate { margin-top: 30px; }
  .porthole .body, .moon .body { padding-bottom: 44px; }
  .label.plate { display: flex; align-items: center; box-sizing: border-box;
    justify-content: center; background-size: 100% 100%; image-rendering: pixelated;
    color: #fff4dc; text-shadow: 0 2px 0 #3a1e0c; margin-top: 10px; letter-spacing: .08em; }
  .compact .trim-corner { display: none; }
  .egg .body { border-radius: 50% 50% 46% 46% / 30% 30% 18% 18%; padding: 36px 20px 40px; }
  .egg .buttons { width: 88%; }
  .tank .body { border-radius: 18px; padding: 16px 18px 36px; }
  .house .body { border-radius: 0 0 10px 10px; padding: 18px 18px 38px; }
  .label { font-size: 14px; letter-spacing: .12em; color: var(--d-ink); }
  .request { position: absolute; right: 14px; bottom: 14px; z-index: 2; min-height: 44px;
    display: none; align-items: center; gap: 6px; padding: 0 14px; border: 2px solid #3a2a1a;
    border-radius: 22px; background: #ffe9a8; color: #3a2a1a; cursor: pointer;
    font: 400 14px 'Tiny5', monospace; box-shadow: 3px 3px 0 #3a2a1a;
    animation: pulse 1.6s ease-in-out infinite; }
  .request.show { display: flex; }
  .bezel { position: relative; width: 100%; box-sizing: border-box; border-radius: 20px; padding: 9px; }
  .bezel > .mould { background: none; }
  .bezel > .mould::before { content: ""; position: absolute; inset: 0; background: var(--d-bezel); clip-path: var(--core); }
  .bezel > .screen { z-index: 1; }
  .screen { position: relative; aspect-ratio: 4 / 3; border-radius: 12px; overflow: hidden;
    background: #2b2f3a; box-shadow: inset 0 0 0 3px rgba(0,0,0,.35); cursor: pointer; }
  .screen img { position: absolute; image-rendering: pixelated; user-select: none;
    -webkit-user-drag: none; pointer-events: none; }
  .bg { inset: 0; width: 100%; height: 100%; object-fit: cover; transition: filter .6s; }
  .screen.night .bg { filter: brightness(.85); }
  .screen.dim .bg { filter: brightness(.5) saturate(.75); }
  .screen.dim .pet { filter: brightness(.8); }
  .pet, .perch, .screen .pat { left: 50%; bottom: 4%; height: 62%; margin-left: -23.25%; transform-origin: 50% 100%; }
  /* Heavy (gaps-seams 2c): 6% wider, height and feet kept, still centred. */
  .pet.heavy, .ghost.heavy { aspect-ratio: 1.06; margin-left: -24.645%; }
  /* Resting (R1): the idle frames, breathing slowly. First of the pet's animations, so any
     reaction (hop, munch, lean...) wins while it plays; reduced motion stops it (above). */
  .pet.resting { animation: breathe 4.5s ease-in-out infinite; }
  @keyframes breathe { 50% { transform: scale(1.015, 1.03); } }
  /* The pat (PR 3b): a clear button over the pet's box (the img takes no taps), above the
     bubble and below a question, a game, the status and the boot screen. Written as
     ".screen .pat" so _tapped's .tap-feedback (position: relative) can't move it. */
  .screen .pat { position: absolute; z-index: 2; width: 46.5%; padding: 0; border: 0; border-radius: 12px;
    background: transparent; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .screen .pat[hidden], .screen.show-status .pat, .screen.linking .pat, .screen:has(> .askday) .pat,
  .screen:has(> .game:not([hidden])) .pat, .screen:has(> .boot:not([hidden])) .pat,
  .slide.away-slide .pat { display: none; }
  .screen .pat.tap-feedback.pressed { transform: none; filter: none; }
  .screen .pat.tap-feedback::after { display: none; }
  .screen .pat:focus-visible { outline-offset: -3px; box-shadow: inset 0 0 0 6px #1d2a22; }
  .pet.pat-soft { animation: pat-soft .3s ease-out; }
  @keyframes pat-soft { 40% { transform: translateY(-2%) scale(1.02, .98); } }
  .pet.pat-slow { animation: perk 1.1s ease-in-out; }
  .pet.rock { animation: rock .6s steps(4, jump-none) 1; transform-origin: 50% 90%; }
  .pet.rock2 { animation: rock .6s steps(4, jump-none) 2; transform-origin: 50% 90%; } /* a cracking egg: a double rock */
  /* Touch (care reactions ship C, plan 5.4): a pat on the head leans the pet 5deg toward the tapped side,
     held while pats keep coming. \`rotate\` is one property: the card adds none of these while .look or a
     wander is on the pet. Its own transition (.15s in, .3s out, +50% when sick), not the pet's .2s. */
  .pet.lean-l { rotate: -5deg; transition: translate .25s ease-out, rotate .15s ease-out, scale .25s steps(2); }
  .pet.lean-r { rotate: 5deg; transition: translate .25s ease-out, rotate .15s ease-out, scale .25s steps(2); }
  .pet.lean-rel { transition: translate .25s ease-out, rotate .3s ease-out, scale .25s steps(2); }
  .pet.lean-sick.lean-l, .pet.lean-sick.lean-r { transition: translate .25s ease-out, rotate .225s ease-out, scale .25s steps(2); }
  .pet.lean-sick.lean-rel { transition: translate .25s ease-out, rotate .45s ease-out, scale .25s steps(2); }
  @keyframes rock { 0% { transform: rotate(-4deg); } 33% { transform: rotate(4deg); } 66% { transform: rotate(-3deg); } 100% { transform: rotate(0); } }
  .pet.hop { animation: hop .7s ease-in-out infinite; }
  .pet.munch { animation: munch .5s ease-in-out 3; }
  @keyframes munch { 50% { transform: translateY(-4%) scale(1.04, .96); } }
  .pet.settle { animation: settle 2.5s ease-in-out; }
  @keyframes settle { 25%, 75% { transform: translateY(3%) scale(.97, .95); } }
  .pet.greethop { animation: hop .7s ease-in-out 2; } /* its own class: the bounce clears "hop" */
  @keyframes hop { 50% { transform: translateY(-9%); } }
  .poop { bottom: 5%; height: 15%; }
  .poop.p0 { left: 6%; } .poop.p1 { left: 18%; bottom: 3%; } .poop.p2 { right: 7%; }
  .attention { top: 5%; right: 5%; height: 17%; animation: pulse 1s ease-in-out infinite; }
  /* A call arriving (_render, once, hidden to shown): pops in, then pulses as ever. */
  .attention.arrive { animation: pop .3s ease-out, pulse 1s ease-in-out .3s infinite; }
  @keyframes pulse { 50% { transform: scale(1.12); } }
  /* A care prop drops in from above in four steps with a one-frame squash, and leaves in two
     (_propShow; plan 6). Props that rise, slide or wag keep the drop's place by their own class. */
  .prop { left: 67%; bottom: 7%; height: 22%; transform-origin: 50% 100%; animation: drop .4s steps(4, jump-none); }
  @keyframes drop { 0% { transform: translateY(-140%); } 80% { transform: none; } 90% { transform: scale(1.12, .88); } 100% { transform: none; } }
  .prop.prop-out { animation: prop-out .3s steps(2, jump-none) forwards; }
  @keyframes prop-out { 50% { opacity: .5; transform: scale(.8); } 100% { opacity: 0; transform: scale(.5); } }
  /* Praise's star and the scold's finger sit above the pet's head; the star rises, the finger wags. */
  .prop.above { left: 50%; bottom: 62%; height: 16%; translate: -50% 0; }
  .prop.rise { animation: prop-rise 1s steps(6, jump-none) forwards; }
  @keyframes prop-rise { 0% { opacity: 0; transform: translateY(60%); } 30% { opacity: 1; } 100% { opacity: 1; transform: translateY(-30%); } }
  .prop.wag { animation: drop .4s steps(4, jump-none), wag .3s steps(2, jump-none) .4s 3; }
  @keyframes wag { 0%, 100% { rotate: 12deg; } 50% { rotate: -12deg; } }
  /* The fan slides in from the right and out again. */
  .prop.slide { animation: prop-slide .4s steps(4, jump-none); }
  @keyframes prop-slide { from { translate: 140% 0; } }
  .prop.slide.prop-out { animation: prop-slide-out .3s steps(2, jump-none) forwards; }
  @keyframes prop-slide-out { to { translate: 140% 0; } }
  /* A clean's extra bubble (fresh-expand M-b): up 30 px over 1.2 s, then it pops. */
  .bubblepop { position: absolute; left: 74%; bottom: 24%; height: 16%; image-rendering: pixelated; pointer-events: none;
    animation: bubblepop 1.2s ease-out forwards; }
  @keyframes bubblepop { 0% { transform: translateY(0); opacity: 1; } 80% { transform: translateY(-30px) scale(1); opacity: 1; }
    100% { transform: translateY(-30px) scale(0); opacity: 0; } }
  @keyframes pop { from { transform: scale(.3); opacity: 0; } }
  .awaysign { left: 50%; bottom: 12%; height: 40%; margin-left: -20%; }
  .awaylabel { position: absolute; left: 0; right: 0; bottom: 5%; text-align: center;
    color: #fff; font-size: 15px; text-shadow: 0 1px 3px #000; }
  .bubble .untyped { visibility: hidden; } /* laid out whole, so it never grows */
  .bubble { position: absolute; left: 5%; top: 6%; max-width: 64%; padding: 5px 9px;
    background: #fffdf5; color: #3a2a1a; border: 2px solid #3a2a1a; border-radius: 8px;
    font-size: 14px; line-height: 1.2; box-shadow: 3px 3px 0 #3a2a1a; }
  .bubble:empty { display: none; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%);
    white-space: nowrap; }
  /* The left/right game: two big guess buttons and a score over the scene. */
  .game { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
  .game[hidden] { display: none; }
  .game button { pointer-events: auto; position: absolute; display: grid; place-items: center;
    min-width: 44px; min-height: 44px; border-radius: 50%; border: 2px solid #3a2a1a;
    background: #fffdf5; color: #3a2a1a; box-shadow: 2px 2px 0 #3a2a1a; cursor: pointer; padding: 0;
    font: inherit; } /* the card's own font, not the browser's button font (F3) */
  .game button[aria-disabled="true"] { opacity: .5; cursor: default; }
  .game button:focus-visible { outline: 3px solid #fffdf5; outline-offset: 2px;
    box-shadow: 0 0 0 6px #1d2a22; }
  .game .gx { right: 4%; top: 6%; min-width: 44px; min-height: 44px; font: inherit; font-size: 14px; }
  .game .gpick { position: absolute; inset: 22% 0 0; display: flex; flex-direction: column; gap: 8px;
    align-items: center; justify-content: center; }
  .game .gpick[hidden], .game .gnum[hidden] { display: none; }
  /* The picker: chunky toy buttons like the device's own (cream, inked, pressing down). */
  .game .gpick button { position: static; display: flex; align-items: center; gap: 8px;
    border-radius: 14px; padding: 4px 14px 4px 10px; font: inherit; font-size: 14px; min-height: 44px;
    min-width: 168px; border: 2px solid #3a2a1a; background: #fffdf5; color: #3a2a1a;
    box-shadow: 0 4px 0 #3a2a1a; transition: transform .08s, box-shadow .08s; }
  .game .gpick button:active { transform: translateY(3px); box-shadow: 0 1px 0 #3a2a1a; }
  /* _fitPicker puts the picker's top under the close button. When a column of
     games doesn't fit there, they wrap into rows of labels (no icons), still
     44 px tall (4c's tap size). */
  .game .gpick.wrap { left: 3%; right: 3%; flex-flow: row wrap; align-content: center; gap: 6px 4px; }
  .game .gpick.wrap button { min-width: 0; padding: 0 10px; font-size: 12px; justify-content: center; }
  .game .gpick.wrap.tight { left: 1%; right: 1%; gap: 4px 3px; } /* still too tall: two a row */
  .game .gpick.wrap.tight button { padding: 0 6px; font-size: 11px; }
  /* A 284 px card's LCD (182 x 136): two rows of 44 px don't fit under the close button, so two even
     columns of 36 px (_fitPicker, the last resort only; a label may take two lines, whatever order the
     games are in). An odd game sits in the middle, or, with the Hop row, leaves it the other cell. */
  .game .gpick.wrap.snug:not([hidden]) { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 3px; align-content: center; }
  .game .gpick.wrap.snug button { min-height: 36px; padding: 0 4px; font-size: 11px; line-height: 1.05;
    text-align: center; }
  .game .gpick.wrap.snug button:last-child:nth-child(odd) { grid-column: 1 / -1; justify-self: center;
    width: calc(50% - 1.5px); }
  /* F2: the pile's leaves, or higher or lower's number, beside the pet (opposite the bubble,
     under the close button), so its face shows all game. */
  .game .gnum { position: absolute; right: 5%; top: 34%;
    display: grid; place-items: center; min-width: 30px; min-height: 36px; padding: 5px 7px;
    border-radius: 10px; background: #fffdf5; color: #3a2a1a; border: 2px solid #3a2a1a;
    box-shadow: 2px 2px 0 #3a2a1a; }
  /* a flip-clock (_flipNumber): the digit tips away and back on rotate (two steps a way), the swap at the
     edge; a win's perk follows on transform. Reduced motion: the number, instantly (JS and the global rule). */
  @keyframes flip-clock { 0%, 100% { rotate: x 0deg; } 50% { rotate: x 90deg; } }
  .game .gnum.flip { animation: flip-clock .16s steps(2); }
  .game .gnum.flip.win { animation: flip-clock .16s steps(2), perk .3s ease-out .16s; }
  /* D-a: today's visitor watching a dig, still, behind the buttons (fresh-expand E5). */
  .game .gwatch { position: absolute; right: 4%; bottom: 26%; height: 18%; image-rendering: pixelated;
    pointer-events: none; transform: scaleX(-1); }
  /* Hop of the Day (experimental_hop; plan ship 2b). The row under the picker: the picker's own
     chunky button, a strip at the foot; _fitPicker moves it into the last line of the games where
     the strip leaves them no room (.slot) and shrinks it to its label (.tight). */
  .game .ghop { left: 3%; right: 3%; bottom: 2%; min-height: 44px; width: auto; border-radius: 14px;
    padding: 4px 10px; font: inherit; font-size: 14px; box-shadow: 0 4px 0 #3a2a1a; }
  .game .ghop[hidden] { display: none; }
  .game .ghop.tight { padding: 0 6px; font-size: 11px; white-space: nowrap; }
  .game .ghop.snug { min-height: 36px; line-height: 1.05; white-space: normal; }
  .game .ghop:active { transform: translateY(3px); box-shadow: 0 1px 0 #3a2a1a; }
  /* The board: the grid on the left, the keys on the right (2 x 4; the close button is the eighth).
     Sizes are set in JS (_hopLayout) from the overlay: --hk the key, --c the cell. No new art:
     the cells are CSS. The real pet stays under the board, still, and the piece wears its frame. */
  .game .hopb[hidden] { display: none; }
  .game .hgrid { position: absolute; display: grid; grid-auto-rows: var(--c); outline: none;
    pointer-events: auto; }
  .game .hc { box-sizing: border-box; border: 1px solid rgba(58, 42, 26, .35); }
  .game .hc.pad { background: rgba(255, 253, 245, .86); border-radius: 22%; }
  .game .hc.pad.find::after { content: "✦"; display: grid; place-items: center; height: 100%;
    color: #b8651b; font-size: calc(var(--c) * .5); line-height: 1; }
  .game .hc.stone { background: rgba(110, 104, 96, .9); border-radius: 30%; }
  .game .hc.water { background: rgba(70, 130, 190, .72); }
  .game .hc.wall { background: rgba(58, 42, 26, .92); border-radius: 0; }
  .game .hc.nest { background: rgba(255, 253, 245, .55); border: 2px dashed #3a2a1a; border-radius: 50%; }
  .game .hc.nest.open { background: rgba(255, 253, 245, .95); border-style: solid; }
  .game .hc.sunk { background: rgba(58, 42, 26, .28); border-style: dashed; }
  .game .hc.sunk::after { content: none; }
  .game .hc.legal { box-shadow: inset 0 0 0 2px #3a2a1a; }
  .game .hc.lit { box-shadow: inset 0 0 0 3px #fffdf5, inset 0 0 0 5px #3a2a1a; background: rgba(255, 253, 245, 1); }
  /* Ship 4a's twist cells (CSS, no art): a stump's rings (the second pair mossy, so two pairs tell apart) and a
     striped rug. They never sink, and keep their look when lit (the ring of .lit is drawn over it). */
  .game .hc.stump, .game .hc.stump.lit { border-radius: 50%; border-color: rgba(58, 42, 26, .6);
    background: radial-gradient(circle, #5a3d22 0 14%, #b07c4c 15% 32%, #6b4a2b 33% 38%, #b07c4c 39% 56%, #5a3d22 57%); }
  .game .hc.stump.two, .game .hc.stump.two.lit {
    background: radial-gradient(circle, #3f4a22 0 14%, #9c9a58 15% 32%, #4a5328 33% 38%, #9c9a58 39% 56%, #3f4a22 57%); }
  .game .hc.rug, .game .hc.rug.lit { border-radius: 12%; border-color: rgba(58, 42, 26, .6);
    background: repeating-linear-gradient(45deg, #b5523b 0 22%, #e2b04a 22% 30%, #b5523b 30% 50%); }
  /* Ship 4b's twist cells (CSS, no art; plain class swaps, no animation). A crackle pad's hairline crack, two
     dark cracks once half-sunk; a tide pool as a stone ringed by water, or water over a sunk stone in its water
     phase (.wet, the next move's); a ripple pad's rings; a dark cell dim until the lantern is lit (then the
     plain pad); the lantern's glow. A sunk pad of any kind keeps .sunk's look. */
  .game .hc.crackle:not(.sunk) { background: linear-gradient(118deg, transparent 47%, rgba(58, 42, 26, .5) 48% 50%,
    transparent 51%), rgba(255, 253, 245, .86); }
  .game .hc.crackle.half:not(.sunk) { background: linear-gradient(118deg, transparent 45%, rgba(58, 42, 26, .78) 46% 50%,
    transparent 51%), linear-gradient(32deg, transparent 54%, rgba(58, 42, 26, .7) 55% 58%, transparent 59%),
    rgba(232, 220, 196, .92); }
  .game .hc.pool { border-radius: 30%; border-color: rgba(40, 90, 140, .6);
    background: radial-gradient(circle, rgba(110, 104, 96, .95) 0 44%, rgba(70, 130, 190, .72) 47%); }
  .game .hc.pool.wet { background: radial-gradient(circle, rgba(70, 130, 190, .6) 0 22%, rgba(40, 100, 170, .9) 26% 40%,
    rgba(70, 130, 190, .82) 44%); }
  .game .hc.ripple:not(.sunk) { background: radial-gradient(circle at 22% 50%, transparent 0 16%,
    rgba(70, 130, 190, .55) 17% 22%, transparent 23% 38%, rgba(70, 130, 190, .4) 39% 44%, transparent 45%),
    rgba(255, 253, 245, .86); }
  .game .hc.dark { background: rgba(34, 30, 64, .86); border-color: rgba(34, 30, 64, .9); }
  .game .hc.lantern:not(.sunk) { background: radial-gradient(circle, #ffd76a 0 15%, rgba(255, 196, 80, .6) 16% 32%,
    transparent 36%), rgba(255, 253, 245, .86); }
  .game .hpath { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none;
    z-index: 1; }
  .game .hpath path { fill: none; stroke: #3a2a1a; stroke-width: 2; stroke-dasharray: 2 4; stroke-linecap: round; }
  .game .hpiece { position: absolute; left: 0; top: 0; z-index: 2; image-rendering: pixelated;
    pointer-events: none; object-fit: contain; transition: translate .14s ease-out; }
  .game .hkeys { position: absolute; display: grid; grid-template-columns: repeat(2, var(--hk));
    grid-auto-rows: var(--hk); gap: 3px; pointer-events: none; }
  .game .hk { position: static; min-width: 0; min-height: 0; width: var(--hk); height: var(--hk);
    font: inherit; font-size: calc(var(--hk) * .42); line-height: 1; }
  .game .hk.on { background: #3a2a1a; color: #fffdf5; }
  .game.hop .gx { top: auto; right: var(--hr); bottom: var(--hb); width: var(--hk); height: var(--hk);
    min-width: 0; min-height: 0; font-size: calc(var(--hk) * .42); }
  .screen:has(> .game.hop:not([hidden])) :is(.pet, .ghost, .drape, .perch, .attention) { visibility: hidden; }
  .screen:has(> .game.hop:not(.end):not([hidden])) .bubble { display: none; }
  /* Trait flair: placed in JS from the head point and the feet line. Every piece
     must read standing still too (reduced motion turns all animation off). */
  .flair { position: absolute; inset: 0; z-index: 2; pointer-events: none;
    animation: fl-moment var(--fl-ms) ease-in-out both; }
  @keyframes fl-moment { 0% { opacity: 0; } 12%, 85% { opacity: 1; } 100% { opacity: 0; } }
  .flair .fx { position: absolute; transform: translate(-50%, -100%); image-rendering: pixelated;
    animation-duration: var(--d, 2.4s); animation-delay: var(--delay, 0s);
    animation-iteration-count: infinite; animation-fill-mode: both; }
  /* .screen img is absolute; flair images stay in flow so the piece has a height
     and translate(-50%, -100%) stands it on its anchor point. */
  .flair .fx img { position: static; display: block; width: 100%; image-rendering: pixelated; }
  .flair .fx.frames img + img { position: absolute; inset: 0; }
  .flair .fx.frames img { animation: fl-frame-a .6s steps(1) infinite; }
  .flair .fx.frames img + img { animation-name: fl-frame-b; }
  @keyframes fl-frame-a { 50% { opacity: 0; } }
  @keyframes fl-frame-b { 0% { opacity: 0; } 50% { opacity: 1; } }
  .fx.bob { animation-name: fl-bob; animation-timing-function: ease-in-out; animation-direction: alternate; }
  @keyframes fl-bob { from { transform: translate(-50%, -100%); } to { transform: translate(-50%, -112%); } }
  .fx.float { animation-name: fl-float; animation-timing-function: ease-out; }
  @keyframes fl-float { 0% { opacity: 0; transform: translate(-50%, -100%); } 20% { opacity: 1; }
    100% { opacity: 0; transform: translate(calc(-50% + var(--dx, 0px)), calc(-100% - var(--rise, 40px))); } }
  .fx.fall { animation-name: fl-fall; animation-timing-function: linear; }
  @keyframes fl-fall { 0% { opacity: 0; transform: translate(-50%, -100%); } 15% { opacity: 1; }
    100% { opacity: 0; transform: translate(calc(-50% + var(--dx, 0px)), calc(-100% + var(--rise, 40px))); } }
  .fx.drift { animation-name: fl-drift; animation-timing-function: ease-in-out; }
  @keyframes fl-drift { 0% { opacity: 0; transform: translate(-50%, -100%); } 20%, 80% { opacity: 1; }
    100% { opacity: 0; transform: translate(calc(-50% + var(--dx, 40px)), calc(-100% + var(--rise, 0px))); } }
  .fx.twinkle { animation-name: fl-twinkle; animation-timing-function: ease-in-out; }
  @keyframes fl-twinkle { 0%, 100% { opacity: .2; transform: translate(-50%, -100%) scale(.7); }
    50% { opacity: 1; transform: translate(-50%, -100%) scale(1); } }
  .fx.bounce { animation-name: fl-bounce; animation-timing-function: ease-in; animation-direction: alternate; }
  @keyframes fl-bounce { from { transform: translate(-50%, -100%); } to { transform: translate(-50%, -150%); } }
  .fx.pop { animation-name: fl-pop; animation-iteration-count: 1; }
  @keyframes fl-pop { 0% { transform: translate(-50%, -100%) scale(.4); } 60% { transform: translate(-50%, -100%) scale(1.1); }
    100% { transform: translate(-50%, -100%) scale(1); } }
  .fx.loop { offset-rotate: 0deg; transform: translate(-50%, -50%); animation-name: fl-loop;
    animation-iteration-count: 1; animation-timing-function: ease-in-out; }
  @keyframes fl-loop { from { offset-distance: 0%; } to { offset-distance: 100%; } }
  .fx.glow { border-radius: 50%; transform: translate(-50%, -50%);
    background: radial-gradient(closest-side, rgba(255, 160, 70, .7), rgba(255, 160, 70, 0));
    animation-name: fl-glow; animation-direction: alternate; }
  @keyframes fl-glow { to { opacity: .55; } }
  /* Seasonal touches (SEASONS): behind the pet, sized to the screen. */
  .season { position: absolute; inset: 0; pointer-events: none; }
  .season .lantern { right: calc(5% + var(--edge, 0%)); bottom: calc(5% + var(--edge, 0%) * .25); width: 17%; }
  .season .lantern.lantern-float { bottom: 30%; animation: s-bob 3s ease-in-out infinite alternate; }
  @keyframes s-bob { to { transform: translateY(-8%) rotate(-4deg); } }
  .screen.s-halloween.night .season .lantern, .screen.s-halloween.dim .season .lantern {
    filter: drop-shadow(0 0 6px rgba(255, 170, 60, .95)); animation: s-flicker 1.6s ease-in-out infinite; }
  .screen.s-halloween.night .season .lantern.lantern-float,
  .screen.s-halloween.dim .season .lantern.lantern-float {
    animation: s-flicker 1.6s ease-in-out infinite, s-bob 3s ease-in-out infinite alternate; }
  @keyframes s-flicker { 50% { filter: drop-shadow(0 0 3px rgba(255, 150, 50, .7)); } }
  /* Winter lights: a soft warm-white glow, the float's bob kept. */
  .screen.s-winter.night .season .lantern, .screen.s-winter.dim .season .lantern {
    filter: drop-shadow(0 0 6px rgba(255, 238, 196, .95)); animation: s-shine 3.2s ease-in-out infinite; }
  .screen.s-winter.night .season .lantern.lantern-float,
  .screen.s-winter.dim .season .lantern.lantern-float {
    animation: s-shine 3.2s ease-in-out infinite, s-bob 3s ease-in-out infinite alternate; }
  @keyframes s-shine { 50% { filter: drop-shadow(0 0 4px rgba(255, 230, 180, .75)); } }
  .screen.s-winter .season .bunting { animation: s-twinkle 2.4s steps(1) infinite; }
  @keyframes s-twinkle { 50% { filter: brightness(1.2); } }
  .season .corner { top: calc(var(--edge, 0%) * .45); width: 17%; opacity: .85; }
  .season .corner.right { right: calc(var(--edge, 0%) * .75); }
  .season .corner.left { left: calc(var(--edge, 0%) * .75); transform: scaleX(-1); }
  .season .sweet { right: calc(23% + var(--edge, 0%)); bottom: calc(5% + var(--edge, 0%) * .25); width: 7%; }
  .season .sfly { position: absolute; animation: s-fly var(--fly-ms, 5s) linear forwards; }
  .season .sfly img { position: static; display: block; width: 100%; }
  .season .sfly.flap img + img { position: absolute; inset: 0; }
  .season .sfly.flap img { animation: fl-frame-a .3s steps(1) infinite; }
  .season .sfly.flap img + img { animation-name: fl-frame-b; }
  .season .sbat { width: 9%; }
  .season .sghost { width: 13%; top: 30%; opacity: .9; }
  .season .sghost.flap img { animation-duration: .8s; }
  .season .switch { width: 22%; top: 5%; }
  .season .sgoose { width: 10%; }
  .season .stwinkle { width: 10%; }
  .season .stwinkle.flap img { animation-duration: .6s; }
  /* A walker keeps to the ground: no flight bob, a slower step. */
  .season .sturkey { width: 15%; bottom: 6%; }
  .season .sturkey.flap img { animation-duration: .5s; }
  .season .snowhare { width: 15%; bottom: 6%; }
  .season .snowhare.flap img { animation-duration: .4s; }
  .season .sfly.walk.ltr { animation-name: s-ltr; } .season .sfly.walk.rtl { animation-name: s-rtl; }
  .season .sfly.ltr { left: -25%; } .season .sfly.rtl { left: 112%; }
  @keyframes s-fly { 25% { translate: 0 30%; } 50% { translate: 0 -20%; } 75% { translate: 0 25%; } }
  .season .sfly.ltr { animation-name: s-fly, s-ltr; } .season .sfly.rtl { animation-name: s-fly, s-rtl; }
  .season .sfly.rtl img { transform: scaleX(-1); } /* the art faces right */
  @keyframes s-ltr { to { left: 112%; } } @keyframes s-rtl { to { left: -25%; } }
  /* A world visitor (visitorList): 18 world cells wide (--px a cell: whole device pixels),
     resting at the scene's edge (--stop). It comes in from --from and leaves back to it;
     a crosser carries on to --to. Under reduced motion it just stands at --stop. */
  .season .vis { position: absolute; width: calc(var(--px, 2px) * 18); left: var(--stop);
    --from: -25%; --stop: calc(5% + var(--edge, 0%)); --to: 112%; }
  .season .vis.rtl { --from: 112%; --stop: calc(95% - var(--edge, 0%) - var(--px, 2px) * 18); --to: -25%; }
  .season .vis img { position: static; display: block; width: 100%; }
  .season .vis.flap img + img { position: absolute; inset: 0; }
  .season .vis.flap img { animation: fl-frame-a .5s steps(1) infinite; }
  .season .vis.flap img + img { animation-name: fl-frame-b; }
  .season .vis.in { animation: v-in var(--in-ms, 1.4s) ease-out both; }
  .season .vis.out { animation: v-out var(--in-ms, 1.4s) ease-in both; }
  .season .vis.cross { animation: v-cross var(--in-ms, 1.4s) linear both; }
  @keyframes v-in { from { left: var(--from); } to { left: var(--stop); } }
  @keyframes v-out { from { left: var(--stop); } to { left: var(--from); } }
  @keyframes v-cross { from { left: var(--from); } to { left: var(--to); } }
  .season .vis.fly { top: 36%; } .season .vis.walk { bottom: 6%; }
  .season .vis.vis-shootingstar { top: 28%; } /* under the bubble, over the pet's head */
  /* The art faces right; leaving, it turns back the way it came. */
  .season .vis.rtl img, .season .vis.ltr.out img { transform: scaleX(-1); }
  .season .vis.rtl.out img { transform: none; }
  /* The basket (visitors v2 §3): 12 world cells wide on the floor line, bottom right
     (inside the porthole's corners), over the pet's tap box; its own tap box is 44 px at
     least. Not live (asleep, a call, a neighbour's): taps go through to the screen. The
     reveal: the basket drawn once, and each find over it, 16 cells wide (its art's scale). */
  .screen .basket, .screen .reveal { position: absolute; z-index: 3; bottom: 6%;
    right: calc(5% + var(--edge, 0%)); width: calc(var(--px, 2px) * 12); padding: 0; border: 0;
    background: none; -webkit-tap-highlight-color: transparent; }
  .screen .basket { cursor: pointer; }
  .screen .basket::before { content: ""; position: absolute; left: 50%; top: 50%;
    width: max(44px, 100%); height: max(44px, 100%); translate: -50% -50%; }
  .screen .basket.idle, .screen .reveal { pointer-events: none; }
  /* a find lands (_basketSync): the first pops the basket in, then one rock; a fuller basket only rocks */
  .screen .basket.lands { animation: pop .3s ease-out, rock .6s steps(4, jump-none) .3s; transform-origin: 50% 100%; }
  .screen .basket.lands-more { animation: rock .6s steps(4, jump-none); transform-origin: 50% 100%; }
  .screen .basket img, .screen .reveal .rb { position: static; display: block; width: 100%; pointer-events: none; }
  .screen .reveal .rf { position: absolute; left: 50%; bottom: 60%; width: calc(var(--px, 2px) * 16);
    margin-left: calc(var(--px, 2px) * -8); image-rendering: pixelated; }
  .screen .reveal .rf.pop { animation: pop .3s ease-out; transform-origin: 50% 100%; }
  .screen .reveal .burst { top: auto; bottom: 90%; }
  /* A gift (visitors v2 §5): the find alone, 16 cells, no basket, up by the pet's head on
     the right: straight above the pet is the bubble's (left-anchored, up to 69% wide),
     where its line is said. Shown in compact too, as the basket and its reveal are. */
  .screen .reveal.gift { left: auto; right: calc(6% + var(--edge, 0%)); bottom: 46%;
    width: calc(var(--px, 2px) * 16); }
  .screen .reveal.gift .rf { position: static; display: block; width: 100%; margin: 0; }
  .season .bunting { position: absolute; top: calc(var(--edge, 0%) * .3); left: var(--edge, 0%);
    right: var(--edge, 0%); height: 8.4%;
    background-repeat: repeat-x; background-size: 18.75% 100%; image-rendering: pixelated; }
  .season .mist { position: absolute; left: -10%; right: -10%; bottom: 0; height: 26%; display: none;
    background: radial-gradient(ellipse at 30% 100%, rgba(214, 206, 240, .45), transparent 65%),
      radial-gradient(ellipse at 75% 100%, rgba(214, 206, 240, .4), transparent 60%);
    animation: s-mist 9s ease-in-out infinite alternate; }
  .screen.night .season .mist, .screen.dim .season .mist { display: block; }
  @keyframes s-mist { to { transform: translateX(6%); opacity: .7; } }
  .season .leaf { top: -6%; width: 3.5%; opacity: 0;
    animation: s-leaf var(--leaf-ms, 9s) linear var(--leaf-delay, 0s) infinite; }
  @keyframes s-leaf { 0% { top: -6%; opacity: 0; translate: 0 0; rotate: 0deg; } 8% { opacity: 1; }
    35% { translate: -140% 0; rotate: 90deg; } 70% { translate: 120% 0; rotate: 200deg; }
    90% { opacity: 1; } 100% { top: 100%; opacity: 0; translate: -60% 0; rotate: 300deg; } }
  .costume .fx.hat { transform: translate(-50%, -100%); }
  .confetti { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 2; }
  .confetti i { position: absolute; top: -6%; left: var(--x); width: 5px; height: 8px; background: var(--c);
    animation: confetti 2.6s linear var(--d) forwards; }
  @keyframes confetti { to { top: 106%; rotate: 540deg; } }
  .game .gprop { position: absolute; bottom: 10%; width: 16%; image-rendering: pixelated;
    pointer-events: none; will-change: left, transform; }
  .game .gprop[hidden] { display: none; }
  .game .gscore { position: absolute; left: 50%; bottom: 4%; transform: translateX(-50%);
    padding: 2px 8px; border-radius: 8px; background: #fffdf5; color: #3a2a1a;
    border: 2px solid #3a2a1a; font-size: 12px; white-space: nowrap; }
  .game .gscore.two { white-space: pre; text-align: center; line-height: 1.25; } /* the dig: round, then bank and basket */
  /* The dig at 300 px: the two-line score, clear of the pet and the bubble. */
  .compact .game .gscore.two { font-size: 10px; padding: 1px 3px; bottom: 3%; letter-spacing: -.3px; }
  .screen.show-status .flair, .screen.show-status .game, .screen.show-status .rain, .screen.show-status .breeze,
  .screen.show-status .flash, .screen.show-status .speck, .screen.show-status .lcd, .screen.show-status .glow,
  .screen.show-status .bondhearts, .screen.show-status .linkhearts, .screen.show-status .carehearts,
  .screen.show-status .basket, .screen.show-status .reveal { display: none !important; }
  .pet { transition: translate .25s ease-out; }
  /* Reactions to moments (see _moment). */
  .pet.sulk, .drape.sulk { animation: shake .35s 2; } /* a sleeping pet's blanket moves with it (_drapeMirror) */
  /* Feeling poorly (2b): sags and settles back, once. Reduced motion holds the sag. */
  .pet.droop, .drape.droop { animation: droop 2.8s ease-in-out 1; transform-origin: 50% 100%; }
  @keyframes droop { 0%, 100% { transform: none; }
    35%, 70% { transform: translateY(4px) rotate(-4deg) scaleY(.94); } }
  .pet.born { animation: pop .45s ease-out; }
  .pet.stretch { animation: perk .5s ease-out 2; }
  .poop.born { animation: pop .4s ease-out; }
  .screen .burst.big { top: 38%; width: 96px; height: 96px; margin-left: -48px; z-index: 2; }
  /* Stand-ins for house poses that are only drawn for the child. */
  .pet.dance { animation: hop .45s ease-in-out infinite; }
  .pet.jig, .drape.jig { animation: hop .45s ease-in-out 4; } /* a house moment's dance (H8): bounded, unlike .dance */
  .pet.startle, .drape.startle { animation: perk .3s ease-out 2; } /* a house moment's startle (H8): a quick double jolt */
  .pet.shiver { animation: shake .25s linear infinite; }
  /* The fan: wind lines cross the scene and the pet leans into them. */
  .breeze { position: absolute; inset: 0; pointer-events: none; display: none; z-index: 1; }
  .screen.breezy .breeze, .screen.windy .breeze { display: block; }
  .breeze span { position: absolute; left: 0; height: 2px; width: 34%; border-radius: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.85) 45%, rgba(255,255,255,.6) 80%, transparent);
    animation: wind 1.1s linear infinite; }
  .breeze span:nth-child(1) { top: 30%; }
  .breeze span:nth-child(2) { top: 48%; width: 24%; animation-delay: .35s; }
  .breeze span:nth-child(3) { top: 64%; animation-delay: .7s; }
  @keyframes wind { from { transform: translateX(-120%); } to { transform: translateX(330%); } }
  /* The pet leans into the breeze once (bounded; it replaces the old endless sway). */
  .pet.lean { animation: lean 2.6s ease-in-out; transform-origin: 50% 100%; }
  @keyframes lean { 15%, 85% { transform: skewX(-4deg) translateX(-1%); } }
  /* A praised adult's twirl: four held poses, front and back (the .look flip), 150 ms each. No
     in-between angle is drawn, so no frame is ever edge-on. (Not ".spin": that is an adult's
     trick, 360 degrees in .9 s, below.) */
  .pet.twirl { animation: twirl .6s step-end; }
  @keyframes twirl { 0% { rotate: y 180deg; } 25% { rotate: y 0deg; } 50% { rotate: y 180deg; } 75% { rotate: y 0deg; } }
  /* the edge-on sprite swap (_swapFlip): the paper flip as a mask. The art swaps while it is a line (90deg). */
  @keyframes turn-swap { 0% { rotate: y 0deg; animation-timing-function: ease-in; }
    50% { rotate: y 90deg; animation-timing-function: ease-out; } 100% { rotate: y 0deg; } }
  .pet.turn { animation: turn-swap .2s linear; }
  /* Thunder: now and then the scene flashes. */
  .flash { position: absolute; inset: 0; pointer-events: none; display: none; z-index: 2;
    background: #fff; opacity: 0; }
  .screen.stormy .flash { display: block; animation: lightning 9s linear infinite; }
  @keyframes lightning { 0%, 89%, 92%, 95%, 100% { opacity: 0; } 90% { opacity: .75; } 94% { opacity: .5; } }
  /* The LCD: a faint dot-matrix grid over the scene, one cell per world art pixel
     (WORLD_GRID, see _lcdPitch), under the weather, the bubble, the game and the status. */
  .lcd { position: absolute; inset: 0; pointer-events: none; display: none;
    background-color: rgba(255,228,170,.035);
    background-image:
      repeating-linear-gradient(0deg, rgba(20,24,12,.08) 0 var(--lcd-line, 1px), transparent var(--lcd-line, 1px) var(--lcd-pitch, 4px)),
      repeating-linear-gradient(90deg, rgba(20,24,12,.08) 0 var(--lcd-line, 1px), transparent var(--lcd-line, 1px) var(--lcd-pitch, 4px));
    background-position: var(--lcd-x, 0) var(--lcd-y, 0); }
  ha-card.lcd-on .lcd { display: block; }
  /* Ghosting (_ghostFrame, _ghostTrail): the pet's geometry, not its class. */
  .ghost { left: 50%; bottom: 4%; height: 62%; margin-left: -23.25%; transform-origin: 50% 100%;
    opacity: 0; display: none; transition: translate .25s ease-out .12s; }
  ha-card.lcd-on .ghost { display: block; }
  .ghost.wander-l { translate: -16% 0; transition-duration: .9s; transition-delay: .32s; } /* the pet's turn (.2 s) + 120 ms */
  .ghost.wander-r { translate: 16% 0; transition-duration: .9s; }
  .ghost.look { rotate: y 180deg; } /* a wander left turns, and so does its trace */
  .screen.dim .ghost { filter: brightness(.8); }
  /* The backlight (_backlight): an Indiglo glow over the scene, under the bubble.
     It comes on at once and fades out; the dimmed scene brightens under it. */
  .glow { position: absolute; inset: 0; pointer-events: none; opacity: 0; mix-blend-mode: screen;
    background: radial-gradient(ellipse at 50% 55%, #4fe3c1 0%, rgba(79,227,193,.8) 45%, rgba(79,227,193,.35) 100%);
    transition: opacity .6s ease-out; }
  .screen.lit .glow { opacity: .55; transition: none; }
  /* By day a real backlight barely shows: a faint lift, not a mint wash. */
  .screen.lit:not(.night):not(.dim):not(.faded) .glow { opacity: .14; }
  .screen.lit:not(.night):not(.dim):not(.faded):not(.raining) .bg { filter: brightness(1.07); }
  .screen.lit.dim .bg, .screen.lit.faded .bg { filter: brightness(.9) saturate(.75); }
  .screen.lit.dim .pet, .screen.lit.dim .ghost { filter: brightness(.9); }
  /* Its button: a 44 px target, transparent, around a small domed cap cut on the grid
     (::before, see _mould) with a bulb on it in the shell's dark tone (::after). Each
     spot (--bx, --by: the cap's centre) keeps the target clear of the screen, the
     buttons and the label, and inside the slide. */
  .backlight { position: absolute; z-index: 1; width: 44px; height: 44px; padding: 0; border: none;
    border-radius: 8px; background: none; cursor: pointer; --bx: 22px; --by: 22px; }
  .backlight::before, .backlight::after { content: ""; position: absolute;
    left: round(var(--bx) - var(--px, 2px) * 4.5, var(--dpx, 1px)); top: round(var(--by) - var(--px, 2px) * 5, var(--dpx, 1px)); }
  .backlight::before { width: calc(var(--px, 2px) * 9); height: calc(var(--px, 2px) * 11);
    background: var(--bl-tones) 0 0 / 100% 100%, #fff7ec; clip-path: var(--bl-clip); }
  .backlight::after { width: calc(var(--px, 2px) * 5); height: calc(var(--px, 2px) * 7);
    margin: var(--px, 2px) 0 0 calc(var(--px, 2px) * 2); background: var(--d-dark);
    -webkit-mask: var(--hw-bulb) 0 0 / 100% 100%; mask: var(--hw-bulb) 0 0 / 100% 100%; }
  .backlight:active::before, .backlight:active::after { translate: 0 var(--px, 2px); }
  .device:has(.screen.lit) .backlight::before { background: var(--bl-tones) 0 0 / 100% 100%, #dffbf2; }
  .device:has(.screen.lit) .backlight::after { background: #1fbf9a; }
  /* Egg: on the shoulder, just above the screen's right corner. */
  .egg .backlight { right: -18px; top: -34px; --bx: 26px; --by: 27px; }
  .compact .egg .backlight { right: -14px; }
  /* Tank: on the lid's right grip. */
  .lid .backlight { left: calc(62% + 6px - 22px); top: -4px; --by: 14px; }
  .lid:has(.backlight) span:nth-of-type(3) { visibility: hidden; }
  /* House: on the chimney (over the roof's triangle). */
  .roof .backlight { right: calc(20% - 11px); top: 0; --by: 22px; }
  /* Porthole: the top-right rivet's place on the ring. */
  .porthole .backlight { left: calc(91.2% - 8px); top: calc(11% - 31px); --bx: 3px; --by: 36px; }
  /* Pad: on the upper right rim. */
  .pad .backlight { right: 18%; top: 4px; }
  /* Moon: on the crescent. */
  .crescent .backlight { left: 0; top: 10px; }
  /* Shell hardware (ui/shell_*.png; art/shell-parts/REQUEST.md): each slot is its greyscale
     --art, tinted from the shell by hard-light and cut out by the art's own alpha.
     Places are rounded to the grid, from the top left of the part. */
  .hw { position: absolute; display: none; z-index: -1; pointer-events: none; image-rendering: pixelated;
    --tint: var(--d-shell); --art: none; background: var(--art) 0 0 / 100% 100%, var(--tint);
    background-blend-mode: hard-light, normal;
    -webkit-mask: var(--art) 0 0 / 100% 100%; mask: var(--art) 0 0 / 100% 100%; }
  /* Screws at the corners of the boxy shells (the egg and the pad snap shut). */
  .hw.screws { inset: calc(var(--px) * 4); --s: calc(var(--px) * 5); --a: var(--hw-screw);
    background: var(--a) 0 0 / var(--s) var(--s) no-repeat, var(--a) 100% 0 / var(--s) var(--s) no-repeat,
      var(--a) 0 100% / var(--s) var(--s) no-repeat, var(--a) 100% 100% / var(--s) var(--s) no-repeat, var(--tint);
    background-blend-mode: hard-light, hard-light, hard-light, hard-light, normal;
    -webkit-mask: var(--a) 0 0 / var(--s) var(--s) no-repeat, var(--a) 100% 0 / var(--s) var(--s) no-repeat,
      var(--a) 0 100% / var(--s) var(--s) no-repeat, var(--a) 100% 100% / var(--s) var(--s) no-repeat;
    mask: var(--a) 0 0 / var(--s) var(--s) no-repeat, var(--a) 100% 0 / var(--s) var(--s) no-repeat,
      var(--a) 0 100% / var(--s) var(--s) no-repeat, var(--a) 100% 100% / var(--s) var(--s) no-repeat; }
  :is(.tank, .house, .porthole, .moon) .hw.screws { display: block; }
  .porthole .hw.screws { inset: calc(var(--px) * 7); }
  .moon .hw.screws { inset: calc(var(--px) * 6) calc(var(--px) * 5); }
  /* The egg mark between two speaker grilles, bottom centre, --hw-b cells up. */
  .body { --hw-b: 8; }
  .tank .body { --hw-b: 7; } .pad .body { --hw-b: 9; }
  .hw.logo, .hw.grille { display: block; top: round(down, 100% - var(--px) * (var(--hw-b) + 9), var(--px)); }
  .hw.logo { --art: var(--hw-logo); width: calc(var(--px) * 7); height: calc(var(--px) * 9);
    left: round(down, 50% - var(--px) * 3.5, var(--px)); }
  .hw.grille { --art: var(--hw-slot); width: calc(var(--px) * 10); height: calc(var(--px) * 5);
    margin-top: calc(var(--px) * 2); background-size: calc(var(--px) * 2) 100%, auto; background-repeat: repeat-x;
    -webkit-mask-size: calc(var(--px) * 2) 100%; mask-size: calc(var(--px) * 2) 100%;
    -webkit-mask-repeat: repeat-x; mask-repeat: repeat-x; }
  .hw.grille.left { left: round(down, 50% - var(--px) * 15.5, var(--px)); }
  .hw.grille.right { left: round(down, 50% + var(--px) * 5.5, var(--px)); }
  /* The world's emblem (full colour, so no tint and no mask) left of the grille, and the
     battery door's seam right of it, both on the grille's row. */
  .hw.emblem, .hw.battery { display: block; }
  .hw.emblem { --art: var(--hw-emblem); width: calc(var(--px) * 9); height: calc(var(--px) * 9);
    top: round(down, 100% - var(--px) * (var(--hw-b) + 9), var(--px)); left: round(down, 50% - var(--px) * 27.5, var(--px));
    background: var(--art) 0 0 / 100% 100%; -webkit-mask: none; mask: none; }
  .hw.battery { --art: var(--hw-battery); width: calc(var(--px) * 24); height: calc(var(--px) * 12);
    top: round(down, 100% - var(--px) * (var(--hw-b) + 11), var(--px)); left: round(down, 50% + var(--px) * 18.5, var(--px)); }
  /* No room for the seam where the bottom-corner trim sits on it (a compact card has none),
     nor beside the curve of the pad, or of a narrow egg. */
  .device.has-corner .hw.battery, .pad .hw.battery, .compact .egg .hw.battery { display: none; }
  /* Printed stripes across the top of the bezel (the porthole's ring has rivets). */
  .hw.stripes { display: block; --art: var(--hw-stripes); --tint: var(--d-bezel); top: var(--px);
    left: round(18%, var(--px)); width: round(down, 64%, var(--px)); height: calc(var(--px) * 3);
    background-size: var(--px) 100%, auto; background-repeat: repeat-x;
    -webkit-mask-size: var(--px) 100%; mask-size: var(--px) 100%; -webkit-mask-repeat: repeat-x; mask-repeat: repeat-x; }
  .porthole .hw.stripes { display: none; }
  /* The power light, left of the screen; dark with the lights out. */
  .hw.light { display: block; --art: var(--hw-light-on); --tint: #e8584a; left: calc(var(--px) * -7);
    top: round(down, 50% - var(--px) * 2.5, var(--px)); width: calc(var(--px) * 5); height: calc(var(--px) * 5); }
  .device:has(.screen.dim) .hw.light { --art: var(--hw-light-off); }
  @supports not (width: round(1px, 1px)) { .hw { display: none !important; } } /* placed on the grid with round() */
  /* The inner glass (device-alive 3B, plan 6.6): a layer in the screen, over the scene and under
     everything that is read or pressed. It sits after .glow in the DOM and has no z-index of its own
     above 0, so the bubble, the pat box, the basket, the game, the status sheet and the boot screen
     (later in the DOM, or z-index 1+) are all over it; it is deaf to the pointer. Drawn only where
     round() is known (every .hw is) and only with "screen effects here" on. dir-wet is the rain
     ambience (still); dir-drop / dir-clear are the onset, dir-echo its shorter form. */
  @supports (width: round(1px, 1px)) {
    .hw.glass { display: none; inset: 0; z-index: 0; background: none; -webkit-mask: none; mask: none;
      --b: var(--px, 2px); }
    ha-card.lcd-on .hw.glass { display: block; }
    .screen.show-status .hw.glass { display: none; }
    .hw.glass::before, .hw.glass::after { content: ""; position: absolute; pointer-events: none; }
    .hw.glass::before { inset: 0; opacity: 0; transition: opacity .8s ease-out; }
    .hw.glass.dir-wet::before, .hw.glass.dir-clear::before {
      background:
        radial-gradient(circle at 14% 22%, rgba(236,246,255,.85) 0 calc(var(--b) * 1.5), transparent calc(var(--b) * 1.5 + 1px)),
        radial-gradient(circle at 37% 11%, rgba(236,246,255,.8) 0 var(--b), transparent calc(var(--b) + 1px)),
        radial-gradient(circle at 81% 19%, rgba(236,246,255,.85) 0 calc(var(--b) * 1.5), transparent calc(var(--b) * 1.5 + 1px)),
        radial-gradient(circle at 63% 47%, rgba(236,246,255,.8) 0 var(--b), transparent calc(var(--b) + 1px)),
        radial-gradient(circle at 8% 63%, rgba(236,246,255,.8) 0 var(--b), transparent calc(var(--b) + 1px)),
        radial-gradient(circle at 90% 71%, rgba(236,246,255,.85) 0 calc(var(--b) * 1.5), transparent calc(var(--b) * 1.5 + 1px)),
        radial-gradient(circle at 44% 86%, rgba(236,246,255,.8) 0 var(--b), transparent calc(var(--b) + 1px)),
        linear-gradient(112deg, rgba(214,232,255,.2), rgba(214,232,255,0) 42%, rgba(214,232,255,.12)); }
    .hw.glass.dir-wet::before { opacity: .8; }
    /* The onset: a drop runs down the glass in steps (a pixel toy), or the sheen dries off. */
    .hw.glass.dir-drop::after { left: 63%; top: -8%; width: calc(var(--b) * 3); height: calc(var(--b) * 7);
      border-radius: 40% 40% 50% 50%; background: linear-gradient(180deg, rgba(240,248,255,0), rgba(240,248,255,.95) 45%, rgba(200,224,255,.85));
      animation: dir-run 1.8s steps(18) both; }
    .hw.glass.dir-clear::before { animation: dir-dry 1.2s ease-in both; }
    .hw.glass.dir-echo.dir-drop::after { animation-duration: .9s; }
    .hw.glass.dir-echo.dir-clear::before { animation-duration: .6s; }
    @keyframes dir-run { 0% { top: -8%; opacity: 0; } 10%, 80% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
    @keyframes dir-dry { from { opacity: .8; } to { opacity: 0; } }
    /* The other layers (slice 4B, plan 6.6b): five <b> in the glass, one per look, each at rest by a
       transition on opacity. 1 frost (snow), 2 fog, 3 storm, 4 wind, 5 the moon (client-computed, off the
       wire). The ambience is the class on the glass (dir-frost ...): still, a transition at most, never a
       finite animation that ends on the glass (F11). An onset is the layer's own animation to or from
       its resting look, and the glass carries the lease's clock, the one named animation dir-glass-life,
       the only thing the card's animationend listener releases on. */
    .hw.glass b { position: absolute; inset: 0; display: block; opacity: 0; pointer-events: none;
      transition: opacity .8s ease-out; }
    @keyframes dir-glass-life { from, to { opacity: 1; } }
    .hw.glass.dir-drop { animation: dir-glass-life 1.8s linear both; }
    .hw.glass.dir-clear { animation: dir-glass-life 1.2s linear both; }
    .hw.glass.dir-frost-form, .hw.glass.dir-thaw, .hw.glass.dir-fog-in, .hw.glass.dir-fog-out { animation: dir-glass-life 2.4s linear both; }
    .hw.glass.dir-storm-in, .hw.glass.dir-storm-out { animation: dir-glass-life 3s linear both; }
    .hw.glass.dir-wind-gust, .hw.glass.dir-wind-die { animation: dir-glass-life 2s linear both; }
    /* Snow: frost in the four corners, in hard pixel rings. It forms in six steps and thaws the same way. */
    .hw.glass b:nth-child(1) { background:
      radial-gradient(circle at 0 0, rgba(238,247,255,.85) 0 calc(var(--b) * 9), rgba(238,247,255,.5) calc(var(--b) * 9) calc(var(--b) * 15), rgba(238,247,255,.22) calc(var(--b) * 15) calc(var(--b) * 22), transparent calc(var(--b) * 22)),
      radial-gradient(circle at 100% 0, rgba(238,247,255,.85) 0 calc(var(--b) * 8), rgba(238,247,255,.5) calc(var(--b) * 8) calc(var(--b) * 13), rgba(238,247,255,.22) calc(var(--b) * 13) calc(var(--b) * 19), transparent calc(var(--b) * 19)),
      radial-gradient(circle at 0 100%, rgba(238,247,255,.85) 0 calc(var(--b) * 8), rgba(238,247,255,.5) calc(var(--b) * 8) calc(var(--b) * 13), rgba(238,247,255,.22) calc(var(--b) * 13) calc(var(--b) * 19), transparent calc(var(--b) * 19)),
      radial-gradient(circle at 100% 100%, rgba(238,247,255,.85) 0 calc(var(--b) * 9), rgba(238,247,255,.5) calc(var(--b) * 9) calc(var(--b) * 15), rgba(238,247,255,.22) calc(var(--b) * 15) calc(var(--b) * 22), transparent calc(var(--b) * 22)); }
    .hw.glass.dir-frost b:nth-child(1) { opacity: .9; }
    .hw.glass.dir-frost-form b:nth-child(1) { animation: dir-layer-in 2.4s steps(6) both; }
    .hw.glass.dir-thaw b:nth-child(1) { animation: dir-layer-in 2.4s steps(6) reverse both; }
    /* Fog: a soft veil that thickens toward the rim. It gathers and clears slowly. */
    .hw.glass b:nth-child(2) { background:
      radial-gradient(ellipse at 50% 52%, rgba(226,232,238,.05) 0 34%, rgba(226,232,238,.22) 74%, rgba(226,232,238,.42)); }
    .hw.glass.dir-fog b:nth-child(2) { opacity: .9; }
    .hw.glass.dir-fog-in b:nth-child(2) { animation: dir-layer-in 2.4s ease-in-out both; }
    .hw.glass.dir-fog-out b:nth-child(2) { animation: dir-layer-in 2.4s ease-in-out reverse both; }
    /* Storm: a cooler dim over the screen. NOT a flash: the shiver is a slow wobble on the tint's
       opacity (every step at most .17, none shorter than a fifth of a 1.8 s echo, so under 2 Hz), the
       release a plain ease, and nothing here repeats. A source test holds these numbers. */
    .hw.glass b:nth-child(3) { background: linear-gradient(180deg, rgba(30,44,80,.34), rgba(30,44,80,.2)); }
    .hw.glass.dir-storm b:nth-child(3) { opacity: 1; }
    .hw.glass.dir-storm-in b:nth-child(3) { animation: dir-storm-shiver 3s linear both; }
    .hw.glass.dir-storm-out b:nth-child(3) { animation: dir-layer-in 3s ease-in-out reverse both; }
    @keyframes dir-storm-shiver { 0% { opacity: 0; } 20% { opacity: .5; } 40% { opacity: .38; } 60% { opacity: .55; } 80% { opacity: .46; } 100% { opacity: 1; } }
    /* Wind: a few flecks, level and short, that lean in from the side. */
    .hw.glass b:nth-child(4) { background:
      linear-gradient(rgba(240,246,252,.85), rgba(240,246,252,.85)) 14% 24% / calc(var(--b) * 7) var(--b) no-repeat,
      linear-gradient(rgba(240,246,252,.85), rgba(240,246,252,.85)) 62% 18% / calc(var(--b) * 9) var(--b) no-repeat,
      linear-gradient(rgba(240,246,252,.7), rgba(240,246,252,.7)) 38% 44% / calc(var(--b) * 6) var(--b) no-repeat,
      linear-gradient(rgba(240,246,252,.85), rgba(240,246,252,.85)) 80% 52% / calc(var(--b) * 8) var(--b) no-repeat,
      linear-gradient(rgba(240,246,252,.7), rgba(240,246,252,.7)) 22% 70% / calc(var(--b) * 9) var(--b) no-repeat,
      linear-gradient(rgba(240,246,252,.85), rgba(240,246,252,.85)) 70% 84% / calc(var(--b) * 6) var(--b) no-repeat; }
    .hw.glass.dir-wind b:nth-child(4) { opacity: .7; }
    .hw.glass.dir-wind-gust b:nth-child(4) { animation: dir-wind-in 2s steps(10) both; }
    .hw.glass.dir-wind-die b:nth-child(4) { animation: dir-wind-out 2s steps(10) both; }
    @keyframes dir-layer-in { from { opacity: 0; } }
    @keyframes dir-wind-in { from { opacity: 0; transform: translateX(-26%); } to { opacity: .7; transform: none; } }
    @keyframes dir-wind-out { from { opacity: .7; transform: none; } to { opacity: 0; transform: translateX(30%); } }
    /* An echo is the same onset, shorter (its lease clock too). */
    .hw.glass.dir-echo.dir-frost-form, .hw.glass.dir-echo.dir-thaw, .hw.glass.dir-echo.dir-fog-in, .hw.glass.dir-echo.dir-fog-out,
    .hw.glass.dir-echo.dir-frost-form b, .hw.glass.dir-echo.dir-thaw b, .hw.glass.dir-echo.dir-fog-in b, .hw.glass.dir-echo.dir-fog-out b { animation-duration: 1.2s; }
    .hw.glass.dir-echo.dir-storm-in, .hw.glass.dir-echo.dir-storm-out, .hw.glass.dir-echo.dir-storm-in b, .hw.glass.dir-echo.dir-storm-out b { animation-duration: 1.8s; }
    .hw.glass.dir-echo.dir-wind-gust, .hw.glass.dir-echo.dir-wind-die, .hw.glass.dir-echo.dir-wind-gust b, .hw.glass.dir-echo.dir-wind-die b { animation-duration: 1s; }
    .hw.glass.dir-echo.dir-drop { animation-duration: .9s; }
    .hw.glass.dir-echo.dir-clear { animation-duration: .6s; }
    /* The moon, on the full and the new day (computed by the card from the server's clock, no wire key):
       a still halo at the top right of the glass. */
    .hw.glass b:nth-child(5) { background: none; }
    .hw.glass.dir-moon b:nth-child(5) { opacity: 1; background:
      radial-gradient(circle at 86% 13%, rgba(255,246,208,.9) 0 calc(var(--b) * 3), rgba(255,246,208,.4) calc(var(--b) * 3) calc(var(--b) * 6), rgba(255,246,208,.14) calc(var(--b) * 6) calc(var(--b) * 10), transparent calc(var(--b) * 10)); }
    .hw.glass.dir-newmoon b:nth-child(5) { opacity: 1; background:
      radial-gradient(circle at 86% 13%, rgba(14,20,40,.62) 0 calc(var(--b) * 3), rgba(190,206,255,.34) calc(var(--b) * 3) calc(var(--b) * 4), transparent calc(var(--b) * 4)); }
    /* The room on the glass (slice 4D, plan 6.6): music's bars (6) and the tv's reflection (7), the same
       way as the weather: still at rest (a class on the glass), an onset the layer's own animation to or
       from its resting look, the lease's clock the glass's dir-glass-life. Quiet: a few bars in the
       bottom corner; a faint rectangle of colour at the screen's lower edge. */
    .hw.glass b:nth-child(6) { background:
      linear-gradient(rgba(206,232,255,.8), rgba(206,232,255,.8)) 90% 96% / calc(var(--b) * 2) calc(var(--b) * 4) no-repeat,
      linear-gradient(rgba(206,232,255,.8), rgba(206,232,255,.8)) 93% 96% / calc(var(--b) * 2) calc(var(--b) * 7) no-repeat,
      linear-gradient(rgba(206,232,255,.8), rgba(206,232,255,.8)) 96% 96% / calc(var(--b) * 2) calc(var(--b) * 5) no-repeat; }
    .hw.glass.dir-bars b:nth-child(6) { opacity: .75; }
    .hw.glass.dir-bars-up b:nth-child(6) { animation: dir-layer-in 1.8s steps(6) both; }
    .hw.glass.dir-bars-down b:nth-child(6) { animation: dir-layer-in 1.8s steps(6) reverse both; }
    .hw.glass b:nth-child(7) { background:
      linear-gradient(rgba(172,206,255,.75), rgba(172,206,255,.75)) 50% 100% / 46% calc(var(--b) * 3) no-repeat,
      linear-gradient(180deg, transparent 66%, rgba(150,190,255,.24)); }
    .hw.glass.dir-tv b:nth-child(7) { opacity: .8; }
    .hw.glass.dir-tv-on b:nth-child(7) { animation: dir-layer-in 1.8s ease-in-out both; }
    .hw.glass.dir-tv-off b:nth-child(7) { animation: dir-layer-in 1.8s ease-in-out reverse both; }
    .hw.glass.dir-bars-up, .hw.glass.dir-bars-down, .hw.glass.dir-tv-on, .hw.glass.dir-tv-off { animation: dir-glass-life 1.8s linear both; }
    .hw.glass.dir-echo.dir-bars-up, .hw.glass.dir-echo.dir-bars-down, .hw.glass.dir-echo.dir-tv-on, .hw.glass.dir-echo.dir-tv-off,
    .hw.glass.dir-echo.dir-bars-up b, .hw.glass.dir-echo.dir-bars-down b, .hw.glass.dir-echo.dir-tv-on b, .hw.glass.dir-echo.dir-tv-off b { animation-duration: .9s; }
    /* Reduced motion: the still looks only; an onset is a move, so there is none (the card never starts
       one, and the global rule above also stops the animation and the transition). */
    @media (prefers-reduced-motion: reduce) { .hw.glass.dir-drop::after, .hw.glass.dir-clear::before { display: none; } }
    /* The rare glass mark (device-alive slice 6, plan section 9): one element after the seven layers (a <u>, so
       none of the b rules above reach it), drawn about once in 20 minutes of viewed time. A generic paw, smudge or
       edge shadow at one of four fixed spots in the screen's margin band (percentages of the glass, so a resize
       keeps the spot; --edge, the porthole's round corners, moves the lower and side spots in). Its own classes (dir-mark-*) are on this element only, never on .hw.glass, and it uses
       neither pseudo-element, so the wet sheen and the frost sit under it. No lease: dir-mark-life is the clock
       (20 s on, a 2 s fade: 22 s in all), a one-shot, opacity only. Deaf to the pointer. */
    .hw.glass .mark { position: absolute; display: block; opacity: 0; pointer-events: none; }
    .hw.glass .mark.dir-mark-on { animation: dir-mark-life 22s linear both; }
    .hw.glass .mark.dir-mark-bl { left: calc(3% + var(--edge, 0%)); top: 70%; }
    .hw.glass .mark.dir-mark-br { right: calc(3% + var(--edge, 0%)); top: 70%; }
    .hw.glass .mark.dir-mark-ml { left: calc(2% + var(--edge, 0%) * .25); top: 36%; }
    .hw.glass .mark.dir-mark-mr { right: calc(2% + var(--edge, 0%) * .25); top: 36%; }
    .hw.glass .mark.dir-mark-paw { width: 9%; aspect-ratio: 1; rotate: -14deg;
      background:
        radial-gradient(ellipse 15% 13% at 18% 36%, rgba(30,22,14,.5) 55%, transparent 100%),
        radial-gradient(ellipse 15% 14% at 39% 17%, rgba(30,22,14,.5) 55%, transparent 100%),
        radial-gradient(ellipse 15% 14% at 61% 17%, rgba(30,22,14,.5) 55%, transparent 100%),
        radial-gradient(ellipse 15% 13% at 82% 36%, rgba(30,22,14,.5) 55%, transparent 100%),
        radial-gradient(ellipse 32% 26% at 50% 67%, rgba(30,22,14,.5) 60%, transparent 100%); }
    .hw.glass .mark.dir-mark-br.dir-mark-paw, .hw.glass .mark.dir-mark-mr.dir-mark-paw { rotate: 12deg; }
    .hw.glass .mark.dir-mark-smudge { width: 15%; aspect-ratio: 1.7; border-radius: 50%;
      background: radial-gradient(ellipse 50% 50% at 46% 52%, rgba(255,255,255,.5), rgba(255,255,255,.24) 55%, transparent 100%); }
    .hw.glass .mark.dir-mark-edge { width: 10%; height: 38%; }
    .hw.glass .mark.dir-mark-edge.dir-mark-bl, .hw.glass .mark.dir-mark-edge.dir-mark-br { top: 58%; }
    .hw.glass .mark.dir-mark-edge.dir-mark-bl, .hw.glass .mark.dir-mark-edge.dir-mark-ml { left: 0; background: linear-gradient(90deg, rgba(10,8,6,.62), rgba(10,8,6,.26) 45%, transparent); }
    .hw.glass .mark.dir-mark-edge.dir-mark-br, .hw.glass .mark.dir-mark-edge.dir-mark-mr { right: 0; background: linear-gradient(270deg, rgba(10,8,6,.62), rgba(10,8,6,.26) 45%, transparent); }
    @keyframes dir-mark-life { 0% { opacity: 0; } 0.5% { opacity: 1; } 90.9% { opacity: 1; } 100% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .hw.glass .mark { display: none; } }
  }
  /* The rim cues (device-alive 3C, plan section 7): a press's one pulse on the bezel's plastic, on its
     own layer (.hw.rim, in the bezel, under the screen, deaf to the pointer, never over a control: it
     lies in the bezel's padding, and the toys are outside the bezel). Drawn only with "screen effects
     here" on. The class on it is the director's lease (dir-feed, dir-play, dir-clean, dir-tuck); each
     lamp (b) moves by opacity or left alone. Nothing here touches .cap or .toy (slice 2 owns them);
     reduced motion draws none (the card offers none, and this hides the layer as well). */
  @supports (width: round(1px, 1px)) {
    .hw.rim { display: none; inset: 0; z-index: -1; background: none; -webkit-mask: none; mask: none;
      --b: var(--px, 2px); --lit: #ff9f1c; }
    ha-card.lcd-on .hw.rim { display: block; }
    .hw.rim b { position: absolute; display: block; width: calc(var(--b) * 6); height: calc(var(--b) * 3);
      background: var(--lit); box-shadow: 0 0 calc(var(--b) * 2) var(--lit), 0 0 0 calc(var(--b) / 2) rgba(255, 244, 200, .8); opacity: 0; pointer-events: none; }
    .hw.rim.dir-feed { animation: dir-rim-life 1.3s linear both; }
    .hw.rim.dir-play { animation: dir-rim-life .9s linear both; }
    .hw.rim.dir-clean { animation: dir-rim-life 1.1s linear both; }
    .hw.rim.dir-tuck { animation: dir-rim-life 1.8s linear both; }
    @keyframes dir-rim-life { from, to { opacity: 1; } }
    /* Feed: the delivery path, three lamps along the bottom edge lighting in turn. */
    .hw.rim.dir-feed b { bottom: calc(var(--b) / 2); animation: dir-rim-blip .5s steps(5) both; }
    .hw.rim.dir-feed b:nth-child(1) { left: 32%; }
    .hw.rim.dir-feed b:nth-child(2) { left: 46%; animation-delay: .25s; }
    .hw.rim.dir-feed b:nth-child(3) { left: 60%; animation-delay: .5s; }
    /* Play: two points, the middle of each side, pulsing twice together. */
    .hw.rim.dir-play b:nth-child(2) { display: none; }
    .hw.rim.dir-play b:nth-child(1), .hw.rim.dir-play b:nth-child(3) { top: 40%; width: calc(var(--b) * 3); height: calc(var(--b) * 7);
      animation: dir-rim-blip .4s steps(4) 2 both; }
    .hw.rim.dir-play b:nth-child(1) { left: calc(var(--b) / 2); }
    .hw.rim.dir-play b:nth-child(3) { right: calc(var(--b) / 2); }
    /* Clean: one sweep along the top edge, left to right. */
    .hw.rim.dir-clean b:nth-child(1), .hw.rim.dir-clean b:nth-child(3) { display: none; }
    .hw.rim.dir-clean b:nth-child(2) { top: calc(var(--b) / 2); width: calc(var(--b) * 12); animation: dir-rim-sweep 1s steps(10) both; }
    /* The tuck, confirmed: three lamps on the top edge, each lit then dimming, one after the other. */
    .hw.rim.dir-tuck b { top: calc(var(--b) / 2); animation: dir-rim-dim .6s steps(6) both; }
    .hw.rim.dir-tuck b:nth-child(1) { left: 38%; }
    .hw.rim.dir-tuck b:nth-child(2) { left: 48%; animation-delay: .45s; }
    .hw.rim.dir-tuck b:nth-child(3) { left: 58%; animation-delay: .9s; }
    /* The room on the rim (slice 4D, plan 6.6, 6.6a). Two kinds of thing share this layer, and never the
       same classes. The AMBIENCE is a still glow on the plastic, a class on the rim (dir-rim-*) painted by
       the adapter from the house's 'current': ::before is the room's (the lights lit or dimmed, the
       fireplace's warm rim; the fireplace over the lights), ::after the climate's tint (warm for the
       heating, cool for the cooling). A transition on opacity at most, no animation, and reduced motion
       keeps it. The lights' glow steps aside for the backlight (the player's own light is its own, the
       ambient is never over '.lit'). The CUES are one-shots on the same three amber lamps as the care cues
       (opacity and 'left' only, the rim's 'dir-rim-life' the lease's clock): the lights' and the
       fireplace's onsets from the wire, the doorbell's chime, the appliance's tick, the vacuum's rotor and
       the heating's wash from the moments (one per event). --lit sets a lamp's colour. */
    .hw.rim::before, .hw.rim::after { content: ""; position: absolute; inset: 0; opacity: 0; pointer-events: none;
      transition: opacity .8s ease-out; }
    .hw.rim::before { box-shadow: inset 0 0 0 calc(var(--b) * 2) var(--rim-glow, transparent), inset 0 0 calc(var(--b) * 6) var(--rim-glow, transparent); }
    .hw.rim::after { box-shadow: inset 0 0 0 calc(var(--b) * 2) var(--rim-tint, transparent), inset 0 0 calc(var(--b) * 5) var(--rim-tint, transparent); }
    .hw.rim.dir-rim-lit::before { --rim-glow: rgba(255, 226, 160, .55); opacity: 1; }
    .hw.rim.dir-rim-dim::before { --rim-glow: rgba(10, 12, 24, .5); opacity: 1; }
    .hw.rim.dir-rim-fire::before { --rim-glow: rgba(255, 96, 24, .75); opacity: 1; }
    .bezel:has(.screen.lit) .hw.rim.dir-rim-lit::before, .bezel:has(.screen.lit) .hw.rim.dir-rim-dim::before { opacity: 0; }
    .hw.rim.dir-rim-warm::after { --rim-tint: rgba(255, 170, 60, .6); opacity: 1; }
    .hw.rim.dir-rim-cool::after { --rim-tint: rgba(110, 176, 255, .4); opacity: 1; }
    .hw.rim.dir-lamp-on, .hw.rim.dir-lamp-off, .hw.rim.dir-ember-in, .hw.rim.dir-ember-out { animation: dir-rim-life 1.5s linear both; }
    .hw.rim.dir-chime { animation: dir-rim-life 1.2s linear both; }
    .hw.rim.dir-tick-l, .hw.rim.dir-tick-m, .hw.rim.dir-tick-r { animation: dir-rim-life .9s linear both; }
    .hw.rim.dir-wash-warm, .hw.rim.dir-wash-cool { animation: dir-rim-life 1.3s linear both; }
    .hw.rim.dir-rotor-out { animation: dir-rim-life 1.1s linear both; }
    .hw.rim.dir-rotor-home { animation: dir-rim-life 2.2s linear both; }
    /* Lights on: the top lamps come on in turn and stay lit to the end; off: they dim in turn, last first. */
    .hw.rim.dir-lamp-on b, .hw.rim.dir-lamp-off b { top: calc(var(--b) / 2); }
    .hw.rim.dir-lamp-on b { animation: dir-rim-rise .5s steps(5) both; }
    .hw.rim.dir-lamp-off b { animation: dir-rim-dim .6s steps(6) both; }
    .hw.rim.dir-lamp-on b:nth-child(1), .hw.rim.dir-lamp-off b:nth-child(3) { left: 38%; }
    .hw.rim.dir-lamp-on b:nth-child(2), .hw.rim.dir-lamp-off b:nth-child(2) { left: 48%; animation-delay: .45s; }
    .hw.rim.dir-lamp-on b:nth-child(3), .hw.rim.dir-lamp-off b:nth-child(1) { left: 58%; animation-delay: .9s; }
    .hw.rim.dir-lamp-off b:nth-child(3) { animation-delay: 0s; }
    /* The fireplace: three embers along the bottom edge, lit in turn (and, at its end, set in turn). */
    .hw.rim.dir-ember-in, .hw.rim.dir-ember-out { --lit: #ff5a14; }
    .hw.rim.dir-ember-in b, .hw.rim.dir-ember-out b { bottom: calc(var(--b) / 2); }
    .hw.rim.dir-ember-in b { animation: dir-rim-rise .5s steps(5) both; }
    .hw.rim.dir-ember-out b { animation: dir-rim-dim .6s steps(6) both; }
    .hw.rim.dir-ember-in b:nth-child(1), .hw.rim.dir-ember-out b:nth-child(3) { left: 36%; }
    .hw.rim.dir-ember-in b:nth-child(2), .hw.rim.dir-ember-out b:nth-child(2) { left: 48%; animation-delay: .45s; }
    .hw.rim.dir-ember-in b:nth-child(3), .hw.rim.dir-ember-out b:nth-child(1) { left: 60%; animation-delay: .9s; }
    .hw.rim.dir-ember-out b:nth-child(3) { animation-delay: 0s; }
    /* The doorbell: two notes, a lamp each along the top edge, the second a beat after. */
    .hw.rim.dir-chime b:nth-child(2) { display: none; }
    .hw.rim.dir-chime b { top: calc(var(--b) / 2); animation: dir-rim-blip .5s steps(5) both; }
    .hw.rim.dir-chime b:nth-child(1) { left: 42%; }
    .hw.rim.dir-chime b:nth-child(3) { left: 54%; animation-delay: .5s; }
    /* The appliance: one lamp, one tick, at the bottom edge: left for the washer, middle for the dryer and any
       other machine, right for the dishwasher. */
    .hw.rim.dir-tick-l b:nth-child(1), .hw.rim.dir-tick-l b:nth-child(3), .hw.rim.dir-tick-m b:nth-child(1), .hw.rim.dir-tick-m b:nth-child(3),
    .hw.rim.dir-tick-r b:nth-child(1), .hw.rim.dir-tick-r b:nth-child(3) { display: none; }
    .hw.rim.dir-tick-l b:nth-child(2), .hw.rim.dir-tick-m b:nth-child(2), .hw.rim.dir-tick-r b:nth-child(2) { bottom: calc(var(--b) / 2); animation: dir-rim-blip .6s steps(6) both; }
    .hw.rim.dir-tick-l b:nth-child(2) { left: 22%; }
    .hw.rim.dir-tick-m b:nth-child(2) { left: 47%; }
    .hw.rim.dir-tick-r b:nth-child(2) { left: 72%; }
    /* The heating or the cooling coming on for the pet: one wash along the top edge, warm or cool. */
    .hw.rim.dir-wash-warm { --lit: #ff8a3c; }
    .hw.rim.dir-wash-cool { --lit: #6fb4ff; }
    .hw.rim.dir-wash-warm b:nth-child(1), .hw.rim.dir-wash-warm b:nth-child(3), .hw.rim.dir-wash-cool b:nth-child(1), .hw.rim.dir-wash-cool b:nth-child(3) { display: none; }
    .hw.rim.dir-wash-warm b:nth-child(2), .hw.rim.dir-wash-cool b:nth-child(2) { top: calc(var(--b) / 2); width: calc(var(--b) * 12); animation: dir-rim-sweep 1.2s steps(12) both; }
    /* The vacuum: a rotor of three lamps (the left side, the top, the right side) lit in turn. Out: one quick
       turn. Home: the same turn, slower, and it ends. */
    .hw.rim.dir-rotor-out b, .hw.rim.dir-rotor-home b { width: calc(var(--b) * 3); height: calc(var(--b) * 7); top: 40%; }
    .hw.rim.dir-rotor-out b:nth-child(1), .hw.rim.dir-rotor-home b:nth-child(1) { left: calc(var(--b) / 2); }
    .hw.rim.dir-rotor-out b:nth-child(2), .hw.rim.dir-rotor-home b:nth-child(2) { top: calc(var(--b) / 2); left: 48%; width: calc(var(--b) * 7); height: calc(var(--b) * 3); }
    .hw.rim.dir-rotor-out b:nth-child(3), .hw.rim.dir-rotor-home b:nth-child(3) { right: calc(var(--b) / 2); }
    .hw.rim.dir-rotor-out b { animation: dir-rim-blip .4s steps(4) both; }
    .hw.rim.dir-rotor-out b:nth-child(2) { animation-delay: .25s; }
    .hw.rim.dir-rotor-out b:nth-child(3) { animation-delay: .5s; }
    .hw.rim.dir-rotor-home b { animation: dir-rim-blip .8s steps(8) both; }
    .hw.rim.dir-rotor-home b:nth-child(2) { animation-delay: .6s; }
    .hw.rim.dir-rotor-home b:nth-child(3) { animation-delay: 1.2s; }
    /* An echo (the first view soon after): the same, shorter, the lamps together. */
    .hw.rim.dir-rim-echo { animation-duration: .7s; }
    .hw.rim.dir-rim-echo b:nth-child(n) { animation-duration: .4s; animation-delay: 0s; }
    @keyframes dir-rim-rise { 0% { opacity: 0; } 30%, 100% { opacity: 1; } }
    @keyframes dir-rim-blip { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }
    @keyframes dir-rim-sweep { 0% { left: 12%; opacity: 0; } 15%, 85% { opacity: 1; } 100% { left: 78%; opacity: 0; } }
    @keyframes dir-rim-dim { 0% { opacity: 0; } 15%, 40% { opacity: 1; } 100% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .hw.rim b { display: none !important; } } /* the lamps are cues, and none is offered; the still glow stays */
  }
  .compact .egg .hw.light { display: none; } /* no margin left beside a narrow egg's screen */
  /* Clear: the board behind the screen, seen through the plastic round the bezel,
     and a glare on the plastic. */
  .hw.guts { inset: calc(var(--px) * -5); z-index: -2; -webkit-mask: none; mask: none; --gold: rgba(236,200,104,.6);
    background: repeating-linear-gradient(180deg, transparent 0 calc(var(--px) * 5), var(--gold) 0 calc(var(--px) * 6)),
      repeating-linear-gradient(90deg, transparent 0 calc(var(--px) * 13), var(--gold) 0 calc(var(--px) * 14)),
      rgba(40,128,84,.55);
    box-shadow: inset 0 0 0 var(--px) var(--gold); }
  .hw.glare { --art: var(--hw-glare); --tint: #fff; opacity: .6; width: calc(var(--px) * 8); height: calc(var(--px) * 8);
    top: round(7%, var(--px)); left: round(down, 84% - var(--px) * 8, var(--px)); }
  /* Glitter: three sets of flecks, each twinkling slowly on its own beat. */
  .hw.flecks { inset: 0; background: var(--tint); --f: calc(var(--px) * 5); --a: var(--hw-fleck);
    filter: drop-shadow(var(--px) var(--px) 0 rgba(48,24,64,.45)); animation: twinkle 3.2s step-end infinite; }
  .hw.flecks.a { --tint: #fff6c8;
    -webkit-mask: var(--a) round(30%, var(--px)) round(4%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(8%, var(--px)) round(40%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(93%, var(--px)) round(66%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(62%, var(--px)) round(96%, var(--px)) / var(--f) var(--f) no-repeat;
    mask: var(--a) round(30%, var(--px)) round(4%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(8%, var(--px)) round(40%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(93%, var(--px)) round(66%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(62%, var(--px)) round(96%, var(--px)) / var(--f) var(--f) no-repeat; }
  .hw.flecks.b { --tint: #ffd2e6; animation-duration: 4.4s; animation-delay: -1.3s;
    -webkit-mask: var(--a) round(70%, var(--px)) round(5%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(5%, var(--px)) round(72%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(94%, var(--px)) round(30%, var(--px)) / var(--f) var(--f) no-repeat;
    mask: var(--a) round(70%, var(--px)) round(5%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(5%, var(--px)) round(72%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(94%, var(--px)) round(30%, var(--px)) / var(--f) var(--f) no-repeat; }
  .hw.flecks.c { --tint: #c8f6e6; animation-duration: 5.6s; animation-delay: -2.1s;
    -webkit-mask: var(--a) round(46%, var(--px)) round(3%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(92%, var(--px)) round(48%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(6%, var(--px)) round(55%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(36%, var(--px)) round(95%, var(--px)) / var(--f) var(--f) no-repeat;
    mask: var(--a) round(46%, var(--px)) round(3%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(92%, var(--px)) round(48%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(6%, var(--px)) round(55%, var(--px)) / var(--f) var(--f) no-repeat,
      var(--a) round(36%, var(--px)) round(95%, var(--px)) / var(--f) var(--f) no-repeat; }
  @keyframes twinkle { 0% { opacity: 1; } 40% { opacity: .25; } 55% { opacity: 1; } }
  .slide.away-slide .hw.flecks, ha-card.offscreen .hw.flecks { animation-play-state: paused; }
  @media (prefers-contrast: more) { ha-card.lcd-on .lcd, ha-card.lcd-on .ghost { display: none; } }
  /* Idle life. */
  .pet { transition: translate .25s ease-out, rotate .2s ease-out, scale .25s steps(2); }
  .pet.look { rotate: y 180deg; }
  /* A wander left turns first (_wander adds .look with it): the .2 s flip, then the slide
     (a .2 s delay on the translate). The way home is the plain .pet transition. */
  .pet.wander-l { translate: -16% 0; transition: translate .9s ease-out .2s, rotate .2s ease-out, scale .25s steps(2); }
  .pet.wander-r { translate: 16% 0; transition: translate .9s ease-out, rotate .2s ease-out, scale .25s steps(2); }
  /* The infrared link (_linkStart): the beam runs over the track between the two
     devices' top edges, where the backlight buttons sit, so it takes no taps. One
     world art pixel is --u; the sprites are 32 of them square. */
  .irbeam { position: absolute; pointer-events: none; z-index: 6; }
  .irbeam img { position: absolute; image-rendering: pixelated; pointer-events: none;
    width: calc(var(--u) * 32); height: calc(var(--u) * 32); }
  .irbeam .head { animation: ir-fly var(--ir-ms) steps(var(--ir-steps), end) forwards; }
  .irbeam .trail { opacity: 0; animation: ir-trail .01s steps(1, end) forwards; }
  .irbeam .arrive { opacity: 0; animation: ir-arrive .5s steps(4, end) forwards; }
  .irbeam.gone { opacity: 0; transition: opacity .3s steps(3, end); }
  /* Mono screen: the LCD (the screen, and the beam that flies over the glass) in the
     four tones; the plastic (shell, bezel, buttons, label, .request) keeps its colour.
     The beam's box is 1 px, so each of its images takes the filter. The backlight's
     blend, the grid and the ghost would flip or snap under the quantise: hidden here,
     and .mono-grid draws the grid again over the result. */
  .monodefs { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }
  ha-card.mono .screen, ha-card.mono .irbeam img { filter: url(#hatch-mono4); }
  /* The backlight, in mono: the glow is hidden, so the lit screen takes a filter that
     lifts the scene about one tone before the quantise. */
  ha-card.mono .screen.lit { filter: url(#hatch-mono4-lit); }
  ha-card.mono .screen .glow, ha-card.mono .screen .lcd, ha-card.mono .screen .ghost { display: none; }
  .mono-grid { position: absolute; z-index: 1; pointer-events: none; display: none;
    left: var(--mg-x, 9px); top: var(--mg-y, 9px); width: var(--mg-w, 0); height: var(--mg-h, 0); border-radius: var(--mg-r, 12px);
    background-image:
      repeating-linear-gradient(0deg, rgba(20,24,12,.08) 0 var(--lcd-line, 1px), transparent var(--lcd-line, 1px) var(--lcd-pitch, 4px)),
      repeating-linear-gradient(90deg, rgba(20,24,12,.08) 0 var(--lcd-line, 1px), transparent var(--lcd-line, 1px) var(--lcd-pitch, 4px));
    background-position: var(--lcd-x, 0) var(--lcd-y, 0); }
  ha-card.lcd-on.mono .mono-grid { display: block; }
  /* Hidden where .lcd is covered in colour: the sheet, the boot screen and a game. */
  ha-card.lcd-on.mono .screen.show-status ~ .mono-grid,
  ha-card.lcd-on.mono .screen:has(.boot:not([hidden])) ~ .mono-grid,
  ha-card.lcd-on.mono .screen:has(.game:not([hidden])) ~ .mono-grid { display: none; }
  @media (prefers-contrast: more) { ha-card.lcd-on.mono .mono-grid { display: none; } }
  @keyframes ir-fly { to { translate: var(--ir-d) 0; } }
  @keyframes ir-trail { to { opacity: 1; } }
  @keyframes ir-arrive { 0% { opacity: 1; scale: .6; } 100% { opacity: 0; scale: 1.3; } }
  .visit { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
  .visit .vband { position: absolute; left: 0; right: 0; top: 38%; height: 20%; display: flex;
    align-items: center; justify-content: center; gap: 7%; background: color-mix(in srgb, var(--d-ink) 82%, transparent); }
  .visit .vband i { width: 4%; aspect-ratio: 1; background: #ffe9ec; animation: ir-dots .9s steps(1, end) infinite; }
  .visit .vband i:nth-child(2) { animation-delay: .15s; } .visit .vband i:nth-child(3) { animation-delay: .3s; }
  .visit .vband i:nth-child(4) { animation-delay: .45s; } .visit .vband i:nth-child(5) { animation-delay: .6s; }
  @keyframes ir-dots { 0%, 100% { opacity: .25; } 40% { opacity: 1; } }
  .visit .vguest { position: absolute; left: 70%; bottom: 4%; height: 62%; margin-left: -23.25%;
    transform-origin: 50% 100%; image-rendering: pixelated; animation: ir-in .5s steps(5, end) both; }
  .visit .vguest.out { animation: ir-out .5s steps(5, end) forwards; }
  .visit .vguest.greethop { animation: hop .7s ease-in-out 2; }
  @keyframes ir-in { from { translate: 160% 0; } }
  @keyframes ir-out { to { translate: 160% 0; } }
  /* The guest came from the left (UX8 F5): the visit is mirrored, the guest at 30% facing
     right, the host on the right facing left, the reply on the left. */
  .visit.left .vguest { left: 30%; animation-name: ir-in-l; }
  .visit.left .vguest.greethop { animation: hop .7s ease-in-out 2; }
  .visit.left .vguest.out { animation: ir-out-l .5s steps(5, end) forwards; }
  @keyframes ir-in-l { from { translate: -160% 0; } }
  @keyframes ir-out-l { to { translate: -160% 0; } }
  .visit.left .vsay { right: auto; left: 5%; }
  .visit .vsay { position: absolute; right: 5%; top: 27%; max-width: 62%; padding: 5px 9px; border-radius: 10px;
    background: #fff; color: #2a2a2a; font-size: 13px; line-height: 1.25; }
  ha-card.bigtext .visit .vsay { font-size: 15px; } /* UX8 F3 */
  .screen.linking .perch { display: none; }
  .pet.linking { translate: -43% 0; transition-duration: .5s; }
  .screen.linkleft .pet.linking { translate: 43% 0; }
  .speck { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: #fff6c9;
    box-shadow: 0 0 6px 2px rgba(255,240,170,.8); top: 45%; z-index: 2; pointer-events: none;
    animation: speck 2.6s ease-in-out forwards; }
  .speck.rtl { animation-name: speck-rtl; }
  @keyframes speck { from { left: 8%; top: 30%; } 50% { top: 55%; } to { left: 88%; top: 38%; opacity: .2; } }
  @keyframes speck-rtl { from { left: 88%; top: 35%; } 50% { top: 58%; } to { left: 8%; top: 30%; opacity: .2; } }
  /* Rain for species with no rain scene of their own. */
  .rain { position: absolute; inset: 0; pointer-events: none; display: none; z-index: 1;
    background: repeating-linear-gradient(105deg, transparent 0 13px, rgba(215,230,255,.5) 13px 15px);
    background-size: 40px 40px; animation: rainfall .45s linear infinite; }
  .screen.raining .rain { display: block; }
  .screen.raining .bg { filter: brightness(.82) saturate(.75); }
  @keyframes rainfall { to { background-position: -10px 40px; } }
  /* The house answers (H3): a warm glow rising from the floor (heat) or a pale frost in the top
     corners (cool) for 2.5 s. A stand-in for the art. Neither crosses the pet's face (UX7 F3); under
     reduced motion the same tint just stays for the 2.5 s: an edge glow doesn't read as a flash. */
  .screen.fx-heat::after, .screen.fx-cool::after { content: ""; position: absolute; inset: 0; z-index: 3;
    pointer-events: none; animation: house-fx 2.5s ease-in-out both; }
  .screen.fx-heat::after { background: linear-gradient(to top, rgba(255,150,60,.35), transparent 45%); }
  .screen.fx-cool::after { background: radial-gradient(circle at 0 0, rgba(210,240,255,.5), transparent 40%),
    radial-gradient(circle at 100% 0, rgba(210,240,255,.5), transparent 40%); }
  @keyframes house-fx { 0% { opacity: 0; transform: translateY(6px); } 8%, 70% { opacity: 1; }
    100% { opacity: 0; transform: translateY(-10px); } }
  @media (prefers-reduced-motion: reduce) { .screen.fx-heat::after, .screen.fx-cool::after { animation: none; opacity: .7; } }
  /* The robot vacuum (H4): a 22x12 rounded box, dark grey with a light rim and a blinking dot,
     gliding across the floor line in 6 s. A stand-in for the house_robot art. */
  .screen.fx-robot::before { content: ""; position: absolute; left: 0; bottom: 3%; z-index: 1; width: 22px; height: 12px;
    box-sizing: border-box; border-radius: 6px; border: 2px solid #ddd; pointer-events: none;
    background: radial-gradient(circle at 70% 50%, #f55 0 1.5px, transparent 2px) #444;
    animation: robot-cross 6s linear both, robot-blink 1s steps(1) infinite; }
  @keyframes robot-cross { from { translate: -30px 0; } to { translate: calc(var(--robot-w, 400px) + 30px) 0; } }
  @keyframes robot-blink { 50% { background-color: #444; background-image: none; } }
  /* A machine finished (H6): suds rise beside the pet (the bath scene's prop_bubbles, half size, reused
     as is) for washer and dishwasher; dryer is a warm swirl, a CSS stand-in for house_tumble. 2.5 s. */
  .screen.fx-suds::before, .screen.fx-suds::after { content: ""; position: absolute; bottom: 14%; z-index: 3; width: 38px; height: 64px;
    background: center bottom / contain no-repeat; image-rendering: pixelated; pointer-events: none;
    animation: suds-rise 2.5s ease-out both; }
  .screen.fx-suds::before { left: 72%; background-image: url(${BASE}/ui/prop_bubbles_1.png?v=${VERSION}); }
  .screen.fx-suds::after { left: 81%; background-image: url(${BASE}/ui/prop_bubbles_2.png?v=${VERSION}); animation-delay: .3s; }
  @keyframes suds-rise { 0% { opacity: 0; transform: translateY(14px); } 15%, 70% { opacity: 1; }
    100% { opacity: 0; transform: translateY(-34px); } }
  .screen.fx-tumble::after { content: ""; position: absolute; left: 74%; bottom: 22%; z-index: 3; width: 48px; height: 48px;
    border-radius: 50%; pointer-events: none; animation: tumble-spin 2.5s ease-in-out both;
    background: radial-gradient(circle at 70% 30%, #e86a8a 0 5px, transparent 6px),
      conic-gradient(from 0deg, rgba(255,200,120,.85), rgba(255,160,90,.2), rgba(255,200,120,.85)); }
  @keyframes tumble-spin { 0% { opacity: 0; transform: rotate(0) scale(.5); } 15%, 70% { opacity: 1; }
    100% { opacity: 0; transform: rotate(540deg) scale(1.1); } }
  @media (prefers-reduced-motion: reduce) { .screen.fx-suds::before, .screen.fx-suds::after, .screen.fx-tumble::after { animation: none; opacity: .7; } }
  @media (prefers-reduced-motion: reduce) { .screen.fx-robot::before { animation: none; left: 40%; } }
  /* A doorbell press (H5): two notes pop up above the pet's head for 1.8 s. A text stand-in for
     the house_chime art (H9). Still, and visible, under reduced motion. */
  .screen.fx-chime::after { content: "♪ ♫"; position: absolute; left: 58%; top: 26%; z-index: 3; translate: -50% 0;
    font-size: 20px; line-height: 1; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.6), 0 0 6px rgba(255,230,140,.8);
    pointer-events: none; animation: chime-pop 1.8s ease-out both; }
  @keyframes chime-pop { 0% { opacity: 0; transform: translateY(10px) scale(.6); } 15%, 70% { opacity: 1; transform: none; }
    100% { opacity: 0; transform: translateY(-12px); } }
  @media (prefers-reduced-motion: reduce) { .screen.fx-chime::after { animation: none; opacity: 1; } }
  /* Water worlds: lighter streaks, and rings where the drops land. */
  .screen.raining.watery .rain { opacity: .6; }
  .screen.raining.watery .rain::after { content: ""; position: absolute; inset: 0;
    background:
      radial-gradient(ellipse 10% 4% at 22% 80%, transparent 55%, rgba(255,255,255,.95) 62%, transparent 75%),
      radial-gradient(ellipse 10% 4% at 72% 70%, transparent 55%, rgba(255,255,255,.95) 62%, transparent 75%),
      radial-gradient(ellipse 10% 4% at 50% 90%, transparent 55%, rgba(255,255,255,.95) 62%, transparent 75%);
    animation: ripple 1.4s ease-out infinite; }
  @keyframes ripple { 0% { opacity: 0; transform: scale(.7); } 30% { opacity: 1; } 100% { opacity: 0; transform: scale(1.25); } }
  /* Off to one side, but never past the screen's edge: the pet's box is 46.5% of the screen,
     grown by --k (its scale) about its middle, so its edge reaches 0 at 107.5% - k * 50%. */
  .pet.go-left, .perch.go-left, .ghost.go-left, .screen .pat.go-left {
    translate: max(var(--go, 60%) * -1, var(--k, 1) * 50% - 107.5%) 0; }
  .pet.go-right, .perch.go-right, .ghost.go-right, .screen .pat.go-right {
    translate: min(var(--go, 60%), 107.5% - var(--k, 1) * 50%) 0; }
  /* What the pet stands on (species.json "perch"); it follows the pet around. */
  .perch, .screen .pat { transition: translate .25s ease-out; }
  .perch.wander-l, .screen .pat.wander-l { translate: -16% 0; transition-duration: .9s; transition-delay: .2s; } /* after the pet's turn */
  .perch.wander-r, .screen .pat.wander-r { translate: 16% 0; transition-duration: .9s; }
  .status { --sheet-bg: #e9e2c6; position: absolute; inset: 0; background: var(--sheet-bg); color: #2f3a24; padding: var(--sy, 9px) var(--sx, 12px);
    display: none; flex-direction: column; gap: 4px; font-size: 13px; overflow: auto; }
  .screen.show-status .status { display: flex; }
  /* The status draws as a handheld's menu does (UX fix 2, F13): four steps down on open, four
     across between its pages. Reduced motion makes both instant (the global rule). */
  @keyframes lcd-wipe-down { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0); } }
  @keyframes lcd-wipe-side { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0); } }
  @keyframes lcd-wipe-up { from { clip-path: inset(0); } to { clip-path: inset(0 0 100% 0); } }
  .status:focus { outline: none; } /* focused by a tap inside it, so Escape reaches it (UX fix 2, F4) */
  .screen .status.wipe-down { animation: lcd-wipe-down .16s steps(4) both; }
  .screen .status.wipe-side { animation: lcd-wipe-side .16s steps(4) both; }
  /* closing: show-status is already off; the page is drawn over the screen for the wipe and ignores taps */
  .screen .status.wipe-up { display: flex; pointer-events: none; animation: lcd-wipe-up .16s steps(4) both; }
  /* The backlight lights the menus too (F10): the sheet and its back band lift toward the glow's
     mint, a faint lift by day and a stronger one in the dark, fading out with the glow. */
  .status, .shead { transition: background-color .6s ease-out; }
  /* At night and dim the sheet and the bubble sink into the dark LCD instead of staying daylight-bright
     (UX7 F5); the backlight (.lit, below) still lifts the sheet. Dark ink stays above 7:1. */
  .screen.night .status, .screen.dim .status { --sheet-bg: color-mix(in srgb, #e9e2c6 72%, #1d2440); }
  .screen.night .bubble, .screen.dim .bubble { background: color-mix(in srgb, #fffdf5 80%, #1d2440); }
  .screen.lit .status { --sheet-bg: color-mix(in srgb, #e9e2c6 55%, #dffbf2); }
  .screen.lit.night .status, .screen.lit.dim .status, .screen.lit.faded .status { --sheet-bg: color-mix(in srgb, #e9e2c6 15%, #dffbf2); }
  .screen.lit .status, .screen.lit .shead { transition: none; }
  .screen.show-status .bubble { display: none; }
  /* Power-on: a plain pale-green LCD with the logo, over everything on the screen. */
  .boot { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 14px; margin: 0; padding: 0; border: 0;
    border-radius: inherit; cursor: pointer; font: 400 14px 'Tiny5', monospace; color: #2f3a24;
    background: linear-gradient(rgba(47,58,36,.1) 1px, transparent 1px) 0 0 / 4px 4px,
      linear-gradient(90deg, rgba(47,58,36,.1) 1px, transparent 1px) 0 0 / 4px 4px, #c6d4a0; }
  .boot[hidden] { display: none; }
  /* The low-battery gag: a pixel battery (empty, one bar, full) top-right; the screen blanks twice. */
  .batt { position: absolute; top: 8px; right: 12px; z-index: 4; width: 36px; height: 18px;
    box-sizing: border-box; border: 3px solid #2f3a24; background: #c6d4a0; display: flex; gap: 3px;
    padding: 3px; pointer-events: none; }
  .batt[hidden] { display: none; }
  .batt::after { content: ""; position: absolute; right: -6px; top: 3px; width: 3px; height: 6px;
    background: #2f3a24; }
  .batt b { flex: 1; background: #2f3a24; visibility: hidden; }
  .batt[data-level="1"] b:first-child, .batt[data-level="3"] b { visibility: visible; }
  .batt[data-level="1"].blink b:first-child { animation: bootblink .8s steps(1) infinite; }
  .screen.blank > *:not(.batt) { visibility: hidden; }
  .booting .buttons, .booting .request { visibility: hidden; }
  .boot .logo { position: relative; font-size: 46px; line-height: 1; letter-spacing: 2px; }
  .boot .logo span { display: block; text-shadow: 2px 2px 0 rgba(47,58,36,.35); }
  .boot .logo .ink { color: #9aaa72; }
  .boot .logo .fill { position: absolute; inset: 0; color: #2f3a24; clip-path: inset(0 100% 0 0);
    transition: clip-path ${BOOT_FILL_MS}ms steps(8); }
  .boot.filling .logo .fill { clip-path: inset(0); }
  .boot .go { animation: bootblink 1.2s steps(1) infinite; }
  @keyframes bootblink { 50% { opacity: 0; } }
  /* The pet's request waits while the status screen or a game is up (it covered them). */
  .screen.show-status ~ .request, .screen:has(> .game:not([hidden])) ~ .request { display: none !important; }
  /* So does an open question: the pill sat over the third answer (UX fix 3, F1). */
  .screen:has(> .askday) ~ .request { display: none !important; }
  /* With a game up, the bubble leaves room for its close button. */
  .screen:has(> .game:not([hidden])) .bubble { max-width: 54%; }
  /* A narrow card: status rows fit four hearts. */
  .compact .row { grid-template-columns: 16px 70px minmax(0, 1fr); gap: 5px; }
  .compact .hearts img { flex-basis: 14px; width: 14px; }
  /* Every row: an icon slot (maybe empty), the label, the value; all on one grid. */
  .row { display: grid; grid-template-columns: 18px 84px minmax(0, 1fr); align-items: center; gap: 6px; }
  ha-card:not(.bigtext) .porthole .row { grid-template-columns: 16px 60px minmax(0, 1fr); gap: 5px; } /* the rim cuts the value column (UX8 F7) */
  /* The nature row (N3) holds a 40-60 character note, which the narrow value column (about 54px at 300, 44 in
     big text) wrapped to 8 lines of one or two words: where the column is narrow (a compact card, which every
     viewport under 420 is, and big text) the label sits on its own line and the note runs full width below it. The wide card keeps the row. */
  .compact .row.naturerow, ha-card.bigtext .row.naturerow { grid-template-columns: 18px minmax(0, 1fr); row-gap: 2px; }
  .compact .row.naturerow > :last-child, ha-card.bigtext .row.naturerow > :last-child { grid-column: 1 / -1; }
  .bar { height: 9px; border: 2px solid #2f3a24; padding: 1px; }
  .bar div { height: 100%; background: #2f3a24; }
  .hearts { letter-spacing: 2px; }
  .hearts .off { opacity: .25; }
  .jolder { display: block; border: none; background: none; padding: 0; min-height: 44px; min-width: 44px;
    font: 400 12px 'Tiny5', monospace; color: inherit; text-decoration: underline; cursor: pointer; }
  .jlink { align-self: flex-end; margin-top: 2px; border: none; background: none; padding: 0;
    min-height: 44px; min-width: 44px;
    font: 400 12px 'Tiny5', monospace; color: inherit; text-decoration: underline; cursor: pointer; }
  /* A sheet row (UX fix 1, F5): the label takes the room, the switch sits at the right edge,
     so the switches line up in one column; no empty icon slot. */
  /* The friends row is a button (UX8 F9): a 44 px target, like every other control. */
  .row.friendsrow { box-sizing: border-box; min-height: 44px; cursor: pointer; }
  .row.srow, .compact .row.srow { grid-template-columns: minmax(0, 1fr) fit-content(60%); }
  .srow > :last-child { justify-self: end; text-align: right; }
  /* The status view's gear and the settings sheet's back row and headings. */
  .shead { position: sticky; top: calc(var(--sy, 9px) * -1); z-index: 1; display: flex; align-items: center;
    margin-top: calc(var(--sy, 9px) * -1); padding-top: calc(var(--sy, 9px) - 6px); background: var(--sheet-bg); }
  /* The pet's head and name at the status band's left (UX fix 2, F10). */
  .who { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 13px; }
  .whohead { flex: none; width: 28px; height: 28px; image-rendering: pixelated;
    background: var(--say-img, none) var(--say-at, 0 0) / var(--say-size, 75px) var(--say-size, 75px) no-repeat; }
  .whoname { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gear { margin-left: auto; display: flex; align-items: center; justify-content: center;
    min-width: 44px; min-height: 44px; padding: 0 5px; border: none; background: none;
    color: inherit; cursor: pointer; }
  /* A deeper page's heading (journal, finds, every world), right of its back link (UX fix 2, F3). */
  .stitle { margin-left: auto; min-width: 0; padding: 0 0 0 8px; text-align: right; font-size: 12px; line-height: 1.1; }
  .sec.lc { text-transform: none; font-size: 12px; letter-spacing: 0; }
  .sback { border: none; background: none; padding: 0; min-height: 44px; min-width: 44px; color: inherit;
    font: 400 12px 'Tiny5', monospace; text-decoration: underline; cursor: pointer; }
  .sec { margin-top: 4px; padding-bottom: 2px; border-bottom: 2px dotted #2f3a24;
    font-size: 11px; letter-spacing: 1px; text-transform: uppercase; }
  /* The pet's shell: a swatch and its name; on a shared screen dimmed and dashed. */
  .sw { display: inline-block; flex: none; box-sizing: border-box; width: 26px; height: 20px;
    border: 2px solid #2f3a24; image-rendering: pixelated; }
  .shellrow, .shellro { display: inline-flex; align-items: center; gap: 5px; }
  .shellrow .sw, .shellro .sw { width: 18px; height: 14px; }
  .shellro { opacity: .6; }
  .shellro .sw { border-style: dashed; }
  .shellnote { font-size: 11px; }
  /* A small sub-heading inside a group (S7: sound, look under "this screen"): no rule, the same ink as .sec. Not .sub: that is the header's paler subtitle. */
  .ssub { margin-top: 2px; font-size: 11px; letter-spacing: 1px; }
  /* The bedtime row: the label as wide as it is, the target takes the rest and wraps by itself. */
  .row.srow.sleeprow, .compact .row.srow.sleeprow { grid-template-columns: auto minmax(0, 1fr); }
  /* The shell picker: three tiles a row; a locked one dimmed and dashed. */
  .tiles { flex: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 4px; }
  .tiles:last-of-type { padding-bottom: 6px; } /* the last row scrolls clear of the bar */
  .tile { display: flex; flex-direction: column; align-items: center; gap: 0; min-width: 0;
    box-sizing: border-box; min-height: 44px; justify-content: center;
    padding: 1px; border: 2px solid transparent; border-radius: 6px; background: none; color: inherit;
    font: 400 11px 'Tiny5', monospace; line-height: 1; text-align: center; cursor: pointer; }
  .tile .tname { max-width: 100%; overflow-wrap: anywhere; }
  .tile .tsub { font-size: 10px; }
  .tile .tsub:empty { display: none; }
  .tile.sel { border-color: #2f3a24; }
  .tile.locked .sw { opacity: .45; border-style: dashed; }
  .tile.locked .tname { opacity: .65; }
  /* The picker's back row ("use" at its right end): a full-width band of the screen's own
     colour, so the list scrolls out of sight under it; its headings sit closer. */
  .status:has(.pback) { gap: 2px; }
  .status:has(.pback) .sec { margin-top: 1px; }
  .shead:has(.pback) { z-index: 2; margin: calc(var(--sy, 9px) * -1) calc(var(--sx, 12px) * -1) 0;
    padding: calc(var(--sy, 9px) - 9px) var(--sx, 12px) 0; }
  .puse { margin-left: auto; }
  .bell[aria-disabled="true"] { opacity: .55; cursor: default; }
  /* A narrow card: tighter still, so two whole rows of tiles show under the back row. */
  .compact .status:has(.pback) { gap: 1px; }
  .compact .status:has(.pback) .sec { margin-top: 0; padding-bottom: 1px; }
  .compact .tile { padding: 0 1px; font-size: 10px; }
  .compact .tile .tsub { font-size: 9px; }
  .bell { border: 2px solid #2f3a24; border-radius: 10px; background: none; color: inherit;
    font: 400 12px 'Tiny5', monospace; padding: 3px 10px; min-width: 44px; min-height: 44px;
    cursor: pointer; }
  .bell[aria-pressed="true"] { background: #2f3a24; color: #e9e2c6; }
  .bell.pending { opacity: .65; }
  /* The lay sheet (plan S2): the offer as a list; a choice made in HA is dashed, read-only. */
  .laylist { display: flex; flex-direction: column; gap: 4px; padding-bottom: 6px; }
  .laygo { margin-left: auto; }
  .layrow { box-sizing: border-box; width: 100%; text-align: left; }
  .layrow.ro { display: flex; align-items: center; border-style: dashed; cursor: default;
    background: #2f3a24; color: #e9e2c6; }
  /* The name sheet (plan S3): the lay sheet's band (keep at the left, "name it" at the right), the
     field in the sheet's own ink, and the error line under it. 16px in the field so a phone's
     browser doesn't zoom in on it. */
  .namego { margin-left: auto; flex: none; }
  .nameback { min-width: 0; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nameinput { box-sizing: border-box; width: 100%; min-height: 44px; margin-top: 4px; padding: 3px 10px;
    border: 2px solid #2f3a24; border-radius: 10px; background: transparent; color: inherit;
    font: 400 16px 'Tiny5', monospace; }
  .nameinput:focus-visible { outline: 2px solid #2f3a24; outline-offset: 2px; }
  .nameerr { padding: 4px 2px 0; font-size: 12px; }
  .nameval { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; min-width: 0; }
  .nameval .nm { min-width: 0; overflow-wrap: anywhere; }
  .nameval .bell { flex: none; }
  .game button[aria-disabled="true"] { opacity: .55; }
  .status-feedback { position: sticky; bottom: 0; margin-top: auto; padding: 5px 7px;
    background: #2f3a24; color: #e9e2c6; font-size: 12px; min-height: 14px; }
  /* The pet speaking (F13): a bubble with its head, hung under the back band; taps go through. */
  .status-feedback.say { position: absolute; top: 100%; left: 0; right: 0; bottom: auto; margin: 2px 0 0;
    z-index: 3; pointer-events: none; display: flex; align-items: center; gap: 6px; min-height: 34px;
    box-sizing: border-box; padding: 3px 8px 3px 5px; border: 2px solid #2f3a24; border-radius: 10px;
    background: #fbf7e6; color: #2f3a24; line-height: 1.15; }
  .status-feedback.say[hidden] { display: none; }
  .status-feedback.say::before { content: ""; flex: none; width: 28px; height: 28px;
    background: var(--say-img, none) var(--say-at, 0 0) / var(--say-size, 75px) var(--say-size, 75px) no-repeat; image-rendering: pixelated; }
  .shead:has(.pback) .status-feedback.say { left: var(--sx, 12px); right: var(--sx, 12px); }
  .jdream, .stoday { font-size: 13px; color: var(--hp-subink); margin: 2px 0 4px; } /* today's dream, today's line (E9) */
  .jweek { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 13px; margin: 0 0 6px; } /* E14 */
  .jweek .wday { display: inline-flex; align-items: center; gap: 3px; }
  .jweek .wday b { font-weight: 600; font-size: 11px; opacity: .8; }
  .jweek img { width: 18px; height: 18px; image-rendering: pixelated; }
  .jgrid { display: flex; flex-wrap: wrap; gap: 6px 10px; }
  .jtile { display: flex; flex-direction: column; align-items: center; width: 64px; font-size: 11px;
    text-align: center; line-height: 1.1; }
  .jtile img { width: 48px; height: 48px; image-rendering: pixelated; }
  .jtile.locked img { filter: brightness(0); opacity: .3; }
  /* The journal's foot (back to the status, on to the finds) and the finds page (V-D):
     a visitor at 18 cells and a find at 16 (--px a cell: their art 1:1 in whole device
     pixels), the unmet ones dark silhouettes with no name, the viewer's gifts with a ♥. */
  .jfoot { display: flex; justify-content: flex-end; align-items: flex-end; }
  .flink, .wlink { align-self: flex-end; margin-top: 2px; border: none; background: none; padding: 0;
    min-height: 44px; min-width: 44px;
    font: 400 12px 'Tiny5', monospace; color: inherit; text-decoration: underline; cursor: pointer; }
  .fgrid { display: flex; flex-wrap: wrap; gap: 6px 8px; }
  .fgrid + .fgrid { margin-top: 4px; padding-top: 6px; border-top: 2px dotted #2f3a24; }
  .ftile { position: relative; display: flex; flex-direction: column; align-items: center;
    width: max(calc(var(--px, 2px) * 18), 62px); font-size: 11px; text-align: center; line-height: 1.1;
    overflow-wrap: break-word; }
  .ftile img { width: calc(var(--px, 2px) * 16); height: calc(var(--px, 2px) * 16); image-rendering: pixelated; }
  .ftile.vis img { width: calc(var(--px, 2px) * 18); height: calc(var(--px, 2px) * 18); }
  .ftile.locked img { filter: brightness(0); opacity: .3; }
  ha-card.mono .ftile.locked img { opacity: .5; }
  .ftile .fheart { position: absolute; top: 0; right: 0; font-size: 12px; line-height: 1; }
  .jlist { font-size: 12px; opacity: .9; display: flex; flex-direction: column; gap: 3px; }
  /* Big text (top10 4b): every size on the status box's pages, about 3 px up. */
  ha-card.bigtext .status { font-size: 16px; }
  ha-card.bigtext .status .log, ha-card.bigtext .status .jlist, ha-card.bigtext .status .photos,
  ha-card.bigtext .status .status-feedback, ha-card.bigtext .status .sback, ha-card.bigtext .status .jlink,
  ha-card.bigtext .status .flink, ha-card.bigtext .status .wlink, ha-card.bigtext .status .jolder,
  ha-card.bigtext .status .fheart { font-size: 15px; }
  ha-card.bigtext .status .layrow, ha-card.bigtext .status .laygo,
  ha-card.bigtext .status .namego, ha-card.bigtext .status .namechange, ha-card.bigtext .status .nameerr { font-size: 15px; }
  ha-card.bigtext .status .nameinput { font-size: 18px; }
  ha-card.bigtext .status .sec, ha-card.bigtext .status .ssub, ha-card.bigtext .status .shellnote, ha-card.bigtext .status .jtile,
  ha-card.bigtext .status .ftile, ha-card.bigtext .status .tile { font-size: 13px; }
  ha-card.bigtext .status .tile .tsub { font-size: 12px; }
  ha-card.bigtext.compact .status .tile { font-size: 12px; } /* "tidepool" whole in the porthole's three columns */
  ha-card.bigtext.compact .status .tile .tsub { font-size: 11px; }
  .photos { display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
  .prow { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 2px; }
  .print { margin: 0; flex: none; display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .screen .status .print img { width: 72px; height: 91px; box-shadow: 2px 2px 0 rgba(58,42,26,.35); }
  .photo-dialog { width: min(300px, 90vw); box-sizing: border-box; padding: 12px; border: 3px solid #3a2a1a;
    border-radius: 12px; background: #e9e2c6; color: #2f3a24; font: 400 13px 'Tiny5', monospace; text-align: center; }
  .photo-dialog::backdrop { background: rgba(20, 16, 10, .65); }
  /* Press and hold to save: nothing here blocks the long-press menu. */
  .photo-dialog .pbig { display: block; width: 100%; height: auto; -webkit-touch-callout: default; user-select: auto; }
  .photo-dialog p { margin: 8px 0 4px; }
  .photo-dialog a { display: block; margin: 4px 0 8px; color: inherit; word-break: break-all; }
  .photo-dialog a[hidden], .photo-dialog p[hidden] { display: none; }
  .jlist .gt { padding-left: 10px; }
  .ticon { width: 14px; height: 14px; object-fit: contain; vertical-align: -3px; margin-right: 2px;
    image-rendering: pixelated; }
  .tnext { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .tnext .bar { flex: 1; min-width: 30px; }
  /* A long trait wraps rather than push its bar off the box (big text at 330, fm-batch-043). */
  .tnext .tname { min-width: 0; overflow-wrap: anywhere; }
  .jlist .gen.now { font-weight: 700; }
  .log { margin-top: 3px; font-size: 12px; opacity: .85; }
  .buttons { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px 6px; width: 100%; }
  .toy { display: flex; flex-direction: column; align-items: center; gap: 5px; border: none;
    background: none; padding: 0; cursor: pointer; font: 400 13px 'Tiny5', monospace;
    letter-spacing: .02em; border-radius: 12px;
    color: var(--d-ink); -webkit-tap-highlight-color: transparent; }
  .picon { image-rendering: pixelated; display: block; pointer-events: none; }
  .title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .emblem { width: 32px; height: 32px; image-rendering: pixelated; }
  .deco { position: absolute; bottom: 6%; width: 48px; height: 48px; image-rendering: pixelated;
    pointer-events: none; transition: opacity .5s; }
  .deco.left { left: 4%; } .deco.right { right: 4%; }
  .compact .deco { display: none; }
  .screen.faded .bg { filter: brightness(.55) saturate(.8); }
  .screen .status img { position: static; } /* not scene sprites */
  .row .picon { width: 18px; height: 18px; }
  .hearts { display: flex; gap: 3px; }
  /* The hearts shrink to the value column (UX8 F7): five of them clipped in the porthole at 300. */
  .hearts img { flex: 0 1 18px; min-width: 0; width: 18px; height: auto; aspect-ratio: 1; image-rendering: pixelated; }
  /* A cap is a domed button cut on the grid (_mould): its face is the cap's own
     background, its side (below the box) and the light on it are pseudo-elements, and
     it sinks two cells when pressed. */
  .toy { gap: calc(var(--px, 2px) * 3 + 2px); }
  .toy .cap { position: relative; width: calc(var(--px, 2px) * var(--cap-n, 23));
    height: calc(var(--px, 2px) * var(--cap-n, 23)); display: flex; align-items: center; justify-content: center;
    background: #fff7ec; color: #3a2a1a; clip-path: var(--cap-clip);
    transition: translate var(--rebound-ms, .12s) var(--rebound, cubic-bezier(.3, 2, .5, 1)), background .2s, filter .25s; }
  .toy .cap::before, .toy .cap::after { content: ""; position: absolute; left: 0; top: 0; width: 100%;
    height: calc(var(--px, 2px) * (var(--cap-n, 23) + 3)); z-index: -1; pointer-events: none; }
  .toy .cap::before { background: var(--d-btn-shadow); clip-path: var(--cap-side); }
  .toy .cap::after { background: var(--cap-tones) 0 0 / 100% 100%; }
  .toy .cap > * { position: relative; }
  /* Pressed: held down for at least 160 ms so even a quick tap reads as a press. */
  .toy:active .cap, .toy.pressed .cap { translate: 0 calc(var(--px, 2px) * 2);
    clip-path: var(--cap-clip-dn); transition-duration: .04s, .2s, .25s; transition-timing-function: ease-out; }
  .toy:active .cap::before, .toy.pressed .cap::before { clip-path: var(--cap-side-dn); }
  .toy:active .cap::after, .toy.pressed .cap::after { background-image: var(--cap-tones-dn);
    height: calc(var(--px, 2px) * (var(--cap-n, 23) + 1)); }
  /* Release: the cap's own transition overshoots as it comes back up (the rebound; the
     .toy button, the hit target, does not move). Each action has its own curve, the rest the
     default above. A cap's state never uses transform or an animation of it (the pressed
     offset is translate), so nothing here can cancel another move. */
  .toy[data-action="feed"] .cap { --rebound: cubic-bezier(.3, 1.7, .5, 1); --rebound-ms: .14s; }
  .toy[data-action="play"] .cap { --rebound: cubic-bezier(.3, 2.8, .5, 1); --rebound-ms: .12s; }
  .toy[data-action="clean"] .cap { --rebound: cubic-bezier(.2, 2.4, .6, .6); --rebound-ms: .1s; }
  .toy[data-action="medicine"] .cap { --rebound: cubic-bezier(.3, 1.25, .5, 1); --rebound-ms: .09s; }
  .toy[data-action="lights"] .cap { --rebound: cubic-bezier(.3, .9, .5, 1); --rebound-ms: .14s; }
  /* Pending (_call: the service call is out) and failed (it was rejected): tones only. Both
     have a still value, so reduced motion (no animation, no transition) shows them too. Failed
     wins over pending. A refusal is not a failure and shows nothing here. */
  .toy.pending .cap { filter: brightness(.94); animation: waiting .9s ease-in-out infinite; }
  @keyframes waiting { 50% { filter: brightness(.86); } }
  .toy.failed .cap { animation: none; filter: saturate(.35) brightness(.88); }
  .burst { position: absolute; left: 50%; top: 0; width: 46px; height: 46px; margin-left: -23px;
    border-radius: 50%; pointer-events: none; border: 3px solid #ffe9a8;
    animation: burst .45s ease-out forwards; }
  @keyframes burst { from { transform: scale(.6); opacity: .9; } to { transform: scale(1.5); opacity: 0; } }
  .toy { position: relative; }
  .screen .askday { position: absolute; left: 0; right: 0; bottom: 3%; display: flex; gap: 8px;
    flex-wrap: wrap; justify-content: center; z-index: 3; margin: 0 auto; }
  .screen .askday.many { max-width: 236px; } /* three a row at most */
  .screen .askday.many.wide { max-width: 100%; }
  .screen .askday.wide button { min-width: 52px; padding: 4px 6px; }
  .screen .askday.asktext input { font: inherit; font-size: 16px; min-height: 44px; width: 9.5em; max-width: 46%;
    border-radius: 14px; border: 2px solid #3a2a1a; padding: 2px 10px; box-sizing: border-box; } /* F1; 16 px: no iOS zoom */
  /* Memory's tag chips (plan M2), inside the text step's box above the input: the prompt, then
     one wrapping row of small chips (the picked one filled), kept low so the box leaves the
     bubble its line: 28 px chips, three rows at 300-330, two at 420. */
  .screen .askday.asktext .tagq { flex-basis: 100%; text-align: center; font-size: 11px; line-height: 14px;
    color: #3a2a1a; background: #fffdf5; border-radius: 8px; padding: 0 6px; margin: 0 auto -2px; max-width: max-content; }
  .screen .askday.asktext .tags { flex-basis: 100%; display: flex; flex-wrap: wrap; justify-content: center; gap: 3px; }
  .screen .askday.asktext .tags button.tag, .compact .screen .askday.asktext .tags button.tag { min-height: 28px;
    min-width: 0; font-size: 11px; line-height: 1; padding: 0 6px; border-radius: 9px; border-width: 2px;
    box-shadow: 0 2px 0 #3a2a1a; }
  /* The picked chip is inverted (dark fill, light text), not only yellow: the mono LCD look turns
     #ffe9a8 and #fffdf5 into one tone, and a player there must still see which tag is picked. */
  .screen .askday.asktext .tags button.tag[aria-pressed="true"] { background: #3a2a1a; color: #fffdf5; }
  .compact .screen .askday.asktext .tags { gap: 2px; }
  .compact .screen .askday.asktext .tags button.tag { min-height: 26px; padding: 0 4px; }
  .compact .screen .askday { gap: 4px; bottom: 2%; }
  .compact .screen .askday.many { max-width: 100%; }
  .compact .screen .askday button { min-height: 44px; min-width: 44px;
    font-size: 12px; padding: 2px 7px; border-radius: 10px; }
  /* The birthday's steppers (F10): "‹ Feb ›", one chip each, 44 px keys either side. */
  .screen .askday .stepper { display: flex; align-items: center; border: 2px solid #3a2a1a; border-radius: 14px;
    background: #fffdf5; box-shadow: 0 4px 0 #3a2a1a; color: #3a2a1a; }
  .screen .askday .stepper output { min-width: 24px; padding: 0 3px; text-align: center; font-size: 14px; }
  .compact .screen .askday .stepper output { padding: 0; font-size: 13px; } /* both steppers fit one row at 330 */
  .screen .askday .stepper button.stepb { min-width: 44px; padding: 0; border: 0; background: transparent;
    box-shadow: none; font-size: 22px; border-radius: 12px; }
  .compact .screen .askday .stepper button.stepb { min-width: 40px; font-size: 20px; }
  /* The birthday: steppers, ok and skip in one row where the screen is wide enough (420), with
     slimmer keys (still 44 px tall); at 330 the steppers take one row and ok, skip the next. */
  ha-card:not(.compact) .screen .askday.bdaybox { gap: 4px; }
  .screen .askday.bdaybox .stepper button.stepb { min-width: 34px; }
  .screen .askday.bdaybox .stepper output { min-width: 0; padding: 0 2px; }
  ha-card:not(.compact) .screen .askday.bdaybox > button { min-width: 40px; padding: 4px 6px; }
  .screen .askday .stepper button.stepb:active { transform: none; background: #ffe9a8; }
  .screen .askday button { font: inherit; font-size: 14px; min-height: 44px; min-width: 64px; padding: 4px 10px;
    border-radius: 14px; border: 2px solid #3a2a1a; background: #fffdf5; color: #3a2a1a;
    box-shadow: 0 4px 0 #3a2a1a; transition: transform .08s, box-shadow .08s; }
  .screen .askday button:active { transform: translateY(3px); box-shadow: 0 1px 0 #3a2a1a; }
  /* Keeping its catchphrase can be a long label ("slow and steady"): smaller, and
     wrapping inside the button if it must, so the five choices stay in two rows. */
  .screen .askday button[data-answer="keep"] { font-size: 12px; white-space: normal;
    max-width: calc(100% - 72px); }
  .screen.show-status .askday { display: none; }
  /* In the porthole the round rim cuts a full-width row: the chips take the bubble's inset (F7). */
  .porthole .screen .askday { left: 4%; right: 4%; bottom: 6%; gap: 3px; }
  /* While it asks, the pet steps back (2 steps; none under reduced motion) so the chips
     don't hide it, and its perk then looks at you (F8). --k is its own scale. */
  .screen:has(> .askday) .pet, .screen:has(> .askday) .perch, .screen:has(> .askday) .ghost {
    translate: var(--ask-dx, 0px) var(--ask-dy, -14%); /* _askPlace measures the chips and the bubble */
    scale: calc(var(--k, 1) * var(--ask-f, .9)) !important; } /* !important: the species scale is inline */
  .screen:has(> .askday) .pet { transition: translate .25s steps(2), rotate .2s ease-out, scale .25s steps(2); }
  /* Beside the bubble (UX7 F1): it wraps in the room left of the pet's column. No room at all: the
     pet's head sits in the bubble and the pet itself waits out the question. */
  .screen:has(> .askday) .bubble { max-width: var(--ask-bw, 64%); }
  .screen:has(> .askday.nopet) .bubble { top: 2%; padding: 1px 6px 1px 36px; min-height: 20px; font-size: 12px; line-height: 1.15; }
  .porthole .screen:has(> .askday.nopet) .bubble { top: 4%; left: 7%; }
  .screen .askday.nopet { bottom: 2%; } /* the chips and the bubble share the whole height */
  .porthole .screen .askday.nopet { bottom: 2%; }
  .screen:has(> .askday.nopet) .bubble::before { content: ""; position: absolute; left: 4px; top: 50%;
    width: 28px; height: 28px; margin-top: -14px; image-rendering: pixelated;
    background: var(--say-img, none) var(--say-at, 0 0) / var(--say-size, 75px) var(--say-size, 75px) no-repeat; }
  .screen:has(> .askday.nopet) .pet, .screen:has(> .askday.nopet) .perch, .screen:has(> .askday.nopet) .ghost { visibility: hidden; }
  /* Big text reaches the pet's words too (F9). */
  ha-card.bigtext .bubble { font-size: 16px; }
  /* Big text reaches the game (UX fix 6, F10): the score, the guess labels and the picker. */
  ha-card.bigtext .game .gscore { font-size: 14px; }
  ha-card.bigtext.compact .game .gscore.two { font-size: 12px; }
  ha-card.bigtext .game .gpick.wrap button { font-size: 14px; }
  ha-card.bigtext .game .gpick.wrap.tight button { font-size: 13px; }
  ha-card.bigtext .game .gpick.wrap.snug button { font-size: 12px; }
  ha-card.bigtext .screen .askday button { font-size: 15px; }
  .screen .bondhearts img, .screen .linkhearts img, .screen .carehearts img { position: absolute; left: calc(50% + var(--x)); top: 52%; width: 18px; height: auto;
    opacity: 0; image-rendering: pixelated; pointer-events: none; z-index: 2; animation: bondheart 1.6s ease-out forwards; }
  @keyframes bondheart { 0% { transform: translateY(0) scale(.7); opacity: 0; } 20% { opacity: 1; }
    100% { transform: translateY(-70px) scale(1); opacity: 0; } }
  .pet.perk { animation: perk .3s ease-out; }
  .pet.spin { animation: spin .9s ease-in-out; } /* an adult's trick (fresh-expand LS-a) */
  .pet.bighop { animation: bighop .7s ease-in-out 2; } /* the promise's payoff (F3): 1.4x a hop */
  @keyframes bighop { 50% { transform: translateY(-12.6%); } }
  @keyframes spin { to { rotate: y 360deg; } }
  @keyframes perk { 40% { transform: translateY(-6%) scale(1.04, .96); } }
  .toy.wanted .cap { background: #ffe9a8; }
  /* Wanted: a ring of light round the cap, cut on the grid too. */
  .toy.wanted::before { content: ""; position: absolute; top: calc(var(--px) * -2); left: calc(var(--cap-x, 0px) - var(--px) * 2);
    z-index: -1; width: calc(var(--px) * (var(--cap-n) + 4)); height: calc(var(--px) * (var(--cap-n) + 7));
    background: #ffd76a; clip-path: var(--cap-halo);
    pointer-events: none; }
  .toy.on .cap { background: #3a2a1a; color: #ffe9a8; }
  .toy[disabled] { opacity: .45; cursor: default; }
  /* Shell modes (card-mode.js): the eight caps take the mode's tint, one colour for every game (owner
     decision D5). The rule outranks every finish's cap rule (.finish-* .toy:nth-child(..) .cap, 0,4,0) and
     the wanted/on rule (.device[class*="finish-"] .toy.on .cap, 0,5,0) at 0,6,0, and comes after them;
     --cap-tones (the shading) stays, so only the colour changes. tests/js/shell_modes.test.js holds the
     specificity, the bench (--mode probe) the computed colour on every finish. */
  .device.moded .buttons > .toy.tinted .cap { background: var(--mode-tint, #c4e2f2); color: #3a2a1a; }
  /* The swap's one rebound: down a press's depth for 90 ms, then the cap's own release curve (translate,
     never transform: AGENTS.md's motion rule). Reduced motion never sets the class (calm()). */
  .toy.swap .cap { translate: 0 calc(var(--px, 2px) * 2); transition-duration: .04s, .2s, .25s; transition-timing-function: ease-out; }
  /* A slot that stays pressed (its on(s): Hop's armed special) is held down, not the lights' dark .on. */
  .toy.armed .cap { translate: 0 calc(var(--px, 2px) * 2); clip-path: var(--cap-clip-dn); }
  .toy.armed .cap::before { clip-path: var(--cap-side-dn); }
  .toy.armed .cap::after { background-image: var(--cap-tones-dn); height: calc(var(--px, 2px) * (var(--cap-n, 23) + 1)); }
  /* Blocked (aria-disabled, still focusable) reads dimmer than live; off is native [disabled] above. */
  .toy[aria-disabled="true"] { opacity: .6; cursor: default; }
  .toy .cap .glyph { font: 400 20px 'Tiny5', monospace; line-height: 1; }
  /* A swapped caption stays one line of the cap font: a wrap, or a glyph from a fallback font ("✦2") with a
     taller line, would make the row taller and move the shell (_mould reads the .toy rects). A caption
     too long for its column shows as a clip on the bench (--mode probe). */
  .toy.tinted > :nth-child(2) { white-space: nowrap; height: 1lh; }
  .compact .toy { font-size: 12px; }
  .compact .egg .body { padding: 28px 14px 32px; }
  .warn { padding: 16px; color: var(--error-color, #c00); background: var(--card-background-color); }
`;

// Care scenes (_sceneStart): their props come and go with the scene and are placed
// each frame by _sceneRender; art is sized by its art pixels (_sceneArt).
const SCENE_STYLE = `
  .screen img.scene { left: 0; bottom: 3%; height: 0; }
  .screen img.scene-pill { left: 74%; bottom: 6%; height: 22%; }
  /* Feed (plan 5.1): the bowl in the prop's place, above the poops; its crumbs (the food's
     colour, set by the scene), the landing dust, and on water worlds bubbles. */
  .screen img.scene-bowl { left: 67%; bottom: 7%; height: 22%; transform-origin: 50% 100%; z-index: 1; }
  .scene-crumb { position: absolute; width: 2.4%; aspect-ratio: 1; opacity: 0; pointer-events: none; z-index: 1; }
  .scene-crumb.dust { background: #d8c8a8; }
  .scene-crumb.bubble { width: 3%; border-radius: 50%; background: #cfeefa; box-shadow: inset -1px -1px 0 #7ab8d0; }
  .pet.chomp { animation: munch .28s ease-in-out; }
  .pet.breath { animation: settle 1s ease-in-out; }
  .pet.breath-long { animation: settle 1.6s ease-in-out; }
  /* The resting label hides while a scene plays (plan 4.9): it would lie under the bowl. */
  .screen.in-scene .awaylabel { visibility: hidden; }
  .screen .scene-gone { visibility: hidden; }
  .scene-spark { position: absolute; width: 6%; aspect-ratio: 1; opacity: 0; pointer-events: none;
    background: #fff6c8; filter: drop-shadow(0 0 2px #ffd76a);
    clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%); }

  /* --- Care B2, snack (plan 5.2): its own block --- */
  /* Snack (plan 5.2): positioned by the scene from the screen's top left (translate, rotate). */
  .screen img.scene-snack { left: 0; top: 0; bottom: auto; transform-origin: 50% 50%; z-index: 2; opacity: 0; }
  .pet.puff { animation: puff .45s ease-in-out; } /* the stash: the cheeks fill */
  @keyframes puff { 50% { transform: scale(1.06, .97); } }
  /* The blanket drape (care reactions D, plan 5.3): a box with the pet's own geometry that wears the
     pet's classes and inline motion (_drapeMirror), so the blanket moves as the body does: the settle,
     a pat, the scene's tilt and flip. The art is a whole 256 px frame (ui/drape_<size>_<n>.png); its
     img is scaled and placed inline (_drapeShow) so the blanket's last frame lands on the pet's body.
     Above the pet, below the prop and the bubble. */
  .screen .drape { position: absolute; left: 50%; bottom: 4%; height: 62%; aspect-ratio: 1; margin-left: -23.25%;
    transform-origin: 50% 100%; pointer-events: none; }
  .screen .drape[hidden] { display: none; }
  /* What the pet's classes do to the pet, they do to the drape (_drapeMirror): the same rules, repeated
     for it, so the blanket is never a beat behind the body. Same values as the pet's, above. */
  .drape { transition: translate .25s ease-out, rotate .2s ease-out, scale .25s steps(2); }
  .drape.heavy { aspect-ratio: 1.06; margin-left: -24.645%; }
  .drape.resting { animation: breathe 4.5s ease-in-out infinite; }
  .drape.pat-soft { animation: pat-soft .3s ease-out; }
  .drape.pat-slow { animation: perk 1.1s ease-in-out; }
  .drape.rock { animation: rock .6s steps(4, jump-none) 1; transform-origin: 50% 90%; }
  .drape.rock2 { animation: rock .6s steps(4, jump-none) 2; transform-origin: 50% 90%; }
  .drape.lean-l { rotate: -5deg; transition: translate .25s ease-out, rotate .15s ease-out, scale .25s steps(2); }
  .drape.lean-r { rotate: 5deg; transition: translate .25s ease-out, rotate .15s ease-out, scale .25s steps(2); }
  .drape.lean-rel { transition: translate .25s ease-out, rotate .3s ease-out, scale .25s steps(2); }
  .drape.lean-sick.lean-l, .drape.lean-sick.lean-r { transition: translate .25s ease-out, rotate .225s ease-out, scale .25s steps(2); }
  .drape.lean-sick.lean-rel { transition: translate .25s ease-out, rotate .45s ease-out, scale .25s steps(2); }
  .drape.settle { animation: settle 2.5s ease-in-out; }
  .drape.look { rotate: y 180deg; }
  .drape.perk, .drape.stretch { animation: perk .3s ease-out; }
  .drape.stretch { animation: perk .5s ease-out 2; }
  .drape.breath { animation: settle 1s ease-in-out; }
  .drape.breath-long { animation: settle 1.6s ease-in-out; }
  .screen.dim .drape { filter: brightness(.8); }
  .screen.lit.dim .drape { filter: brightness(.9); }
  .screen .drape img { left: 0; top: 0; width: 100%; height: 100%; transform-origin: 50% 87.5%; }
  /* The tuck's lie-down: a 300 ms squash (the swap to the asleep frame hides in it) and the sigh after. */
  .pet.lie, .drape.lie { animation: lie .3s ease-in-out; }
  @keyframes lie { 50% { transform: translateY(3%) scale(.97, .95); } }
  .pet.sigh, .drape.sigh { animation: sigh .6s ease-in-out; }
  @keyframes sigh { 50% { transform: scale(1.02); } }
  /* Two steps of dusk over the background only, before the dim art itself is swapped in (lights scene). */
  .screen .scene-dusk { position: absolute; inset: 0; background: #000; opacity: 0; pointer-events: none; }
`;

