import { BaseModifier, registerModifier } from "../lib/dota_ts_adapter";

@registerModifier()
export class modifier_deaths_bounty extends BaseModifier {
    private missed_hit: Function = () => { };
    DeclareFunctions(): ModifierFunction[] {
        return [ModifierFunction.ON_DEATH];
    }
    IsAura(): boolean {
        return false;
    }
    GetAuraRadius(): number {
        return 0;
    }
    GetAuraSearchFlags(): UnitTargetFlags {
        return UnitTargetFlags.NONE;
    }
    OnDeath(event: ModifierInstanceEvent): void {
        if (!IsServer()) {
            return;
        }
        let player: CDOTA_BaseNPC = PlayerResource.GetPlayer(0)?.GetAssignedHero()!;
        if (event.unit != this.GetParent())
            return;
        if (event.attacker == player) {
            EmitGlobalSound("Rogue.LastHit");
            return;
        }
        EmitGlobalSound("Rogue.MissedHit");
        GameRules.Addon.OnMissedHit();
    }
}
