-- Phase 1 HUD: round timer, Ectoplasm meter, role, health, vacuum charge, hints,
-- round messages, damage flash and the downed overlay. Everything is read from
-- replicated attributes each frame, so the HUD can never drift out of sync.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local GameState = ReplicatedStorage:WaitForChild("GameState")

local player = Players.LocalPlayer

local HUD = {}

local COLORS = {
	panel = Color3.fromRGB(20, 14, 28),
	edge = Color3.fromRGB(80, 58, 110),
	text = Color3.fromRGB(238, 232, 248),
	muted = Color3.fromRGB(170, 160, 190),
	ember = Color3.fromRGB(255, 140, 50),
	ghost = Color3.fromRGB(185, 130, 255),
	health = Color3.fromRGB(225, 70, 80),
	charge = Color3.fromRGB(120, 190, 255),
	draining = Color3.fromRGB(120, 255, 150),
	overheated = Color3.fromRGB(255, 90, 60),
	ectoHigh = Color3.fromRGB(120, 255, 150),
	ectoMid = Color3.fromRGB(255, 215, 80),
	ectoLow = Color3.fromRGB(255, 80, 70),
}

local FONT = Enum.Font.GothamBold

local function new(className: string, props: { [string]: any }, children: { Instance }?): any
	local instance = Instance.new(className)
	local parent = props.Parent
	for key, value in props do
		if key ~= "Parent" then
			(instance :: any)[key] = value
		end
	end
	if children then
		for _, child in children do
			child.Parent = instance
		end
	end
	instance.Parent = parent
	return instance
end

local function corner(radius: number): UICorner
	return new("UICorner", { CornerRadius = UDim.new(0, radius) })
end

local function stroke(color: Color3, thickness: number?): UIStroke
	return new("UIStroke", { Color = color, Thickness = thickness or 1.5 })
end

local function label(props: { [string]: any }): TextLabel
	props.BackgroundTransparency = props.BackgroundTransparency or 1
	props.Font = props.Font or FONT
	props.TextColor3 = props.TextColor3 or COLORS.text
	props.TextSize = props.TextSize or 16
	return new("TextLabel", props)
end

-- A labelled horizontal bar. Returns the fill frame and the text label.
local function bar(parent: Instance, name: string, position: UDim2, size: UDim2, color: Color3): (Frame, TextLabel)
	local background = new("Frame", {
		Name = name,
		Parent = parent,
		Position = position,
		Size = size,
		BackgroundColor3 = COLORS.panel,
		BackgroundTransparency = 0.15,
		BorderSizePixel = 0,
	}, { corner(6), stroke(COLORS.edge) })
	local fill = new("Frame", {
		Name = "Fill",
		Parent = background,
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = color,
		BorderSizePixel = 0,
	}, { corner(6) })
	local text = label({
		Name = "Label",
		Parent = background,
		Size = UDim2.fromScale(1, 1),
		TextSize = 14,
		TextStrokeTransparency = 0.5,
		ZIndex = 2,
	})
	return fill, text
end

local ui: { [string]: any } = {}

