# Item pieces (cut for review, not wired)

48 pieces cut from the four owner sheets (`art/item-sheets/*.png`, kept out of git) by
`cut_items.py` (`python3 art/items/cut_items.py [SRC_DIR] [OUTDIR]`, needs numpy, scipy, Pillow).
Output is `cut/<sheet>/<name>.png`, written at 4 screen px per art px (the creatures' scale),
NEAREST, trimmed to the drawn box, one 16-colour palette per sheet, alpha hard (0 or 255).
`cut/sizes.json` has the art-px sizes; `contact.png` (from `make_contact.py`) shows all 48 on a
dark and a light background. Nothing here is in `frontend/`, `src/` or tests.

Method: items are connected components of the alpha (the lantern cord and the mallet bleed
across the nominal cells), re-keyed hard at alpha >= 128. The pitch is the median of the
edge periods of the sheet's items: toys 6.8, wearables 7.35, decor 8.1, food 9.7 source px per
art px. A PNG's pixel size is art px x 4.

| file | what | art px | flags |
|---|---|---|---|
| `toys/item_ball.png` | striped ball | 24x24 |  |
| `toys/item_ring_stacker.png` | ring stacker | 29x36 |  |
| `toys/item_chick.png` | wind-up chick on wheels | 39x32 |  |
| `toys/item_drum.png` | toy drum with sticks | 38x35 |  |
| `toys/item_rattle.png` | star rattle (face, bow, ring) | 26x41 |  |
| `toys/item_snail.png` | pull snail on wheels | 44x32 |  |
| `toys/item_cloud_plush.png` | smiling plush cloud | 43x30 |  |
| `toys/item_cups.png` | stacking cups (rainbow) | 26x40 |  |
| `toys/item_xylophone.png` | xylophone and mallet | 45x34 |  |
| `toys/item_pinwheel.png` | pinwheel wand | 31x43 | thin stick |
| `toys/item_boat.png` | toy sailboat | 39x40 |  |
| `toys/item_kite.png` | paper kite with bows | 32x42 | loose tail bows are thin (1-2 art px) |
| `wearables/hat_beanie.png` | pom beanie (hearts) | 34x34 | 34 art px wide: shrinking to a 16-px-wide hat would lose the hearts |
| `wearables/hat_sunhat.png` | floppy sunhat (daisy) | 46x28 | 46 art px wide, daisy detail would not survive a 2x shrink |
| `wearables/hat_flower_band.png` | flower headband | 39x23 | small flower detail, as sunhat |
| `wearables/hat_bunny_hood.png` | bunny-ear hood | 42x41 | face hole keyed transparent (99 art px); check the rim reads on a pet |
| `wearables/wear_bow_tie.png` | bow tie | 34x20 | body wear: needs per-species anchors, no home today |
| `wearables/wear_scarf.png` | polka-dot scarf | 34x32 | body wear: needs per-species anchors, no home today |
| `wearables/wear_glasses.png` | round glasses | 43x16 | lenses cut cleanly at this pitch (no redraw needed after all); only 16 art px tall, thin frame |
| `wearables/hat_leaf_crown.png` | leaf crown | 41x24 |  |
| `wearables/hat_rain_hood.png` | rain hood (drops) | 37x38 | face hole keyed transparent (192 art px); check the rim reads on a pet |
| `wearables/wear_cape.png` | striped cape | 46x31 | body wear, drawn flat-on: needs per-species anchors |
| `wearables/hat_chef.png` | chef hat and red neckerchief | 39x38 |  |
| `wearables/wear_backpack.png` | mini backpack (clover) | 40x33 | body wear, drawn flat-on: needs per-species anchors |
| `room-decor/deco_item_sprout.png` | potted sprout | 22x28 |  |
| `room-decor/deco_item_clock.png` | wall clock (bear ears) | 28x30 | hangs on a wall |
| `room-decor/deco_item_frame.png` | framed landscape | 32x33 | hangs on a wall |
| `room-decor/deco_item_lantern.png` | paper lantern | 26x46 | hanging cord kept (46 art px tall); trim if floor-only |
| `room-decor/deco_item_cushion.png` | floor cushion | 37x19 |  |
| `room-decor/deco_item_plaque.png` | fish wall plaque | 33x22 | hangs on a wall |
| `room-decor/deco_item_bookshelf.png` | bookshelf (vine) | 33x32 |  |
| `room-decor/deco_item_star_lights.png` | star lights (string) | 37x20 | hangs; thin string |
| `room-decor/deco_item_aquarium.png` | small aquarium | 32x28 |  |
| `room-decor/deco_item_basket.png` | woven basket | 32x25 |  |
| `room-decor/deco_item_lamp.png` | table lamp | 25x30 |  |
| `room-decor/deco_item_flower_box.png` | flower box | 39x24 |  |
| `food-and-drink/food_tart.png` | berry tart | 33x28 |  |
| `food-and-drink/food_toast.png` | honey toast | 32x28 |  |
| `food-and-drink/food_rice_ball.png` | rice ball | 26x24 |  |
| `food-and-drink/food_fish_biscuit.png` | fish biscuit (taiyaki) | 32x23 |  |
| `food-and-drink/food_cocoa.png` | cocoa (marshmallows) | 33x25 |  |
| `food-and-drink/food_fruit_bowl.png` | fruit bowl | 33x27 |  |
| `food-and-drink/food_dumpling.png` | dumpling in steamer | 30x27 |  |
| `food-and-drink/food_pancakes.png` | pancake stack | 34x26 |  |
| `food-and-drink/food_muffin.png` | carrot muffin | 28x29 |  |
| `food-and-drink/food_star_cookie.png` | star cookie | 30x29 |  |
| `food-and-drink/food_yogurt.png` | berry yogurt cup | 27x30 |  |
| `food-and-drink/food_onigiri.png` | wrapped onigiri (bow) | 31x29 |  |

## Needs a redraw

None strictly. The scout expected the glasses' lenses to be broken; at the measured pitch they cut clean.
If the hats go onto pets at 16-px width, the beanie, sunhat and flower band would need a hand-drawn small version (they are 34-46 art px wide here).

## Flagged

- Hoods (`hat_bunny_hood`, `hat_rain_hood`): the flat brown face patch was flood-keyed to transparent from a seed (`HOLES` in the script).
- Body wear (bow tie, scarf, cape, backpack): no place in the game yet; cut and parked.
- Hanging decor (clock, frame, plaque, lantern, star lights): there is no wall in the scenes.
