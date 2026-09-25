-- Builds the Phase 1 test house (two rooms + lobby pad) and tracks possessable props.
-- If workspace already has a model/folder named "Map", it is used instead of generating
-- one. A hand-built map needs a "Spawns" folder with parts named LobbySpawn, GhostSpawn
-- and one or more HumanSpawn, and possessable props tagged "Possessable".

local CollectionService = game:GetService("CollectionService")
local Lighting = game:GetService("Lighting")

local Map = {}

local HOUSE_ORIGIN = Vector3.new(0, 0, 120)
local FLOOR_TOP = 1
local WALL_HEIGHT = 16

local WOOD = Color3.fromRGB(110, 78, 52)
local WALLPAPER = Color3.fromRGB(72, 58, 84)

local spawns = {
	lobby = CFrame.new(0, 4, 0),
	ghost = CFrame.new(),
	humans = {} :: { CFrame },
}

local function makePart(parent: Instance, props: { [string]: any }): Part
	local part = Instance.new("Part")
	part.Anchored = true
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	for key, value in props do
		(part :: any)[key] = value
	end
	part.Parent = parent
	return part
end

-- Wall segment between two points on the floor (x/z), standing WALL_HEIGHT tall.
local function wall(parent: Instance, x1: number, z1: number, x2: number, z2: number)
	local a = HOUSE_ORIGIN + Vector3.new(x1, 0, z1)
	local b = HOUSE_ORIGIN + Vector3.new(x2, 0, z2)
	local length = (b - a).Magnitude
	local mid = (a + b) / 2 + Vector3.new(0, FLOOR_TOP + WALL_HEIGHT / 2, 0)
	makePart(parent, {
		Name = "Wall",
		Size = Vector3.new(1, WALL_HEIGHT, length),
		CFrame = CFrame.lookAt(mid, mid + (b - a)),
		Color = WALLPAPER,
		Material = Enum.Material.Plaster,
	})
end

type PropDef = {
	name: string,
	size: Vector3,
	pos: Vector3, -- x/z relative to house origin; y is the bottom of the prop above the floor
	color: Color3,
	material: Enum.Material?,
	density: number?,
	heavy: boolean?,
	shape: Enum.PartType?,
	light: boolean?,
}

local PROPS: { PropDef } = {
	-- Kitchen (west room)
	{ name = "Fridge", size = Vector3.new(4, 8, 3), pos = Vector3.new(-36, 0, 26), color = Color3.fromRGB(230, 230, 225), material = Enum.Material.Metal, density = 3, heavy = true },
	{ name = "KitchenTable", size = Vector3.new(8, 3, 5), pos = Vector3.new(-17, 0, 0), color = WOOD, material = Enum.Material.Wood, density = 1.5, heavy = true },
	{ name = "Chair", size = Vector3.new(2.5, 4, 2.5), pos = Vector3.new(-23, 0, 0), color = WOOD, material = Enum.Material.Wood },
	{ name = "Chair", size = Vector3.new(2.5, 4, 2.5), pos = Vector3.new(-11, 0, 0), color = WOOD, material = Enum.Material.Wood },
	{ name = "FryingPan", size = Vector3.new(2, 0.4, 2), pos = Vector3.new(-30, 4, 27), color = Color3.fromRGB(50, 50, 55), material = Enum.Material.Metal, density = 2 },
	{ name = "Knife", size = Vector3.new(0.3, 0.2, 2.5), pos = Vector3.new(-27, 4, 27), color = Color3.fromRGB(200, 200, 210), material = Enum.Material.Metal, density = 2 },
	{ name = "Blender", size = Vector3.new(1.2, 2, 1.2), pos = Vector3.new(-23, 4, 27), color = Color3.fromRGB(180, 40, 40), material = Enum.Material.SmoothPlastic },
	{ name = "Crate", size = Vector3.new(3, 3, 3), pos = Vector3.new(-30, 0, -20), color = Color3.fromRGB(150, 110, 70), material = Enum.Material.WoodPlanks },
	-- Living room (east room)
	{ name = "Piano", size = Vector3.new(8, 5, 3.5), pos = Vector3.new(30, 0, 25), color = Color3.fromRGB(20, 18, 20), material = Enum.Material.Wood, density = 3, heavy = true },
	{ name = "Sofa", size = Vector3.new(10, 3, 4), pos = Vector3.new(20, 0, 5), color = Color3.fromRGB(120, 40, 50), material = Enum.Material.Fabric, heavy = true },
	{ name = "Lamp", size = Vector3.new(1, 7, 1), pos = Vector3.new(8, 0, 25), color = Color3.fromRGB(230, 200, 140), material = Enum.Material.SmoothPlastic, light = true },
	{ name = "TV", size = Vector3.new(5, 3.5, 1), pos = Vector3.new(20, 0, 28), color = Color3.fromRGB(25, 25, 30), material = Enum.Material.SmoothPlastic },
	{ name = "Book", size = Vector3.new(1.5, 2, 0.5), pos = Vector3.new(35, 0, -10), color = Color3.fromRGB(40, 70, 130), material = Enum.Material.SmoothPlastic },
	{ name = "Book", size = Vector3.new(1.5, 2, 0.5), pos = Vector3.new(36, 0, -8), color = Color3.fromRGB(130, 40, 40), material = Enum.Material.SmoothPlastic },
	{ name = "Box", size = Vector3.new(3, 3, 3), pos = Vector3.new(10, 0, -20), color = Color3.fromRGB(170, 140, 100), material = Enum.Material.Cardboard },
	{ name = "Vase", size = Vector3.new(1.2, 2, 1.2), pos = Vector3.new(36, 0, -25), color = Color3.fromRGB(60, 120, 110), material = Enum.Material.Glass, shape = Enum.PartType.Cylinder },
}

