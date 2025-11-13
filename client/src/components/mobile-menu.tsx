import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import Sidebar from "./layout/sidebar";

interface MobileMenuProps {
  userRole: string;
  userName: string;
  userInitials: string;
  alertCount: number;
  managerStoreId?: string;
  alwaysVisible?: boolean;
}

export default function MobileMenu({
  userRole,
  userName,
  userInitials,
  alertCount,
  managerStoreId,
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
              alertCount={alertCount}
              isMobile={true} // Enable mobile mode for full labels
              managerStoreId={managerStoreId}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}