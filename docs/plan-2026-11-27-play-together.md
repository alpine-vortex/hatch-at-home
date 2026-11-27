# Hatch at Home gameplay expansion spec

The owner approved eight gameplay ideas from the 27 November review. The section numbers retain the review’s numbering. The first playable designs, timings, and rollout order below are proposed implementation choices. Baseline is upstream main at `917c8a88`.

## Player experience

Hatch already gives the pet an independent life. This expansion gives the player more chances to do something with that specific pet. A Tidepool outing should feel like going somewhere together. Weather should change a decision on screen. Visitors and family should do things the player can join. Everyday play should fit into a short visit without putting ongoing care on hold.

The first versions each deliver a complete interaction in one world, with one visitor or one species where appropriate. Build against the current world and pet stage. Use the original proposal’s example as the first content to ship, then use hands-on play to decide whether it earns wider coverage. Display strings in this spec describe intended meaning and working control names.

## Shared implementation rules

- **Entry and ownership.** Activities are player-started. Use the existing Play picker, scene prompts and care controls according to the feature sections. At most one of Outing, Channel and Make a snack applies to a given pet. In the smallest card layout keep that entry, the three existing game choices and Today’s boards reachable by touch and keyboard. An activity that takes over the pet screen uses the shell mode lifecycle and the card’s screen ownership check. Use the director’s scoped timers, the same cap actions for keys and clicks, and the normal focus return. A swipe, detach or competing care flow cleans up the scene. Passive visitors, questions, and flourishes wait for a busy screen.
- **Care comes first.** Extend the new screen-owning activity modes with a shared call-driven exit. It consumes the same visible calling state as the care UI, so the exit reveals no distinction about the call. An already active call takes priority at entry. A rising call closes the new mode through its normal cleanup, releases its controls and exposes the live care state. Add a guard and exit reason to the shell-mode contract rather than relying on its current asleep/egg guards. Sleep, sickness and re-hatching close incompatible activities. A confirmed scene-owned tuck may play its closing beat after the baby falls asleep. The clock and ordinary care rules continue during play. The other activities have story, discovery or play payoffs. Verify that a real call during an activity restores care and that a late result cannot repaint the care controls.
- **Touch and accessibility.** Check 300, 330 and 420 CSS pixels, including the Tidepool porthole, big text and monochrome. Provide a labelled tap target and keyboard route for every choice. Keep outcomes legible as still poses or step changes with reduced motion. Aim, ordering and turn-taking remain possible with sound off. Let tap, click and keyboard activate the same state transition. Don’t require a swipe, a drag, exact timing or the perception of colour.
- **Persistence and authority.** Keep authoritative outcomes in the local HA store where specified. Identify a pet incarnation by device ID, generation and the state’s immutable `born` timestamp, carried as one opaque reference on the wire. Every stateful request uses this reference, typed action IDs, a state/version precondition where the player advances shared state, and a bounded payload. Check that the caller may read the pet and control the relevant pet/action entity for a mutation. Check the incarnation and revision again after awaited lookups or generation jobs. A response for an old slide, generation or request leaves the current screen alone. Commit state and the retry outcome together, and publish success after the awaited write. The existing delayed `_save()` alone cannot provide this guarantee. Coordinate awaited writes with the ordinary save path so an older snapshot cannot overwrite the acknowledged state. Older saves get feature defaults. Unknown catalog IDs hide gracefully. An older client or server continues to offer its existing care and play.
- **Shared screens.** Household activities and unfinished household progress can be seen on a shared screen with the same entity permissions. Use catalog IDs and public pet presentation fields. Keep free-text answers and personal data out of scenes, shared payloads, game state, journal records and logs. New data, art and game logic stay in the household integration.
- **Review.** Use deterministic bench fixtures for scene poses, awkward layouts and reduced motion. Use tests for rules, old saves, request retry and conflicting edits. Use card-check for real server calls, permissions, subscription updates and restart/reconnect behavior. Check a phone and a shared tablet for discoverability and delight before expanding content.

[Shell modes](plan-2026-11-04-shell-modes.md) · [Card ownership](../src/card/card-base.js) · [Timer ledger](../src/card/interaction-director.js) · [Card bench](../dev/bench/README.md) · [Project instructions](../AGENTS.md)

## 1. Branching Tidepool outing

