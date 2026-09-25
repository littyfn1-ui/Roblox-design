-- How the Ghost's body looks on this screen:
--   * the Ghost sees itself faintly, so it knows where it is
--   * Humans can't see it at all, except as a faint shape while a vacuum is draining it
-- The Ghost's footsteps and other character sounds are muted for everyone else.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local GameState = ReplicatedStorage:WaitForChild("GameState")

local player = Players.LocalPlayer

local Visibility = {}

local function getGhost(): Player?
	local ghostId = GameState:GetAttribute("GhostUserId")
	if not ghostId or ghostId == 0 then
		return nil
	end
	return Players:GetPlayerByUserId(ghostId)
end

local function refresh()
	local ghost = getGhost()
	local character = ghost and ghost.Character
	if not ghost or not character then
		return
	end

	local isMe = ghost == player
	local transparency = 1
	if isMe then
		transparency = Config.GHOST_SELF_TRANSPARENCY
	elseif ghost:GetAttribute("Revealed") then
		transparency = Config.GHOST_REVEALED_TRANSPARENCY
	end

	for _, descendant in character:GetDescendants() do
		if descendant:IsA("BasePart") then
			local target = if descendant.Name == "HumanoidRootPart" then 1 else transparency
			if descendant.Transparency ~= target then
				descendant.Transparency = target
			end
		elseif descendant:IsA("Decal") then
			if descendant.Transparency ~= transparency then
				descendant.Transparency = transparency
			end
		elseif descendant:IsA("Sound") and not isMe then
			descendant.Volume = 0
		end
	end
end

function Visibility.init()
	task.spawn(function()
		while true do
			refresh()
			task.wait(0.15)
		end
	end)
end

return Visibility