local function makeProp(parent: Instance, def: PropDef)
	local bottomY = HOUSE_ORIGIN.Y + FLOOR_TOP + def.pos.Y
	local center = HOUSE_ORIGIN + Vector3.new(def.pos.X, 0, def.pos.Z)
	center = Vector3.new(center.X, bottomY + def.size.Y / 2, center.Z)

	local cf = CFrame.new(center)
	local size = def.size
	if def.shape == Enum.PartType.Cylinder then
		-- Cylinders run along their X axis; stand it upright.
		size = Vector3.new(def.size.Y, def.size.X, def.size.Z)
		cf *= CFrame.Angles(0, 0, math.rad(90))
	end

	local part = makePart(parent, {
		Name = def.name,
		Size = size,
		CFrame = cf,
		Color = def.color,
		Material = def.material or Enum.Material.SmoothPlastic,
		Anchored = false,
		Shape = def.shape or Enum.PartType.Block,
	})
	if def.density then
		part.CustomPhysicalProperties = PhysicalProperties.new(def.density, 0.5, 0.2)
	end
	if def.light then
		local light = Instance.new("PointLight")
		light.Color = Color3.fromRGB(255, 190, 120)
		light.Range = 18
		light.Brightness = 1.5
		light.Parent = part
	end
	part:SetAttribute("Heavy", def.heavy == true)
	CollectionService:AddTag(part, "Possessable")
end

local function spawnMarker(parent: Instance, name: string, position: Vector3)
	makePart(parent, {
		Name = name,
		Size = Vector3.new(2, 1, 2),
		CFrame = CFrame.new(position),
		Transparency = 1,
		CanCollide = false,
		CanQuery = false,
		CanTouch = false,
	})
end