**Player goal.** Go out with the pet, follow a clue and come home with a discovery the player chose to pursue.

**First playable.** An awake Tidepool pet has an Outing entry under Play. The screen moves from the shell’s home scene to a small authored shore scene. The pet and player start at the landing and move to the fork with the existing directional caps. Bubbles mark the pool route and a glint marks the ridge route. The route is chosen by moving toward the clue. Each route has one activity.

| Route | Player action | Payoff |
| --- | --- | --- |
| Pool | Wait at the water’s edge, then look when the pet signals a ripple. Looking early disturbs the water and returns to the wait choice. The signal stays visible until the player acts. | A sea star peeks out from under the ledge and the pet holds still so you can both see it. The journal records the sighting. |
| Ridge | Pick one of two places to check, using the glint the pet pointed out. The empty crevice sends you back to the choice so you can look again. | The pet brings a piece of green sea glass back to the landing. The journal records finding it together. |

Both endings include a return to the home scene. Aim for roughly a minute with no counting clock. Leave is always available. Revisit either route after it has been seen. Its distinct scene still plays, and the journal keeps one first-completion entry per route and pet incarnation.

**State and implementation.** Use an authored scene graph with finite node and action IDs. Adapt the Hop controls and overlay layout as useful. Keep the graph rules independent of Hop’s tiles and payouts. Save one server checkpoint per participating Tidepool pet, binding graph version and incarnation to the current node and revision. Remember a completed observation such as Wait as a graph node, so a resume can show the same signal. Returning to the landing at either ending atomically marks that route seen and clears the active checkpoint. Add `greenseaglass` quietly to Tidepool’s collection if it is missing. The pool scene records a sighting in the journal through the outing path. Keep the scheduled visitor credit and basket on their own paths. Mark the narrative journal entry independently of previous finds. A confirmed ending can be retried without duplicating journal or collection effects. A generation change ends the checkpoint and keeps earlier journal memories with their original generation. Missing graph versions drop only the unfinished checkpoint.

**Acceptance.**

- From the same start, the pool and ridge require different actions, show clearly different endings, and write the matching journal discoveries. Either route can be replayed after both endings.
- At the fork and at each route’s interaction, leave, reload and resume on another screen at the same place. A new pet in the same shell starts at the landing.
- A slow or retried ending request yields one completion. Previously owning the sea glass still gives the ridge scene and its journal memory.

[Hop board UI](../src/card/card-board.js) · [World catalog and find IDs](../custom_components/virtual_pet/frontend/worlds.json) · [Collection storage](../custom_components/virtual_pet/model.py) · [Journal](../src/card/card-journal.js)

## 3. Pond weather play

**Player goal.** Recover a seed pod with a different set of actions depending on the rain.

**First playable.** On a Pond pet, the Channel entry under Play opens a short scene in the home habitat. In rain, there’s water between the pet and the pod. Turn the left gate or the right gate to change where the next release sends it, then release the pod. The gate that points toward the pet sends it to the catch point. The other gate sends it into a little side eddy where it can be brought back and tried again. On a dry day, guide the pet onto two exposed stepping stones in order to reach the pod. An inaccessible step gives an immediate response and leaves the pet where it stands. The pet brings the pod up to the player at the end in both cases.

**State and implementation.** On Start ask the integration for the pond’s current rain state. Read the live HA states of the mapped rain and weather entities once, treat unavailable or unknown values as absent, and use the same unit conversion and `rain_reading` rules as the watcher. Bypass both the watcher’s last-good-state hold and the glass effect’s debounce. Known rain selects wet. Known dry or absent usable input selects dry. If a previously supported server cannot answer Start within two seconds, open dry and ignore a late answer. Display and pin the layout before accepting moves. A new round takes another snapshot. The browser runs the chosen authored states using local art. Weather is a passive input.

**Acceptance.**

- With the same pet, rain opens the gate interaction and dry opens the stepping stones. Their controls and valid actions differ. With no weather entity, the dry game is fully playable.
- Rain starting or stopping mid-round leaves the current layout playable. The next round reflects the updated reading. Start in rain, mark the source unavailable while the glass still shows rain, and open another round. It starts dry. A disconnected Start also gives dry, and a delayed wet reply cannot flip it.
- Try the wrong gate or unreachable stone, recover, and finish with touch, keyboard and reduced motion.

