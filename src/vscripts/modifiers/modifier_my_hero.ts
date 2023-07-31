import { BaseModifier, registerModifier } from "../lib/dota_ts_adapter";

@registerModifier()
export class modifier_my_hero extends BaseModifier {
    IsHidden(): boolean {
        return false;
    }
    CheckState(): Partial<Record<ModifierState, boolean>> {
        return {
            [ModifierState.ATTACK_IMMUNE]: true,
        };
    }
}