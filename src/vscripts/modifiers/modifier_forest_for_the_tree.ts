import { BaseModifier, registerModifier } from "../lib/dota_ts_adapter";


@registerModifier()
export class modifier_forest_for_the_tree_effect extends BaseModifier {
    IsHidden() { return false; }
    IsAura() { return false; }
    IsDebuff() { return true; }
    CheckState() {
        return {
            [ModifierState.INVULNERABLE]: true,
            [ModifierState.STUNNED]: true,
        };
    }
}

@registerModifier()
export class modifier_forest_for_the_tree extends BaseModifier {
    IsHidden() { return false; }
    IsDebuff() { return false; }
    IsAura() { return true; }
    GetAuraRadius() { return FIND_UNITS_EVERYWHERE; }
    GetAuraSearchFlags() { return UnitTargetFlags.NONE; }
    GetAuraSearchType() { return UnitTargetType.ALL; }
    GetAuraSearchTeam() { return UnitTargetTeam.ENEMY; }
    GetModifierAura() { return modifier_forest_for_the_tree_effect.name; }
}
