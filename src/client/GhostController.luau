-- Ghost controls: "Possess" prompts on objects (only the Ghost can see them), and
-- flying a possessed object with real physics forces. The server hands this client
-- network ownership of the object, so forces applied here move it for everyone.

local CollectionService = game:GetService("CollectionService")
local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local GameState = ReplicatedStorage:WaitForChild("GameState")

local player = Players.LocalPlayer

local GhostController = {}

local ACTION_LAUNCH = "GhostLaunch"
local ACTION_RISE = "GhostRise"
local ACTION_SINK = "GhostSink"
local ACTION_LEAVE = "GhostLeave"
local STEERING = 4 -- how quickly the object matches the speed you're steering toward

local controls: any = nil
local prompts: { [BasePart]: ProximityPrompt } = {}

local possessed: BasePart? = nil
local force: VectorForce? = nil
local attachment: Attachment? = nil
local stepConnection: RBXScriptConnection? = nil
local rising = false
local sinking = false
local coastUntil = 0
local lastLaunch = 0

-- Possess prompts -------------------------------------------------------------

local function wantsPrompts(): boolean
	return player:GetAttribute("Role") == "Ghost"
		and GameState:GetAttribute("State") == "Round"
		and not player:GetAttribute("Possessing")
end

local function addPrompt(part: Instance)
	if not part:IsA("BasePart") or prompts[part] then
		return
	end
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "PossessPrompt"
	prompt.ActionText = "Possess"
	prompt.ObjectText = part.Name
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = Config.POSSESS_RANGE
	prompt.RequiresLineOfSight = false
	prompt.Enabled = false
	prompt.Triggered:Connect(function()
		Remotes.Possess:FireServer(part)
	end)
	prompt.Parent = part
	prompts[part] = prompt
end

local function removeAllPrompts()
	for part, prompt in prompts do
		prompt:Destroy()
		prompts[part] = nil
	end
end

local function refreshPrompts()
	if player:GetAttribute("Role") ~= "Ghost" then
		if next(prompts) then
			removeAllPrompts()
		end
		return
	end
	for _, part in CollectionService:GetTagged("Possessable") do
		addPrompt(part)
	end
	local enabled = wantsPrompts()
	for part, prompt in prompts do
		if part.Parent == nil then
			prompt:Destroy()
			prompts[part] = nil
		else
			prompt.Enabled = enabled and part:GetAttribute("PossessedBy") == nil
		end
	end
end

-- Flying a possessed object ---------------------------------------------------

local function flatUnit(v: Vector3, fallback: Vector3): Vector3
	local flat = Vector3.new(v.X, 0, v.Z)
	return if flat.Magnitude > 1e-3 then flat.Unit else fallback
end

-- Where the player is pointing: the mouse on PC, the screen center on touch/gamepad.
local function aimPoint(ignore: { Instance }): Vector3
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
	params.FilterDescendantsInstances = ignore
	local result = workspace:Raycast(ray.Origin, ray.Direction * 500, params)
	return if result then result.Position else ray.Origin + ray.Direction * 500
end

local function step(dt: number)
	local part = possessed
	local vectorForce = force
	if not part or not vectorForce or part.Parent == nil then
		return
	end

	local mass = part.AssemblyMass
	local velocity = part.AssemblyLinearVelocity
	local antiGravity = Vector3.new(0, workspace.Gravity, 0)

	-- Calm the tumbling a little so the object stays controllable.
	part.AssemblyAngularVelocity *= math.max(0, 1 - dt * 1.5)

	if os.clock() < coastUntil then
		-- Just launched: let it fly with a gentle arc.
		vectorForce.Force = antiGravity * 0.5 * mass
		return
	end

	local camera = workspace.CurrentCamera.CFrame
	local forward = flatUnit(camera.LookVector, Vector3.new(0, 0, -1))
	local right = flatUnit(camera.RightVector, Vector3.new(1, 0, 0))
	local move = if controls then controls:GetMoveVector() else Vector3.zero
	local vertical = (if rising then 1 else 0) - (if sinking then 1 else 0)

	local desired = (right * move.X - forward * move.Z) * Config.POSSESS_MOVE_SPEED
		+ Vector3.yAxis * vertical * Config.POSSESS_VERTICAL_SPEED
	local accel = (desired - velocity) * STEERING
	if accel.Magnitude > Config.POSSESS_MAX_ACCEL then
		accel = accel.Unit * Config.POSSESS_MAX_ACCEL
	end
	vectorForce.Force = (accel + antiGravity) * mass