local function formatTime(seconds: number): string
	return string.format("%d:%02d", seconds // 60, seconds % 60)
end

local function ectoColor(fraction: number): Color3
	if fraction > 0.5 then
		return COLORS.ectoMid:Lerp(COLORS.ectoHigh, (fraction - 0.5) * 2)
	end
	return COLORS.ectoLow:Lerp(COLORS.ectoMid, fraction * 2)
end

local function build()
	local gui = new("ScreenGui", {
		Name = "PoltergeistHUD",
		ResetOnSpawn = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		Parent = player:WaitForChild("PlayerGui"),
	})
	ui.gui = gui

	-- Full-screen overlays (behind everything else)
	ui.damageFlash = new("Frame", {
		Name = "DamageFlash",
		Parent = gui,
		Size = UDim2.new(1, 0, 1, 60),
		Position = UDim2.fromOffset(0, -60),
		BackgroundColor3 = Color3.fromRGB(200, 20, 30),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ZIndex = 0,
	})
	ui.downed = new("Frame", {
		Name = "Downed",
		Parent = gui,
		Size = UDim2.new(1, 0, 1, 60),
		Position = UDim2.fromOffset(0, -60),
		BackgroundColor3 = Color3.fromRGB(60, 0, 10),
		BackgroundTransparency = 0.55,
		BorderSizePixel = 0,
		Visible = false,
		ZIndex = 0,
	})
	ui.downedText = label({
		Parent = ui.downed,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.45),
		Size = UDim2.fromOffset(700, 60),
		TextSize = 26,
		TextStrokeTransparency = 0.4,
	})

	-- Top center: timer + Ectoplasm meter
	local top = new("Frame", {
		Name = "Top",
		Parent = gui,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 6),
		Size = UDim2.fromOffset(360, 66),
		BackgroundTransparency = 1,
	})
	ui.timer = label({
		Name = "Timer",
		Parent = top,
		Size = UDim2.new(1, 0, 0, 34),
		TextSize = 30,
		TextStrokeTransparency = 0.5,
	})
	ui.ectoFill, ui.ectoLabel = bar(top, "Ectoplasm", UDim2.fromOffset(0, 38), UDim2.new(1, 0, 0, 22), COLORS.ectoHigh)

	-- Round messages
	ui.banner = label({
		Name = "Banner",
		Parent = gui,
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 82),
		Size = UDim2.fromOffset(720, 34),
		TextSize = 22,
		TextColor3 = COLORS.ember,
		TextStrokeTransparency = 0.3,
	})

	-- Top left: role
	ui.role = label({
		Name = "Role",
		Parent = gui,
		Position = UDim2.fromOffset(14, 10),
		Size = UDim2.fromOffset(240, 28),
		TextSize = 20,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextStrokeTransparency = 0.4,
	})

	-- Bottom center: health + vacuum charge (Humans only)
	local bottom = new("Frame", {
		Name = "Bottom",
		Parent = gui,
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -14),
		Size = UDim2.fromOffset(340, 52),
		BackgroundTransparency = 1,
	})
	ui.bottom = bottom
	ui.healthFill, ui.healthLabel = bar(bottom, "Health", UDim2.fromOffset(0, 0), UDim2.new(1, 0, 0, 22), COLORS.health)
	ui.chargeFill, ui.chargeLabel = bar(bottom, "Vacuum", UDim2.fromOffset(0, 28), UDim2.new(1, 0, 0, 22), COLORS.charge)

	-- Contextual hint above the bars
	ui.hint = label({
		Name = "Hint",
		Parent = gui,
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -74),
		Size = UDim2.fromOffset(760, 24),
		TextSize = 15,
		TextColor3 = COLORS.muted,
		TextStrokeTransparency = 0.6,
		TextWrapped = true,
	})
end

