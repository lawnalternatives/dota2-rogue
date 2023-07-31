import { BaseModifier } from "./lib/dota_ts_adapter";
import { reloadable } from "./lib/tstl-utils";
import { modifier_my_hero } from "./modifiers/modifier_my_hero";
import { modifier_deaths_bounty } from "./modifiers/modifier_deaths_bounty";

declare global {
    interface CDOTAGameRules {
        Addon: GameMode;
    }
}

class RGBColor {
    constructor(public red: number, public green: number, public blue: number) { }
}

class CreepTeam {
    constructor(public readonly dotaTeam: DotaTeam, public readonly name: string, public readonly color: RGBColor, public readonly apply: (target: CDOTA_BaseNPC) => unknown) { }
    private cache = new Map<string, CBaseEntity>();
    private Cached(name: string): CBaseEntity {
        let ent = this.cache.get(name);
        ent ??= Entities.FindByName(undefined, name);
        assert(ent);
        ent = ent!;
        this.cache.set(name, ent);
        return ent;
    }
    public Spawner(): CBaseEntity { return this.Cached(`spawner_${this.name}`); }
    public InitialGoal(): CBaseEntity { return this.Cached(`pathcorner_${this.name}_1`); }
}

function* range(max: number) {
    for (let i = 0; i < max; ++i)
        yield i;
}

const attributeDefinedStatsToZero = [
    AttributeDerivedStats.AGILITY_ARMOR,
    AttributeDerivedStats.AGILITY_ATTACK_SPEED,
    AttributeDerivedStats.INTELLIGENCE_MANA,
    AttributeDerivedStats.INTELLIGENCE_MANA_REGEN,
    AttributeDerivedStats.STRENGTH_HP,
    AttributeDerivedStats.STRENGTH_HP_REGEN,
];

@reloadable
export class GameMode {
    readonly CREEP_TEAMS = [
        new CreepTeam(DotaTeam.CUSTOM_1, "goodguys", new RGBColor(197, 77, 168), (unit: CDOTA_BaseNPC) => {
            modifier_deaths_bounty.apply(unit);
            unit.SetMinimumGoldBounty(1);
            unit.SetMaximumGoldBounty(1);
        }),
        new CreepTeam(DotaTeam.CUSTOM_2, "badguys", new RGBColor(255, 108, 0), (unit: CDOTA_BaseNPC) => { }),
    ];

    private waveNumber: number = 0;
    private waveCreeps: CDOTA_BaseNPC[] = [];

    public static Precache(this: void, context: CScriptPrecacheContext) {
        PrecacheResource("particle", "particles/units/heroes/hero_meepo/meepo_earthbind_projectile_fx.vpcf", context);
        PrecacheResource("soundfile", "soundevents/game_sounds_heroes/game_sounds_meepo.vsndevts", context);
    }

    public static Activate(this: void) {
        // When the addon activates, create a new instance of this GameMode class.
        GameRules.Addon = new GameMode();
    }

    constructor() {
        this.configure();

        // Register event listeners for dota engine events
        ListenToGameEvent("game_rules_state_change", () => this.OnStateChange(), undefined);
        ListenToGameEvent("npc_spawned", event => this.OnNpcSpawned(event), undefined);
        ListenToGameEvent("dota_npc_goal_reached", event => this.OnDotaNpcGoalReached(event), undefined);
        ListenToGameEvent("entity_killed", event => this.OnEntityKilled(event), undefined);

        /*
        // Register event listeners for events from the UI
        CustomGameEventManager.RegisterListener("ui_panel_closed", (_, data) => {
            print(`Player ${data.PlayerID} has closed their UI panel.`);

            // Respond by sending back an example event
            const player = PlayerResource.GetPlayer(data.PlayerID)!;
            CustomGameEventManager.Send_ServerToPlayer(player, "example_event", {
                myNumber: 42,
                myBoolean: true,
                myString: "Hello!",
                myArrayOfNumbers: [1.414, 2.718, 3.142]
            });

            // Also apply the panic modifier to the sending player's hero
            const hero = player.GetAssignedHero();
            hero.AddNewModifier(hero, undefined, modifier_panic.name, { duration: 5 });
        });
        */
    }

