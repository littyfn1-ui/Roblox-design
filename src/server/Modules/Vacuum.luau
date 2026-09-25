-- The Humans' vacuum: tool creation, charge/overheat, and the server-side cone check
-- that decides whether a vacuum is hitting the Ghost. Clients only say "I'm on/off"
-- and "I'm aiming this way"; the server does the rest.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Humans = require(script.Parent.Humans)

local Remotes = ReplicatedStorage.Remotes

local Vacuum = {}

type VacuumState = {
	wantsOn: boolean,
	aim: Vector3,
	charge: number,
	overheated: boolean,
	suction: ParticleEmitter?,
}

local states: { [Player]: VacuumState } = {}
local tickTimer = 0
local COS_CONE = math.cos(math.rad(Config.VACUUM_CONE_DEGREES))

local function getState(player: Player): VacuumState
	local state = states[player]
	if not state then
		state = {
			wantsOn = false,
			aim = Vector3.zAxis,
			charge = Config.VACUUM_CHARGE_MAX,
			overheated = false,
			suction = nil,
		}
		states[player] = state
	end
	return state
end

local function makeSuctionEffect(root: BasePart): ParticleEmitter
	-- Emits from a point in front of the player and flows back toward them.
	local attachment = Instance.new("Attachment")
	attachment.Name = "VacuumSuction"
	attachment.CFrame = CFrame.new(0, 0.5, -10)
	attachment.Parent = root

	local emitter = Instance.new("ParticleEmitter")
	emitter.EmissionDirection = Enum.NormalId.Back
	emitter.Speed = NumberRange.new(18, 24)
	emitter.Lifetime = NumberRange.new(0.4, 0.5)
	emitter.SpreadAngle = Vector2.new(20, 20)
	emitter.Rate = 60
	emitter.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.6),
		NumberSequenceKeypoint.new(1, 0.1),
	})
	emitter.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 1),
		NumberSequenceKeypoint.new(0.3, 0.5),
		NumberSequenceKeypoint.new(1, 1),
	})
	emitter.Color = ColorSequence.new(Color3.fromRGB(200, 220, 255))
	emitter.LightEmission = 0.5
	emitter.Enabled = false
	emitter.Parent = attachment
	return emitter
end

function Vacuum.giveTool(player: Player)
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root or not root:IsA("BasePart") then
		return
	end

	local tool = Instance.new("Tool")
	tool.Name = "Vacuum"
	tool.ToolTip = "Hold click to vacuum the Ghost"
	tool.CanBeDropped = false
	tool.RequiresHandle = true

	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = Vector3.new(1, 1, 3)
	handle.Color = Color3.fromRGB(230, 120, 40)
	handle.Material = Enum.Material.Metal
	handle.CanCollide = false
	handle.Massless = true
	handle.Parent = tool

	tool.Parent = player:WaitForChild("Backpack")

	local state = getState(player)
	state.wantsOn = false
	state.charge = Config.VACUUM_CHARGE_MAX
	state.overheated = false
	state.suction = makeSuctionEffect(root)
	player:SetAttribute("VacuumCharge", state.charge)
	player:SetAttribute("VacuumOverheated", false)
	player:SetAttribute("Draining", false)
end

function Vacuum.clear(player: Player)
	local state = states[player]
	if state and state.suction then
		state.suction.Enabled = false
	end
	states[player] = nil
	player:SetAttribute("Draining", false)
end

function Vacuum.clearAll()
	for player in states do
		Vacuum.clear(player)
	end
	tickTimer = 0
end

local function isRunning(player: Player, state: VacuumState): boolean
	if not state.wantsOn or state.overheated or not Humans.isActive(player) then
		return false
	end
	-- Must actually be holding the vacuum.
	local character = player.Character
	local tool = character and character:FindFirstChild("Vacuum")
	return tool ~= nil and tool:IsA("Tool")
end

