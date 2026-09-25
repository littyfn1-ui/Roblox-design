-- Human vacuum input: tells the server when the vacuum is on/off and where it's aimed.
-- The server decides whether that actually hits the Ghost.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local Remotes = ReplicatedStorage:WaitForChild("Remotes")

local player = Players.LocalPlayer

local VacuumController = {}

local hookedTools: { [Tool]: boolean } = setmetatable({}, { __mode = "k" }) :: any
local active = false
local aimTimer = 0

local function getRoot(): BasePart?
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	return if root and root:IsA("BasePart") then root else nil
end

local function aimDirection(): Vector3?
	local character = player.Character
	local head = character and character:FindFirstChild("Head")
	if not head or not head:IsA("BasePart") then
		return nil
	end
	local camera = workspace.CurrentCamera
	local screen: Vector2
	local lastInput = UserInputService:GetLastInputType()
	if lastInput == Enum.UserInputType.Touch or lastInput.Name:find("Gamepad") then
		screen = camera.ViewportSize / 2
	else
		screen = UserInputService:GetMouseLocation()
	end
	local ray = camera:ViewportPointToRay(screen.X, screen.Y)
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { character :: Instance }
	local result = workspace:Raycast(ray.Origin, ray.Direction * 500, params)
	local target = if result then result.Position else ray.Origin + ray.Direction * 500
	local offset = target - head.Position
	return if offset.Magnitude > 0.1 then offset.Unit else nil
end

local function setActive(on: boolean)
	if on == active then
		return
	end
	active = on
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if humanoid then
		-- While vacuuming, the character turns to face where you aim.
		humanoid.AutoRotate = not on
	end
	if on then
		local direction = aimDirection()
		if direction then
			Remotes.VacuumAim:FireServer(direction)
		end
	end
	Remotes.VacuumState:FireServer(on)
end

local function hookTool(tool: Instance)
	if not tool:IsA("Tool") or tool.Name ~= "Vacuum" or hookedTools[tool] then
		return
	end
	hookedTools[tool] = true
	tool.Activated:Connect(function()
		if not player:GetAttribute("Downed") then
			setActive(true)
		end
	end)
	tool.Deactivated:Connect(function()
		setActive(false)
	end)
	tool.Unequipped:Connect(function()
		setActive(false)
	end)
end

local function onHeartbeat(dt: number)
	if not active then
		return
	end
	if player:GetAttribute("Downed") then
		setActive(false)
		return
	end

	local direction = aimDirection()
	local root = getRoot()
	if direction and root then
		local flat = Vector3.new(direction.X, 0, direction.Z)
		if flat.Magnitude > 1e-3 then
			root.CFrame = CFrame.lookAt(root.Position, root.Position + flat)
		end
	end

	aimTimer += dt
	if aimTimer >= Config.VACUUM_TICK and direction then
		aimTimer = 0
		Remotes.VacuumAim:FireServer(direction)
	end
end

function VacuumController.init()
	task.spawn(function()
		-- Tools can show up in the Backpack or directly in the character; keep watching both.
		while true do
			local backpack = player:FindFirstChildOfClass("Backpack")
			if backpack then
				for _, tool in backpack:GetChildren() do
					hookTool(tool)
				end
			end
			if player.Character then
				for _, tool in player.Character:GetChildren() do
					hookTool(tool)
				end
			end
			task.wait(0.5)
		end
	end)

	player.CharacterAdded:Connect(function()
		active = false
	end)

	RunService.Heartbeat:Connect(onHeartbeat)
end

return VacuumController