local function build(): Folder
	local map = Instance.new("Folder")
	map.Name = "Map"

	local structure = Instance.new("Folder")
	structure.Name = "Structure"
	structure.Parent = map

	-- Lobby pad (in case the place has no baseplate)
	makePart(structure, {
		Name = "LobbyPad",
		Size = Vector3.new(30, 1, 30),
		CFrame = CFrame.new(0, 0.5, 0),
		Color = Color3.fromRGB(40, 32, 52),
		Material = Enum.Material.Slate,
	})

	-- House floor
	makePart(structure, {
		Name = "Floor",
		Size = Vector3.new(80, 1, 60),
		CFrame = CFrame.new(HOUSE_ORIGIN + Vector3.new(0, FLOOR_TOP - 0.5, 0)),
		Color = WOOD,
		Material = Enum.Material.WoodPlanks,
	})

	-- Outer walls (front wall facing the lobby has a doorway)
	wall(structure, -40, -30, -4, -30)
	wall(structure, 4, -30, 40, -30)
	wall(structure, -40, 30, 40, 30)
	wall(structure, -40, -30, -40, 30)
	wall(structure, 40, -30, 40, 30)
	-- Divider between kitchen and living room, with a doorway
	wall(structure, 0, -30, 0, -4)
	wall(structure, 0, 4, 0, 30)

	-- Kitchen counter (anchored decor, not possessable)
	makePart(structure, {
		Name = "Counter",
		Size = Vector3.new(12, 4, 3),
		CFrame = CFrame.new(HOUSE_ORIGIN + Vector3.new(-26, FLOOR_TOP + 2, 27)),
		Color = Color3.fromRGB(190, 180, 165),
		Material = Enum.Material.Marble,
	})

	-- Ceiling lights, one per room
	for _, x in { -20, 20 } do
		local fixture = makePart(structure, {
			Name = "CeilingLight",
			Size = Vector3.new(3, 0.5, 3),
			CFrame = CFrame.new(HOUSE_ORIGIN + Vector3.new(x, FLOOR_TOP + WALL_HEIGHT - 1, 0)),
			Color = Color3.fromRGB(255, 210, 150),
			Material = Enum.Material.Neon,
			CanCollide = false,
		})
		local light = Instance.new("PointLight")
		light.Color = Color3.fromRGB(255, 200, 140)
		light.Range = 40
		light.Brightness = 1.2
		light.Parent = fixture
	end

	local props = Instance.new("Folder")
	props.Name = "Props"
	props.Parent = map
	for _, def in PROPS do
		makeProp(props, def)
	end

	local spawnFolder = Instance.new("Folder")
	spawnFolder.Name = "Spawns"
	spawnFolder.Parent = map
	spawnMarker(spawnFolder, "LobbySpawn", Vector3.new(0, 4, 0))
	spawnMarker(spawnFolder, "GhostSpawn", HOUSE_ORIGIN + Vector3.new(-20, 4, 20))
	for i = 0, 3 do
		spawnMarker(spawnFolder, "HumanSpawn", HOUSE_ORIGIN + Vector3.new(10 + i * 4, 4, -24))
	end

	map.Parent = workspace
	return map
end

local function applyLighting()
	Lighting.ClockTime = 20
	Lighting.Brightness = 1
	Lighting.Ambient = Color3.fromRGB(45, 35, 60)
	Lighting.OutdoorAmbient = Color3.fromRGB(60, 50, 80)
end

local homeCFrames: { [BasePart]: CFrame } = {}

function Map.init(propCollisionGroup: string)
	local map = workspace:FindFirstChild("Map") or build()
	applyLighting()

	local spawnFolder = map:FindFirstChild("Spawns")
	assert(spawnFolder, "Map is missing a 'Spawns' folder")
	for _, marker in spawnFolder:GetChildren() do
		if not marker:IsA("BasePart") then
			continue
		end
		local cf = CFrame.new(marker.Position)
		if marker.Name == "LobbySpawn" then
			spawns.lobby = cf
		elseif marker.Name == "GhostSpawn" then
			spawns.ghost = cf
		elseif marker.Name == "HumanSpawn" then
			table.insert(spawns.humans, cf)
		end
	end
	assert(#spawns.humans > 0, "Map needs at least one HumanSpawn part")

	for _, prop in CollectionService:GetTagged("Possessable") do
		if prop:IsA("BasePart") then
			homeCFrames[prop] = prop.CFrame
			prop.CollisionGroup = propCollisionGroup
		end
	end
end

function Map.getSpawns()
	return spawns
end

-- Puts every prop back where it started. Called at the start of each round.
function Map.resetProps()
	for prop, cf in homeCFrames do
		if prop.Parent == nil then
			continue
		end
		prop.AssemblyLinearVelocity = Vector3.zero
		prop.AssemblyAngularVelocity = Vector3.zero
		prop.CFrame = cf
		if prop:CanSetNetworkOwnership() then
			prop:SetNetworkOwnershipAuto()
		end
	end
end

-- Returns a prop to its starting spot (used when one falls out of the world).
function Map.resetProp(prop: BasePart)
	local cf = homeCFrames[prop]
	if cf then
		prop.AssemblyLinearVelocity = Vector3.zero
		prop.AssemblyAngularVelocity = Vector3.zero
		prop.CFrame = cf
	end
end

return Map
