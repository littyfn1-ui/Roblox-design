-- Human-side feedback and teamwork: knockback + red flash when hit by a possessed
-- object, and "Revive" prompts on downed teammates.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local Remotes = ReplicatedStorage:WaitForChild("Remotes")

local HUD = require(script.Parent:WaitForChild("HUD"))

local player = Players.LocalPlayer

local HumanController = {}

local revivePrompts: { [Player]: ProximityPrompt } = {}

local function onHit(fromPosition: Vector3, _damage: number, velocity: Vector3)
	HUD.flashDamage()

	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root or not root:IsA("BasePart") then
		return
	end
	-- Push the player the way the object was flying (or directly away from it).
	local push = Vector3.new(velocity.X, 0, velocity.Z)
	if push.Magnitude < 1 then
		push = Vector3.new(root.Position.X - fromPosition.X, 0, root.Position.Z - fromPosition.Z)
	end
	if push.Magnitude < 1e-3 then
		push = Vector3.new(0, 0, 1)
	end
	root.AssemblyLinearVelocity = push.Unit * Config.HIT_KNOCKBACK_SPEED + Vector3.new(0, 25, 0)
end

local function canRevive(): boolean
	return player:GetAttribute("Role") == "Human"
		and not player:GetAttribute("Downed")
		and not player:GetAttribute("Eliminated")
end

local function removePrompt(target: Player)
	local prompt = revivePrompts[target]
	if prompt then
		prompt:Destroy()
		revivePrompts[target] = nil
	end
end

local function refreshRevivePrompts()
	local eligible = canRevive()
	for _, other in Players:GetPlayers() do
		if other == player then
			continue
		end
		local character = other.Character
		local root = character and character:FindFirstChild("HumanoidRootPart")
		local needsPrompt = eligible
			and other:GetAttribute("Role") == "Human"
			and other:GetAttribute("Downed") == true
			and root ~= nil

		local existing = revivePrompts[other]
		if needsPrompt and existing and existing.Parent ~= root then
			removePrompt(other)
			existing = nil
		end
		if needsPrompt and not existing then
			local prompt = Instance.new("ProximityPrompt")
			prompt.Name = "RevivePrompt"
			prompt.ActionText = "Revive"
			prompt.ObjectText = other.DisplayName
			prompt.KeyboardKeyCode = Enum.KeyCode.E
			prompt.HoldDuration = Config.REVIVE_HOLD_TIME
			prompt.MaxActivationDistance = Config.REVIVE_RANGE
			prompt.RequiresLineOfSight = false
			prompt.Triggered:Connect(function()
				Remotes.Revive:FireServer(other)
			end)
			prompt.Parent = root
			revivePrompts[other] = prompt
		elseif not needsPrompt and existing then
			removePrompt(other)
		end
	end
end

function HumanController.init()
	Remotes.HitFeedback.OnClientEvent:Connect(onHit)
	Players.PlayerRemoving:Connect(removePrompt)

	task.spawn(function()
		while true do
			refreshRevivePrompts()
			task.wait(0.25)
		end
	end)
end

return HumanController
