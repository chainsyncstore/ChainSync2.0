import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import Sidebar from "./layout/sidebar";

interface MobileMenuProps {
  userRole: string;
  userName: string;
  userInitials: string;
  selectedStore: string;
  stores: Array<{ id: string; name: string }>;
  onStoreChange: (storeId: string) => void;
  alertCount: number;
}

export default function MobileMenu({
  userRole,
  userName,
  userInitials,
  selectedStore,
  stores,
  onStoreChange,
  alertCount,
}: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden w-10 h-10 min-h-[40px] min-w-[40px]"
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
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}