    private configure(): void {
        GameRules.SetCustomGameTeamMaxPlayers(DotaTeam.GOODGUYS, 1);
        GameRules.SetCustomGameTeamMaxPlayers(DotaTeam.BADGUYS, 0);
        if (IsInToolsMode())
            GameRules.LockCustomGameSetupTeamAssignment(true);
        GameRules.SetTimeOfDay(0.251);
        GameRules.SetStrategyTime(0.1);
        GameRules.SetShowcaseTime(0.1);
        GameRules.SetPreGameTime(0.1);
        GameRules.SetStartingGold(0);
        GameRules.SetGoldPerTick(0);
        GameRules.SetTreeRegrowTime(60);
        let GameMode = GameRules.GetGameModeEntity();
        GameMode.SetCustomGameForceHero("npc_dota_hero_phantom_assassin");
        GameMode.SetFogOfWarDisabled(true);
        GameMode.SetRecommendedItemsDisabled(true);
        GameMode.SetBotThinkingEnabled(false);
        GameMode.SetAnnouncerDisabled(true);
        GameMode.SetKillingSpreeAnnouncerDisabled(true);
        GameMode.SetStickyItemDisabled(true);
        GameMode.SetPauseEnabled(true);
        GameMode.SetFreeCourierModeEnabled(false);
        GameMode.SetUseDefaultDOTARuneSpawnLogic(false);
        GameMode.SetDaynightCycleDisabled(true);
        for (let team of this.CREEP_TEAMS)
            SetTeamCustomHealthbarColor(team.dotaTeam, team.color.red, team.color.green, team.color.blue);
        GameMode.SetCustomAttributeDerivedStatValue(AttributeDerivedStats.STRENGTH_HP, 0.0);
        GameMode.SetCustomAttributeDerivedStatValue(AttributeDerivedStats.STRENGTH_HP_REGEN, 0.0);
    }

    public OnStateChange(): void {
        const state = GameRules.State_Get();
        if (state === GameState.CUSTOM_GAME_SETUP)
            Timers.CreateTimer(0.1, () => GameRules.FinishCustomGameSetup());
        else if (state === GameState.PRE_GAME)
            Timers.CreateTimer(5.0, () => this.StartGame());
    }

    private StartGame(): void {
        print("Game starting!");
        this.StartWave();
    }

    private StartWave(): void {
        let hero = this.GetPlayer().GetAssignedHero();
        hero.SetMana(hero.GetMaxMana());
        for (let i of range(hero.GetAbilityCount()))
            hero.GetAbilityByIndex(i)?.EndCooldown();
        this.waveNumber++;
        for (let team of this.CREEP_TEAMS)
            for (let _ of range(this.waveNumber))
                this.SpawnLaneCreep(team, "npc_dota_goodguys_melee_creep");
    }

    private GetPlayer(): CDOTAPlayerController {
        return PlayerResource.GetPlayer(0)!;
    }

    // Called on script_reload
    public Reload() {
        print("Script reloaded!");
    }

    private OnNpcSpawned(event: NpcSpawnedEvent) {
        const unit = EntIndexToHScript(event.entindex) as CDOTA_BaseNPC;
        if (unit.IsRealHero())
            if (!unit.HasModifier(modifier_my_hero.name))
                modifier_my_hero.apply(unit);
    }

    private OnDotaNpcGoalReached(event: DotaNpcGoalReachedEvent): void {
        if (EntIndexToHScript(event.next_goal_entindex))
            return;
        const unit = EntIndexToHScript(event.npc_entindex) as CDOTA_BaseNPC;
        unit.Kill(undefined, undefined);
    }

    public SpawnLaneCreep(team: CreepTeam, unitName: string): CDOTA_BaseNPC {
        let unit = CreateUnitByName(unitName, team.Spawner().GetAbsOrigin(), true, undefined, undefined, team.dotaTeam);
        unit.SetInitialGoalEntity(team.InitialGoal());
        team.apply(unit);
        this.waveCreeps.push(unit);
        return unit;
    }

    private OnEntityKilled(event: EntityKilledEvent): void {
        const unit = EntIndexToHScript(event.entindex_killed) as CDOTA_BaseNPC;
        if (unit.IsHero()) {
            Timers.CreateTimer(0.1, () => GameRules.MakeTeamLose(DotaTeam.GOODGUYS));
            return;
        }
        const index = this.waveCreeps.indexOf(unit);
        if (index == -1)
            return;
        this.waveCreeps.splice(index, 1);
        if (this.waveCreeps.length != 0)
            return;
        this.GetPlayer().GetAssignedHero().HeroLevelUp(true);
        this.StartWave();
    }
}
