-- Round flow: Waiting -> Intermission -> Round -> PostRound -> repeat.
-- Shared game state is published as attributes on ReplicatedStorage.GameState so every
-- client's HUD can read it.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local Characters = require(script.Parent.Characters)
local Humans = require(script.Parent.Humans)
local Map = require(script.Parent.Map)
local Possession = require(script.Parent.Possession)
local Vacuum = require(script.Parent.Vacuum)

local GameState = ReplicatedStorage.GameState

local RoundManager = {}

local roundActive = false
local ghostPlayer: Player? = nil
local lastGhostUserId: number? = nil

local function setState(state: string, message: string?)
	GameState:SetAttribute("State", state)
	GameState:SetAttribute("Message", message or "")
end

local function setTimeLeft(seconds: number)
	GameState:SetAttribute("TimeLeft", math.max(0, math.ceil(seconds)))
end

local function soloTesting(): boolean
	return Config.SOLO_TEST_IN_STUDIO and RunService:IsStudio()
end

local function enoughPlayers(): boolean
	local count = #Players:GetPlayers()
	return count >= Config.MIN_PLAYERS or (soloTesting() and count >= 1)
end

-- What happens when a character dies, by role.
local function onDied(player: Player, _character: Model)
	local role = Characters.getRole(player)
	if role == "Human" then
		Humans.eliminate(player)
	elseif role == "Ghost" then
		-- The Ghost can't really die (e.g. it fell out of the map); put it back.
		task.wait(2)
		if roundActive and ghostPlayer == player and player.Parent then
			Characters.spawn(player, "Ghost", Map.getSpawns().ghost, onDied)
		end
	else
		task.wait(3)
		if player.Parent and Characters.getRole(player) == "Lobby" then
			Characters.spawn(player, "Lobby", Map.getSpawns().lobby, onDied)
		end
	end
end

local function spawnInLobby(player: Player)
	Humans.clear(player)
	Vacuum.clear(player)
	Characters.spawn(player, "Lobby", Map.getSpawns().lobby, onDied)
end