local function nozzlePosition(character: Model): Vector3?
	local head = character:FindFirstChild("Head")
	if head and head:IsA("BasePart") then
		return head.Position
	end
	local root = character:FindFirstChild("HumanoidRootPart")
	return root and (root :: BasePart).Position
end

local function isHittingTarget(
	character: Model,
	aim: Vector3,
	target: BasePart,
	ignore: { Instance }
): boolean
	local origin = nozzlePosition(character)
	if not origin then
		return false
	end
	local offset = target.Position - origin
	local distance = offset.Magnitude
	-- Big objects are easier to catch: measure roughly to their surface.
	local reach = Config.VACUUM_RANGE + target.Size.Magnitude / 2
	if distance > reach then
		return false
	end
	if distance > 1 and aim:Dot(offset.Unit) < COS_CONE then
		return false
	end

	-- Walls block the vacuum.
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = ignore
	local result = workspace:Raycast(origin, offset, params)
	return result == nil or result.Instance == target
end

-- Runs the vacuum simulation. `ghost` is the Ghost player (or nil), `target` is the part
-- the vacuum has to hit: the possessed object, or the Ghost's root part.
-- Returns how much Ectoplasm was drained this frame.
function Vacuum.update(dt: number, ghost: Player?, target: BasePart?): number
	tickTimer += dt
	if tickTimer < Config.VACUUM_TICK then
		return 0
	end
	local step = tickTimer
	tickTimer = 0

	-- Everything the line-of-sight ray should pass through: people, and the Ghost itself.
	local ignore: { Instance } = {}
	for _, player in Players:GetPlayers() do
		if player.Character then
			table.insert(ignore, player.Character)
		end
	end

	local drained = 0
	local anyHit = false
	for player, state in states do
		local running = isRunning(player, state)

		if running then
			state.charge -= Config.VACUUM_CHARGE_USE_PER_SECOND * step
			if state.charge <= 0 then
				state.charge = 0
				state.overheated = true
				running = false
			end
		else
			state.charge = math.min(Config.VACUUM_CHARGE_MAX, state.charge + Config.VACUUM_CHARGE_REGEN_PER_SECOND * step)
			if state.overheated and state.charge >= Config.VACUUM_OVERHEAT_UNLOCK then
				state.overheated = false
			end
		end

		local hitting = false
		if running and ghost and target and player.Character then
			hitting = isHittingTarget(player.Character, state.aim, target, ignore)
		end
		if hitting then
			drained += Config.VACUUM_DRAIN_PER_SECOND * step
			anyHit = true
		end

		if state.suction then
			state.suction.Enabled = running
			state.suction.Rate = if hitting then 160 else 60
		end
		player:SetAttribute("VacuumCharge", math.floor(state.charge + 0.5))
		player:SetAttribute("VacuumOverheated", state.overheated)
		player:SetAttribute("Draining", hitting)
	end

	if ghost then
		-- Only show the Ghost's body when the vacuum is hitting the body itself, not an
		-- object it's possessing (its body is parked somewhere else meanwhile).
		ghost:SetAttribute("Revealed", anyHit and not ghost:GetAttribute("Possessing"))
	end
	return drained
end

function Vacuum.init()
	Remotes.VacuumState.OnServerEvent:Connect(function(player, on)
		if typeof(on) ~= "boolean" then
			return
		end
		local state = states[player]
		if state then
			state.wantsOn = on
		end
	end)

	Remotes.VacuumAim.OnServerEvent:Connect(function(player, direction)
		if typeof(direction) ~= "Vector3" then
			return
		end
		local magnitude = direction.Magnitude
		if magnitude < 0.5 or magnitude > 1.5 or magnitude ~= magnitude then
			return
		end
		local state = states[player]
		if state then
			state.aim = direction.Unit
		end
	end)

	Players.PlayerRemoving:Connect(function(player)
		states[player] = nil
	end)
end

return Vacuum
