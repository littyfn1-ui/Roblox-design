-- Human health, the downed state, bleed-out and revives. All server-authoritative.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = ReplicatedStorage.Remotes

local Humans = {}

local bleedoutThreads: { [Player]: thread } = {}

local function getHumanoid(player: Player): Humanoid?
	local character = player.Character
	return character and character:FindFirstChildOfClass("Humanoid")
end

local function cancelBleedout(player: Player)
	local thread = bleedoutThreads[player]
	if thread then
		task.cancel(thread)
		bleedoutThreads[player] = nil
	end
end

-- In the round and still standing.
function Humans.isActive(player: Player): boolean
	return player:GetAttribute("Role") == "Human"
		and not player:GetAttribute("Downed")
		and not player:GetAttribute("Eliminated")
end

-- In the round and not out yet (downed still counts).
function Humans.isAlive(player: Player): boolean
	return player:GetAttribute("Role") == "Human" and not player:GetAttribute("Eliminated")
end

function Humans.eliminate(player: Player)
	if player:GetAttribute("Eliminated") then
		return
	end
	cancelBleedout(player)
	player:SetAttribute("Downed", false)
	player:SetAttribute("Eliminated", true)
	local humanoid = getHumanoid(player)
	if humanoid and humanoid.Health > 0 then
		humanoid.Health = 0
	end
end

function Humans.down(player: Player)
	if not Humans.isActive(player) then
		return
	end
	local humanoid = getHumanoid(player)
	if not humanoid then
		return
	end
	humanoid:UnequipTools()
	humanoid.Health = 1
	humanoid.WalkSpeed = Config.DOWNED_WALK_SPEED
	humanoid.JumpPower = 0
	humanoid.JumpHeight = 0

	player:SetAttribute("Downed", true)
	player:SetAttribute("DownedUntil", workspace:GetServerTimeNow() + Config.BLEEDOUT_TIME)

	cancelBleedout(player)
	bleedoutThreads[player] = task.delay(Config.BLEEDOUT_TIME, function()
		bleedoutThreads[player] = nil
		if player:GetAttribute("Downed") then
			Humans.eliminate(player)
		end
	end)
end

function Humans.revive(player: Player)
	if not player:GetAttribute("Downed") then
		return
	end
	cancelBleedout(player)
	player:SetAttribute("Downed", false)
	local humanoid = getHumanoid(player)
	if humanoid then
		humanoid.Health = Config.REVIVE_HEALTH
		humanoid.WalkSpeed = Config.HUMAN_WALK_SPEED
		humanoid.JumpPower = 50
		humanoid.JumpHeight = 7.2
	end
end

-- Damage never kills outright: dropping to 0 downs the Human instead.
function Humans.damage(player: Player, amount: number)
	if not Humans.isActive(player) then
		return
	end
	local humanoid = getHumanoid(player)
	if not humanoid then
		return
	end
	local newHealth = humanoid.Health - amount
	if newHealth <= 0 then
		Humans.down(player)
	else
		humanoid.Health = newHealth
	end
end

-- Clears downed/bleed-out state (between rounds or when a player leaves).
function Humans.clear(player: Player)
	cancelBleedout(player)
end

local function onReviveRequest(reviver: Player, target: any)
	if typeof(target) ~= "Instance" or not target:IsA("Player") or target == reviver then
		return
	end
	if not Humans.isActive(reviver) or target:GetAttribute("Role") ~= "Human" then
		return
	end
	if not target:GetAttribute("Downed") then
		return
	end
	local reviverChar = reviver.Character
	local targetChar = target.Character
	if not reviverChar or not targetChar then
		return
	end
	local distance = (reviverChar:GetPivot().Position - targetChar:GetPivot().Position).Magnitude
	if distance > Config.REVIVE_RANGE + 2 then
		return
	end
	Humans.revive(target)
end

function Humans.init()
	Remotes.Revive.OnServerEvent:Connect(onReviveRequest)
	Players.PlayerRemoving:Connect(Humans.clear)
end

return Humans