local function pickGhost(players: { Player }): Player
	local candidates = {}
	for _, player in players do
		-- Don't make the same person Ghost twice in a row if someone else can take a turn.
		if player.UserId ~= lastGhostUserId then
			table.insert(candidates, player)
		end
	end
	if #candidates == 0 then
		candidates = players
	end
	return candidates[math.random(1, #candidates)]
end

local function startRound(): (boolean, boolean)
	local players = Players:GetPlayers()
	Map.resetProps()
	GameState:SetAttribute("Ectoplasm", Config.MAX_ECTOPLASM)

	local ghost: Player? = nil
	if #players == 1 and soloTesting() then
		if Config.SOLO_TEST_ROLE == "Ghost" then
			ghost = players[1]
		end
	else
		ghost = pickGhost(players)
	end
	ghostPlayer = ghost
	lastGhostUserId = ghost and ghost.UserId or lastGhostUserId
	GameState:SetAttribute("GhostUserId", ghost and ghost.UserId or 0)

	local spawns = Map.getSpawns()
	local humanIndex = 0
	local hadHumans = false
	for _, player in players do
		if player == ghost then
			task.spawn(function()
				Characters.spawn(player, "Ghost", spawns.ghost, onDied)
			end)
		else
			hadHumans = true
			humanIndex += 1
			local at = spawns.humans[(humanIndex - 1) % #spawns.humans + 1]
			task.spawn(function()
				if Characters.spawn(player, "Human", at, onDied) then
					Vacuum.giveTool(player)
				end
			end)
		end
	end

	roundActive = true
	return ghost ~= nil, hadHumans
end

-- Returns the winning side and a message, or nil while the round should keep going.
local function checkRoundOver(ectoplasm: number, timeLeft: number, hadGhost: boolean, hadHumans: boolean): (string?, string?)
	if hadGhost and ectoplasm <= 0 then
		return "Humans", "The Ghost was vacuumed up! HUMANS WIN"
	end
	if hadGhost and (ghostPlayer == nil or ghostPlayer.Parent == nil) then
		return "Humans", "The Ghost fled the house! HUMANS WIN"
	end
	if hadHumans then
		local anyStanding = false
		local anyInRound = false
		for _, player in Players:GetPlayers() do
			if player:GetAttribute("Role") == "Human" then
				anyInRound = true
				if Humans.isActive(player) then
					anyStanding = true
				end
			end
		end
		if not anyInRound then
			return "Ghost", "Every Human fled! GHOST WINS"
		end
		if not anyStanding then
			return "Ghost", "No Humans left standing! GHOST WINS"
		end
	end
	if timeLeft <= 0 then
		if hadGhost then
			return "Ghost", "Time's up! The Ghost survived. GHOST WINS"
		end
		return "Nobody", "Time's up!"
	end
	return nil, nil
end

local function runRound(hadGhost: boolean, hadHumans: boolean): string
	local timeLeft = Config.ROUND_TIME
	local ectoplasm = Config.MAX_ECTOPLASM
	setState("Round")
	setTimeLeft(timeLeft)

	while true do
		local dt = RunService.Heartbeat:Wait()
		timeLeft -= dt
		setTimeLeft(timeLeft)

		Possession.update(dt)

		local ghost = ghostPlayer
		local target: BasePart? = nil
		if ghost and ghost.Parent then
			target = Possession.getPossessedPart(ghost)
			if not target and ghost.Character then
				local root = ghost.Character:FindFirstChild("HumanoidRootPart")
				if root and root:IsA("BasePart") then
					target = root
				end
			end
		end
		local drained = Vacuum.update(dt, ghost, target)

		if hadGhost then
			ectoplasm = math.max(0, ectoplasm - Config.PASSIVE_DRAIN_PER_SECOND * dt - drained)
			GameState:SetAttribute("Ectoplasm", math.floor(ectoplasm * 10 + 0.5) / 10)
		end

		local winner, message = checkRoundOver(ectoplasm, timeLeft, hadGhost, hadHumans)
		if winner then
			setState("PostRound", message)
			GameState:SetAttribute("Winner", winner)
			return winner
		end
	end
end

local function endRound()
	roundActive = false
	Possession.releaseAll()
	Vacuum.clearAll()
	for _, player in Players:GetPlayers() do
		Humans.clear(player)
	end
	if ghostPlayer then
		ghostPlayer:SetAttribute("Revealed", false)
	end
	ghostPlayer = nil
	GameState:SetAttribute("GhostUserId", 0)
end

local function countdown(state: string, seconds: number, message: string, keepGoing: () -> boolean): boolean
	setState(state, message)
	for t = seconds, 1, -1 do
		setTimeLeft(t)
		task.wait(1)
		if not keepGoing() then
			return false
		end
	end
	setTimeLeft(0)
	return true
end

function RoundManager.run()
	Possession.setAllowedCheck(function()
		return roundActive
	end)

	GameState:SetAttribute("Ectoplasm", Config.MAX_ECTOPLASM)
	GameState:SetAttribute("GhostUserId", 0)
	setTimeLeft(0)

	Players.PlayerAdded:Connect(spawnInLobby)
	for _, player in Players:GetPlayers() do
		task.spawn(spawnInLobby, player)
	end

	while true do
		setState("Waiting", `Waiting for players ({#Players:GetPlayers()}/{Config.MIN_PLAYERS})`)
		while not enoughPlayers() do
			task.wait(1)
			setState("Waiting", `Waiting for players ({#Players:GetPlayers()}/{Config.MIN_PLAYERS})`)
		end

		if countdown("Intermission", Config.INTERMISSION_TIME, "Round starting soon", enoughPlayers) then
			local hadGhost, hadHumans = startRound()
			runRound(hadGhost, hadHumans)
			endRound()

			task.wait(Config.POST_ROUND_TIME)
			for _, player in Players:GetPlayers() do
				task.spawn(spawnInLobby, player)
			end
		end
	end
end

return RoundManager