[Rain normalization](../custom_components/virtual_pet/device_fx.py) · [Watcher input and last-good-state hold](../custom_components/virtual_pet/watcher.py) · [Card rain adapter](../src/card/device-fx.js) · [Pond and its visual assets](../custom_components/virtual_pet/frontend/worlds.json)

## 4. Play with the shore crab

**Player goal.** There’s a reason to join a visit, and a way to play after missing the greeting.

**First playable.** The scheduled Tidepool shore crab leaves a little shell calling card at the start of its visit window. Open the card to invite it back for a short shelter-building activity. Place a left and right shell in the low or high position, then point the opening toward the rock or toward the water. The shell on that entrance side must be low to leave room for the crab. The board shows the opening and the shells at their actual relative positions. On Try, the crab follows that route. It finds shade when facing the rock or dips its claws in the pool when facing the water. A blocked route makes it back out and tap the obstructing shell while the pet indicates it. Adjust and retry or leave. Show each result in a readable still frame as well as in motion.

**Rules and state.** Offer the activity in the habitat from the scheduled window’s start through the end of the following HA-local day. If the card never saw the live greeting, the same calling card is still available. Use the authoritative scheduled visit to create one bounded offer keyed to the scheduled world, visitor, window and pet incarnation. Capture the offer before the coordinator replaces the old visit, including at startup, and save the replacement visit and retained offer together. A restart within the offer window reconstructs it from the saved visit or retained offer. The running activity can finish after the deadline if its pet is still eligible. The building board is local and can be restarted without a penalty. Birthday, seasonal and rare cross-world guests stay on their established paths. The invitation and its play outcome are independent of visitor credit and finds.

**Acceptance.**

- A player who saw the crab and one who arrives on the following day can both open the same invitation. Repeated play gives the shade, splash and blocked outcomes with the original visit credit recorded once.
- A restart across the end of the scheduled window preserves the offer. Before the start and after the grace period, a fresh activity cannot begin.
- The route visibly distinguishes blocked and clear from the board itself. Both results work without sound, animation, or colour. An egg and a different world show no offer.

[Scheduled visitor and credit](../custom_components/virtual_pet/model.py) · [Current visit view](../custom_components/virtual_pet/coordinator.py) · [Visitor rendering](../src/card/card-visitors.js) · [Tidepool visitor catalog](../custom_components/virtual_pet/frontend/worlds.json)

## 5. Furnish an active habitat

**Player goal.** Make a visible change to the habitat and see the pet use it.

**First playable.** Woodland gets two marked positions inside the LCD and two placeable props. The starter hideout is immediately available. Finding an ordinary Woodland acorn makes an acorn-cap cup available as a furnishing. Choose a position and prop, preview, and confirm. Either spot may be empty. Each prop fits either position and can occupy one position at a time. Moving a prop places it in the new spot and clears the old one. Swapping occupied spots is an ordinary preview and single confirm. Place Furnish on the Woodland status page and make both placed objects labelled controls on the main scene.

**Pet use.** Tapping a placed object invites the pet to check it out. It peers out of the hideout or lowers its head to the cup and looks up. A free pet may also use one of its props as an idle act. Avoid playing the same act twice in a row and give natural idle moves room between uses. If the pet is busy or already doing the act, the player sees a short status response. The pose and object remain visibly distinct with reduced motion.

**State and implementation.** Add two validated slot assignments to a Woodland pet’s save, bound to the current incarnation. The cup unlock reads the same device’s shared collection for `acorn`. The similarly named `acorncup` catalog entry belongs to the private gift system. Attaching the furnishing uses a reference and preserves the shared find. Handle same-shell retirement by clearing the interactive layout as part of the new incarnation. A new Woodland pet can furnish with the collection the device kept. The 300 px card still shows the placed objects. Keep this layer inside the scene, separate from the rotating shell decorations, and account for care props and walking room when placing its anchors.

**Acceptance.**

- Place the starter prop with a fresh collection. Roll an ordinary acorn, then place, move and remove the cup. The acorn stays in the collection. A private gift alone does not affect the prop options on either the recipient’s card or a shared screen.
- Tapping each placed prop triggers its distinct action. A free pet uses both props during a pinned idle test. Slot state survives reload and matches across clients.
- Two screens editing the same revision cannot silently overwrite one another. Verify the layout at 300 px in both positions during care and quiet idle.

