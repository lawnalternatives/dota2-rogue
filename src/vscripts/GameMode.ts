import { reloadable } from "./lib/tstl-utils";
import { modifier_my_hero } from "./modifiers/modifier_my_hero";
import { modifier_deaths_bounty } from "./modifiers/modifier_deaths_bounty";
import { modifier_forest_for_the_tree } from "./modifiers/modifier_forest_for_the_tree";

declare global {
    interface CDOTAGameRules {
        Addon: GameMode;
    }
}

class RGBColor {
    constructor(public red: number, public green: number, public blue: number) { }
}

class UniquelyNamedEntityCache {
    private cache = new Map<string, CBaseEntity>();
    public Get(name: string): CBaseEntity {
        let ent = this.cache.get(name);
        ent ??= Entities.FindByName(undefined, name);
        assert(ent);
        ent = ent!;
        this.cache.set(name, ent);
        return ent;
    }
}
let entcache = new UniquelyNamedEntityCache;

class CreepTeam {
    constructor(public readonly dotaTeam: DotaTeam, public readonly name: string, public readonly color: RGBColor) { }
    public Spawner(): CBaseEntity { return entcache.Get(`spawner_${this.name}`); }
    public InitialGoal(): CBaseEntity { return entcache.Get(`pathcorner_${this.name}_1`); }
}

function* range(max: number) {
    for (let i = 0; i < max; ++i)
        yield i;
}

const GOOD_CREEP_TEAM = new CreepTeam(DotaTeam.CUSTOM_1, "goodguys", new RGBColor(197, 77, 168));
const BAD_CREEP_TEAM = new CreepTeam(DotaTeam.CUSTOM_2, "badguys", new RGBColor(255, 108, 0));
const CREEP_TEAMS = [GOOD_CREEP_TEAM, BAD_CREEP_TEAM];

const TP_ITEM = "item_blink";
const NEUTRAL_ITEM = "item_rogue_blade";
const ARENA_CENTER = "arena_center";

@reloadable
export class GameMode {
    private waveNumber: number = 0;
    private waveCreeps: CDOTA_BaseNPC[] = [];
    private lifes = { max: 5, current: 5 };
    private startTree?: CBaseAnimatingActivity;

    public static Precache(this: void, context: CScriptPrecacheContext) {
        PrecacheResource("soundfile", "soundevents/custom_sounds.vsndevts", context);
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
        GameRules.LockCustomGameSetupTeamAssignment(true);
        GameRules.SetTimeOfDay(0.251);
        GameRules.SetStrategyTime(0.1);
        GameRules.SetShowcaseTime(0.1);
        GameRules.SetPreGameTime(0.1);
        GameRules.SetStartingGold(0);
        GameRules.SetGoldPerTick(0);
        GameRules.SetTreeRegrowTime(60);
        GameRules.SetUseUniversalShopMode(true);
        let GameMode = GameRules.GetGameModeEntity();
        if (IsInToolsMode())
            GameMode.SetCustomGameForceHero("npc_dota_hero_alchemist");
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
        GameMode.SetTPScrollSlotItemOverride(TP_ITEM);
        GameMode.SetExecuteOrderFilter(this.ExecuteOrderFilter, {});
        GameMode.SetCustomBackpackCooldownPercent(1);
        for (let team of CREEP_TEAMS)
            SetTeamCustomHealthbarColor(team.dotaTeam, team.color.red, team.color.green, team.color.blue);
    }

    private ExecuteOrderFilter(event: ExecuteOrderFilterEvent): boolean {
        if ([UnitOrder.DROP_ITEM, UnitOrder.GIVE_ITEM, UnitOrder.DROP_ITEM_AT_FOUNTAIN].includes(event.order_type))
            return false;
        if ([UnitOrder.MOVE_ITEM, UnitOrder.SELL_ITEM, UnitOrder.SET_ITEM_COMBINE_LOCK].includes(event.order_type)) {
            let ability = EntIndexToHScript(event.entindex_ability);
            if (ability === undefined)
                return true;
            return ability.GetName() != NEUTRAL_ITEM;
        }
        return true;
    }

    public OnStateChange(): void {
        const state = GameRules.State_Get();
        if (state === GameState.CUSTOM_GAME_SETUP)
            Timers.CreateTimer(0.1, () => GameRules.FinishCustomGameSetup());
        else if (state === GameState.PRE_GAME)
            Timers.CreateTimer(5.0, () => this.StartGame());
    }

    private SendLifesChanged(): void {
        CustomGameEventManager.Send_ServerToAllClients("lifes_changed", this.lifes);
    }

    public OnMissedHit(): void {
        if (this.lifes.current > 0) {
            this.lifes.current -= 1;
            this.SendLifesChanged();
        }
        if (this.lifes.current == 0)
            Timers.CreateTimer(0.1, () => GameRules.MakeTeamLose(DotaTeam.GOODGUYS));
    }

    public OnChopTree(target: CDOTA_BaseNPC): void {
        if (target.GetCursorPosition() != this.ArenaCenter().GetOrigin())
            return;
        this.GetPlayer().GetAssignedHero().RemoveModifierByName(modifier_forest_for_the_tree.name);
    }

    private StartGame(): void {
        print("Game starting!");
        this.SendLifesChanged();
        this.StartWave();
    }

    private ArenaCenter(): CBaseEntity {
        return entcache.Get(ARENA_CENTER);
    }

    private StartWave(): void {
        CreateTempTree(this.ArenaCenter().GetOrigin(), Infinity);
        modifier_forest_for_the_tree.apply(this.GetPlayer().GetAssignedHero());
        this.waveNumber++;
        let creepCount = 1 + Math.floor(Math.log2(this.waveNumber));
        let bountyBonus = 10 * this.waveNumber;
        for (let _ of range(creepCount)) {
            let goodCreep = this.SpawnLaneCreep(GOOD_CREEP_TEAM, "npc_dota_goodguys_melee_creep");
            modifier_deaths_bounty.apply(goodCreep);
            goodCreep.SetMinimumGoldBounty(0);
            goodCreep.SetMaximumGoldBounty(0);
            let badCreep = this.SpawnLaneCreep(BAD_CREEP_TEAM, "npc_dota_goodguys_melee_creep");
            badCreep.SetMinimumGoldBounty(48 + bountyBonus);
            badCreep.SetMinimumGoldBounty(52 + bountyBonus);
        }
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
        if (unit.IsRealHero()) {
            if (!unit.HasModifier(modifier_my_hero.name))
                modifier_my_hero.apply(unit);
            for (let i of range(unit.GetAbilityCount())) {
                let ability = unit.GetAbilityByIndex(i);
                if (ability !== undefined)
                    unit.RemoveAbilityByHandle(ability);
            }
            unit.AddItemByName(TP_ITEM);
            let temp_slot = unit.AddItemByName(NEUTRAL_ITEM).GetItemSlot();
            assert(temp_slot != -1);
            unit.SwapItems(temp_slot, InventorySlot.NEUTRAL_SLOT);

            Timers.CreateTimer(0.1, () => {
                for (let i of range(InventorySlot.NEUTRAL_SLOT + 1)) {
                    let item = unit.GetItemInSlot(i);
                    if (item !== undefined && item.GetName() == "item_tpscroll")
                        unit.RemoveItem(item);
                }
            });
        }
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
