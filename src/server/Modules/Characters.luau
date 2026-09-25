-- Spawning characters into a role (Lobby / Human / Ghost) and applying role-specific setup.

local PhysicsService = game:GetService("PhysicsService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)

local Characters = {}

local GHOST_GROUP = "Ghost"
local HUMAN_GROUP = "Humans"
Characters.PROP_GROUP = "Props"

export type Role = "Lobby" | "Human" | "Ghost"

local function registerGroup(name: string)
	if not PhysicsService:IsCollisionGroupRegistered(name) then
		PhysicsService:RegisterCollisionGroup(name)
	end
end

function Characters.init()
	registerGroup(GHOST_GROUP)
	registerGroup(HUMAN_GROUP)
	registerGroup(Characters.PROP_GROUP)
	-- The Ghost walks through Humans instead of bumping into them (which would give it away),
	-- and through furniture, so its parked body never blocks the object it's flying.
	PhysicsService:CollisionGroupSetCollidable(GHOST_GROUP, HUMAN_GROUP, false)
	PhysicsService:CollisionGroupSetCollidable(GHOST_GROUP, Characters.PROP_GROUP, false)
	-- Rounds decide when and where characters spawn.
	Players.CharacterAutoLoads = false
end

-- Runs fn on every current and future descendant of the character.
local function forEachDescendant(character: Model, fn: (Instance) -> ())
	for _, descendant in character:GetDescendants() do
		fn(descendant)
	end
	character.DescendantAdded:Connect(fn)
end

local function setupGhost(character: Model, humanoid: Humanoid)
	humanoid.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None
	humanoid.HealthDisplayType = Enum.HumanoidHealthDisplayType.AlwaysOff
	humanoid.WalkSpeed = Config.GHOST_WALK_SPEED
	forEachDescendant(character, function(descendant)
		if descendant:IsA("BasePart") then
			descendant.Transparency = 1
			descendant.CastShadow = false
			descendant.CollisionGroup = GHOST_GROUP
		elseif descendant:IsA("Decal") then
			descendant.Transparency = 1
		end
	end)
end

local function setupHuman(character: Model, humanoid: Humanoid)
	humanoid.MaxHealth = Config.HUMAN_MAX_HEALTH
	humanoid.Health = Config.HUMAN_MAX_HEALTH
	humanoid.WalkSpeed = Config.HUMAN_WALK_SPEED
	forEachDescendant(character, function(descendant)
		if descendant:IsA("BasePart") then
			descendant.CollisionGroup = HUMAN_GROUP
		end
	end)
end

-- Loads a fresh character for the player in the given role at the given spot.
-- onDied is called if that character dies. Returns the character, or nil if the
-- player left while it was loading.
function Characters.spawn(
	player: Player,
	role: Role,
	at: CFrame,
	onDied: (Player, Model) -> ()
): Model?
	player:SetAttribute("Role", role)
	player:SetAttribute("Downed", false)
	player:SetAttribute("Eliminated", false)
	player:SetAttribute("Possessing", false)
	player:SetAttribute("Revealed", false)

	local ok, err = pcall(function()
		player:LoadCharacterAsync()
	end)
	if not ok and player.Parent then
		-- Older Studio builds only have the original method.
		warn(`[Characters] LoadCharacterAsync failed ({err}), falling back to LoadCharacter`)
		ok = pcall(function()
			(player :: any):LoadCharacter()
		end)
	end
	local character = player.Character
	if not ok or not character or player.Parent == nil then
		return nil
	end

	local humanoid = character:WaitForChild("Humanoid") :: Humanoid
	character:WaitForChild("HumanoidRootPart")
	character:PivotTo(at)

	if role == "Ghost" then
		setupGhost(character, humanoid)
	elseif role == "Human" then
		setupHuman(character, humanoid)
	end

	humanoid.Died:Connect(function()
		if player.Character == character then
			onDied(player, character)
		end
	end)

	return character
end

function Characters.getRole(player: Player): Role
	return (player:GetAttribute("Role") or "Lobby") :: Role
end

return Characters