[World decoration selection](../src/card/card-layout.js) · [Finds display](../src/card/card-journal.js) · [Idle action selection](../src/card/card-tick.js) · [World finds catalog](../custom_components/virtual_pet/frontend/worlds.json)

## 6. A first bedtime with the parent

**Player goal.** See the new hatchling do something with the parent the player chose to keep.

**First playable.** A newly created separate-shell hatchling can invite its own parent during the existing evening tuck-in hours within the first seven simulated days after hatching. Offer it on the awake hatchling’s screen alongside ordinary bedtime. The parent can appear from a shell omitted from the current shelf, provided it is still the same readable adult. The visit uses its artwork, so an adult already asleep can appear dozing while the hatchling settles. The player dims the lamp using the bedtime cap. On confirmation, the parent curls up, the hatchling copies and then settles. A subsequent ordinary evening tuck presents a short echo of that pose once.

**State and implementation.** Extend `prepare_separate_egg` with the parent device and incarnation. Carry it through the existing websocket and `CONF_EGG_SEED` config flow. Transfer it into the child’s first saved state before removing the seed. Scope eligibility to newly linked hatchlings. Resolve the parent on the server and return a minimal readable art descriptor using existing stage fallbacks. Recheck parent and child identity, parent read permission, and child lights-switch control when confirming. Treat the guest pose as presentation. Use the existing lights mutation and attribute it like an ordinary tuck. Record completion and the echo only when the child actually emits `fell_asleep` with `how: lights`; an already-asleep no-op can otherwise report success. Save both with the sleep mutation before acknowledging it. The next ordinary evening lights-to-sleep transition emits the echo as a child-only presentation event on the card. Deduplicate it by transition so reloading the view cannot replay the same event. Cancel, refusal, or an unavailable parent leaves the option for another eligible night. A past pet returning via the journal remains a separately scoped backlog idea.

**Acceptance.**

- Lay a separate-shell egg, restart HA before hatching, and confirm that the right parent appears at bedtime. Include a case where only the child is on the dashboard.
- Cancel, reject the tuck, tuck the child from another screen first, and retire the parent before confirming in separate cases. The first three preserve a chance to try later within the window. Retirement or removal removes eligibility for that parent. Verify the incarnation check also distinguishes a replaced save where the generation number is reused.
- A successful scene changes the child’s bedtime through the normal path and presents the echo on a later ordinary evening tuck. Reopening the original scene or retrying the same confirmed request yields one completion. A second household screen observes the child getting tucked in.

[Separate-shell flow](../custom_components/virtual_pet/__init__.py) · [First save and egg seed](../custom_components/virtual_pet/coordinator.py) · [Two-pet scene](../src/card/card-link.js) · [Bedtime scene](../src/card/card-care.js) · [Past-pet visits](../TODO.md)

## 7. Fetch in the Hearth pet screen

**Player goal.** Start a responsive play session within a few seconds of saying hello.

**First playable.** An awake Hearth corgi has a small ball target beside it in the main LCD when the screen is free. Touch or focus and activate the ball to start. Inside the same scene, choose an aim with the left/right caps or tap the corresponding target on the LCD. A straight roll goes to the nearer side and the corgi reaches it before it stops. A banked roll hits an edge and rebounds into a second lane, making the corgi visibly change direction. The ball settles if the corgi overshoots. Call Back gets the ball and the corgi back to the player, allowing another roll. Give each route a clear replayable outcome.

**State and implementation.** One transient scene and a finite set of authored trajectories. Start with the adult corgi’s existing ball fetch pose, use an available walk/perk pose for eligible younger stages and use an explicit furthest safe target inside the Hearth LCD. The aim and final ball position are visible in still form. Exit returns the pet to the normal position and the ball to its starting target. This short session has no score or care mutation. The existing Play entry continues to offer the current games.

**Acceptance.**

- In the main habitat, two different aims produce visibly different ball and pet movement. Call Back works after either outcome. Repeat without reopening a picker.
- Tap the ball, tap the pet, and navigate the shelf on a narrow phone. Each starts only its own interaction. Keyboard and tap produce the same trajectories.
- If a need, sleep or navigation interrupts fetch, the scene disposes of the ball and pose cleanly, with no stale controls or motion on the next slide.

