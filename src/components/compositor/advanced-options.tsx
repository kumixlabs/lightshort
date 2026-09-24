import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@kumix/ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@kumix/ui/ui/collapsible";
import { Input } from "@kumix/ui/ui/input";
import { Slider } from "@kumix/ui/ui/slider";
import { useStore } from "@/stores/app-store";

const PRESET_COLORS = [
  { label: "Digital", hex: "#00FF00" },
  { label: "Studio", hex: "#00B140" },
  { label: "Blue", hex: "#0047AB" },
];

export function AdvancedOptions() {
  const opts = useStore((s) => s.opts);
  const updateOpts = useStore((s) => s.updateOpts);
  const resetOpts = useStore((s) => s.resetOpts);

  const hexColor = opts.color.startsWith("0x") ? `#${opts.color.slice(2)}` : opts.color;
  const [typedHex, setTypedHex] = useState(hexColor);

  useEffect(() => {
    setTypedHex(hexColor);
  }, [hexColor]);

  const num = (v: number | readonly number[] | null) => (Array.isArray(v) ? v[0] : (v ?? 0));

  const handleHexChange = (val: string) => {
    let clean = val.trim();
    if (!clean.startsWith("#")) {
      clean = `#${clean}`;
    }
    setTypedHex(clean);
    const hex = clean.slice(1);
    if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
      updateOpts({ color: `0x${hex.toUpperCase()}` });
    }
  };

  return (
    <Collapsible defaultOpen={false}>
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2">
        <CollapsibleTrigger className="cursor-pointer text-muted-foreground text-sm hover:text-foreground">
          Advanced options
        </CollapsibleTrigger>
        <Button variant="ghost" size="icon-sm" title="Reset to default" onClick={resetOpts}>
          <RotateCcw className="size-3.5" />
        </Button>
      </div>

      <CollapsibleContent className="flex flex-col gap-4 px-4 pt-3">
        <label className="grid gap-2 text-muted-foreground text-sm">
          <span>Reaction size {Math.round(opts.pipScale * 100)}%</span>
          <Slider
            min={10}
            max={50}
            value={[Math.round(opts.pipScale * 100)]}
            onValueChange={(v) => updateOpts({ pipScale: num(v) / 100 })}
          />
        </label>

        <label className="grid gap-2 text-muted-foreground text-sm">
          <span>Margin {opts.margin}px</span>
          <Slider
            min={0}
            max={80}
            step={5}
            value={[opts.margin]}
            onValueChange={(v) => updateOpts({ margin: num(v) })}
          />
        </label>

        <label className="grid gap-2 text-muted-foreground text-sm">
          <span>Green tolerance {opts.similarity.toFixed(2)}</span>
          <Slider
            min={1}
            max={50}
            value={[Math.round(opts.similarity * 100)]}
            onValueChange={(v) => updateOpts({ similarity: num(v) / 100 })}
          />
        </label>

        <label className="grid gap-2 text-muted-foreground text-sm">
          <span>Edge blend {opts.blend.toFixed(2)}</span>
          <Slider
            min={0}
            max={50}
            value={[Math.round(opts.blend * 100)]}
            onValueChange={(v) => updateOpts({ blend: num(v) / 100 })}
          />
        </label>

        <div className="grid gap-2 text-muted-foreground text-sm">
          <span>Chroma key color</span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border">
              <input
                type="color"
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                value={hexColor.toLowerCase()}
                onChange={(e) =>
                  updateOpts({ color: `0x${e.currentTarget.value.slice(1).toUpperCase()}` })
                }
              />
              <span className="size-full rounded" style={{ backgroundColor: hexColor }} />
            </div>

            <Input
              type="text"
              maxLength={7}
              value={typedHex}
              placeholder="#00FF00"
              onChange={(e) => handleHexChange(e.currentTarget.value)}
              className="h-8 w-24 font-mono text-xs uppercase"
            />

            <div className="flex items-center gap-1">
              {PRESET_COLORS.map((p) => (
                <button
                  key={p.hex}
                  type="button"
                  onClick={() => updateOpts({ color: `0x${p.hex.slice(1)}` })}
                  className={`rounded border px-2 py-1 font-mono text-[11px] transition-colors ${
                    hexColor.toUpperCase() === p.hex
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
