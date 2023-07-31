import { BaseModifier, registerModifier } from "../lib/dota_ts_adapter";

@registerModifier()
export class modifier_deaths_bounty extends BaseModifier {
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
        if (event.attacker == player || event.unit != this.GetParent()) {
            return;
        }
        ApplyDamage({ attacker: this.GetParent(), victim: player, damage_type: DamageTypes.PURE, damage: 10, ability: this.GetAbility() });
    }
}