[Touch interaction](../src/card/card-tick.js) · [Corgi sprite manifest](../custom_components/virtual_pet/frontend/sprites/corgi/species.json) · [Care controls](../src/card/card-actions.js) · [Shell controls](../src/card/card-mode.js)

## 8. Household Hop board

**Player goal.** Leave a puzzle partway through for another person and finish one board together.

**First playable.** Under Today’s boards, open Household Hop. The first Start fixes a board from the current HA-local day, world, pet stage and species using the existing Hop generator. The shared board has its own identity and progress. Anyone allowed to control that pet can take the next move, including someone using a shared tablet login. A readable view is available to readers. After making a move, Leave for later marks the current tile as a handoff and closes the board. The next person sees the pet on that tile and the prompt to continue. The same person can continue from that prompt. Reaching the nest shows the household completion wherever that board is open. A completion card remains on the entry until the household starts a new board.

**State and implementation.** Keep one active or finished record per pet incarnation. Store its board identity, bounded immutable board descriptor and rule version, HA-local seed date, bounded move prefix, revision, handoff state and completion. Generate off the event loop. Give the household seed its own namespace so the board differs from the solo puzzle when the generator has distinct valid boards available. Reconstruct the state with the same Hop rules used by the solo board, treating an empty path as an explicit start state. Accept one legal move or an undo against the current revision. Keep the board across midnight, sleep, reload, restart or age changes. Server mutations pause while the pet is asleep or otherwise unavailable. Keep solo play and its records independent. Offer an explicit confirmed restart of the same unfinished board if a player wants to clear its path, and a Start new board action after completion on a later seed day. An old board with unsupported rules offers a fresh start. Push committed revisions to other open household boards through a permission-checked subscription or equivalent small view.

**Concurrency and feedback.** A stale revision returns the latest board and a neutral update prompt. Draw that board before taking another move. A rejected move requires a fresh player choice. Give each explicit mutation an ID and reuse it on retry. Persist the latest successful mutation ID and its outcome with the board, and always require the original revision on its retries. Revisions increase across replacement and restart within the same incarnation. A retry superseded by later moves returns the canonical board. Provide an immediate pending cue and allow one in-flight move per client. Readers can inspect the board. Mutators must have control to move, undo, leave a handoff, start or restart it. Cap path length at the existing Hop limit and make Undo or Restart available at the cap. Keep all contribution markers anonymous.

**Acceptance.**

- A wall tablet plays a move and closes the card. A second login on a phone resumes at the exact tile and finishes. Repeat with a restart and local midnight between turns. Solo Hop is independently playable and keeps its own state.
- Two screens try different moves against the same revision. One applies and one redraws the canonical result. Restart HA immediately after an acknowledged move and after a lost response, and retry the latter request without applying it twice. Retry an earlier move after someone else has advanced the board and verify that it returns the later state.
- Undo, restart, handoff, unsupported rules and stale completion all have a deterministic result. A reader or wrong-pet request cannot alter the board. A one-person household can finish alone.

[Hop rule engine](../custom_components/virtual_pet/hop.py) · [Hop coordinator](../custom_components/virtual_pet/coordinator.py) · [Board rendering and controls](../src/card/card-board.js) · [Hop design](plan-2026-11-02-hop-of-the-day.md)

## 9. Prepare a tasting snack

**Player goal.** Make something for the pet and learn a preference by watching it react.

**First playable.** Keep the ordinary Snack press. On a hatched Hearth corgi, add a labelled Make a snack entry alongside the Play picker’s activities so it has a tap and keyboard path even at compact widths. It opens a short scene with a plain biscuit base and a choice of apple or pumpkin topping. The preview shows the assembled recipe. On Serve, the pet sniffs, takes a bite and reacts differently to the preferred and ordinary recipe. On later serves it recognizes the recipe the player discovered it likes. A short Make again route preselects the known recipe and still asks the player to serve it.

**State and implementation.** Choose a stable preferred recipe from the two catalog IDs for the current incarnation. Store only which recipes the pet has tasted. Keep this preference specific to tasting. Give each intentional Serve its own operation ID bound to the pet incarnation and caller, and keep that ID across retries, reconnect and an uncertain result. Make again creates a new ID only at the next intentional Serve. Use an expiring server-issued attempt token and keep acknowledged outcomes for the token’s retry lifetime. An expired token cannot apply a snack. Persist the bounded receipt with the recipe discovery and the care mutation atomically. Serialize the mutation with ordinary Snack. Resolve the actor and recheck status before applying the shared care logic. Both `ok` and `spoiled` apply the ordinary snack and record the tasting. Only `ok` is eligible for wish and care bond credit, as with the ordinary Snack button. Full, asleep and other refusals use the existing results. A typed response correlated by Serve ID drives the initiating scene. Suppress the competing random favourite-snack flourish on this Serve. A direct Snack press or another screen’s care event cannot become the recipe scene’s answer.

