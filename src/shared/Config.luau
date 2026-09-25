-- All gameplay tuning numbers live here so balancing never means hunting through scripts.

local Config = {}

-- Round flow ------------------------------------------------------------------
Config.MIN_PLAYERS = 2
Config.INTERMISSION_TIME = 15
Config.ROUND_TIME = 300
Config.POST_ROUND_TIME = 8

-- With only one player in Studio, start rounds anyway with that player in this
-- role so mechanics can be tested solo. Has no effect in a live server.
Config.SOLO_TEST_IN_STUDIO = true
Config.SOLO_TEST_ROLE = "Ghost" -- "Ghost" or "Human"

-- Ectoplasm (the Ghost's health) ----------------------------------------------
Config.MAX_ECTOPLASM = 100
Config.PASSIVE_DRAIN_PER_SECOND = 0.05 -- ~15 over a full round
Config.VACUUM_DRAIN_PER_SECOND = 4 -- per Human hitting the Ghost

-- Vacuum ----------------------------------------------------------------------
Config.VACUUM_RANGE = 30
Config.VACUUM_CONE_DEGREES = 22
Config.VACUUM_TICK = 0.1 -- server cone checks run 10x per second
Config.VACUUM_CHARGE_MAX = 100
Config.VACUUM_CHARGE_USE_PER_SECOND = 12
Config.VACUUM_CHARGE_REGEN_PER_SECOND = 20
Config.VACUUM_OVERHEAT_UNLOCK = 35 -- charge needed before an overheated vacuum works again

-- Possession ------------------------------------------------------------------
Config.POSSESS_RANGE = 12
Config.POSSESS_COOLDOWN = 1.5
Config.POSSESS_MOVE_SPEED = 28 -- top cruising speed of a possessed object
Config.POSSESS_VERTICAL_SPEED = 18
Config.POSSESS_MAX_ACCEL = 90 -- caps how fast objects change direction, so they feel heavy
Config.POSSESS_LAUNCH_SPEED = 75
Config.POSSESS_LAUNCH_COOLDOWN = 1.2
Config.POSSESS_LAUNCH_COAST_TIME = 0.6 -- steering is paused this long after a launch
Config.POSSESS_MAX_SPEED = 110 -- server kicks the Ghost out of objects moving faster than this

-- Possessed-object hits -------------------------------------------------------
Config.HIT_MIN_SPEED = 25
Config.HIT_COOLDOWN = 0.8 -- per object, per Human
Config.HIT_DAMAGE_PER_SPEED = 0.5
Config.HIT_DAMAGE_MIN = 10
Config.HIT_DAMAGE_MAX = 40
Config.HIT_HEAVY_MULTIPLIER = 1.5
Config.HIT_KNOCKBACK_SPEED = 45

-- Humans ----------------------------------------------------------------------
Config.HUMAN_MAX_HEALTH = 100
Config.HUMAN_WALK_SPEED = 16
Config.DOWNED_WALK_SPEED = 3
Config.BLEEDOUT_TIME = 20
Config.REVIVE_HOLD_TIME = 2
Config.REVIVE_RANGE = 10
Config.REVIVE_HEALTH = 50

-- Ghost -----------------------------------------------------------------------
Config.GHOST_WALK_SPEED = 20
Config.GHOST_SELF_TRANSPARENCY = 0.7 -- how the Ghost sees its own body
Config.GHOST_REVEALED_TRANSPARENCY = 0.75 -- how Humans see the Ghost while vacuuming it

return Config
