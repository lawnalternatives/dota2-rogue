import { BaseItem, registerAbility } from "../lib/dota_ts_adapter";

@registerAbility()
export class item_rogue_blade extends BaseItem {
    OnSpellStart(): void {
        let target = this.GetCursorTarget();
        if (target === undefined)
            return;
        GridNav.DestroyTreesAroundPoint(target.GetOrigin(), 0, true);
        GameRules.Addon.OnChopTree(target);
    }
}