**Acceptance.**

- Complete a tasting of each recipe on the same pet. It eats on an accepted serve, one recipe is recognizably preferred, and the pet recognizes it after reload. A normal Snack press still works without a recipe.
- Full, asleep and interrupted cases match the normal care path. Include a false call beginning after the player presses Serve but before the server applies the snack. Check that `spoiled` records the tasting, logs the ordinary result and grants zero wish or care bond credit. Cancelled preparation and rejected attempts leave the recipe undiscovered. A dropped response followed by restart and retry applies one snack total. Intentionally serving again after Make again applies a second snack once. A simultaneous ordinary Snack stays separate and cannot answer the tasting scene.
- Verify the prepare, serving, response and refusal states on a narrow phone and in reduced motion. The ordinary Snack remains one press and Make a snack is keyboard reachable.

[Snack scene](../src/card/card-care.js) · [Care application and snack outcomes](../custom_components/virtual_pet/model.py) · [Care dispatch and wish credit](../custom_components/virtual_pet/coordinator.py)

## Suggested build order

1. **Fetch.** The smallest complete play loop, with a direct way to tell if the pet feels responsive on the card.
2. **Tidepool outing.** The anchor feature. Ship the full branch-and-return loop before expanding any map or making more worlds.
3. **Weather play and the shore crab.** Add one each of a house-driven scene and a visitor-driven scene. They can land independently once the activity lifecycle is proven.
4. **Habitat and tasting.** Add continued reasons to interact with the ordinary home screen and a specific pet.
5. **Family bedtime and household Hop.** These require the most cross-screen or multi-pet coordination. They can ship independently of each other.

Each item is a shippable vertical slice. Add art and content only where the first scene needs it. Validate the changed behaviors with the repo’s existing bench and test entry points. Run the full CI gate before reporting a future implementation branch shipped, as required by the repo.

[Repo verification workflow](../AGENTS.md)

## Adversarial review

Luna reviewed the draft against `917c8a88` and reported five source-backed gaps and one implementation hazard. A second pass checked the fixes and identified the need to state explicitly how a spoiled snack affects wish and bond credit. The acceptance cases describe future implementation checks.

- **Furnishing unlock.** The acorn-cap cup was a private gift in the first draft. The furnishing now unlocks from the ordinary shared acorn. Include both acquisition paths in the check. [Woodland catalog](../custom_components/virtual_pet/frontend/worlds.json) · [Find selection](../custom_components/virtual_pet/model.py)
- **Rain availability.** The glass retains a last accepted value, and the watcher can hold the last good entity state. Start now checks live rain inputs directly and pins the result. Include a formerly wet but unavailable source in the check. [Device effects](../custom_components/virtual_pet/device_fx.py) · [Watcher](../custom_components/virtual_pet/watcher.py)
- **Parent identity.** The old egg seed carries only species and trait. Extend the existing seed and first-save handoff, and test both an HA restart and a parent whose shell changes occupants. [Egg websocket](../custom_components/virtual_pet/__init__.py) · [Egg seed and load](../custom_components/virtual_pet/coordinator.py)
- **Care priority.** The current shell contract guards against sleep and eggs. Add the call-driven exit to the new activities and verify that a live care call immediately restores the care caps. [Shell mode schema](../src/card/shell-modes.js) · [Mode guard](../src/card/card-mode.js)
- **Tasting retries.** Each intended snack gets its own attempt ID, and reconnects keep that ID. A deliberate second snack and a retry of the first are separate acceptance cases. [Ordinary care dispatch](../custom_components/virtual_pet/coordinator.py)
- **Durable acknowledgement.** The existing delayed save is unsuitable as the sole write for an acknowledged shared move or serving. Save the outcome and its receipt together before acknowledging. Restart immediately after success and after a lost reply in separate checks. [Capped save implementation](../custom_components/virtual_pet/saving.py)
