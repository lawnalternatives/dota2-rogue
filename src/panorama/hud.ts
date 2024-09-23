$.Msg("Hud panorama loaded");

/**
 * Turn a table object into an array.
 * @param obj The object to transform to an array.
 * @returns An array with items of the value type of the original object.
 */
function toArray<T>(obj: Record<number, T>): T[] {
    const result = [];

    let key = 1;
    while (obj[key]) {
        result.push(obj[key]);
        key++;
    }

    return result;
}

function* range(max: number) {
    for (let i = 0; i < max; ++i)
        yield i;
}

class CustomUI {
    panel_root: Panel;
    panel_lifes: Panel;

    constructor(panel: Panel) {
        $.Msg("CustomUI constructor");
        this.panel_root = panel;
        this.panel_lifes = panel.FindChild("Lifes")!;
        this.panel_lifes.RemoveAndDeleteChildren();
        GameEvents.Subscribe<LifesChanged>("lifes_changed", (event) => this.OnLifesChanged(event));
    }

    OnLifesChanged(event: LifesChanged) {
        $.Msg("OnLifesChanged: " + event.current + " / " + event.max);
        this.panel_lifes.RemoveAndDeleteChildren();
        for (let i of range(event.max)) {
            const panel = $.CreatePanel("Panel", this.panel_lifes, "");
            panel.BLoadLayoutSnippet("Life");
            const image = panel.FindChildTraverse("LifeImage") as ImagePanel;
            image.SetImage("file://{resources}/images/custom_game/tstl.png");
            if (i < event.current) {
                image.AddClass("LifePresent");
            } else {
                image.AddClass("LifeMissing");
            }
        }
    }
}

let ui = new CustomUI($.GetContextPanel());