local function update()
	local state = GameState:GetAttribute("State") or "Waiting"
	local timeLeft = GameState:GetAttribute("TimeLeft") or 0
	local ectoplasm = GameState:GetAttribute("Ectoplasm") or Config.MAX_ECTOPLASM
	local message = GameState:GetAttribute("Message") or ""
	local ghostId = GameState:GetAttribute("GhostUserId") or 0

	local role = player:GetAttribute("Role") or "Lobby"
	local downed = player:GetAttribute("Downed") == true
	local eliminated = player:GetAttribute("Eliminated") == true
	local inRound = state == "Round" and role ~= "Lobby"

	-- Timer
	if state == "Round" then
		ui.timer.Text = formatTime(timeLeft)
		ui.timer.TextColor3 = if timeLeft <= 30 then COLORS.ember else COLORS.text
	elseif state == "Intermission" then
		ui.timer.Text = `Starting in {timeLeft}`
		ui.timer.TextColor3 = COLORS.text
	else
		ui.timer.Text = ""
	end

	-- Ectoplasm meter (shown whenever there's a Ghost in play)
	local showEcto = (state == "Round" or state == "PostRound") and ghostId ~= 0
	ui.ectoFill.Parent.Visible = showEcto
	if showEcto then
		local fraction = math.clamp(ectoplasm / Config.MAX_ECTOPLASM, 0, 1)
		ui.ectoFill.Size = UDim2.fromScale(fraction, 1)
		ui.ectoFill.BackgroundColor3 = ectoColor(fraction)
		ui.ectoLabel.Text = `ECTOPLASM  {math.ceil(ectoplasm)}%`
	end

	ui.banner.Text = message

	-- Role
	if role == "Ghost" then
		ui.role.Text = "YOU ARE THE GHOST"
		ui.role.TextColor3 = COLORS.ghost
	elseif role == "Human" then
		ui.role.Text = if eliminated then "HUMAN (OUT)" else "HUMAN"
		ui.role.TextColor3 = COLORS.ember
	else
		ui.role.Text = "LOBBY"
		ui.role.TextColor3 = COLORS.muted
	end

	-- Human bars
	local showHumanBars = role == "Human" and not eliminated
	ui.bottom.Visible = showHumanBars
	if showHumanBars then
		local character = player.Character
		local humanoid = character and character:FindFirstChildOfClass("Humanoid")
		local health = humanoid and humanoid.Health or 0
		local maxHealth = humanoid and humanoid.MaxHealth or Config.HUMAN_MAX_HEALTH
		ui.healthFill.Size = UDim2.fromScale(math.clamp(health / maxHealth, 0, 1), 1)
		ui.healthLabel.Text = if downed then "DOWNED" else `HEALTH  {math.ceil(health)}`

		local charge = player:GetAttribute("VacuumCharge") or Config.VACUUM_CHARGE_MAX
		local overheated = player:GetAttribute("VacuumOverheated") == true
		local draining = player:GetAttribute("Draining") == true
		ui.chargeFill.Size = UDim2.fromScale(math.clamp(charge / Config.VACUUM_CHARGE_MAX, 0, 1), 1)
		if overheated then
			ui.chargeFill.BackgroundColor3 = COLORS.overheated
			ui.chargeLabel.Text = "VACUUM OVERHEATED"
		elseif draining then
			ui.chargeFill.BackgroundColor3 = COLORS.draining
			ui.chargeLabel.Text = "DRAINING THE GHOST!"
		else
			ui.chargeFill.BackgroundColor3 = COLORS.charge
			ui.chargeLabel.Text = `VACUUM  {charge}%`
		end
	end

	-- Downed overlay
	ui.downed.Visible = downed and inRound
	if downed then
		local untilTime = player:GetAttribute("DownedUntil") or 0
		local secondsLeft = math.max(0, math.ceil(untilTime - workspace:GetServerTimeNow()))
		ui.downedText.Text = `DOWNED - a teammate can revive you ({secondsLeft}s)`
	end

	-- Hint
	local hint = ""
	if state == "Round" then
		if role == "Ghost" then
			if player:GetAttribute("Possessing") then
				hint = "WASD move  ·  Space / Q rise and sink  ·  Click to LAUNCH  ·  F to leave the object"
			else
				hint = "You're invisible. Walk up to an object and press E to possess it."
			end
		elseif role == "Human" then
			if eliminated then
				hint = "You're out. Wait for the next round."
			elseif not downed then
				hint = "Equip the Vacuum (1) and hold click to drain the Ghost. Purple-glowing objects are possessed!"
			end
		end
	elseif state == "Intermission" or state == "Waiting" then
		hint = "One player will be the Ghost. Everyone else hunts it with vacuums."
	end
	ui.hint.Text = hint
end

function HUD.flashDamage()
	ui.damageFlash.BackgroundTransparency = 0.5
	TweenService:Create(ui.damageFlash, TweenInfo.new(0.35), { BackgroundTransparency = 1 }):Play()
end

function HUD.init()
	build()
	RunService.RenderStepped:Connect(update)
end

return HUD
