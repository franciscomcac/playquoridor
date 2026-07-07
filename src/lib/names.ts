// Gaming-style usernames. Combined pool + optional tag suffixes produces
// tens of thousands of variants that all still feel hand-picked.

const BASE_NAMES = [
  // Cyber / techy
  "zephyr","cypher","neonPulse","glitchBoy","axiom","voidling","circuitFox","binaryOwl",
  "phaseShift","overclocked","packetLoss","kernelKid","segFault","null_hero","daemon","hex_ghost",
  "byteBender","cache","fuse","staticSage","subroutine","socket7","raster","logicBomb",
  // Mystic / fantasy
  "shadowfox","dracari","nyxxo","obsidian","emberwing","frostbite","runegazer","stormcaller",
  "hex","witchbolt","ashenveil","voidmage","lichling","direwolf","havoc","gloomtide",
  "duskrunner","paleflame","spectra","reverie","banshee","valkyrion","onyxheart","wraithkin",
  // Sci-fi / space
  "nova","quasar","pulsar","meteorMouse","asteria","cosmoCat","stellarhound","astral",
  "helix","gravity","nebula","voidwalker","orbital","cryo","aurora","interstellar",
  "andromedae","corvus","corona","perigee","photon","supernova_kid","zenith","lunaria",
  // Chess / tactical
  "checkmate","zugzwang","rookrider","paladin","gambit","enPassant","kingslayer","queenside",
  "flanker","openingline","zwischenzug","calculatr","tempo","initiative","fischerbait","tal_ghost",
  // Gamer classic-feel
  "vex","kai","raiko","hollow","jinx","reaper","phantom","havokk","riftlord","frostbyte",
  "shroud","tempest","warbringer","stormbreak","havocwing","echoslay","nightblade","siege",
  "korra","dagr","krush","ricochet","recoil","frag","clutch","noscope","ace_hunter","kilo",
  "delta","tango","charlie","bravo","zulu","sigma","omicron","juno","atlas","orion",
  // Animals / creatures
  "wolfgang","panther","krakenx","hyena","viper","cobra","serval","lynx","raven","jackal",
  "griffin","phoenix","chimera","basilisk","tigra","mantis","hawkeye","kestrel","stag","condor",
  // Words + tone
  "midnight","aftermath","overkill","killswitch","fallout","meltdown","aftershock","ricochet2",
  "backlash","cutthroat","bulletpoint","triggered","dropshot","doubletap","softlock","hardlock",
  "poltergeist","banished","freefall","tailspin","cataclysm","paradox","enigma","cryptic",
  // Aesthetic / lowercase gamer
  "y2k","lowkey","softboi","pastelvoid","matcha","depressoespresso","kirbyfan","spaceCadette",
  "mothra","yumemi","kokomi","yuzuu","xoxo_gg","hikari","tsuki","kaguya","suzuran","mochi",
  // Numbers/letters vibes
  "K1LO","zxcvbn","qwerty","asdf","0penfire","3dgelord","4nomaly","c4ustic","d3ci","x9",
  // Hard-sounding
  "brutus","havok","zangief","kaido","volk","krieg","warden","reign","tyrannus","carnage",
  "obliterator","hellborn","warforged","ironclad","juggernaut","riotgear","siegebreaker",
  // Chill
  "chillbeats","cloudy","dreamy","lazyfox","daydream","napqueen","mellow","serene","zenmode","koi",
  // Retro / arcade
  "pixelburn","spriteknight","hi_score","gameover","respawn","1up","checkpoint","credits",
  "bosskey","warpzone","hyperbeam","gigacharge","turbo","arcadia","joystick","coin_op",
  // Anime-flavored
  "senpai","kohai","tenshi","akuma","raiden","kirito","asuka","rei02","levii","hanabi",
  "kagami","yoru","sora","rin","aiko","haru","ryu","tsuki2","kenshi","ikari",
  // Weapon / martial
  "blade","katana","tantoo","bushido","ronin","kenshin","ronin7","glaive","reaver","longbow",
  "crossbow","ballista","gauntlet","warhammer","halberd","scythe","spectre",
  // Slick 2-syllable
  "kova","zeno","milo","dax","ivo","enzo","otis","rylo","kira","syx",
  "mira","luca","kaiya","aro","brix","zayn","vela","nyra","oria","talon",
  // Techy leetspeak
  "gh0st","kn1ght","cr0w","w0lf","f0x","st0rm","fr0st","p0ison","sp3ctre","sp1der",
  // Playful
  "duckling","biscuit","pickle","tofu","peppr","waffles","brioche","nugget","pretzel","boba",
  // Ominous
  "silhouette","umbra","penumbra","eclipse","abyssal","hollowed","gravemind","shroudedone","witchmark","ashenone",
];

const TAGS = [
  "", "", "", "", "", "", "", "", "", "", "", "",
  "_x", "_gg", "77", "99", "42", "_tv", "z", "xx", ".exe",
  "_hd", "1", "2", "88", "13", "_og", "007", "23", "_v2",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomGamerName(): string {
  const base = pick(BASE_NAMES);
  const tag = pick(TAGS);
  return base + tag;
}

export function randomGamerNameDistinctFrom(taken: string): string {
  const t = taken.toLowerCase().trim();
  for (let i = 0; i < 8; i++) {
    const n = randomGamerName();
    if (n.toLowerCase() !== t) return n;
  }
  return randomGamerName() + "x";
}
