import { Menu } from "lucide-react";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import Sidebar from "./layout/sidebar";
import { cn } from "@/lib/utils";

/* eslint-disable no-unused-vars -- prop parameter names document external API */
interface MobileMenuProps {
  userRole: string;
  userName: string;
  userInitials: string;
  selectedStore: string;
  stores: Array<{ id: string; name: string }>;
  onStoreChange: (storeId: string) => void;
  alertCount: number;
  hideStoreSelector?: boolean;
  alwaysVisible?: boolean;
}
/* eslint-enable no-unused-vars */

export default function MobileMenu({
  userRole,
  userName,
  userInitials,
  selectedStore,
  stores,
  onStoreChange,
  alertCount,
  hideStoreSelector = false,
  alwaysVisible = false,
}: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={cn("inline-block", !alwaysVisible && "lg:hidden")}> 
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn("w-10 h-10 min-h-[40px] min-w-[40px]", !alwaysVisible && "lg:hidden")}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent 
          side="left" 
          className="p-0 w-80 max-w-[85vw] overflow-y-auto"
        >
          <div className="h-full">
            <Sidebar
              userRole={userRole}
              userName={userName}
              userInitials={userInitials}
              selectedStore={selectedStore}
              stores={stores}
              onStoreChange={(storeId) => {
                onStoreChange(storeId);
                setIsOpen(false); // Close menu after selection
              }}
              alertCount={alertCount}
              isMobile={true} // Enable mobile mode for full labels
              hideStoreSelector={hideStoreSelector}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}