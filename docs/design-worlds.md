# Worlds, devices and the shelf (decided 2026-10-26)

## The idea

- **A world** is a theme with a roster of creatures: Woodland (bird, then Douglas
  squirrel and deer), Terrarium (leopard gecko, then Mexican red-knee tarantula; the
  blue death-feigning beetle is shelved after several failed attempts), later Ocean
  (dolphin, shark, goldfish) and more.
- **Six worlds planned** (2026-10-26), **five creatures each** (approved 2026-10-28).
  They're listed in `worlds.json` and hidden until one of their creatures is ready;
  a creature on a roster without a ready `species.json` is simply skipped.

  | World | Creatures | Device shell | Notes |
  | --- | --- | --- | --- |
  | Woodland | bird ✅, Douglas squirrel ✅, black-tailed deer ✅, red fox, banana slug | egg with keychain loop | |
  | Terrarium | leopard gecko ✅, red-knee tarantula ✅, Russian tortoise, bearded dragon, ball python | tank with lid and feet | beetle shelved, not counted |
  | Hearth | tabby kitten ✅, lop bunny ✅, corgi puppy, Syrian hamster, ferret | little house (roof and chimney) | cozy living room |
  | Tidepool | sea otter ✅, giant Pacific octopus ✅, harbor seal pup, hermit crab, tufted puffin | round porthole with rivets | water world |
  | Pond | Pacific tree frog ✅, axolotl ✅, western pond turtle, mallard duckling, beaver | lily-pad rounded body | water world |
  | Night Sky | little brown bat ✅, luna moth ✅, saw-whet owl, firefly, opossum | crescent-topped body | moon events |

- **Water worlds** (`"mess": "murk"`) show cloudy water instead of poop sprites. Clean
  is a water change with bubbles. The rules are identical; only the drawing differs.
- **New creatures go through probe and review.** Sol first draws a probe sheet
  (baby, child and teen in content, the teen sick and asleep, and one signature pose).
  The owner approves it before the full set is drawn. Creatures after the first in a
  world need no egg sprites: they hatch from the world's egg.
- **A device** is one pet's home: a handheld toy shaped and coloured for its world
  (Woodland is an orange egg with a keychain loop; Terrarium is a sandstone tank with
  a vented lid). One device holds **one pet at a time**. Each device is one config
  entry of the integration.
- **The egg decides the species.** On hatching, the pet becomes one of its world's
  creatures. By default it's a surprise, preferring creatures this device hasn't
  raised yet. Picking the species yourself will be a later option.
- **Generations** (phase 4) walk through the roster. When an adult lays an egg, the
  next pet can be a different creature from the same world.
- **The journal** is per world. Raised creatures show up, and unfound ones are
  locked silhouettes.
- **The shelf card** is one dashboard card holding all your devices. The card is a
  normal rectangle, so it sits well in a dashboard slot. Its backdrop and ground take
  the active world's colours, the device stands on it, and arrows and dots slide to
  the next device, which peeks in from the side.

## Files

- `frontend/worlds.json`: every world, with its name, shell style, backdrop colours
  and roster. A world appears in the setup screen once at least one creature on its
  roster is ready.
- `frontend/sprites/<species>/species.json`: one creature (see `sprites/README.md`).
- The pet's state stores its `species` (empty while it's an egg) and the creatures
  this device has `raised`.

## Look

Mock-up C in the "Hatch pet card mockup" artifact: chunky toy buttons that press down
and glow when the pet needs them, a cream screen bezel, a pixel speech bubble and the
Tiny5 pixel font (chosen over Pixelify Sans, whose "c" closes up at label sizes). The shells are drawn in CSS so they stay crisp at any size. Sol
supplies the pixel icons and small world emblems.

## The 2026-10-28 creatures

Seventeen creatures approved by the owner, each waiting for its probe. Their drafts
are in `art/new-creatures/creatures.py`, in the same format as
`art/kitten/creatures.py`. `make_probe_prompts.py` writes one probe prompt per
creature to `art/new-creatures/prompts/`. Each prompt attaches an approved sheet
from the same world so the style matches. None needs egg sprites or backgrounds;
they borrow the first creature's, like the bunny does from the kitten.

| Id | World | Stages (baby → child → teen) | Signature poses | Watch for |
| --- | --- | --- | --- | --- |
| `fox` | Woodland | dark kit → orange young fox → sleek fox | pounce, tail wrap, yip | not too close to the ginger kitten: black socks, white tail tip |
| `bananaslug` | Woodland | pale tiny slug → plump → long, spotty | slime slide, curl up, mushroom | eye-stalks short and thick (the beetle's antennae problem) |
| `tortoise` | Terrarium | flat hatchling → young → high dome | hide in shell, dig, munch | |
| `beardeddragon` | Terrarium | slender hatchling → juvenile → broad dragon | beard puff, bask, cricket | the dragon wave is its `calling` mood; beard puff without darkening (no tint) |
| `ballpython` | Terrarium | thin loop → S-curve → thick coil | ball, tongue flick, climb | no limbs, so moods ride on the face and coil; food kept vague ("dinner") |
| `corgi` | Hearth | both ears flopped → one up → both up | sploot, head tilt, fetch | |
| `hamster` | Hearth | fuzzy pup → young → round hamster | cheeks, wheel, stand up | small creature: smaller `target` sizes |
| `ferret` | Hearth | fluffy kit → young → long ferret | war dance, tunnel, dook | the deep-sleep pose must read as asleep, not sick |
| `seal` | Tidepool | round pup → young → plump seal, on a low rock | banana pose, flipper clap, splash | |
| `hermitcrab` | Tidepool | periwinkle → whelk → moon-snail shell | shell peek, shell try-on, claw wave | the shell grows each stage; eye-stalks short and thick |
| `puffin` | Tidepool | grey puffling → dark young → plumed puffin, on a rock | fish in bill, waddle, bill clack | a second bird after Woodland's: keep the black-and-orange look bold |
| `pondturtle` | Pond | coin-sized hatchling → young → turtle | bask on log, tuck, swim | must not look like the tortoise: low flat dark shell, webbed feet |
| `duckling` | Pond | yellow duckling → mottled → green-headed drake, floating | bottoms up, quack, shake | floats on a ripple like the otter; a hen instead of a drake is the owner's call |
| `beaver` | Pond | fluffy kit → young → beaver | stick carry, tail slap, gnaw | not too close to the otter: flat scaly tail, orange teeth |
| `owl` | Night Sky | grey owlet → chocolate fledgling → spotted owl | head turn, toot, feather puff | |
| `firefly` | Night Sky | glow-worm → plump larva → winged firefly | blink, flutter, dim | the beetle's antenna and leg problems; the glow is rays, not a recolour |
| `opossum` | Night Sky | tiny joey → young → scruffy opossum | play dead (one eye open), hiss, tail curl | playing dead must look like pretending |