end

local function launch()
	local part = possessed
	if not part or os.clock() - lastLaunch < Config.POSSESS_LAUNCH_COOLDOWN then
		return
	end
	lastLaunch = os.clock()
	local ignore: { Instance } = { part }
	if player.Character then
		table.insert(ignore, player.Character)
	end
	local offset = aimPoint(ignore) - part.Position
	if offset.Magnitude < 1 then
		return
	end
	part.AssemblyLinearVelocity = offset.Unit * Config.POSSESS_LAUNCH_SPEED
	coastUntil = os.clock() + Config.POSSESS_LAUNCH_COAST_TIME
end

local function onAction(actionName: string, inputState: Enum.UserInputState): Enum.ContextActionResult
	local began = inputState == Enum.UserInputState.Begin
	if actionName == ACTION_RISE then
		rising = began
	elseif actionName == ACTION_SINK then
		sinking = began
	elseif actionName == ACTION_LAUNCH and began then
		launch()
	elseif actionName == ACTION_LEAVE and began then
		Remotes.Unpossess:FireServer()
	end
	return Enum.ContextActionResult.Sink
end

local function stopControlling()
	if stepConnection then
		stepConnection:Disconnect()
		stepConnection = nil
	end
	if force then
		force:Destroy()
		force = nil
	end
	if attachment then
		attachment:Destroy()
		attachment = nil
	end
	possessed = nil
	rising = false
	sinking = false
	for _, action in { ACTION_LAUNCH, ACTION_RISE, ACTION_SINK, ACTION_LEAVE } do
		ContextActionService:UnbindAction(action)
	end

	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if humanoid then
		workspace.CurrentCamera.CameraSubject = humanoid
	end
end

local function startControlling(part: BasePart)
	stopControlling()
	possessed = part

	local newAttachment = Instance.new("Attachment")
	newAttachment.Name = "GhostControl"
	newAttachment.Parent = part
	attachment = newAttachment

	local newForce = Instance.new("VectorForce")
	newForce.Name = "GhostForce"
	newForce.Attachment0 = newAttachment
	newForce.RelativeTo = Enum.ActuatorRelativeTo.World
	newForce.ApplyAtCenterOfMass = true
	newForce.Force = Vector3.zero
	newForce.Parent = part
	force = newForce

	workspace.CurrentCamera.CameraSubject = part

	local priority = Enum.ContextActionPriority.High.Value
	ContextActionService:BindActionAtPriority(ACTION_LAUNCH, onAction, true, priority, Enum.UserInputType.MouseButton1, Enum.KeyCode.ButtonR2)
	ContextActionService:BindActionAtPriority(ACTION_RISE, onAction, true, priority, Enum.KeyCode.Space, Enum.KeyCode.ButtonA)
	ContextActionService:BindActionAtPriority(ACTION_SINK, onAction, true, priority, Enum.KeyCode.Q, Enum.KeyCode.LeftControl, Enum.KeyCode.ButtonB)
	ContextActionService:BindActionAtPriority(ACTION_LEAVE, onAction, true, priority, Enum.KeyCode.F, Enum.KeyCode.ButtonY)
	ContextActionService:SetTitle(ACTION_LAUNCH, "Launch")
	ContextActionService:SetTitle(ACTION_RISE, "Up")
	ContextActionService:SetTitle(ACTION_SINK, "Down")
	ContextActionService:SetTitle(ACTION_LEAVE, "Leave")

	stepConnection = RunService.Heartbeat:Connect(step)
end

function GhostController.init()
	task.spawn(function()
		local playerModule = require(player:WaitForChild("PlayerScripts"):WaitForChild("PlayerModule") :: any)
		controls = playerModule:GetControls()
	end)

	Remotes.PossessionChanged.OnClientEvent:Connect(function(part: BasePart?)
		if part then
			startControlling(part)
		else
			stopControlling()
		end
	end)

	player.CharacterAdded:Connect(function()
		stopControlling()
	end)

	task.spawn(function()
		while true do
			refreshPrompts()
			task.wait(0.25)
		end
	end)
end

return GhostController
