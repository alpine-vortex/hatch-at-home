# Worlds, devices and the shelf (decided 2026-10-26)

## The idea

- **A world** is a theme with a roster of creatures: Woodland (bird, then squirrel and
  deer), Terrarium (leopard gecko, blue death-feigning beetle), later Ocean (dolphin,
  shark, goldfish) and more.
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
Pixelify Sans font. The shells are drawn in CSS so they stay crisp at any size. Sol
supplies the pixel icons and small world emblems.
