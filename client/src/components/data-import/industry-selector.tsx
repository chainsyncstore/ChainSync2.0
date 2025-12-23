import { Building2, Store, Check } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    INDUSTRY_GROUPS,
    saveIndustry,
} from "@/lib/industry-config";
import { cn } from "@/lib/utils";

/* eslint-disable no-unused-vars -- callback param names required for type clarity */
interface IndustrySelectorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (industryId: string) => void;
    currentIndustry?: string | null;
}
/* eslint-enable no-unused-vars */

export default function IndustrySelector({
    open,
    onOpenChange,
    onSelect,
    currentIndustry,
}: IndustrySelectorProps) {
    const [selectedIndustry, setSelectedIndustry] = useState<string>(currentIndustry ?? "");
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

    const handleConfirm = () => {
        if (selectedIndustry) {
            saveIndustry(selectedIndustry);
            onSelect(selectedIndustry);
            onOpenChange(false);
        }
    };

    const getSelectedIndustryName = (): string => {
        for (const group of INDUSTRY_GROUPS) {
            const found = group.industries.find(ind => ind.id === selectedIndustry);
            if (found) return found.name;
        }
        return "";
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Select Your Industry
                    </DialogTitle>
                    <DialogDescription>
                        Choose the industry that best describes your business. This helps us
                        provide relevant product categories for organizing your inventory.
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[50vh] pr-4">
                    <div className="space-y-4">
                        {INDUSTRY_GROUPS.map((group) => (
                            <div key={group.name} className="space-y-2">
                                <button
                                    type="button"
                                    className="w-full text-left font-semibold text-sm text-muted-foreground hover:text-foreground flex items-center justify-between py-2 border-b"
                                    onClick={() => setExpandedGroup(
                                        expandedGroup === group.name ? null : group.name
                                    )}
                                >
                                    {group.name}
                                    <span className="text-xs">
                                        {expandedGroup === group.name ? "▼" : "▶"}
                                    </span>
                                </button>

                                {(expandedGroup === group.name ||
                                    group.industries.some(ind => ind.id === selectedIndustry)) && (
                                        <RadioGroup
                                            value={selectedIndustry}
                                            onValueChange={setSelectedIndustry}
                                            className="grid gap-2 pl-2"
                                        >
                                            {group.industries.map((industry) => (
                                                <div key={industry.id} className="flex items-start space-x-3">
                                                    <RadioGroupItem
                                                        value={industry.id}
                                                        id={industry.id}
                                                        className="mt-1"
                                                    />
                                                    <Label
                                                        htmlFor={industry.id}
                                                        className={cn(
                                                            "flex-1 cursor-pointer rounded-md border p-3 hover:bg-accent/50 transition-colors",
                                                            selectedIndustry === industry.id && "border-primary bg-accent"
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <Store className="h-4 w-4 text-muted-foreground" />
                                                            <span className="font-medium">{industry.name}</span>
                                                            {selectedIndustry === industry.id && (
                                                                <Check className="h-4 w-4 text-primary ml-auto" />
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            {industry.description}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            Categories: {industry.categories.slice(0, 4).map(c => c.label).join(", ")}
                                                            {industry.categories.length > 4 && ` +${industry.categories.length - 4} more`}
                                                        </p>
                                                    </Label>
                                                </div>
                                            ))}
                                        </RadioGroup>
                                    )}
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                {selectedIndustry && (
                    <div className="bg-muted/50 rounded-md p-3 text-sm">
                        <span className="text-muted-foreground">Selected: </span>
                        <span className="font-medium">{getSelectedIndustryName()}</span>
                    </div>
                )}

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!selectedIndustry}
                    >
                        Confirm Selection
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
