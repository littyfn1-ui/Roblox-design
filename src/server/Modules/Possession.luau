-- Server side of possession: validating requests, handing network ownership to the
-- Ghost's client, sanity-checking the object's movement, and dealing hit damage.
--
-- The Ghost's client simulates the possessed object (smooth, responsive control), but
-- the server decides everything that matters: who may possess what, speed limits, and
-- whether a hit connected.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Humans = require(script.Parent.Humans)
local Map = require(script.Parent.Map)

local Remotes = ReplicatedStorage.Remotes

local Possession = {}

type PossessionInfo = {
	part: BasePart,
	highlight: Highlight,
	overspeedTime: number,
}

local possessions: { [Player]: PossessionInfo } = {}
local lastPossessAt: { [Player]: number } = {}
local lastHitAt: { [BasePart]: { [Player]: number } } = {}
local canPossess: () -> boolean = function()
	return false
end

-- Round manager tells us whether possession is currently allowed (only during a round).
function Possession.setAllowedCheck(check: () -> boolean)
	canPossess = check
end

function Possession.getPossessedPart(player: Player): BasePart?
	local info = possessions[player]
	return info and info.part
end

local function isPossessedByAnyone(part: BasePart): boolean
	for _, info in possessions do
		if info.part == part then
			return true
		end
	end
	return false
end

local function setGhostAnchored(player: Player, anchored: boolean)
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if root and root:IsA("BasePart") then
		root.Anchored = anchored
	end
end

function Possession.release(player: Player)
	local info = possessions[player]
	if not info then
		return
	end
	possessions[player] = nil

	local part = info.part
	info.highlight:Destroy()
	part:SetAttribute("PossessedBy", nil)
	if part.Parent and part:CanSetNetworkOwnership() then
		part:SetNetworkOwnershipAuto()
	end

	-- The Ghost's body stayed anchored where it started; bring it to the object it left.
	local character = player.Character
	if character and part.Parent then
		character:PivotTo(CFrame.new(part.Position + Vector3.new(0, 3, 0)))
	end
	setGhostAnchored(player, false)

	player:SetAttribute("Possessing", false)
	lastPossessAt[player] = os.clock()
	if player.Parent then
		Remotes.PossessionChanged:FireClient(player, nil)
	end
end

function Possession.releaseAll()
	for player in possessions do
		Possession.release(player)
	end
end

local function tryPossess(player: Player, part: any)
	if not canPossess() or player:GetAttribute("Role") ~= "Ghost" then
		return
	end
	if typeof(part) ~= "Instance" or not part:IsA("BasePart") then
		return
	end
	if not CollectionService:HasTag(part, "Possessable") or not part:IsDescendantOf(workspace) then
		return
	end
	if part.Anchored or isPossessedByAnyone(part) then
		return
	end
	if os.clock() - (lastPossessAt[player] or 0) < Config.POSSESS_COOLDOWN then
		return
	end

	-- Range is measured from the Ghost's body, or from the object it's in right now.
	local current = possessions[player]
	local character = player.Character
	local origin: Vector3
	if current then
		origin = current.part.Position
	elseif character then
		origin = character:GetPivot().Position
	else
		return
	end
	-- Allow for big objects: measure to the nearest face, roughly.
	local reach = Config.POSSESS_RANGE + part.Size.Magnitude / 2 + 2
	if (part.Position - origin).Magnitude > reach then
		return
	end

	local canOwn = part:CanSetNetworkOwnership()
	if not canOwn then
		return
	end

	if current then
		Possession.release(player)
	end

	part:SetNetworkOwner(player)
	setGhostAnchored(player, true)

	local highlight = Instance.new("Highlight")
	highlight.Name = "PossessionGlow"
	highlight.FillColor = Color3.fromRGB(170, 90, 255)
	highlight.FillTransparency = 0.8
	highlight.OutlineColor = Color3.fromRGB(215, 170, 255)
	highlight.OutlineTransparency = 0.1
	highlight.DepthMode = Enum.HighlightDepthMode.Occluded
	highlight.Parent = part

	possessions[player] = { part = part, highlight = highlight, overspeedTime = 0 }
	lastPossessAt[player] = os.clock()
	part:SetAttribute("PossessedBy", player.UserId)
	player:SetAttribute("Possessing", true)
	Remotes.PossessionChanged:FireClient(player, part)
end

local function humanCharacters(): { Model }
	local list = {}
	for _, player in Players:GetPlayers() do
		if Humans.isActive(player) and player.Character then
			table.insert(list, player.Character)
		end
	end
	return list
end

local function checkHits(part: BasePart, velocity: Vector3)
	local speed = velocity.Magnitude
	if speed < Config.HIT_MIN_SPEED then
		return
	end
	local targets = humanCharacters()
	if #targets == 0 then
		return
	end

	local params = OverlapParams.new()
	params.FilterType = Enum.RaycastFilterType.Include
	params.FilterDescendantsInstances = targets
	local touching = workspace:GetPartBoundsInBox(part.CFrame, part.Size + Vector3.new(1.5, 1.5, 1.5), params)

	local hitTimes = lastHitAt[part]
	if not hitTimes then
		hitTimes = {}
		lastHitAt[part] = hitTimes
	end

	local now = os.clock()
	local alreadyHit: { [Player]: boolean } = {}
	for _, touched in touching do
		local model = touched:FindFirstAncestorOfClass("Model")
		local victim = model and Players:GetPlayerFromCharacter(model)
		if not victim or alreadyHit[victim] then
			continue
		end
		alreadyHit[victim] = true
		if now - (hitTimes[victim] or 0) < Config.HIT_COOLDOWN then
			continue
		end
		hitTimes[victim] = now

		local damage = math.clamp(speed * Config.HIT_DAMAGE_PER_SPEED, Config.HIT_DAMAGE_MIN, Config.HIT_DAMAGE_MAX)
		if part:GetAttribute("Heavy") then
			damage *= Config.HIT_HEAVY_MULTIPLIER
		end
		damage = math.floor(damage)
		Humans.damage(victim, damage)
		Remotes.HitFeedback:FireClient(victim, part.Position, damage, velocity)
	end
end

-- Called every frame by the round manager while a round is running.
function Possession.update(dt: number)
	for player, info in possessions do
		local part = info.part
		if part.Parent == nil or not part:IsDescendantOf(workspace) then
			Possession.release(player)
			continue
		end
		if part.Position.Y < workspace.FallenPartsDestroyHeight + 50 then
			Possession.release(player)
			Map.resetProp(part)
			continue
		end

		local velocity = part.AssemblyLinearVelocity
		-- Anti-exploit: the client simulates this object, so don't let it go faster than
		-- the game ever would. A short grace window absorbs physics spikes from collisions.
		if velocity.Magnitude > Config.POSSESS_MAX_SPEED then
			info.overspeedTime += dt
			if info.overspeedTime > 0.5 then
				warn(`[Possession] {player.Name} kicked out of {part.Name}: moving too fast`)
				Possession.release(player)
				continue
			end
		else
			info.overspeedTime = 0
		end

		checkHits(part, velocity)
	end
end

function Possession.init()
	Remotes.Possess.OnServerEvent:Connect(tryPossess)
	Remotes.Unpossess.OnServerEvent:Connect(function(player)
		Possession.release(player)
	end)
	Players.PlayerRemoving:Connect(function(player)
		Possession.release(player)
		lastPossessAt[player] = nil
		for _, hitTimes in lastHitAt do
			hitTimes[player] = nil
		end
	end)
end

return Possession
