-- Server entry point: sets everything up, then hands control to the round loop.

local Modules = script.Parent.Modules

local Characters = require(Modules.Characters)
local Humans = require(Modules.Humans)
local Map = require(Modules.Map)
local Possession = require(Modules.Possession)
local RoundManager = require(Modules.RoundManager)
local Vacuum = require(Modules.Vacuum)

Characters.init() -- registers collision groups, so it goes first
Map.init(Characters.PROP_GROUP)
Humans.init()
Possession.init()
Vacuum.init()

print("[Poltergeist] Server ready")
RoundManager.run()
