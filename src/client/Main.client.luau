-- Client entry point.

local PlayerScripts = script.Parent

local HUD = require(PlayerScripts:WaitForChild("HUD"))
local GhostController = require(PlayerScripts:WaitForChild("GhostController"))
local HumanController = require(PlayerScripts:WaitForChild("HumanController"))
local VacuumController = require(PlayerScripts:WaitForChild("VacuumController"))
local Visibility = require(PlayerScripts:WaitForChild("Visibility"))

HUD.init()
GhostController.init()
HumanController.init()
VacuumController.init()
Visibility.init()
