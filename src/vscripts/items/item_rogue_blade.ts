import { BaseItem, registerAbility } from "../lib/dota_ts_adapter";

@registerAbility()
export class item_rogue_blade extends BaseItem {
    CastFilterResultTarget(target: CDOTA_BaseNPC): UnitFilterResult {
        return UnitFilter(target, UnitTargetTeam.BOTH, UnitTargetType.TREE, UnitTargetFlags.NONE, this.GetCaster().GetTeamNumber());
    }
    OnSpellStart(): void {
        let target = this.GetCursorTarget();
        if (target === undefined)
            return;
        assert(target.GetClassname() == "ent_dota_tree");
        GridNav.DestroyTreesAroundPoint(target.GetOrigin(), 0, true);
        GameRules.Addon.OnChopTree();
    }
}