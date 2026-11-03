# Hatch at Home: the full guide

Everything the [README](../README.md) leaves out: setup step by step, every
entity, option and rule, Assist, events and development.

A Tamagotchi-style virtual pet that lives inside Home Assistant. Later phases
let the real house (weather, light, bedtime, who's home) shape its mood and
scenery. **The house can never hurt the pet**; it only changes how the pet
looks, what it says and what it asks for.

Status: the pet, its house and its family are built (see the Roadmap at the end).
The pet lives in HA: stats, calls, care misses, poop, sleep, weight,
discipline, two games (left or right, higher or lower) and chore treats. It sits on a pixel-art **device
shelf** card and reacts to your house: weather, indoor temperature, lights,
bedtime, people coming and going, the TV and music, and the moon. It learns traits,
grows up with an upbringing, and starts new generations that you can follow in its
journal.

Each pet lives in a **device** themed for its **world**: an orange egg-shaped toy for
Woodland, a sandstone tank for Terrarium, a little red house for Hearth, a riveted
porthole for Tidepool (whose water clouds over instead of collecting poop), a lily pad
for Pond, and a crescent moon for Night Sky. Each world has five creatures, 30 in all.
The egg decides which of that world's creatures hatches. See `docs/design-worlds.md`.

## Install

1. **Take a backup first**: Settings → System → Backups → Back up now.
2. Get the files, through HACS (recommended) or by hand:
   - **HACS:** HACS → ⋮ (top right) → Custom repositories. Paste
     `https://github.com/alpine-vortex/hatch-at-home`, pick type **Integration**
     and press Add. Then search HACS for **Hatch at Home** and press Download.
   - **By hand:** copy `custom_components/virtual_pet/` from this repo into your
     HA config folder, so you end up with
     `/config/custom_components/virtual_pet/manifest.json`. The Samba share, the
     SSH add-on or the Studio Code Server add-on all work.
3. Restart HA: Settings → System → power icon (top right) → Restart Home Assistant.
4. Settings → Devices & services → Add integration → search **Hatch at Home**,
   then name your pet and pick its world: Woodland, Terrarium, Hearth, Tidepool, Pond
   or Night Sky (five creatures each). Add the integration again for each extra pet device.
5. **Add the card:** edit a dashboard → Add card → **Hatch at Home pet shelf** (see *Add the
   card* below). The egg hatches in about half an hour.

### Add the card

The integration loads the card on every dashboard by itself; there's no resource
to add and no Advanced mode needed. After installing or updating, restart HA and
reload the browser page. On a phone or wall tablet, pull to refresh.

Edit a dashboard → Add card → search **Hatch at Home pet shelf**. With no settings
it shows every pet. To show only some, pick them in the card's editor. In YAML:

```yaml
type: custom:hatch-pet-card
# optional: the pets' device IDs (the editor fills these in)
devices:
  - 0123456789abcdef0123456789abcdef
# or, as before, any one entity of each pet:
entities:
  - sensor.pip_mood
seasonal: false  # optional: no seasonal touches (on by default; "halloween", "thanksgiving" or "winter" previews one)
```

**Upgrading from 0.3.x:** you added the card as a dashboard resource back then.
Remove it now (Settings → Dashboards → ⋮ → Resources → delete the
`hatch-pet-card.js` row), or an old cached copy may load first.

### Updating

With HACS, new versions appear under Settings → Updates. Install, restart HA,
then reload the browser page. By hand, copy the folder over the old one and do the
same. Either way your pets are safe: they live in HA's own storage
(`/config/.storage/virtual_pet.<entry id>`), not in the integration folder. Restoring
an HA backup rewinds the pet to that point, which is fine.

Moving a manual install to HACS needs nothing special: add the custom repository,
download, restart. HACS replaces the folder you copied.

### Using the card

- Each pet stands in its device on its world's backdrop. Use the arrows, the dots or a
  swipe to move to the next device (a mostly vertical drag, reading or selecting, does nothing). A reload comes back to the pet you were looking at.
- **Power-on:** the first time a browser shows the card, the screen starts like a
  new toy: a pale-green screen with the HATCH logo and a blinking "▶ tap to start".
  A tap fills in the logo and cuts to the pet (with a rising beep if you turned
  sounds on, outside quiet hours and while the pet is awake); with no tap it starts by itself after about
  five seconds, silently. It shows once per browser, and again only after an update
  that asks for it. Reduced motion skips the fill.
- The screen shows the pet, its scene and a speech bubble. The bubble says what's on
  its mind, or why it refused something ("i'm full!").
- **Play** offers three games. It opens a picker that starts on the
  last game you picked. **Left or right:**
  the pet hides on one side and you guess with the arrows; a win cheers it up more than
  plain play. **Higher or lower:** the pet shows a number from 1 to 9 and you guess
  whether the next is lower (lo) or higher (hi); it's mostly skill, so a win pays like
  plain play. Five rounds each; three right guesses win. ✕ stops a game. **Berry dig:**
  each round the pet faces a leaf pile hiding 6 berries and 2 bees (the number is the
  leaves left). **dig** turns one leaf: a berry goes in this round's basket, a bee scares
  the basket off and ends the round. **keep** banks the basket and ends the round. Five
  rounds; 5 berries banked win, and a win pays a little more than higher or lower. ✕ puts
  a dig aside instead of ending it: your next berry dig carries on from the same pile,
  round and bank, however much later. Each person has their own; someone else starts
  fresh. (The `play` button entity is still plain play, for
  automations and voice.)
- **Every day** there's something new when you look in:
  - **A wish of the day**, picked when it wakes up, only from what your house can grant: play
    a game together, a snack after lunch, a bubble bath, "good job!", being tucked in
    tonight, watching the sunset together (someone home at sunset), someone coming to
    say hi in the afternoon (opening the card after noon), and, when you have
    them mapped, some music, TV together, a chore treat, or seeing the rain on a day the
    forecast says rain. It's on the status screen and the pet mentions it once more later
    (never again after bedtime, when it can't come true);
    granting it brings a sparkle and a little happiness. A missed wish costs nothing:
    tomorrow brings a new one.
  - **A dream**: it may dream about something from the day before (a show it watched,
    the rain, a game it won, its wish coming true) and tells the first person who
    looks in that morning. On a quiet day it may dream of the day's world visitor
    instead ("I dreamed about the chickadee! ♪"), and with nothing to dream about it
    has a dream of its own ("I dreamed I found a secret door!"), a different one each
    morning for a month.
  - **While you were out**: open the card after a few hours away and it tells you what
    happened ("while you were out, I napped, watched the rain and played a game!").
    Back after two days or more, it hops and welcomes you back first, with the news
    before anything else.
  - **Its day, in the evening**: from 17:00 a teen or adult tells you about its day once
    (on each screen): its wish come true, a visitor it saw, something it did ("today I
    watched the sunset! ♪"), or a line of its own. The status screen shows it too, and
    before 17:00 it shows today's dream; the journal shows today's dream under its title.
  - **Its own words, in turns**: most everyday lines (waking up, a pat, "good job!",
    meals at breakfast, lunch and supper, its wish, its answer to "how was your day?")
    take turns day by day, and a teen or adult often says them in its own way. Now and
    then a pat finds the sweet spot ("that's the spot!! ♥"). At lights out it may
    remember the day's visitor or the sunset; the day after a cure it says it feels all
    better.
  - **A promise**: every three weeks a teen or adult says it's practising something (a
    hop, a spin, a song), practises now and then, and a few days later shows you.
  - **Tricks**: an adult learns a trick a month for its first three months (a spin, a
    double perk, a look around), shows it off once, and does it now and then after.
  - **Games**: each day it has a favourite game, first in the list (with a word about it
    on a wide card), and a lucky number that sparkles when it comes up in Higher or
    Lower. After a game a teen or adult sometimes adds a word of its own; in Berry dig a
    berry now and then is a shiny one.
- **A bond with each person.** The pet gets to know everyone who signs in to Home
  Assistant with their own login, separately (a shared wall-tablet login counts as one
  person). Looking in once a day, caring for it, playing games and granting its wish
  bring you closer; care and games count up to a daily limit, so there's no need to
  rush, and a bond never goes down, even after days away. Ten levels, slow near the
  top (about a week to level 5, a month or so to 10). Closer, it greets you more
  warmly (level 2), hops when you look in (3), picks a nickname for you ("hi,
  sunbeam!", 4), has a favourite game with you and says so when you play it (6), and
  floats hearts just for you (8). Once it has a nickname for you, your phone
  notifications and Assist use it too ("Pip is hungry, sunbeam!", "Thanks,
  sunbeam!"). From level 3 it cheers when you come home ("Sam's home!!", and "welcome
  home!" when you next look in; this needs your person entity linked to your login),
  and some days its wish is for you ("I hope Sam plays a game with me today!"; anyone
  can still grant it). It also:
  - remembers when you met, and says so each month ("we've been friends for a
    month! ♥");
  - cheers when you beat your own best at a game, which it keeps for each person;
  - says goodnight when you tuck it in in the evening (lights out by hand from 6 pm),
    and thanks you the next morning;
  - asks you things now and then (from level 2), at most one question in the morning
    and one later, per person, however many pets and screens you have: "did you
    sleep well?", "how was your day?" (always after you come back from work or
    school), "what should I dream about tonight?" (the next morning everyone hears the
    dream's story, and you hear it was your idea), "rain or sun tomorrow?" (judged
    the next evening, no score), "anything big this week?" (Sunday or Monday, at
    most once a week; "yes" asks which day (today included), then lets you type what it is, and on that
    day the pet cheers you on in the morning and, from 7 pm, asks how it went or is
    there for you), and once
    each "what's your favourite weather?" and "...season?", and "who's your favourite
    visitor?" once in each world (its visitors as buttons). After a tough day it's a
    little softer with you the next morning. It remembers favourites, tonight's
    dream, your guess and a big day (see Privacy); the rest of your answers stay on
    your screen. While it asks, the pet steps back a little, "lay an egg?" waits out of
    the way, and a tap beside the buttons does nothing. Every answer gets a reply that
    stays on show for a few seconds, and a tap right after an answer opens nothing;
  - remembers your favourites: "it's snowing, your favourite!! ❄", "it's autumn, your
    favourite! ♥" once a season (no season talk in the tropics), "Thanksgiving in
    your favourite season! ♥"; your favourite visitor gets its own hello on your
    screen now and then ("your favourite, the chickadee! ♥"), and if it came by
    while you were out, "your chickadee came by today ♥";
  - says what it's like out there when you come home ("it's wet out there! come
    get cozy ☂", "brr, it looks cold out there!");
  - greets you sleepily if you look in before sunrise ("mmh... you're up before the
    sun... zzz ♥").

  At most two of these lines at one look; the rest wait for your next one.

  A bond never changes the pet's stats: it's flavour. The status screen shows "you
  two" in five hearts.
- **Friends this week.** Beside "you two", the status page shows "friends": five
  hearts for the pet's week beyond the house. A world visitor counts when someone looks
  in while it's there and the pet is up, and each neighbour it meets over the infrared link counts once a
  day. It's a rolling week, so it fills and fades with the visits, and it changes
  nothing about the pet: no stats, no points. A pet that met no neighbour all week (alone
  in the house, or on a card of its own) gets a little more from each visitor. At full hearts it says "so many friends this week! ♥" (once a
  week), and a new egg starts its own. The row hides until there's a friend to show.
- **My day** (turn it on in settings, the gear on the status screen; for yourself only): the pet notices your
  good days from the phones you signed in to the Home Assistant app with. It only
  ever says something when a day stands out for the better, and only to you, at most
  once a day; never a quiet day, a short night, a heart rate or a weight. The closer
  your bond, the more it notices: a 10,000-step day (level 2), more steps than your
  own usual by this time of day (4), a bike ride, a run or lots of stairs (5), your
  most active day in weeks (7), and a good night's sleep, at least your usual (8).
  It reads the companion app's steps, floors and activity sensors (iOS) and Health
  Connect's daily steps, floors and sleep (Android); Android's plain step counter
  works through Home Assistant's long-term statistics. "Usual" is your own median
  over the last two weeks, from that history; the pet stores none of it. With "my
  day" on, it also notices:
  - a walk in the rain or snow ("you walked in the rain! so brave! ☂", level 4);
  - coming back from a zone you made, when its name has gym, work, office, school,
    college, university or park in it ("back from the gym! so strong!", "back from
    class! ♥", level 3; other zones are never named);
  - an early alarm tomorrow on an Android phone (the Next alarm sensor, which is
    off by default in the app): "early start tomorrow! sleep well ♥", from 19:00,
    when it's at least 45 minutes before your usual (level 3);
  - a send-off on your phone on a notable morning as you leave ("Pip says: rain
    today, take an umbrella, sunbeam ☂"), with "notify me" on, at most three times a
    week, from the pet you're closest to (or the pet your card opens on, if your bond
    with it is level 3 or more and it's home and hatched), and silent (level 3).

  On a wall tablet or any screen the whole family looks at but one person is signed
  in to, turn on "shared screen" in settings (the gear on the status page; it's saved
  in that browser only): it shows nothing personal there, no names, notes, questions,
  bond or "my day", and doesn't count as anyone's visit. It opens on the pet an admin
  picked for shared screens (below), if there is one, and never shows anyone's heart.

  **A family tablet: which way?** There are two ways to set one up. Give the tablet its
  own Home Assistant login (a "family" user): the pet then treats the tablet as one
  more person, with its own household bond, greetings, questions and nickname, and
  everyone's own phone or login keeps its own bond as well. Or sign the tablet in as one
  person and turn on "shared screen": nothing personal shows, and the tablet builds no
  bond at all. The first is warmer for a family; the second suits a screen in a shared
  or public space. The card says so in a line under the "shared screen" switch.

  "My day" is one switch per person, for every pet. Phone focus modes and Do Not
  Disturb are left to your phone: the pet's calls and sickness are time-sensitive
  (they may come through a focus you allow); a need asking again is an ordinary
  notification, and poop calls stay on the card. Everything else waits like any
  other notification. Each person only ever sees their own bond: it is on no pet sensor and no
  pet event (your phone's messages may use your nickname), and only their own card fetches it, over a private subscription. Care through Assist counts for
  whoever is signed in; automations build no bond. A new generation keeps the household's bonds. (The card tells the pet who
  looked in with `virtual_pet.visit`, counted at most hourly.)
- **Visitors**: on about 4 days in 7 a small creature from the pet's world (a robin, a
  heron, a shooting star...) drops by during a 3-hour window and the pet greets it, once
  a day on each screen. If a day visitor's window passed while nobody was looking, it
  still comes by when you next look in that day (on a night or dimmed screen the pet
  just says so instead: "a robin came by today ♪"). Home Assistant picks the day's
  visitor and its window, so every screen agrees and a restart doesn't change it. A
  visitor seen on a screen on three days becomes a friend there and greets it with its
  own lines; a visitor stays longer on a shared screen; on rare days two come together,
  or one drops in from another world. On a visitor day the pet may save it a crumb, let
  it watch a Berry dig, or tell a linked pet about it.
- **Seasons** (by the viewing device's date; card option `seasonal: false`, or "Seasonal
  decorations" in the card editor, turns them off): from 20 to 31 October it's **Halloween**. Bunting hangs across the scene, a
  jack-o'-lantern with a new carved face each day sits by the pet and glows at night (it
  floats in Tidepool and Pond), cobwebs hang in the corner (both corners of the
  Terrarium), a sweet waits by the door in Hearth, a pumpkin joins the device's
  decorations, mist curls along the ground at night, bats flit across at night (in Night
  Sky by day too, where a witch crosses the sky). Each pet has a costume of the day (a
  witch hat, a pumpkin cap, cat ears or little horns) that it puts on every couple of
  minutes with something spooky to say; a friendly ghost floats by now and then and
  makes it jump; snacks are candy; the first visit of each day counts down ("3 sleeps
  till Halloween!"); and on the 31st the first visit gets "trick or treat!" and a
  sweet.
  **Thanksgiving** (US; the fourth Thursday of November) runs from 12 days before it to
  the Sunday after. A leaf garland hangs across the scene, autumn leaves drift down, a
  harvest piece of the day sits by the pet (a horn of plenty, gourds or a basket of
  apples), leaves gather in the corner (both corners of the Terrarium), a plate waits by
  the door in Hearth, a sheaf of wheat joins the device's decorations, and geese fly
  over in a V. The costume of the day is a pilgrim hat, a leaf crown, a feather band or
  an acorn cap; a turkey wanders by now and then ("gobble?!"); snacks are pumpkin pie;
  the countdown runs ("3 sleeps till Thanksgiving!"); and on the day the first visit
  gets "happy Thanksgiving! ♥", a plate, and a thank-you to everyone who looks after
  it ("thank you all for taking care of me ♥").
  **Winter lights** run from 1 to 31 December (Thanksgiving keeps 1 December in the
  years it reaches it). A string of lights hangs across the scene, a lamp of the day
  sits by the pet (a paper lantern, a star lamp or a snow lantern) and glows softly at
  night (it floats in Tidepool and Pond), frost gathers in the corner (both corners of
  the Terrarium), a mug waits by the door in Hearth, a snow globe joins the device's
  decorations, and little lights drift across the night sky. The costume of the day is
  a knit cap, earmuffs, a wreath of lights or a star cap, with "happy holidays! ♥",
  "so many lights!" and the like; on Christmas Eve and Day, the days of Hanukkah and
  New Year's Eve the pet sometimes names the day. A snow hare hops by now and then
  ("oh!", then "hi, little hare!"); snacks are star cookies; and on 21 December the
  first visit gets "so many lights! ♥" and a little treat. There's no countdown. The
  season goes by the device's date, so it's winter lights in a southern December too.
  All cosmetic. "holiday names" in settings turns festival names off (see below).
- Tap the screen for the status page: hearts and meters, weight, traits (n/4) and
  the one it's learning next, upbringing with "missed calls" and "ignored whines"
  under it (calls nobody answered in time, and fake calls nobody answered),
  personality (from teen), the next egg, recent care, and a link to the journal.
  The pet's head and name sit at the top left. Tap again to go back, or press Escape;
  Escape on the journal or the pages under it goes back one page first. An egg's page
  has just "you two" and when it hatches ("warm and growing ♪", then "wiggling! any
  minute ♪", then "cracking! ♥"). The status draws in as a four-step wipe (instant
  with reduced motion). A care button tapped with the status open closes it first, so the
  pet is seen eating. The switches live behind the gear (below).
- **The settings gear.** A gear sits at the top of the status page ("settings").
  Tap it for the settings sheet. On the sheet, "‹ status" (or the Escape key) takes
  you back to the status page; on a sub-page such as the shell picker, "‹ settings"
  takes you back to the sheet. A tap on a label or the empty space beside a switch
  leaves the sheet open. When the pet has something to say about a change ("no phone
  pings, ok ♪"), it says it in a small bubble with its head under the top row; and when
  you leave the sheet after some changes, the pet may remark on the last one. The sheet has
up to four parts, in this order:
  - **this screen**, in two groups. *sound*: sounds here, and babble (for pets with a
    voice). Babble waits for "sounds here": with that off its row reads "needs sounds"
    and can't be switched. *look*: screen effects here, holiday names, mono screen and
    big text. These are saved in this browser only.
  - **for you**: notify me, my day, remember me (memory, off until you turn it on; see
    Privacy), my birthday, birthday on my phone, baby talk, your
    remembered favourites (each with "ask me again"), "♥ open on <pet>" and my data.
    These follow your login. A shared screen doesn't show this part.
    "♥ open on <pet>" (with two or more pets) is the favourite pet: the pet your card
    opens on when you open it. Once you've swiped to another pet, it stays there until
    you close the tab or browser. Turn it on for the
    pet you're looking at; it moves from any other, and off clears it. A small heart
    marks that pet's dot at the foot of the card, on your own screens only; nobody
    else sees it, and it ranks nothing. Your phone's birthday message and send-off
    come from that pet when it may send them (home, hatched, and for a send-off a
    close enough bond); otherwise from the pet you're closest to, as before. An admin
    gets one more row, "shared screens open on <pet>": the household's pick, where
    every shared screen opens. It is no one's, so "forget my data" leaves it.
  - **for the pet** (or **for** its name): "notices", the kinds of thing the house
    shows the pet (weather, lights, tv, music, chores, fireplace, heater, fan, robot, doorbell, machines, moon; the moon always
    shows); an admin also gets "connect more ›", which opens the pet's own page in
    Settings → Devices & services. Then "bedtime", read only: the pet's bedtime and
    wake time as "about … · up …", in the 12 or 24 hour format of your Home Assistant
    language and settings. It is the pet's own schedule, not a person's, so a shared
    screen shows it too. Then "resting", the pet's resting switch with what it means
    (see *Resting* under *How the pet works*); a shared screen shows whether it's on,
    with no switch, and an egg has no row. Then the pet's "shell" row, see below. An
    older server shows no bedtime or resting row.
  - **shared screen**, at the foot: its switch, a note ("a family tablet? give it its
    own login, and we'll make friends ♥"), and for an admin (not on a shared screen) a
    line, "sensor privacy is in the pet's options".
- **Holiday names.** "holiday names" in the sheet's "this screen" part is on to begin
  with. Turned off, the pet on this screen never names a festival: no Christmas,
  Hanukkah or New Year's Eve lines in December, no "happy Halloween!" or "happy
  Thanksgiving!", no "3 sleeps till..." countdown, and "it's autumn, your favourite!"
  in place of "Thanksgiving in your favourite season!". The seasons' scenery, hats
  and generic lines ("happy holidays! ♥", "spooky~") stay. Phone messages are not
  changed by it.
- **The shell picker.** On a server that offers it, the sheet has a "shell" row
  showing the pet's current shell. Tap it to open the picker, a list of finishes in
  groups (world plastics, specials, prints), starting with the world's own. Tap a
  tile to see it on the pet's shell as a preview, then **use** (top right, dimmed until
  the preview differs from the saved pick) to keep it. The world's own shell is the
  first tile, marked "default"; use it to go back to the world's own. "‹ settings"
  leaves without saving. Each pet has its own shell. The earned shells (glitter, glow, smoke,
  sunset, constellation and stars) unlock when the pet is a teen: before that their
  tiles are dimmed with the stage they open at, and tapping one says "I get this one
  as a teen ♪". On a shared screen the row is read-only: it shows the shell and says
  "ask a grown-up to change it", with no picker.
- **The mono screen.** "mono screen" in the sheet's "this screen" part redraws the
  LCD in four greens, like an old handheld. It is per browser, off to begin with,
  and only changes how the screen looks. Safari and iOS can't draw it and keep
  showing colour.
- **Big text.** "big text" in the same part makes the words on the status page, the
  journal and the settings sheet bigger (the page scrolls more), and the pet's words
  too: its speech bubble and its answer buttons, with each line held half as long
  again. It is per browser and off to begin with: handy on a wall tablet, or for
  younger and older readers.
- Every tap answers straight away: the button sinks, a ring pops out, the pet perks up
  and phones give a tiny vibration. Then the real reaction follows (a food bowl, a
  sparkle, or a refusal like "i'm full!"). If HA rejects the press, the button goes dull for a moment
  and the pet says so.
- The toy buttons press the pet's button entities, so anything you do here works
  from automations and voice too. A button glows when the pet needs it, for example
  Feed when it's hungry. Medicine is greyed out unless it's sick.
- The pet reacts to what happens to it, even when nobody pressed anything: a missed
  call (gently, once, at your next look: "...oh, there you are ♥"), hatching ("hello!"), growing up, a new trait, a good
  morning, a fair scolding. In its child stage, each creature also has its own
  reactions, like the squirrel stuffing its cheeks with a snack or the kitten's
  zoomies after play.
- The scene follows the sun (`sun.sun`), and dims when the lights are out. Creatures
  without their own rain scene get rain drawn over theirs.
- The sleep button turns into "wake" whenever the pet is asleep, even if it dozed off
  by itself; one tap wakes it.
- Between events it has a life of its own: it looks around, wanders, chases a speck of
  light, mutters to itself and, as a child, strikes its own poses. A treat sets it
  bouncing for a few seconds, then it hops now and then while it's still excited.
- It says hi to whoever is looking, by first name ("morning, Alex!"), at most every few
  hours. The name comes from your Home Assistant account and stays in your browser.

### Little touches

The device behaves a little like a real handheld's screen. None of this changes the
pet; it's only how the screen looks.

- **The LCD grid.** A faint dot-matrix grid lies over the scene, one cell per pixel
  the creature is drawn in (one per four on a low-resolution screen, where a finer
  grid would shimmer). Weather, the speech bubble, the games and the status screen
  sit in front of it, so words stay crisp. "screen effects here" on the status
  screen turns it off for this browser; it's also off when the browser asks for
  more contrast.
- **Ghosting.** Like a slow old LCD, the screen leaves a fading trace of the pet:
  its last frame for a moment when it moves, and a short smear when it wanders or
  dashes aside in a game. Only on the pet you're looking at, and
  never with reduced motion. The same "screen effects here" switch turns it off.
  It's off on a mono screen ("mono screen" in the settings), which keeps the grid.
- **The press.** A toy button's cap sinks when you press it and springs back up a
  little (each care has its own bounce), dims while the press is on its way to Home
  Assistant, and returns dull if the press is rejected. With reduced motion on, it
  only dims and sinks, without the spring.
- **The backlight.** Every device has a little button on its shell: a nub on the
  egg's shoulder, the tank lid's right grip, a lamp on the house's chimney, the
  porthole's top-right rivet, a dewdrop on the lily pad's rim and a star on the
  moon. Tap it ("Light up the screen") and the screen glows blue-green for three
  seconds, then fades; tap again for three more seconds. It lights the status page and
  the settings sheet too. It shows best at night, when a
  sleeping pet glows under it (it stays asleep). It only lights the screen: it
  doesn't turn the lights on, wake the pet or tell Home Assistant anything. With
  sounds on it clicks, except at night and while the pet sleeps.
- **The infrared link.** With two or more pets on one card, now and then (once a day
  at most for any pair, 10-25 minutes after you open the page) the pet on show and
  the one next to it visit: a small red beam hops along the tops of the devices,
  the screen shows a band of dots for a moment, and then both pets stand on the
  host's background, wave and hop, say hello and part. The visiting pet's own slide
  shows a little "♪" meanwhile. It's a surprise, not a button; nothing is counted or
  remembered, and it never happens while either pet is asleep, calling, playing,
  mid-care or the status is open. A swipe ends it at once; with reduced motion the
  pets just appear together, speak and go. With sounds on it chirps. Teens and adults
  greet in their own personality's words, and two of the same type or of partner types
  (mellow and sweet, bouncy and starry, old soul and fancy, charming and plucky)
  sometimes get one more line from the host.
- **Low battery after a restart.** When Home Assistant itself restarts, the pet's
  screen flickers once, a little battery blinks in the corner and the pet says it
  nearly lost power, then perks up and the battery fills and goes (about four
  seconds). It plays once per restart in each browser, only if you see the card
  within 15 minutes of it; a pet that is asleep waits for you to wake it (up to 12
  hours), and a call or a game cuts it short. A browser that has never shown the
  card just starts quietly. Reloading the integration doesn't count, and nothing
  about it is a state or in the history: the pet's time stood still, so there is no
  "where were you". With reduced motion there is no flicker and the battery stays a
  single bar.

## What you get

One device named after your pet, with the entities below. To rename the pet or move
it to another world, open Settings → Devices & services → Hatch at Home → ⋮ next to the
pet → **Reconfigure**. A rename keeps the entity IDs, and notifications and the journal
follow the new name. A newly laid egg can also be named on the card during its first
day.

Two words are easy to mix up. The **world** is which creatures can hatch and how the
device looks; Reconfigure changes it. The **shell finish** is this pet's colour, picked
on the card in settings (the gear); Reconfigure leaves it alone. A pet that has hatched
stays in its world; a new world starts with its next egg (the status screen says "next
egg in …"). A pet still in its egg moves at once.

| Entity | What it is |
| --- | --- |
| `sensor.<pet>_hunger`, `_happiness`, `_energy`, `_health`, `_discipline`, `_weight` | Stats, 0–100 whole numbers. Hunger is a fullness meter: 100 is stuffed. Weight is healthy between 25 and 75. |
| `sensor.<pet>_mood` | `egg`, `away`, `sick`, `asleep`, `calling`, `hungry`, `dirty`, `sleepy`, `bored`, `excited`, `cozy` or `content`. Attributes: `flags`, `reason` (what the speech bubble will say), `reason_key` (which sentence that is, for the card's baby talk), `call_deadline`. |
| `sensor.<pet>_life_stage` | `egg` → `baby` (30 min) → `child` (1 day) → `teen` (5 days) → `adult` (14 days). Attributes include `species`, `traits`, `trait_levels`, `inherited_trait`, `trait_progress` (0–1 per trait), `trait_cap`, `age_days`, `world`, `generation`, `upbringing` (final once adult, what it's on track for before), `upbringing_score`, `personality` (from teen; kept out of history), `games` (played and won per game), `memories` (first snow, frost and fog, the first warm day, and each season's first day), `hatches_at` (while an egg), `next_world`, `next_egg`, `journal` (the device's retired pets) and `week` (the journal's strip: days with a dream, a credited visitor or notable weather; kept out of history). |
| `sensor.<pet>_poop`, `_care_misses` | Poop on screen (max 3) and care misses so far (attribute `discipline_misses`: fake calls nobody answered). |
| `sensor.<pet>_last_care` | When it was last cared for. Attribute `log`: the last 20 actions and who did them; `moments`: the last 10 things that happened to it, for the card to react to. |
| `binary_sensor.<pet>_asleep`, `_calling`, `_sick` | |
| `switch.<pet>_lights_out` | On puts it to bed, off wakes it. |
| `switch.<pet>_resting` | On rests the pet (see *Resting*), off wakes it. Off by default; an egg can't rest (turning it on does nothing, and logs nothing louder than debug). |
| `button.<pet>_feed`, `_snack`, `_play`, `_clean`, `_medicine`, `_scold`, `_praise` | Care. Medicine is unavailable unless the pet is sick. |
| `select.<pet>_next_egg` | `Surprise me` (the default) or a creature of the egg's world, for the next hatch only. Attribute `next_egg` on the life stage sensor shows the choice too. |
| `button.<pet>_lay_egg` | Starts the next generation. Available from a week into adulthood (day 21), while the pet is well and home. |
| `button.<pet>_blanket`, `_fan` | Answers to what the house makes the pet ask for. Unavailable unless it's asking. |
| `sensor.<pet>_debug` | Diagnostic, **disabled by default**. Enable it on the entity's settings page to see the raw numbers. What the house was doing (who's home, the show, the song) shows as `**REDACTED**`, privacy option or not. For a file to share, use **Download diagnostics** on the pet's device page instead: it leaves out your entity IDs and people's names. |

### Quick dashboard card

```yaml
type: entities
title: Pip
entities:
  - sensor.pip_mood
  - type: attribute
    entity: sensor.pip_mood
    attribute: reason
    name: Says
  - sensor.pip_life_stage
  - sensor.pip_hunger
  - sensor.pip_happiness
  - sensor.pip_energy
  - sensor.pip_health
  - sensor.pip_discipline
  - sensor.pip_poop
  - sensor.pip_care_misses
  - binary_sensor.pip_calling
  - switch.pip_lights_out
  - button.pip_feed
  - button.pip_snack
  - button.pip_play
  - button.pip_clean
  - button.pip_medicine
  - button.pip_scold
  - button.pip_praise
```

## Connect it to your house (options)

Settings → Devices & services → **Hatch at Home** → the gear (⚙) next to your pet. The
dialog is titled **"What <name> notices"** and opens a menu of seven pages, one topic
each: Bedtime, People and privacy, Weather and air, The pet's room, The house helps,
Moon and sky, and Where notifications open. Pick a page, change what you like and
submit; you come back to the menu. Every field is optional except the ones with
defaults, and anything left empty is ignored. Saving applies the changes straight
away. Each pet has its own settings.

The house never hurts the pet. It changes its mood, its scene and what it asks for,
and it adds at most +3 happiness an hour.

### Bedtime

Bedtime and wake time are targets: the pet may turn in up to an hour either side.

| Field | Default | What it does | Example |
| --- | --- | --- | --- |
| Bedtime | 23:00 | Drowsy 30 minutes before. If nobody puts it to bed, it dozes off an hour after. Turning lights-out off after bedtime costs a little happiness. | 23:00 |
| Wake time | 07:00 | It wakes up on its own. | 07:00 |
| Bedtime lights | none | All off (from an hour before bedtime) plus a quiet house means bed. A light left on late doesn't keep it up past its bedtime. | bedroom lights |
| Motion sensors | none | Movement in the last 10 minutes means the house isn't quiet yet. | indoor occupancy sensors |

Lights-out (the switch, or the sleep button on the card) always wins, and the house
never wakes the pet. Flipped while the pet is at the sitter's, it takes effect when
the pet comes home.

### Weather and air

| Field | Default | What it does | Example |
| --- | --- | --- | --- |
| Rain sensor | none | On/off "it's raining", or a rain rate where anything above 0 means rain. Beats the forecast. Rain brings a rainy scene and a **blanket?** request. | `input_boolean.raining` |
| Weather forecast | none | Sunny, snow and fog, and rain when there's no rain sensor. Wind from the condition or the wind speed (30 km/h, or gusts of 50). Its daily forecast, if it has one, gives the pet something to talk about (see Passing moments). A new pet starts with your Met home weather here (or your only weather entity). A pet made before this update got it only if it had nothing set in that weather section; a weather integration you add later isn't filled in for existing pets. To undo it, clear the field and Submit: it stays clear. | `weather.forecast_home` |
| Indoor temperature | none | Outside the comfort range: shivers or sweats and asks for a **blanket** or a **fan**. | `sensor.indoor_temperature` |
| Too cold below | 18 °C / 64.5 °F | Shown in your unit system. No blanket request while the fireplace is lit. | default |
| Too warm above | 26.5 °C / 79.5 °F | | default |
| Air quality index | none | Above 100: a little mask, staying in. Cosmetic only. | `sensor.air_quality_index` |
| Solar radiation | none | Only if your weather station reports W/m². 300 or more counts as sunny. | leave empty |

### The pet's room

Lights, a fireplace, the TV and music change the pet's scene and mood.

| Field | Default | What it does | Example |
| --- | --- | --- | --- |
| Room lights | none | Still on at half brightness or more after bedtime: squints, "too bright, it's late!". Dim evening light makes it cozy. Daylight and the evening before bedtime never count, so lights kept at full until bed are fine. | living room lights |
| Fireplace | none | Any entity that's on, heating or above 0 when lit (not a thermometer: that's always above 0). Curls up by it and gets a little happier. | `switch.fireplace` |
| Light sensors | none | 100 lx or more after bedtime also counts as too bright. | optional |
| TVs | none | On or playing: watches along (small bonus). | `media_player.tv` |
| Music players | none | Playing anything but video: dances (small bonus). | your speakers |

### People and privacy

Who is home decides whether the pet is with you or at the sitter's. The two switches at the end decide what dashboards and sensors may show.

| Field | Default | What it does | Example |
| --- | --- | --- | --- |
| Home zone | `zone.home` | Counts the people in it. Someone arriving gets an excited greeting, at most once every 30 minutes. | `zone.home` |
| Off to the sitter's after | 2 h | With nobody home this long, the pet is frozen: no hunger, no aging, no calls. | 2 h |
| The sitter calms a fussy pet | on | If the pet was fussing for attention (not a real need) when it left, the sitter settles it and it comes home happy. Off: the fussing waits for you. Real needs always wait. | on |
| Keep presence private | on | An empty house shows the pet napping, never at the sitter's (care while it's away is refused as "asleep"), and the pet never says who came or went. For a wall tablet, also turn on "shared screen" in the card's settings. Turn it off to see "at the sitter's". | default |
| Pets may remember what people tell them | on | Each person may turn memory on for themselves (see "Memory" under Privacy below); this pet then keeps their picks and tags, dates and fixed choices only, until they forget them. Off: this pet keeps, says and asks nothing from memory. (If you turn it off on only some pets, the pet with it off may use the day's one question slot first, and the others then don't ask that day.) Off on every pet, or removing a pet when no other pet allows it, erases everyone's memory. Per pet. | default |
| Keep house words off sensors | off | Off: a news headline (`virtual_pet.share_news`) and a Custom house moment's own words (`virtual_pet.react`) sit on the pet's last-care sensor for a while, like its other moments, where any dashboard or template can read them. On: the open cards say them live, shared screens too, and they're kept nowhere: not on a sensor, not for a card opened later. The `virtual_pet_news` event keeps its headline either way (it's your automation's own words); `virtual_pet_house_moment` never carries the words while this is on. Per pet. | default |

### The house helps

| Field | Default | What it does | Example |
| --- | --- | --- | --- |
| Heating | none | Thermostats (heating, or set to heat and below the target), switches and toggles that are on. While it's on the chilly pet doesn't ask for a blanket and shows "nice and cozy". If it comes on while the pet is chilly and awake, the house tucks it in (as a blanket would), at most twice a day. A blanket for rain or thunder stays yours. | your living-room thermostat |
| Cooling | none | Fans, thermostats (cooling or running the fan), switches and toggles that are on. The same for a warm pet and the fan. | `fan.bedroom` |
| Notice robot vacuums | on | Every `vacuum.*` in the house counts, with nothing to pick. While one is cleaning the pet watches the robot go by ("a robot's zooming around!"); when it starts and when it heads home the pet says so (at most 3 starts a day; nothing while the pet is asleep or at the sitter's). Cosmetic only. A vacuum added after the pet started listening needs the integration reloaded (Settings → Devices & services → Hatch at Home → ⋮ → Reload) before it's noticed. Off: the pet ignores robots. | all your vacuums |
| Notice doorbells | on | Every doorbell in the house counts, with nothing to pick: any `event.*` entity whose device class is `doorbell` (Ring, UniFi Protect, Nest and DoorBird provide one). A press makes the pet startle, with two notes and a line. Nothing while the pet is asleep, away or an egg, and at most one every 30 minutes for each pet, however many doorbells. A restart, a reconnect or an old press never counts, only a press that just happened. The pet's "notices" row says "doorbell" and nothing more. **Privacy:** the press is said once, live, on every card open at that moment (remote viewers and shared screens too: anyone in the room heard the bell), and kept nowhere. It is never on a `virtual_pet_*` event, our logs or diagnostics, the sensors, the journal or the debug sensor, and a card opened later doesn't hear it. HA's own event entity and recorder still hold the press, as they always do. A doorbell added after the pet started listening needs the integration reloaded (Settings → Devices & services → Hatch at Home → ⋮ → Reload) before it's noticed. A doorbell you point the house moment blueprint at is heard once, by this setting. Off: the pet ignores doorbells. | all your doorbells |
| Washer, dryer, dishwasher | none | Pick any number of switches, sensors and binary sensors; the pet says so when one finishes a cycle (once, never repeated or reminded; nothing while the pet is asleep or at the sitter's; at most once an hour per machine). A **binary sensor** counts as running after 10 minutes on, and done when it goes off. A **sensor that names a state** (Home Connect, SmartThings, LG ThinQ, Miele) is done when it moves from a running state to one with "finish", "end", "complete", "done" or "ready" in it. A **power sensor** (device class power) or a **switch that reports `current_power_w`** is running above the idle power for 10 minutes and done after about 3 minutes at or under it. A plain switch that reports no power says nothing. The 10 and 3 minutes are checked when the machine changes and every 5 minutes, so they can run up to about 5 minutes long. The pet says "the washer's finished!", "the dishes are all done!", "the dryer's done!" or "a machine finished", from the entity's device class or name (wash, dry, dish), else machine. After a restart the pet times a machine that is already running from the restart, and one that finished meanwhile isn't counted. Cosmetic only; only the kind is shared, never which machine. | `binary_sensor.washing_machine_running` |
| Idle power | 5 W | For power readings: at or under this many watts counts as not running. | `5` |
| Chore lists | none | To-do lists. Each item someone ticks off earns the pet a treat (a little food and happiness, up to 5 a day). Treats wait if it's asleep or away. | your chores list |

### Moon and sky

| Field | Default | What it does |
| --- | --- | --- |
| Moon phase | none | Any phase sensor, such as `sensor.moon_phase` from HA's Moon integration. Full moon at night: "the moon is so big tonight!" and a little happiness (+1 an hour) if it's awake. New moon: a starry night, cosmetic only. With no moon sensor at all, the pet still goes by the date: full for about 3 nights a month, new for about 3. A sensor you map wins. |
| Moon illumination | none | Optional, the lit fraction (0–1 or %). Used when there's no phase sensor: 97% or more is full, 3% or less is new. |
| Moon altitude | none | Optional, degrees. The moon only counts while it's above the horizon. |

### Where notifications open

| Field | Default | What it does |
| --- | --- | --- |
| Dashboard to open | none | Tapping one of this pet's phone notifications opens this dashboard. Pick one or type a path, like `/lovelace/pets`. Empty opens the app as it was. Setup offers a second pet the first pet's dashboard to start with. |

### Privacy: what the pets remember

**What the pets remember about you.** Your birthday, your answers to its questions,
your alarm times, the last zone you came back from (only while "my day" is on),
your "baby talk", "my day" and "birthday on my phone" switches, and the pet your card
opens on, are kept for you alone, for every pet, in one place (the people store). The
dream you picked for tonight (and, the next morning, that it was your idea) is kept in
each pet's own save, not the people store, for about a day. They stay
when you remove a pet, even the last one, so they're there if you set it up again.
**"forget my data"** in settings (the gear on the status screen) (not on a shared screen) erases all of
that, for you only, at once; tonight's dream pick goes with "forget my data" on every pet that
is loaded (a disabled pet's stays in its save until that pet is loaded again and the
pick has aged out). Your bond with each pet, its photos and its nickname
for you stay. So does whether you get notifications: turn "notify me" off for that.
So does a "forget my birthday": the pets still won't ask for it. So does your answer to
"can i remember what you tell me?", yes or not now: the pets still won't ask whether to remember (your
memory itself goes). Messages already sent to your
phone, and switch changes, stay in Home Assistant's history until it clears them.
The pets start fresh with you, and they note again when you next come home. To
erase everyone's, an admin can stop Home Assistant and delete
`.storage/virtual_pet.people` (and any `virtual_pet.people.damaged.*` copies, which hold
everyone's records and memory too).

**Memory (off unless you turn it on).** With memory on, the pets keep a few
things you told them for longer than a day, so they can bring them up later: the
picks you made (tonight's dream, a game, a rain-or-sun guess, a great day) and which
kind of big day or weekend you said was coming, each with its date. Only choices from fixed
lists and dates: never typed words, never anyone's name, no times or places, and no
tough days. It is per person and one switch for every pet, kept in the people store,
until you forget it. Turn it on with "remember me" in settings (the gear on the status
screen; your own screen only, and only where the pet's option allows it, or while it is
on, so you can always turn it off). Turning it off
(two taps), or "forget my data", erases it at once. "Forget my data" keeps the pets'
record that they asked whether to remember (a yes-or-no and up to seven dates the question
was offered, nothing you told them), so they don't ask again.

**Tags.** With memory on, the box under "what is it?" (after a "yes" to "anything big
this week?" or "anything fun this weekend?") also asks "what kind of day is it?", with
one tag to pick: exam, match, show, trip, party, lesson, work thing or something else
("no tag" is the default, and nothing is kept for it). The tag is kept with the day:
the day you picked for a big day, the Saturday for a weekend; never what you typed. It
rides on the same answer as the "yes", so a tag the pet can't keep (memory turned off
on another screen, or this pet's option off) is just left out, and the big day stays.
Tags are kept until you forget them, at most 120 (the oldest go first), and go with the
rest of memory. "work thing" and "something else" are never said back.

Once you and a pet are close (bond level 4), it asks once, on your own screen and only
where its option allows it: "can i remember what you tell me?". "yes" turns memory on,
as the settings row does; "not now" is kept as your answer. Either way no pet asks
again, and the settings row still works. It isn't asked while baby talk is on.

**What the pets say from memory.** Only on your own screen, only while memory is on and
that pet allows it, one a look and after the pet's other news: the morning after you
told it your day was great ("yesterday was a great one! ♥"); a dream, guess or game you
keep picking (at most once a week each, and only after a new pick); once, the first
time a favourite weather or season you told it with memory on comes back; and, from a
big day's tag, a week after that day ("thinking of the show you told me about") and a
year after it ("a year ago you told me about a show ♥", not for an exam). Each of those
two is tied to its one day: with no look at the pet between 11:00 and 20:00 that day,
it is skipped. If three of the last five big days you tagged as a match, a show or a
lesson fell on the same weekday, the pet may wish you well on the eve of the next one
("maybe a match tomorrow! go you ♥"), skipped the same way, and one such remark a month at
most across all three; once the latest of them is more than eight weeks old, the pattern has
ended. It is worked out from the tags kept and nothing else, so
forgetting a tag can end it. On the day you have been friends for a whole year, the pet's line may
name the most recent big day you tagged in that year ("a whole year! you told me about
a show"). They say "you told me", never that the day happened, and never count. A shared
screen never gets these: they come with the pet's private news, which the card asks
for only on a screen that isn't shared. That is the card's own check, since the server
can't see the shared-screen switch. "great" is kept only while memory is on (and never
makes the next morning softer); with memory off it never leaves the card.

Things to know:

- It is in Home Assistant's backups, like the rest of the people store. Turning it off
  can't reach a backup made before, and restoring one brings it back.
- A family sharing one Home Assistant login (a shared login) shares one memory, and a
  tablet signed in as one person remembers for that person, whoever holds it. The
  card's "shared screen" switch keeps memory off a wall tablet, but it is the
  browser's own setting, not a lock: a tablet whose setting was cleared counts as
  personal.
- With children in the house: each person turns memory on only for themselves, on
  their own login, so a child with their own account can turn it on for their account;
  a parent can't turn it on for them, and they can't for a parent. Only picks and dates
  are kept for anyone. The pets won't ask a person with baby talk on whether to
  remember. An admin can turn memory off for the house (below).
- If someone turns on debug logging for `homeassistant.components.websocket_api`, Home
  Assistant logs every message, the picks sent to the pets included.
- After a downgrade to a version without memory, the record stays on disk, unread and
  no longer capped, until "forget my data" or a newer version.
- Downgrading to a version before this one drops "exam" tags (and any tag the older list
  lacks) the next time memory is saved.
- **For admins:** "Pets may remember what people tell them" in each pet's People and
  privacy options (on by default) lets that pet keep, say and ask about memory. Off on
  one pet only quiets that pet. Off on every pet erases everyone's memory at once,
  and so does removing a pet when no other pet allows it. A disabled pet's option still counts,
  so turn it off there too.

**Follow-ups.** Answer "tough" to "how was your day?" and the pet keeps only the
date, in memory, to be a little softer the next morning on your own screen; a restart
forgets it, and "ok" never leaves the card ("great" only while memory is on, above). Say "yes" to "anything big this
week?" (and pick the day) or "anything fun this weekend?" and it keeps that day (the date, not what it is) for a
week at most, to wish you luck or welcome you back. "what should we play tomorrow?" and
"should I learn a new trick?" keep only your pick, for that pet. What you type in "what
is it?" (optional, 20 characters at most) is kept in Home Assistant's memory only (never
on a sensor, in a log, a notification, diagnostics, Assist or a backup; a restart there
forgets it) and in the browser you typed it on, until that day is over, so a restart
doesn't lose it there. The pet says your words back only to you, on the browser you
typed them on or on a phone or the Home Assistant app, never on a shared screen; other
screens get its usual line. Things to know: if someone turns on debug logging for
`homeassistant.components.websocket_api`, Home Assistant logs every message, your typed
words included; if a family shares one Home Assistant account, every phone signed in to
it can hear them (as with birthdays); and "forget my data" erases all of it in Home
Assistant and in the browser you press it on, but a copy in another browser stays there
until its day is over.

With no pets left there's no card, so no "forget my data" button. An admin can
delete `.storage/virtual_pet.people` (and any `virtual_pet.people.damaged.*` copies) then, with Home Assistant stopped.

If an entity named in these settings is later renamed or removed, Settings →
**Repairs** says which ones. Submit the repair to make the pet forget them (nothing else
in its settings changes), or open the options page it names to pick the new ones.

### Fixed rules (not settings)

- **Sensor dropouts:** a sensor that goes unavailable keeps its last value for 10 minutes, then counts as unmapped. It never reads as dark or empty.
- **After a restart:** motion sensors all look freshly changed, so bedtime-by-darkness waits 10 minutes.
- **Requests:** the blanket and fan buttons are unavailable unless the pet is asking. Answering gives a happiness boost and two cozy (or cool) hours.
- **The numbers:** every one of them is in `custom_components/virtual_pet/rates.py`.

## How the pet works

### Resting

Each pet has a **resting** switch, off by default: in settings (the gear on the
status screen, "resting") or as `switch.<pet>_resting`. Turning it on refills
hunger, happiness and energy to at least 55 (health stays as it is) and settles an
open call, with no miss and no push left on the phone. That refill comes at most once
in 12 hours: rest it again sooner and it only pauses, keeping its needs, an open call
and its misses as they were until it wakes. While it rests:

- nothing lowers its needs by itself, it makes no hunger, happiness, energy or
  pretend calls, misses nothing, can't fall ill, and doesn't poop;
- **aging pauses**: it doesn't grow up, an adult can't lay its egg (wake it first),
  and there is no birthday party; when it wakes, its hatch day moves on by the whole
  days it rested, so its years are the time it lived;
- its day and night go on (bedtime, the morning, naps, the lights-out switch), and
  you can still visit, feed, play, give medicine (a sick pet may rest: it stays sick
  until medicine, and its health holds), play games and link it; visitors and finds
  still come, and chore treats wait until it wakes;
- the card shows "resting ☁" under it and it says easy-going things now and then.

Care still counts: a lot of play spends energy, so a pet may wake below a call
level and ask at once, as it would anyway. A sick pet, or one with an old poop, asks
about that on waking. Otherwise waking ("good stretch! i'm back ♪") brings no calls
for hours. The sitter's freeze (nobody home) wins while it lasts; resting carries on
when someone comes home. Every pet may rest at once (a holiday automation can flip
the switches); nothing wakes it by itself. An egg can't rest, because it would never
hatch.

The first time you pick which pet your card opens on, and you have other pets that
can rest, the settings sheet asks whether to rest them. "rest them" switches resting
on for the other pets on that card; "not now" leaves them as they are. It asks until
you answer, then not again ("Forget my data" starts it fresh). Resting pets won't
get any hungrier and don't grow up until they're back, and anyone can wake one from
its own settings.

All numbers live in `custom_components/virtual_pet/rates.py`, in units per hour.

- **Calls:** when hunger or happiness drops below 25, energy below 20, a poop
  sits for 30 minutes, or it gets sick, the pet calls. You have 20 minutes to
  answer (feed, play, lights out, clean, medicine). A missed call is a
  **care miss**. After a miss, it won't count another miss for it until the stat
  recovers above 40, but if the need lasts it asks again every 4 hours.
- **Fake calls:** now and then it whines when nothing is really wrong. *Scold*
  raises discipline. *Praise* during a fake call spoils it. Scolding for
  nothing makes it sad. Ignoring a fake call is not a care miss.
  A whine and a real plea to play often look alike: the hearts are the best clue.
- **Discipline:** the more of it, the less the pet whines: at 100 it whines a
  quarter as often (never not at all). It fades slowly while the pet is awake,
  about 4 points a day, so the habit needs a reminder now and then. Scolding a
  whine teaches the most; *Praise* within 10 minutes of care it needed (a meal
  when hungry, a clean-up, play or a finished game when bored, medicine when
  sick) teaches a little, once per care.
- **Praise:** cheers it up, but each press within half an hour gives less (8, 4,
  2, then nothing), and after the day's first three, only a touch. It can't
  stand in for play.
- **Poop:** a meal comes out about 2 hours later. Poop older than an hour slowly
  costs health and may make it sick. *Clean* flushes it.
- **Sleep:** bedtime 23:00, wake 07:00 (change both in the options). Lights-out puts it
  to bed; outside sleep hours that's a nap that ends when it's rested. Left up
  past bedtime, it dozes off on its own after an hour with no penalty. Turning
  lights-out off during sleep hours costs a little happiness. No calls while asleep.
  If its energy runs out, it falls asleep where it is (no penalty: the energy call
  before that was the warning).
- **Weight:** 0–100, healthy between 25 and 75. Meals (+4) and snacks (+6) add to it;
  being awake (−0.7 an hour), play (−3) and a game (−4) burn it off. Three meals a
  day roughly balance out, so snacks are what tip it. Too heavy or too light, it
  stops healing; too heavy, it can also get sick. Starving loses weight.
- **The games:** five rounds from the card, or `virtual_pet.play_game`: `guess`
  `left`/`right` plays left or right (the first guess starts it; the answer says where
  the pet went). For higher or lower, call it with `game: higher_lower` and no guess to
  start and see the first number, then `guess` `lower`/`higher`. For the berry dig, call
  it with `game: dig` and no guess to start, then `guess` `dig` or `keep`; `round` in the
  answer is rounds finished (a berry doesn't finish one), with `wins` (berries banked),
  `basket`, `leaves`, and after a tap `found` (`berry`, `bee` or `kept`) and `round_over`.
  `keep` on an empty basket answers `empty_basket` and changes nothing. A game costs energy
  like play, and an unfinished one is dropped after 3 minutes (a guess after that
  starts a new left or right game, and its answer has `restarted: true`; higher or
  lower and the berry dig answer `no_game`). `end: true` (the card's ✕) ends the game in
  progress with no reward, penalty or log line; a berry dig that has started is put aside
  instead (`parked: true` in the answer) for whoever ended it, and their next dig carries
  on from it. Calls with no person (automations) share one household slot. A dig guess
  with no game answers `no_game`, with `parked: true` if the caller's dig is put aside. Each pet counts games
  played and won per game (attribute `games` on the life stage and debug sensors,
  diagnostics, and the journal).
- **Chores:** map a to-do list in the options, and every item ticked off earns a treat.
- **Passing moments** (cosmetic, while it's awake and home):
  - It watches the sunset, greets the sunrise, and says good morning at the first
    movement in the house after wake time. It says good night when it's put to bed or
    the house goes dark and quiet.
  - It comments on what's on TV or playing ("ooh, Bluey!"), at most every 20 minutes,
    and yawns when the TV goes off late.
  - Thunder makes it hide and ask for its blanket, and the screen flashes; wind blows
    across the scene.
  - It remarks on the weather changing: rain starting or stopping (a rainbow, if the
    sun is out), snow starting, the sun coming out after two hours of cloud, a hot day
    (30 °C or more) or a freezing one (−10 °C or less), in your unit. At most one remark
    every 20 minutes, and the same one not again for 90 minutes.
  - If the weather entity has a daily forecast, it mentions today's a few minutes after
    good morning and tomorrow's in the evening, one to three hours before bedtime, but
    only when the day is worth a word: a storm, snow, a hot or cold day, a jump of 8 °C
    from the day before, rain, or sun after rain ("snow tomorrow!!").
  - The season's first snow and first frost (from the weather entity's temperature) are
    a moment once each winter, kept as memories in the journal. They notify too. So are
    the first fog of each winter-year (July to June) and the year's first warm day (20 °C
    or more, from March in the north or September in the south, through the six warm
    months; never in the tropics), on the card only.
  - The first day of each season ("first day of spring! ♪", by your latitude; none in
    the tropics) is a journal memory, said if the pet is awake in the season's first
    three days; on the card only.
  - It passes on news an automation tells it ("did you hear? Tamagotchi turns 30!"),
    at most every 30 minutes. See [Sharing news with the pet](#sharing-news-with-the-pet).
- **Sickness:** health below 25, four care misses in a day, old poop, or being too heavy.
  Medicine cures it. **It never dies.**
- **Upbringing:** on reaching adulthood, how it was raised sets its upbringing for
  life. The score is 75% care and 25% its discipline, averaged over every waking
  hour from hatching. Care is mostly the share of waking hours it was well (not
  sick, and no meter under 10), with a little off for care misses (2 points
  each, at most two a day). The status screen shows what it's on track for;
  the discipline bar is today's.

  | Upbringing | Score | As an adult |
  | --- | --- | --- |
  | Devoted | 80+ | Gets hungry and bored 20% more slowly; hands its trait down one star deeper |
  | Steady | 50+ | As usual |
  | Scrappy | below 50 | Whines half as often again (it never hurts it) |

  A pet kept well with a little discipline grows up devoted; seen to four
  times a day, it grows up steady; left hungry, bored or sick much of the time,
  scrappy. Pets that were growing up when this rule came in keep the
  grade they were on track for, up to steady, until their next counted miss.
- **Personality:** on becoming a teen, the pet settles into one of eight
  personalities and keeps it for life: mellow, sweet, bouncy, starry, old soul,
  fancy, charming or plucky. Any creature can be any type. It's mostly luck; each
  trait it has by then nudges it a little toward two types (a homebody leans sweet
  or mellow), and how it was cared for never counts. It's flavour only: it never
  changes a stat, a call or a care result. The status screen and the journal show
  it, and a new teen says which kind it is. From then on, about half the time, it
  says its hellos, good morning, good night, the sunset, a wish coming true and its
  favourite snack in its type's own words (on a shared screen, hellos without a
  name; a few more once it knows you well). Its idle chatter and mood line keep the
  usual words for now.
- **Traits:** the pet picks up habits from your house and keeps them for life, up
  to **four** (an inherited one counts; once it has four it learns no more). Only
  time it spends awake counts, and traits only ever add a little happiness (all
  house bonuses together stay under the cap of +3 an hour). Each pet has its own
  **temperament**, rolled when it hatches: it takes to some things sooner than
  others (each threshold below ×0.6 to ×1.6), so pets raised in the same house
  can still turn out differently.

  | Trait | Learned from | While it happens |
  | --- | --- | --- |
  | Night owl | 10 h up during sleep hours | Stays up twice as long before dozing off; +0.5 an hour up late |
  | Music lover | 12 h of music | +1.5 an hour on top of the music bonus |
  | Homebody | someone home ≥ 75% of 48+ awake hours (needs the home zone) | +0.5 an hour with company |
  | Sun lover | 20 h of sunshine | +1 an hour on sunny days |
  | Fireside | 10 h by a lit fireplace | +1 an hour by the fire |
  | Moon child | 3 h awake under a full moon | +1 an hour under a full moon |
  | Storm watcher | 15 h of rain | +0.5 an hour while it rains |
  | Couch potato | 12 h of TV | +0.5 an hour watching TV |
  | Social butterfly | 2.5 h of greetings (about 15 arrivals) | +1 an hour while greeting |
  | Snow child | 6 h of snow | +0.5 an hour while it snows |
  | Breeze rider | 10 h of wind | +0.5 an hour while it's windy |
  | Fog wanderer | 8 h of fog | +0.5 an hour while it's foggy |
  | Thunder heart | 2 h of thunderstorms | +0.5 an hour during a storm |
  | Early bird | 7 mornings the house stirred within an hour of wake time (needs motion sensors) | +0.5 an hour for two hours after wake time |
  | Helper | 10 chore treats | +4 more happiness per chore treat |
  | Player | 15 games finished | +4 more happiness per game won |

  **On the card**, a pet's traits show as little flair around it (never drawn on it)
  about once a minute: above its head (a rain cloud, a thunder flicker, a sunrise,
  the moon), in the air around it (notes, a butterfly, snowflakes, leaves,
  fireflies, sun glints) or at its feet (embers, mist, a broom, a ball, a cushion,
  popcorn). One trait per place at a time, so a pet's mix shows as one picture;
  deeper traits show a little more. Not during games, sleep or the status screen;
  with reduced motion it stands still.

  Traits have levels, ★ to ★★★: effects are ×1, ×1.5 and ×2. A new egg
  inherits one of its parent's traits at the parent's level (shown with ↓). If
  the child also learns it for itself, it goes up a level, so a trait kept in the
  family deepens over the generations. Seasonal traits (sun lover, fireside) carry
  through the seasons this way.
- **Generations:** a week into adulthood the card offers "lay an egg?" (two taps,
  so it can't happen by accident), as long as the pet isn't sick. Nothing ends until you choose it, so a favourite
  pet can stay forever. The adult retires to the journal and a new egg takes its
  place; it inherits one of the parent's traits and, as always, prefers a creature
  this device hasn't raised yet.
- **Choosing the next egg:** to pick the creature instead of a surprise, set
  `select.<pet>_next_egg` (on the pet's device page, under Configuration) before the
  egg hatches, for example before laying it. It lists the egg's world, the new one if
  a world change is waiting. The choice is for one egg; the next is a surprise again.
- **The journal:** on the status screen, tap "journal". Under its title, "this week"
  shows the last seven days that held something, oldest first: ✦ a dream, the day's
  first weather (☂ rain, ❄ snow, ☀ sun, ⚡ a storm, ☁ fog), and the visitor who came while
  finds are shown. Quiet days are left out, not shown blank. It shows the world's
  creatures (ones nobody in this home has raised yet are silhouettes) and this
  device's family line: each generation with its traits, stars, upbringing and
  personality. The latest four show; past them, "older generations (N)" opens the rest,
  oldest first.
  Under the creatures, "every world ›" shows all six worlds, five creatures each, the
  pet's own world first: the ones a pet on this card has raised are drawn, the rest are
  silhouettes. The journal, finds and every-world pages each have a "‹" back link in a
  band at the top, like the settings sheet. A tap on a creature's tile keeps the page
  open and the pet says a line about it, once a tile (the page keeps its place when the
  pet updates, too).
- **Notifications:** opt in per person. In settings (the gear on the status screen), tap "notify me" to get
  this pet's calls (each need has three phrasings, one a day: "Pip is hungry!" one day,
  "Pip's tummy is rumbling!" another), sickness, hatching, growing up, new or deeper traits, the season's
  first snow and frost, new eggs, and a holiday greeting on the morning of Halloween
  ("Happy Halloween! Pip is dressed up and ready to trick or treat 🎃") and of
  Thanksgiving ("Happy Thanksgiving! Pip is thankful for you 🦃"), and two winter lights
  mornings: 1 December ("The winter lights are up! Pip is all aglow ✨") and 21 December
  ("Winter lights day! Pip saved you a star cookie ✨"), on your phone, through
  the Home Assistant app. It only changes them for whoever is signed in; each person
  chooses for themselves. Automations can use `virtual_pet.notify_me` the same way.
  A call's notification has buttons that answer it (Feed, Medicine, Lights out; Play
  or Scold for a plea to play), and it clears itself once the call is answered or
  missed. A need asking again is an ordinary notification, and poop calls stay on
  the card. Fast-forward never notifies.
  The pet asks once: after a call is missed (or while one is waiting), it may ask
  "can I call your phone when I need you?". It asks only people signed in to the Home
  Assistant app on a phone, never someone already getting its calls, and at most one
  question a day. Once you've seen it, it never asks again (unless you "forget my data"). "yes ♥" turns "notify me" on for that pet.
- **Sounds:** off until you turn them on. In settings (the gear on the status screen), tap "sounds here"
  for little chirps when the pet calls, hatches, learns a trait or wins a game. It
  only changes this browser, and the pet stays quiet while it sleeps and from 21:00
  to 08:00.
- **Its voice.** Every creature has its own sound: the bird says "tweet", the
  squirrel "chirr", the octopus "bloop". Now and then a line opens with it ("tweet!
  hi, Sam!"), never more than once every two minutes, and never on a sad or sick
  line. Lines type out at the creature's own speed (not with reduced motion turned
  on). Tap "babble" in settings (the gear on the status screen) for its voice as it talks, a tiny sound
  per letter at its own pitch: off by default, only for this browser, and quiet at
  the same times as the chirps. Screen readers hear the words without the sound.
- **Its favourite snack.** At hatching each pet picks a favourite from its
  creature's foods (the squirrel likes hazelnuts, fir cones and mushrooms), and now
  and then a snack turns out to be it: "hazelnuts, my favourite!!", at most once a
  day. It's on the life stage sensor as `favourites`.
- **Its catchphrase.** Each creature has one of its own ("tra la" for the bird,
  "acorn" for the squirrel), said now and then at the end of a line that names
  nobody. Once you're close (bond level 7), the pet asks you once what it should
  say instead: hehe, yay, and stuff, la la, or keep the one it has. The latest
  friend's choice is the pet's, and everyone hears it. A new generation asks again.
  It's on the life stage sensor as `catchphrase`.
- **Birthdays.** The pet's is the day it hatched (`hatched_on` on the life stage
  sensor; for a pet from before 0.33, worked out from when its egg was laid). In
  its first year it tells you each month ("I'm 3 months old today!"), then once a
  year it has a party: confetti and a party hat, on every screen. At bond level 4
  it asks you, once, when your birthday is (two steppers for the month and the day, or "skip", which it remembers). Your
  birthday is kept only for you: never on a sensor, an event or diagnostics. On the
  day, the first pet you look at says "happy birthday!!" with a little tune, and
  if you turn "birthday on my phone" on (in settings; off by default) and have
  "notify me" on, your phone hears it once that morning from the pet you're closest
  to, by its nickname for you. Like every phone message, that one is in Home
  Assistant's history, where admins can see it; that's why it starts off. "forget my birthday" in
  settings (the gear on the status screen; two taps) forgets it and stops asking; "forget my data" forgets
  everything the pets remember about you (see Privacy).
- **A photo, for best friends.** At bond level 10, once a pet is a teen, it makes
  you a framed photo of itself as it was that day ("I made you something! it's in
  your journal ♥"), once per generation. It's in your journal under "photos", seen
  only by you and never on a shared screen, a sensor or a phone message. Tap "save"
  to share it or keep it. The Android app can't save it, so there the picture says
  you can save it from a computer.
- **Baby talk.** Turn "baby talk" on (in settings; off by default) and, while a
  pet is a baby or a child, its common lines get simpler: "hungy!" for a baby's
  hungry call, "hi hi, Sam!", "yay yay!". Babies get the most changes, children a
  few; teens and adults never change. A pet is a baby for about its first day of
  age and a child for about the next four, so about 4.5 days in all (age pauses
  while it's away). A need still names the need (hungry, sleepy, play, stinky,
  medicine), and its catchphrase never ends a baby line. The switch is yours: it
  follows you to every pet and every device you're signed in on, but a change made
  on one device reaches the others at their next visit, up to an hour later. Only
  the card changes: phone messages, Assist, the journal and the status screen keep
  their words, and a shared screen has no switch and no baby talk.
- **A welcome for every new pet.** Adding a pet puts a note in the sidebar's
  notifications: "Pip, a new virtual pet, just moved in! Its egg hatches in about half an hour.
  Say hi ♥". It also goes to
  the phones of anyone who has "notify me" on for another pet in the house. A new
  generation laid as an egg isn't a new pet, and restarts never welcome again.
  The sidebar note also says where the pet shows: with no dashboard named anywhere it
  asks you to add the pet shelf card to one; the first pet with a dashboard gets the link and
  a line for when the card isn't there; a later pet on a dashboard the house already named
  gets the link alone. Setup offers a later pet the first pet's dashboard to start with, and
  on an empty card an admin gets "add a pet ›", which opens Home Assistant's add dialog.
- **Dashboard with the pet shelf:** when you add a pet (or later, in its options under
  Notifications), pick the dashboard that tapping its notifications opens, the
  welcome included, or type a path like `/lovelace/pets`.
- **Restarts never hurt it.** HA downtime freezes the pet: nothing decays,
  ages or expires while HA is off.

## Talking to it through Assist

Ask "how's Pip?" and the pet answers in its own words ("Pip is hungry: a little
peckish. It's a child, day 2. Today it wishes for a bubble bath."): its stage and
day, today's wish (never who it's for), the day's visitor once its visit is over
("A robin came by today."), and its traits if it has learned any. A sleeping pet
just says so. A resting pet is "taking it easy" ("Pip is taking it easy."), or keeps
its mood's word and adds "and resting" ("Pip is hungry and resting"). Ask "feed Pip"
and it's the same as pressing the button, logged under your name; resting refuses
nothing. Expose the resting switch and "turn on Pip resting" works through Home
Assistant's own switch intents.

- **LLM agents** (Claude, OpenAI, Ollama and others set to control Home Assistant)
  get two tools, `virtual_pet__status` and `virtual_pet__care`, with nothing to set
  up. The fast-forward debug action is never offered.
- **The built-in agent** needs sentences: copy
  [`docs/custom_sentences/en/virtual_pet.yaml`](custom_sentences/en/virtual_pet.yaml)
  to `<config>/custom_sentences/en/`, put your pets' names in its list, and restart.
  It covers "how's Pip doing", "feed Pip", "give Pip a treat", "play with Pip",
  "clean up after Pip", "give Pip medicine", "scold Pip", "praise Pip", "tuck Pip in",
  "give Pip a fan", "lights out, Pip" and, with one pet, "how's my pet" and "feed my pet". English only.
- A pet answers only if at least one of its entities is exposed to that assistant
  (Settings → Voice assistants → Expose). Its lights-out switch is exposed by default.
- The intents are `VirtualPetStatus` (slot `pet`, optional with one pet) and
  `VirtualPetCare` (slots `pet` and `action`: `feed`, `snack`, `play`, `clean`,
  `medicine`, `scold`, `praise`, `blanket`, `fan`, `lights_out`), for your own
  sentences.

## Sharing news with the pet

`virtual_pet.share_news` hands the pet a headline, and it says it in its speech bubble
on the card for a few seconds, like a TV title: "did you hear? …", "guess what? …",
"ooh, news! …", or "<topic> news! …" when you give a topic.

| Field | | |
| --- | --- | --- |
| `entity_id` | required | Any entity of the pet; a list for several pets. |
| `headline` | required | What the pet says. Spaces and line breaks are tidied, and anything past 60 characters is cut at a word with "…". |
| `topic` | optional | A short label such as the feed's name (up to 20 characters). |

- **Cosmetic only.** No stat changes, no excited mood, nothing saved, no notification.
- **Not while it's asleep, away or still an egg:** the news is dropped, not saved for
  later, like the other passing moments. It never wakes the pet.
- **At most one bit of news every 30 minutes per pet.** Anything sooner is dropped, so a
  burst of stories shows only the first. Dropped news doesn't start the wait.
- With "return response" it answers per pet (by config entry ID) with `shared`,
  `asleep`, `away` (only with privacy off; otherwise `asleep`), `egg` or `too_soon`.
- **Where the headline goes.** On the `virtual_pet_news` event, and for a while on the
  pet's last-care sensor (its `moments`), so the card can say it. With "Keep house
  words off sensors" on (People and privacy), the sensor gets only that there was news, and the
  open cards hear the headline live instead.

For example, when a news sensor's latest headline changes:

```yaml
triggers:
  - trigger: state
    entity_id: sensor.example_pet_news
    attribute: title
conditions:
  - condition: template
    value_template: "{{ trigger.to_state.attributes.title not in [None, ''] }}"
actions:
  - action: virtual_pet.share_news
    data:
      entity_id: button.pip_feed
      headline: "{{ trigger.to_state.attributes.title }}"
      topic: "{{ trigger.to_state.attributes.source | default('') }}"
```

## House moments (virtual_pet.react)

`virtual_pet.react` tells the pet that something in the house happened, and what it is:
the pet says a line of its own ("the washer's finished! ♪", "ding! time's up! ♪"),
reacts (a hop, a cheer, a cozy settle, a little dance or a startle) and, where there is
one, shows a house effect (warm air, cool air, suds, a tumble). The easiest way to use
it is the [house moment blueprint](#let-the-pet-notice-things-house-moment-blueprint).

| Field | | |
| --- | --- | --- |
| `entity_id` | required | Any entity of the pet; a list for several pets. |
| `category` | required | What it is (the table below). |
| `source` | optional | The entity that changed. Read to check the change and to step aside for the pet's own house settings, never kept or sent on. |
| `from_state`, `to_state` | optional | The change it saw. Leave both out and it always counts (your automation has decided). |
| `held` | optional | Seconds the old state held, so a washer that ran a minute isn't "done". |
| `match` | optional | Custom only: the state that counts. Empty: any change. |
| `reaction` | Custom | `hop`, `cheer`, `cozy`, `dance` or `startle`. Required for Custom; every other category has its own. |
| `text` | optional | Custom only: what the pet says, up to 40 characters (longer is cut with "…"; blank is its own line). Ignored with any other category. |

| Category | Counts when | Reaction | Effect |
| --- | --- | --- | --- |
| Heater (`heater`) | a thermostat's mode leaves off for heat (or heat/cool); a switch or toggle turns on | cozy | warm air |
| Air conditioner (`ac`) | a thermostat's mode leaves off for cool, dry or fan only; a switch or toggle turns on | cozy | cool air |
| Fan (`fan`) | it turns on | hop | cool air |
| Washing machine, dryer, dishwasher | on to off after 10 minutes on; a state sensor going from running to finished, end, complete, done or ready | cheer | suds (dryer: a tumble) |
| Oven (`oven`), card only | on to off after 10 minutes (never when it comes on) | cheer | none |
| Coffee maker (`coffee`), card only | on to off after a minute | hop | none |
| 3D printer (`printer`) | as a washer | cheer | none |
| EV charger (`ev`), card only | as a washer, or a state sensor going to charged or full | cheer | none |
| Pet feeder (`feeder`) | a button or event pressed, a timestamp changing, a count rising, a switch turning on | hop | none |
| Plants / watering (`plants`) | a valve or switch closing after a minute; a moisture sensor rising 10 points | cozy | none |
| Mailbox / delivery (`delivery`), card only | a sensor turning on, an event, a count rising | startle | none |
| Timer (`timer`), card only | `timer.finished` (the blueprint sends it; a cancelled timer doesn't count) | startle | none |
| Internet (`internet`) | a connectivity sensor back on after 2 minutes off (never when it goes down) | dance | none |
| Custom (`custom`) | any change, or only `match` | yours | none |

No garage door: whether a door is open is a security signal, not a moment. Robot vacuums
and doorbells have their own settings (The house helps).

- **Cosmetic only.** No stat changes, nothing saved, no notification.
- **Not while it's asleep, away or still an egg:** dropped, not saved for later. It
  never wakes the pet.
- **Each category at most every 10 minutes**, and any two house moments at least 20
  seconds apart, so two bubbles never stack. A washer and a dishwasher finishing
  minutes apart are both said. Separate from the news's wait. A dropped call starts no
  wait.
- **The pet's own settings come first.** A `source` that's already in its Heating,
  Cooling or Washer, dryer, dishwasher settings is left to those, so one change never
  gives two bubbles: the call answers `native` and does nothing. The cost: a heater in
  the Heating setting gets the pet's "the house heard me" moment only when it comes on
  while the pet was chilly, never a house moment every time it turns on. Take it out of
  that setting if you'd rather have the moment every time (and lose the tuck-in).
- With "return response" it answers per pet with `shared`, `ignored` (that change isn't
  this category's moment), `native`, `asleep`, `away` (only with privacy off), `egg` or
  `too_soon`.
- **Card only.** Oven, coffee maker, EV charger and delivery say someone is home (a
  parcel at the door, someone up making coffee, the car home), so they're said live on
  the open cards (shared screens too) and kept nowhere: never on a sensor, an event,
  the journal or diagnostics. A card opened later doesn't hear it.
- **Custom words** are your automation's own. They're on the `virtual_pet_house_moment`
  event and for a while on the last-care sensor, unless "Keep house words off sensors"
  is on (People and privacy): then they're said live on the open cards only. Either way they're
  never in our logs or diagnostics. Home Assistant itself keeps a service call's data
  in its own `call_service` event and in automation traces; those are out of our hands.

## Events

Fired on the HA event bus, each with `pet_id` (the config entry ID). No person
names are included.

`virtual_pet_call_started` (with `recall: true` when a missed need asks again),
`virtual_pet_call_answered`, `virtual_pet_care_miss`, `virtual_pet_call_expired` (a
missed re-call, which isn't a care miss),
`virtual_pet_discipline_miss`, `virtual_pet_pooped`, `virtual_pet_became_sick`,
`virtual_pet_recovered`, `virtual_pet_fell_asleep`, `virtual_pet_woke_up`,
`virtual_pet_stage_changed` (with `personality` on becoming a teen, `upbringing` on reaching adulthood), `virtual_pet_care`, `virtual_pet_hatched`,
`virtual_pet_request_answered`, `virtual_pet_went_away`, `virtual_pet_came_home`,
`virtual_pet_rest_started` and `virtual_pet_rest_ended` (the resting switch; nobody's name),
`virtual_pet_game_finished` (with `game`, `won`, `wins`; `dropped: true` for a game left unfinished after a guess, which counts as a loss and grants no wish, record or bond), `virtual_pet_chore_treat`,
`virtual_pet_sunrise`, `virtual_pet_sunset`, `virtual_pet_good_morning`,
`virtual_pet_watching` and `virtual_pet_listening` (when the pet notices a new show or song, at most every 20 minutes, with
no `title` or `artist`: for every change, read `media_title` from your media player),
`virtual_pet_tv_off_late`, `virtual_pet_news` (with `headline`, and `topic` if given),
`virtual_pet_first_snow`, `virtual_pet_first_frost`, `virtual_pet_season_start` (with `season`),
`virtual_pet_trait_learned` and `virtual_pet_trait_deepened` (with `trait`, `level`), `virtual_pet_egg_laid` (with `generation`,
`parent_species`, `inherited_trait`), `virtual_pet_welcomed` (once, when the pet is added),
`virtual_pet_wish_made` and `virtual_pet_wish_granted` (with `kind`),
`virtual_pet_someone_home` (anyone signed in came home; it says nobody's name),
`virtual_pet_holiday` (with `holiday`: `halloween`, `thanksgiving`, `winter_lights` or `winter_treat`), `virtual_pet_weather` (with `change`),
`virtual_pet_forecast` (with `when` and `kind`), `virtual_pet_house_answered` (with `request`: `blanket` or `fan`; the heating or cooling came on for the pet), `virtual_pet_robot_out` and `virtual_pet_robot_home` (a robot vacuum started a run and went home; no vacuum is named), `virtual_pet_appliance_done` (with `kind`: `washer`, `dryer`, `dishwasher` or `machine`; no machine is named; there is no doorbell event: a press is never on the bus), `virtual_pet_house_moment` (with `category`, and for Custom `reaction` and its `text` unless the words are kept off sensors; never for oven, coffee, EV, delivery or timer, and never naming the entity), `virtual_pet_call_settled` (everyone left and the sitter settled its needs),
`virtual_pet_favourite_snack` (with `food`),
`virtual_pet_found` (with `id` and `world`, when the pet finds something).

No person's bond, nickname, favourite game, notifications or aimed wish is ever on an
event or a sensor: each person's card gets its own over a private websocket
subscription. So a bond's moments (a level-up, a new best, a favourite game, a close
friend coming home, a tuck-in) are not events, and `virtual_pet_wish_made` doesn't
say whom a wish is for. A "welcome home" automation can use
`virtual_pet_someone_home` or the person entity instead. Nor is the show or song the pet
noticed, or a dream about one: the cards hear those on the same subscription (anyone who
can open a card can already read your media players). What it notices about someone's day, where
they've been, their alarm and their answers are never an event: they go only to
that person, in `virtual_pet.visit`'s response, and answers come in through the
websocket command `virtual_pet/answer`, which (unlike a service call) puts nothing
on the event bus. The visit service's door notes can carry a tag key (for example
`"exam"`), so an automation that saves the response can see it.

Events fired during a fast-forward carry `simulated: true`.

### Let the house answer a call (blueprint)

[![Import the blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Falpine-vortex%2Fhatch-at-home%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fvirtual_pet%2Fcall_response.yaml)

An optional automation blueprint: when the pet calls, lamps you pick blink or glow a
colour for a moment, and a speaker can play a short sound. Nothing happens until you
make an automation from it. HACS doesn't install blueprints, so import it with the
button, or under Settings → Automations & scenes → Blueprints → Import, from
`https://github.com/alpine-vortex/hatch-at-home/blob/main/blueprints/automation/virtual_pet/call_response.yaml`.

- Only lamps that are already on are touched, and never their brightness, so a dark
  room stays dark and the pet doesn't sense a brighter room. A colour pulse puts the
  lamps back as they were.
- Quiet hours (22:00–07:00 by default) mute the sound, not the lamps.
- After a response, further calls are ignored for the cooldown (30 minutes by
  default). Fast-forward calls are ignored.
- A fake call (see "How the pet works") looks the same as a real one, here too.

### Let the pet notice things (house moment blueprint)

[![Import the blueprint](https://my.home-assistant.io/badges/blueprint_import.svg)](https://my.home-assistant.io/redirect/blueprint_import/?blueprint_url=https%3A%2F%2Fgithub.com%2Falpine-vortex%2Fhatch-at-home%2Fblob%2Fmain%2Fblueprints%2Fautomation%2Fvirtual_pet%2Fhouse_moment.yaml)

Pick an entity and say what it is, and the pet notices it. Import it with the button,
or under Settings → Automations & scenes → Blueprints → Import, from
`https://github.com/alpine-vortex/hatch-at-home/blob/main/blueprints/automation/virtual_pet/house_moment.yaml`,
then make one automation from it for each thing.

- **Pet**: any entity of the pet. **Entity**: the thing. **What it is**: a category
  from [House moments](#house-moments-virtualpetreact). That's all; you never have to
  write a line.
- **Custom**: pick a reaction, and optionally type the words (up to 40 characters) and
  the state that counts (such as `finished`). Empty words: the pet says its reaction's
  own line.
- The blueprint passes every state change of the entity (not attribute changes, and
  never from or to unavailable) to `virtual_pet.react`, which decides by the category
  whether it counts. A timer counts on `timer.finished`.
- A thermostat that's already heating when the heating comes on doesn't change state
  (only its `hvac_action` does), so the Heater category counts its mode leaving off.
  The heating coming on for a chilly pet is the Heating setting's job.

## Testing with fast-forward

Developer Tools → Actions → **Hatch at Home: Fast forward**, with `hours: 6`. The
pet lives those hours instantly at normal rates, with nobody caring for it, so
unanswered calls become care misses. Tick "return response" to see the
events. Admin only.

## Recorder

Long attributes (the care log, mood flags, debug detail) are already kept out
of the history database. Optionally drop the debug sensor completely:

```yaml
recorder:
  exclude:
    entity_globs:
      - sensor.*_debug
```

Its events are recorded like any other; none carries a person. To keep them out of
history altogether: `recorder: exclude: event_types: [virtual_pet_care, …]`.

**Events from older versions.** Before the privacy update, the pets fired `virtual_pet_bond_up`,
`virtual_pet_bond_record`, `virtual_pet_bond_favourite`, `virtual_pet_friend_home` and
`virtual_pet_tucked_in` with the person's user ID (and a nickname or favourite game),
`virtual_pet_wish_made` with whom the wish was for, and `virtual_pet_watching` and
`virtual_pet_listening` with the show's or song's `title` (and `artist`). Those rows stay
in history until the recorder purges them (after `purge_keep_days`, 10 days by default).
To remove them sooner, add those eight event types under `recorder: exclude:
event_types:` and run the **Recorder: Purge** action with **Apply filter** on.

## Development

Never develop against your live HA. This repo includes a throwaway instance.

```sh
scripts/setup     # .venv with HA 2026.10 + test tools (needs uv, Python 3.14)
scripts/test      # ruff + pytest
scripts/develop   # throwaway HA at http://localhost:8123, config in dev/config
scripts/card-check  # with develop running: drives the card in Chromium (Playwright)
```

`scripts/card-check` onboards a fresh instance (user `dev`, password `devdevdev`) and
creates two pets if there are none. It then checks the shelf, status and journal
screens, a full game, the reactions to moments, the egg's frames and the card editor,
and saves screenshots to `dev/card-check/`.

The card is built: `src/card/*.js` are joined into
`custom_components/virtual_pet/frontend/hatch-pet-card.js`, which git does not track.
The scripts above build it themselves; a copy of `custom_components/` from a branch or
a clone has no card until you run `node scripts/build-card.js` (the release zip has it).

`dev/config/configuration.yaml` has stand-in entities (fake weather, lux,
indoor temperature, AQI, motion, presence and music) for the home-awareness
phases.

To release: bump the version in `const.py`, `manifest.json` and
`src/card/prefs.js` (`VERSION`; `BOOT_VERSION` lives there too) and push. Then on GitHub open Actions → Release →
Run workflow. It tags that commit with the manifest's version and publishes a
GitHub release, which is what HACS offers as an update. (Pushing a tag like
`v0.6.1` does the same.) The Validate workflow runs
HACS's and Home Assistant's checks and the tests on every push.

## Roadmap

0. ✅ Test bench
1. ✅ Living pet
2. ✅ The card: device shelf, sprites, speech bubble, poop, attention icon, status screen
3. ✅ Home awareness: options (entity mapping, bedtime, privacy), weather, light, bedtime, presence, activity, AQI and requests
4. Life (in progress): ✅ traits, ✅ generations and journal, ✅ moon, ✅ notifications, ✅ adult forms, ✅ upbringing, ✅ weight; still to come: bird visits from BirdNET-Pi
5. ✅ HACS packaging
6. Play (in progress): ✅ chore treats, ✅ the left or right game, ✅ higher or lower, ✅ talking to it through Assist, ✅ 30 species
7. ✅ Friends and seasons: a bond with each person, world visitors, Halloween, Thanksgiving and winter lights, shells and the settings gear, device charm (the infrared link, the backlight, sounds and babble)

## License

MIT, see `LICENSE`. The bundled Tiny5 font is under the SIL Open Font License
(`custom_components/virtual_pet/frontend/fonts/OFL.txt`).
